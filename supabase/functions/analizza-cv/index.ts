// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function buildMatchSystemPrompt(lingua: string, soglia: number) {
  return `Sei un esperto HR. Analizza il seguente CV e confrontalo con le seguenti posizioni aperte. \
Per ogni posizione fornisci: punteggio di compatibilità da 0 a 100, motivazione sintetica, \
punti di forza del candidato rispetto al ruolo, eventuali lacune. \
Indica quale posizione è più adatta e perché. \
Considera il candidato NON ADATTO se nessuna posizione raggiunge un punteggio di ${soglia}/100. \
In tal caso imposta "non_adatto": true e spiega chiaramente il motivo. \
Rispondi in ${lingua} in formato JSON strutturato.`;
}

function buildExtractSystemPrompt(lingua: string) {
  return `Sei un esperto HR. Estrai in modo accurato e strutturato le informazioni dal CV fornito. \
Rispondi SEMPRE in ${lingua}. Se un'informazione non è presente nel CV, lascia il campo come stringa vuota o array vuoto — NON inventare. \
Per le lingue, indica nome e livello (es. "Inglese - C1"). Per le competenze tecniche, elenca le principali (max 15). \
Per i campi personalizzati, restituisci un oggetto chiave-valore solo per quelli effettivamente presenti nel CV.`;
}

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

function buildExtractSchema(customFields: Array<{ etichetta: string }>) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      nome: { type: "string" },
      cognome: { type: "string" },
      eta: { type: "string", description: "Età o data di nascita" },
      residenza: { type: "string" },
      nazionalita: { type: "string" },
      email: { type: "string" },
      telefono: { type: "string" },
      lingue: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            lingua: { type: "string" },
            livello: { type: "string" },
          },
          required: ["lingua", "livello"],
        },
      },
      titolo_studio: { type: "string", description: "Titolo di studio più alto conseguito" },
      istituto: { type: "string", description: "Università o istituto di studio principale" },
      anni_esperienza: { type: "string", description: "Anni totali di esperienza lavorativa" },
      ultimo_ruolo: { type: "string" },
      competenze_tecniche: { type: "array", items: { type: "string" } },
      certificazioni: { type: "array", items: { type: "string" } },
      campi_personalizzati: {
        type: "object",
        additionalProperties: { type: "string" },
        description:
          customFields.length > 0
            ? "Estrai questi campi se presenti nel CV: " +
              customFields.map((f) => `"${f.etichetta}"`).join(", ")
            : "Nessun campo personalizzato",
      },
    },
    required: [
      "nome",
      "cognome",
      "eta",
      "residenza",
      "nazionalita",
      "email",
      "telefono",
      "lingue",
      "titolo_studio",
      "istituto",
      "anni_esperienza",
      "ultimo_ruolo",
      "competenze_tecniche",
      "certificazioni",
      "campi_personalizzati",
    ],
  };
}

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

    const { data: candidato, error: cErr } = await supabase
      .from("candidati")
      .select("id, nome, cognome, cv_path, note")
      .eq("id", candidato_id)
      .single();
    if (cErr || !candidato) return json({ error: "Candidato non trovato" }, 404);
    if (!candidato.cv_path) return json({ error: "Il candidato non ha un CV caricato" }, 400);

    // Load app settings (lingua output, soglia, escludi posizioni chiuse)
    const { data: settings } = await supabase
      .from("app_settings")
      .select("lingua_output, soglia_non_idoneo, escludi_posizioni_chiuse")
      .eq("id", "default")
      .maybeSingle();
    const lingua = settings?.lingua_output || "Italiano";
    const soglia = typeof settings?.soglia_non_idoneo === "number" ? settings.soglia_non_idoneo : 30;
    const escludiChiuse = settings?.escludi_posizioni_chiuse !== false;
    // OpenAI key SOLO da secret env
    const openAiKey = Deno.env.get("OPENAI_API_KEY") || null;

    let posQuery = supabase
      .from("posizioni")
      .select("id, titolo, reparto, descrizione, competenze, anni_esperienza, titolo_studio, lingue, luogo, stato")
      .in("id", posizioni_ids);
    if (escludiChiuse) posQuery = posQuery.neq("stato", "chiusa");
    const { data: posizioni, error: pErr } = await posQuery;
    if (pErr || !posizioni || posizioni.length === 0) {
      return json({ error: "Nessuna posizione valida da valutare (controlla che non siano tutte chiuse)" }, 404);
    }

    const { data: customFields } = await supabase
      .from("campi_personalizzati")
      .select("etichetta, descrizione")
      .order("ordine", { ascending: true });
    const fields = customFields || [];


    const { data: file, error: dErr } = await supabase.storage.from("cvs").download(candidato.cv_path);
    if (dErr || !file) return json({ error: "Impossibile scaricare il CV" }, 500);

    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text: pages } = await extractText(pdf, { mergePages: false });
    const cvText = (Array.isArray(pages) ? pages.join("\n\n") : String(pages || "")).trim();
    if (!cvText) return json({ error: "Impossibile estrarre testo dal CV (PDF vuoto o scansione)" }, 422);

    const cvSnippet = cvText.slice(0, 18000);

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

    const matchUserMessage =
      `Candidato: ${candidato.nome} ${candidato.cognome}\n` +
      (candidato.note ? `Note HR: ${candidato.note}\n` : "") +
      `\n## Testo del CV\n${cvSnippet}\n\n## Posizioni da valutare\n${posizioniText}\n\n` +
      `IMPORTANTE: nel campo "valutazioni" usa esattamente l'ID di ciascuna posizione fornito sopra.`;

    const customFieldsText = fields.length
      ? fields
          .map(
            (f) =>
              `- "${f.etichetta}"` + (f.descrizione ? `: ${f.descrizione}` : ""),
          )
          .join("\n")
      : "(nessuno)";

    const extractUserMessage =
      `## Testo del CV\n${cvSnippet}\n\n` +
      `## Campi personalizzati richiesti dall'HR\n${customFieldsText}\n\n` +
      `Estrai le informazioni standard e popola "campi_personalizzati" SOLO con i campi sopra elencati che trovi effettivamente nel CV (chiave = etichetta esatta, valore = testo breve).`;

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!userOpenAiKey && !lovableKey) {
      return json({ error: "Nessuna chiave AI disponibile" }, 500);
    }

    const useOpenAiDirect = !!userOpenAiKey;
    const aiUrl = useOpenAiDirect
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const aiHeaders: Record<string, string> = useOpenAiDirect
      ? { "Content-Type": "application/json", Authorization: `Bearer ${userOpenAiKey}` }
      : { "Content-Type": "application/json", "Lovable-API-Key": lovableKey! };
    const modelName = useOpenAiDirect ? "gpt-4o" : "openai/gpt-5";

    const callAI = async (system: string, user: string, schemaName: string, schema: any) => {
      return await fetch(aiUrl, {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: schemaName, strict: true, schema },
          },
        }),
      });
    };

    const [matchRes, extractRes] = await Promise.all([
      callAI(buildMatchSystemPrompt(lingua, soglia), matchUserMessage, "analisi_cv", RESPONSE_SCHEMA),
      callAI(buildExtractSystemPrompt(lingua), extractUserMessage, "estrazione_cv", buildExtractSchema(fields)),
    ]);


    if (!matchRes.ok) {
      const errText = await matchRes.text();
      console.error("AI match error:", matchRes.status, errText);
      if (matchRes.status === 429) return json({ error: "Limite di richieste AI raggiunto. Riprova tra poco." }, 429);
      if (matchRes.status === 402) return json({ error: "Crediti AI esauriti. Aggiungi crediti al workspace." }, 402);
      return json({ error: "Errore dal servizio AI" }, 500);
    }

    const matchJson = await matchRes.json();
    const matchContent = matchJson.choices?.[0]?.message?.content;
    if (!matchContent) return json({ error: "Risposta AI vuota" }, 500);
    let risultato: any;
    try {
      risultato = typeof matchContent === "string" ? JSON.parse(matchContent) : matchContent;
    } catch {
      return json({ error: "Risposta AI non in formato JSON valido" }, 500);
    }

    let estratte: any = null;
    if (extractRes.ok) {
      try {
        const extractJson = await extractRes.json();
        const c = extractJson.choices?.[0]?.message?.content;
        estratte = typeof c === "string" ? JSON.parse(c) : c;
      } catch (e) {
        console.warn("Extract parse error:", e);
      }
    } else {
      console.warn("Extract AI error:", extractRes.status, await extractRes.text());
    }

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

    const { data: saved, error: sErr } = await supabase
      .from("analisi")
      .insert({
        candidato_id,
        posizioni_ids,
        risultato,
        best_posizione_id: bestPosId,
        best_score: bestScore,
        modello: modelName,
      })
      .select()
      .single();
    if (sErr) {
      console.error("Save error:", sErr);
      return json({ error: "Errore nel salvataggio dell'analisi" }, 500);
    }

    const update: Record<string, unknown> = { stato_analisi: "analizzato" };
    if (estratte) update.informazioni_estratte = estratte;
    await supabase.from("candidati").update(update).eq("id", candidato_id);

    return json({ analisi: saved, informazioni_estratte: estratte });
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
