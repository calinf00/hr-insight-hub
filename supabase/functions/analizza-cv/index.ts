// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Sei un esperto HR. Analizza il seguente CV e confrontalo con le seguenti posizioni aperte. \
Per ogni posizione fornisci: punteggio di compatibilità da 0 a 100, motivazione sintetica, \
punti di forza del candidato rispetto al ruolo, eventuali lacune. \
Indica quale posizione è più adatta e perché. \
Se il candidato non è adatto a nessuna posizione, spiegalo chiaramente. \
Rispondi in italiano in formato JSON strutturato.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    valutazioni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          posizione_id: { type: "string" },
          titolo: { type: "string" },
          punteggio: { type: "integer", minimum: 0, maximum: 100 },
          motivazione: { type: "string" },
          punti_di_forza: { type: "array", items: { type: "string" } },
          lacune: { type: "array", items: { type: "string" } },
        },
        required: ["posizione_id", "titolo", "punteggio", "motivazione", "punti_di_forza", "lacune"],
      },
    },
    posizione_migliore_id: { type: ["string", "null"] },
    motivazione_migliore: { type: "string" },
    suggerimenti: { type: "array", items: { type: "string" } },
    punti_di_forza_generali: { type: "array", items: { type: "string" } },
    non_adatto: { type: "boolean" },
    spiegazione_non_adatto: { type: ["string", "null"] },
  },
  required: [
    "valutazioni",
    "posizione_migliore_id",
    "motivazione_migliore",
    "suggerimenti",
    "punti_di_forza_generali",
    "non_adatto",
  ],
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidato_id, posizioni_ids } = await req.json();
    if (!candidato_id || !Array.isArray(posizioni_ids) || posizioni_ids.length === 0) {
      return json({ error: "candidato_id e posizioni_ids sono obbligatori" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Fetch candidato
    const { data: candidato, error: cErr } = await supabase
      .from("candidati")
      .select("id, nome, cognome, cv_path, note")
      .eq("id", candidato_id)
      .single();
    if (cErr || !candidato) return json({ error: "Candidato non trovato" }, 404);
    if (!candidato.cv_path) return json({ error: "Il candidato non ha un CV caricato" }, 400);

    // 2. Fetch posizioni
    const { data: posizioni, error: pErr } = await supabase
      .from("posizioni")
      .select("id, titolo, reparto, descrizione, competenze, anni_esperienza, titolo_studio, lingue, luogo")
      .in("id", posizioni_ids);
    if (pErr || !posizioni || posizioni.length === 0) {
      return json({ error: "Nessuna posizione trovata" }, 404);
    }

    // 3. Download CV from storage and extract text
    const { data: file, error: dErr } = await supabase.storage.from("cvs").download(candidato.cv_path);
    if (dErr || !file) return json({ error: "Impossibile scaricare il CV" }, 500);

    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text: pages } = await extractText(pdf, { mergePages: false });
    const cvText = (Array.isArray(pages) ? pages.join("\n\n") : String(pages || "")).trim();
    if (!cvText) return json({ error: "Impossibile estrarre testo dal CV (PDF vuoto o scansione)" }, 422);

    // 4. Build user message
    const posizioniText = posizioni
      .map(
        (p, i) =>
          `### Posizione ${i + 1}\n` +
          `- ID: ${p.id}\n` +
          `- Titolo: ${p.titolo}\n` +
          (p.reparto ? `- Reparto: ${p.reparto}\n` : "") +
          (p.luogo ? `- Luogo: ${p.luogo}\n` : "") +
          (p.anni_esperienza ? `- Esperienza minima: ${p.anni_esperienza} anni\n` : "") +
          `- Titolo di studio richiesto: ${p.titolo_studio}\n` +
          (p.lingue ? `- Lingue: ${p.lingue}\n` : "") +
          (p.competenze ? `- Competenze richieste: ${p.competenze}\n` : "") +
          `- Descrizione:\n${p.descrizione}`,
      )
      .join("\n\n");

    const userMessage =
      `Candidato: ${candidato.nome} ${candidato.cognome}\n` +
      (candidato.note ? `Note HR: ${candidato.note}\n` : "") +
      `\n## Testo del CV\n${cvText.slice(0, 18000)}\n\n## Posizioni da valutare\n${posizioniText}\n\n` +
      `IMPORTANTE: nel campo "valutazioni" usa esattamente l'ID di ciascuna posizione fornito sopra.`;

    // 5. Call Lovable AI Gateway (OpenAI GPT-5)
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY non configurata" }, 500);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "analisi_cv", strict: true, schema: RESPONSE_SCHEMA },
        },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      if (aiRes.status === 429) return json({ error: "Limite di richieste AI raggiunto. Riprova tra poco." }, 429);
      if (aiRes.status === 402) return json({ error: "Crediti AI esauriti. Aggiungi crediti al workspace." }, 402);
      return json({ error: "Errore dal servizio AI" }, 500);
    }

    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content;
    if (!content) return json({ error: "Risposta AI vuota" }, 500);

    let risultato: any;
    try {
      risultato = typeof content === "string" ? JSON.parse(content) : content;
    } catch (_e) {
      return json({ error: "Risposta AI non in formato JSON valido" }, 500);
    }

    // 6. Compute best
    const valutazioni: any[] = Array.isArray(risultato.valutazioni) ? risultato.valutazioni : [];
    const validIds = new Set(posizioni.map((p) => p.id));
    valutazioni.forEach((v) => {
      if (!validIds.has(v.posizione_id)) {
        const match = posizioni.find((p) => p.titolo === v.titolo);
        if (match) v.posizione_id = match.id;
      }
    });

    let bestPosId: string | null = risultato.posizione_migliore_id ?? null;
    if (bestPosId && !validIds.has(bestPosId)) bestPosId = null;
    let bestScore: number | null = null;
    if (bestPosId) {
      const found = valutazioni.find((v) => v.posizione_id === bestPosId);
      bestScore = found?.punteggio ?? null;
    } else if (valutazioni.length > 0) {
      const sorted = [...valutazioni].sort((a, b) => (b.punteggio ?? 0) - (a.punteggio ?? 0));
      bestPosId = sorted[0].posizione_id ?? null;
      bestScore = sorted[0].punteggio ?? null;
    }

    // 7. Save analisi
    const { data: saved, error: sErr } = await supabase
      .from("analisi")
      .insert({
        candidato_id,
        posizioni_ids,
        risultato,
        best_posizione_id: bestPosId,
        best_score: bestScore,
        modello: "openai/gpt-5",
      })
      .select()
      .single();
    if (sErr) {
      console.error("Save error:", sErr);
      return json({ error: "Errore nel salvataggio dell'analisi" }, 500);
    }

    // 8. Mark candidato as analizzato
    await supabase.from("candidati").update({ stato_analisi: "analizzato" }).eq("id", candidato_id);

    return json({ analisi: saved });
  } catch (e) {
    console.error("Errore inatteso:", e);
    return json({ error: e instanceof Error ? e.message : "Errore inatteso" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
