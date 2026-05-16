import jsPDF from "jspdf";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Candidato = Tables<"candidati"> & { posizioni?: { titolo: string } | null };
type Analisi = Tables<"analisi">;

interface Lingua { lingua: string; livello: string }
interface Estratte {
  nome?: string; cognome?: string; eta?: string; residenza?: string;
  nazionalita?: string; email?: string; telefono?: string;
  lingue?: Lingua[]; titolo_studio?: string; istituto?: string;
  anni_esperienza?: string; ultimo_ruolo?: string;
  competenze_tecniche?: string[]; certificazioni?: Array<string | { nome?: string }>;
  campi_personalizzati?: Record<string, string>;
}
interface Valutazione {
  posizione_id: string; titolo: string; punteggio: number; motivazione: string;
  punti_di_forza: string[]; lacune: string[];
}
interface Risultato {
  valutazioni: Valutazione[]; posizione_migliore_id: string | null;
  motivazione_migliore: string; suggerimenti: string[];
  punti_di_forza_generali: string[]; non_adatto: boolean;
  spiegazione_non_adatto?: string | null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportCandidatiCSV() {
  const { data, error } = await supabase
    .from("candidati")
    .select("*, posizioni(titolo)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: campi } = await supabase
    .from("campi_personalizzati")
    .select("etichetta")
    .order("ordine", { ascending: true });
  const customLabels = (campi || []).map((c) => c.etichetta);

  const rows = (data as Candidato[]).map((c) => {
    const e = (c.informazioni_estratte as Estratte | null) || {};
    const row: Record<string, string> = {
      "Nome": c.nome,
      "Cognome": c.cognome,
      "Email": e.email || "",
      "Telefono": e.telefono || "",
      "Età": e.eta || "",
      "Residenza": e.residenza || "",
      "Nazionalità": e.nazionalita || "",
      "Lingue": (e.lingue || []).map((l) => `${l.lingua} (${l.livello})`).join("; "),
      "Titolo di studio": e.titolo_studio || "",
      "Istituto": e.istituto || "",
      "Anni esperienza": e.anni_esperienza || "",
      "Ultimo ruolo": e.ultimo_ruolo || "",
      "Competenze tecniche": (e.competenze_tecniche || []).join("; "),
      "Certificazioni": (e.certificazioni || []).map((c) => typeof c === "string" ? c : (c?.nome ?? "")).filter(Boolean).join("; "),
      "Ruolo applicato": c.posizioni?.titolo || "",
      "Canale": c.canale || "",
      "Stato analisi": c.stato_analisi,
      "Note HR": c.note || "",
      "Data caricamento": new Date(c.created_at).toLocaleDateString("it-IT"),
    };
    for (const label of customLabels) {
      row[label] = e.campi_personalizzati?.[label] || "";
    }
    return row;
  });

  const csv = Papa.unparse(rows, { quotes: true });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `candidati_${date}.csv`);
}

export async function exportAnalisiPDF(candidatoId: string) {
  const { data: candidato, error: cErr } = await supabase
    .from("candidati")
    .select("*, posizioni(titolo)")
    .eq("id", candidatoId)
    .single();
  if (cErr || !candidato) throw new Error("Candidato non trovato");

  const { data: analisi, error: aErr } = await supabase
    .from("analisi")
    .select("*")
    .eq("candidato_id", candidatoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!analisi) throw new Error("Nessuna analisi disponibile per questo candidato");

  const { data: posizioni } = await supabase
    .from("posizioni")
    .select("id, titolo")
    .in("id", (analisi as Analisi).posizioni_ids || []);
  const posMap = new Map((posizioni || []).map((p) => [p.id, p.titolo]));

  const c = candidato as Candidato;
  const e = (c.informazioni_estratte as Estratte | null) || {};
  const r = (analisi as Analisi).risultato as unknown as Risultato;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const text = (s: string, size = 10, style: "normal" | "bold" = "normal", color: [number, number, number] = [30, 30, 30]) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(s, maxW) as string[];
    const lineH = size * 0.45;
    ensureSpace(lines.length * lineH);
    doc.text(lines, margin, y);
    y += lines.length * lineH + 1;
  };
  const heading = (s: string) => {
    y += 2;
    ensureSpace(8);
    doc.setDrawColor(15, 118, 110);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + 4, y);
    text(s, 12, "bold", [15, 118, 110]);
  };
  const kv = (k: string, v: string) => {
    if (!v) return;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const keyW = 45;
    ensureSpace(5);
    doc.text(k, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(v, maxW - keyW) as string[];
    doc.text(lines, margin + keyW, y);
    y += lines.length * 4 + 1;
  };

  // Title bar
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Report Analisi CV", margin, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Generato il ${new Date().toLocaleDateString("it-IT")} — CV Analyzer`,
    margin, 17,
  );
  y = 30;

  text(`${c.nome} ${c.cognome}`, 18, "bold");
  if (c.posizioni?.titolo) text(`Ruolo applicato: ${c.posizioni.titolo}`, 10, "normal", [100, 100, 100]);

  heading("Informazioni candidato");
  kv("Email", e.email || "");
  kv("Telefono", e.telefono || "");
  kv("Età / Nascita", e.eta || "");
  kv("Residenza", e.residenza || "");
  kv("Nazionalità", e.nazionalita || "");
  kv("Lingue", (e.lingue || []).map((l) => `${l.lingua} (${l.livello})`).join(", "));
  kv("Titolo di studio", e.titolo_studio || "");
  kv("Istituto", e.istituto || "");
  kv("Anni esperienza", e.anni_esperienza || "");
  kv("Ultimo ruolo", e.ultimo_ruolo || "");
  kv("Competenze", (e.competenze_tecniche || []).join(", "));
  kv("Certificazioni", (e.certificazioni || []).join(", "));
  if (e.campi_personalizzati) {
    for (const [k, v] of Object.entries(e.campi_personalizzati)) kv(k, v);
  }

  heading("Risultati Analisi AI");

  const best = r.valutazioni?.find((v) => v.posizione_id === r.posizione_migliore_id);
  if (best) {
    text(`★ Posizione più adatta: ${best.titolo} (${best.punteggio}/100)`, 11, "bold", [15, 118, 110]);
    if (r.motivazione_migliore) text(r.motivazione_migliore, 10);
  }
  if (r.non_adatto) {
    text("⚠ Candidato non adatto a nessuna delle posizioni valutate", 10, "bold", [180, 60, 60]);
    if (r.spiegazione_non_adatto) text(r.spiegazione_non_adatto, 10);
  }

  for (const v of r.valutazioni || []) {
    y += 3;
    ensureSpace(20);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
    text(`${v.titolo} — ${v.punteggio}/100`, 11, "bold");
    if (v.motivazione) text(v.motivazione, 10);
    if (v.punti_di_forza?.length) {
      text("Punti di forza:", 9, "bold", [15, 118, 110]);
      for (const p of v.punti_di_forza) text(`• ${p}`, 9);
    }
    if (v.lacune?.length) {
      text("Lacune:", 9, "bold", [180, 100, 30]);
      for (const p of v.lacune) text(`• ${p}`, 9);
    }
  }

  if (r.suggerimenti?.length) {
    heading("Suggerimenti");
    for (const s of r.suggerimenti) text(`• ${s}`, 10);
  }
  if (r.punti_di_forza_generali?.length) {
    heading("Punti di forza generali");
    for (const s of r.punti_di_forza_generali) text(`• ${s}`, 10);
  }

  // Posizioni valutate
  if (posMap.size > 0) {
    heading("Posizioni confrontate");
    for (const t of posMap.values()) text(`• ${t}`, 9);
  }

  const filename = `analisi_${c.cognome}_${c.nome}_${new Date().toISOString().slice(0, 10)}.pdf`
    .replace(/\s+/g, "_");
  doc.save(filename);
}
