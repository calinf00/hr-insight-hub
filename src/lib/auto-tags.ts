// Generazione automatica di tag a partire dalle informazioni estratte dal CV.
// I tag sono pensati per essere visualizzati come chip nella scheda candidato e nel Talent Pool.

export interface Lingua {
  lingua?: string;
  livello?: string;
}

export interface InformazioniEstratte {
  lingue?: Lingua[];
  titolo_studio?: string;
  anni_esperienza?: string;
  competenze_tecniche?: string[];
  certificazioni?: string[];
  [k: string]: unknown;
}

function parseAnni(raw: string | undefined | null): number {
  if (!raw) return 0;
  const m = raw.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function tagsLingue(lingue: Lingua[] | undefined): string[] {
  const out: string[] = [];
  for (const l of lingue ?? []) {
    if (!l?.lingua) continue;
    const nome = l.lingua.trim();
    const livello = (l.livello ?? "").trim().toUpperCase();
    // Inglese avanzato (C1/C2)
    if (/inglese|english/i.test(nome) && /\bC[12]\b/.test(livello)) {
      out.push("Inglese avanzato");
    }
    // Altre lingue avanzate
    if (!/inglese|english/i.test(nome) && /\bC[12]\b/.test(livello)) {
      out.push(`${nome} avanzato`);
    }
    // Madrelingua
    if (/madrelingua|native/i.test(livello)) {
      out.push(`${nome} madrelingua`);
    }
  }
  return out;
}

function tagsTitoloStudio(titolo: string | undefined): string[] {
  if (!titolo) return [];
  const t = titolo.toLowerCase();
  if (/dottorato|phd|ph\.d/.test(t)) return ["Dottorato"];
  if (/laurea\s*magistrale|magistrale|master('s)?\s*degree/.test(t)) return ["Laurea magistrale"];
  if (/laurea\s*triennale|triennale|bachelor/.test(t)) return ["Laurea triennale"];
  if (/laurea/.test(t)) return ["Laurea"];
  if (/master\b/.test(t)) return ["Master"];
  if (/diploma/.test(t)) return ["Diploma"];
  return [];
}

function tagsEsperienza(raw: string | undefined): string[] {
  const anni = parseAnni(raw);
  const out: string[] = [];
  if (anni >= 10) out.push("Senior");
  if (anni >= 5) out.push("5+ anni esperienza");
  if (anni >= 1 && anni < 5) out.push("Junior/Mid");
  return out;
}

function tagsCompetenze(comp: string[] | undefined): string[] {
  return (comp ?? [])
    .map((c) => (c ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function tagsCertificazioni(cert: string[] | undefined): string[] {
  return (cert ?? [])
    .map((c) => (c ?? "").trim())
    .filter(Boolean)
    .map((c) => (c.length > 60 ? c.slice(0, 57) + "…" : c));
}

/**
 * Genera tag automatici a partire dalle informazioni estratte.
 * Deduplica preservando l'ordine.
 */
export function generateAutoTags(estratte: InformazioniEstratte | null | undefined): string[] {
  if (!estratte) return [];
  const all = [
    ...tagsLingue(estratte.lingue),
    ...tagsTitoloStudio(estratte.titolo_studio),
    ...tagsEsperienza(estratte.anni_esperienza),
    ...tagsCompetenze(estratte.competenze_tecniche),
    ...tagsCertificazioni(estratte.certificazioni),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of all) {
    const norm = t.trim();
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

/**
 * Unisce tag automatici e tag esistenti (es. manuali), deduplicando case-insensitive
 * ma mantenendo il primo casing incontrato.
 */
export function mergeTags(existing: string[] | null | undefined, auto: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...(existing ?? []), ...auto]) {
    const norm = (t ?? "").trim();
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

/**
 * Colore semantico per la chip di un tag. Restituisce classi Tailwind.
 */
export function tagChipClass(tag: string): string {
  const t = tag.toLowerCase();
  if (/senior|dottorato|magistrale|avanzato|madrelingua/.test(t))
    return "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400";
  if (/junior|triennale|diploma|5\+\s*anni/.test(t))
    return "bg-sky-500/15 text-sky-700 border border-sky-500/30 dark:text-sky-400";
  if (/master|laurea|certificat|iso|pmp|aws|azure|google/.test(t))
    return "bg-amber-500/15 text-amber-700 border border-amber-500/30 dark:text-amber-400";
  return "bg-muted text-muted-foreground border border-border";
}
