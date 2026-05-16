import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CandidatoLite = Pick<
  Tables<"candidati">,
  "id" | "nome" | "cognome" | "created_at" | "informazioni_estratte"
>;

export interface DuplicateQuery {
  nome?: string;
  cognome?: string;
  email?: string;
  telefono?: string;
  excludeId?: string;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Cerca possibili duplicati nella tabella candidati.
 * Match per:
 *  - email estratta (informazioni_estratte->>email) uguale (case-insensitive)
 *  - telefono estratto uguale (solo cifre)
 *  - nome + cognome uguali (case-insensitive)
 */
export async function findDuplicates(q: DuplicateQuery): Promise<CandidatoLite[]> {
  const orParts: string[] = [];

  if (q.email) {
    const e = q.email.trim();
    if (e) orParts.push(`informazioni_estratte->>email.ilike.${e}`);
  }

  if (q.nome && q.cognome) {
    orParts.push(`and(nome.ilike.${q.nome.trim()},cognome.ilike.${q.cognome.trim()})`);
  }

  if (orParts.length === 0 && !q.telefono) return [];

  let query = supabase
    .from("candidati")
    .select("id, nome, cognome, created_at, informazioni_estratte")
    .order("created_at", { ascending: false })
    .limit(20);

  if (orParts.length > 0) query = query.or(orParts.join(","));

  if (q.excludeId) query = query.neq("id", q.excludeId);

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[duplicate-check] errore:", error);
    return [];
  }

  let results = (data ?? []) as CandidatoLite[];

  // Telefono: filtro client-side perché richiede normalizzazione cifre
  if (q.telefono) {
    const targetDigits = q.telefono.replace(/\D+/g, "");
    if (targetDigits.length >= 6) {
      const { data: all, error: e2 } = await supabase
        .from("candidati")
        .select("id, nome, cognome, created_at, informazioni_estratte")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!e2 && all) {
        const phoneMatches = (all as CandidatoLite[]).filter((c) => {
          if (q.excludeId && c.id === q.excludeId) return false;
          const tel = ((c.informazioni_estratte as { telefono?: string } | null)?.telefono ?? "").replace(
            /\D+/g,
            "",
          );
          if (!tel || tel.length < 6) return false;
          // match se uguali o se uno è suffisso dell'altro (last 8 digits)
          const a = tel.slice(-8);
          const b = targetDigits.slice(-8);
          return a === b;
        });
        // unisci senza duplicare
        const ids = new Set(results.map((r) => r.id));
        for (const m of phoneMatches) if (!ids.has(m.id)) results.push(m);
      }
    }
  }

  // Anche email fallback client-side (per CI exact match)
  if (q.email) {
    const target = norm(q.email);
    results = results.filter((c) => {
      // mantieni risultati che hanno match per email O nome/cognome O telefono
      const e = norm((c.informazioni_estratte as { email?: string } | null)?.email);
      const matchEmail = !!target && e === target;
      const matchNome =
        q.nome && q.cognome && norm(c.nome) === norm(q.nome) && norm(c.cognome) === norm(q.cognome);
      const tel = ((c.informazioni_estratte as { telefono?: string } | null)?.telefono ?? "").replace(
        /\D+/g,
        "",
      );
      const targetTel = (q.telefono ?? "").replace(/\D+/g, "");
      const matchTel =
        !!targetTel && targetTel.length >= 6 && tel.slice(-8) === targetTel.slice(-8);
      return matchEmail || matchNome || matchTel;
    });
  }

  return results;
}
