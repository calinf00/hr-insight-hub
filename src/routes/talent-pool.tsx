import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Download,
  Eye,
  Filter,
  Columns3,
  Sparkles,
  Archive,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Tag as TagIcon,
  Plus,
  Pencil,
  PenLine,
  X,
  FormInput,
} from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { tagChipClass } from "@/lib/auto-tags";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { handleDbError } from "@/lib/handle-error";

export const Route = createFileRoute("/talent-pool")({
  head: () => ({ meta: [{ title: "Talent Pool — CV Analyzer" }] }),
  component: TalentPoolPage,
});

type Candidato = Tables<"candidati">;
type Posizione = Tables<"posizioni">;
type Analisi = Tables<"analisi">;

interface Lingua {
  lingua: string;
  livello?: string;
}
interface Estratte {
  email?: string;
  telefono?: string;
  eta?: string;
  residenza?: string;
  nazionalita?: string;
  lingue?: Lingua[];
  titolo_studio?: string;
  istituto?: string;
  anni_esperienza?: string;
  ultimo_ruolo?: string;
  competenze_tecniche?: string[];
  certificazioni?: Array<string | { nome?: string }>;
  campi_personalizzati?: Record<string, string>;
}
interface Valutazione {
  posizione_id: string;
  titolo: string;
  punteggio: number;
  motivazione: string;
  punti_di_forza: string[];
  lacune: string[];
}
interface Risultato {
  valutazioni: Valutazione[];
  posizione_migliore_id: string | null;
  motivazione_migliore: string;
  suggerimenti: string[];
  punti_di_forza_generali: string[];
  non_adatto: boolean;
  spiegazione_non_adatto?: string | null;
}

type StatoPool = "attivo" | "rivalutare" | "archiviato" | "non_idoneo";

const STATI: { value: StatoPool | "tutti"; label: string; className?: string }[] = [
  { value: "tutti", label: "Tutti" },
  { value: "attivo", label: "Attivo" },
  { value: "rivalutare", label: "Da rivalutare" },
  { value: "archiviato", label: "Archiviato" },
  { value: "non_idoneo", label: "Non idoneo" },
];

const STATO_BADGE: Record<StatoPool, { label: string; className: string }> = {
  attivo: { label: "Attivo", className: "bg-emerald-600 hover:bg-emerald-600 text-white" },
  rivalutare: { label: "Da rivalutare", className: "bg-amber-500 hover:bg-amber-500 text-white" },
  archiviato: { label: "Archiviato", className: "bg-muted text-muted-foreground" },
  non_idoneo: { label: "Non idoneo", className: "bg-destructive text-destructive-foreground" },
};

const STATI_POOL_KEY = "cv-analyzer:talent-pool:stati";
const TAGS_KEY = "cv-analyzer:talent-pool:tags";
const COLS_KEY = "cv-analyzer:talent-pool:cols";

function loadMap<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function saveMap<T>(key: string, m: Record<string, T>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(m));
}

function parseEsperienza(raw: string | undefined | null): number {
  if (!raw) return 0;
  const m = raw.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function scoreColor(s: number | null | undefined) {
  if (s == null) return "bg-muted text-muted-foreground";
  if (s >= 80) return "bg-emerald-600 text-white";
  if (s >= 60) return "bg-amber-500 text-white";
  if (s >= 40) return "bg-orange-500 text-white";
  return "bg-destructive text-destructive-foreground";
}

function isModificatoManualmente(est: Estratte | null | undefined): boolean {
  return !!(est as (Estratte & { _modificato_manualmente?: boolean }) | null | undefined)
    ?._modificato_manualmente;
}

function isCompletatoManualmente(c: { stato_analisi: string }): boolean {
  return c.stato_analisi === "completato_manualmente";
}

function isEstratteVuoto(est: Estratte | null | undefined): boolean {
  if (!est) return true;
  const keys = Object.keys(est).filter((k) => !k.startsWith("_"));
  if (keys.length === 0) return true;
  return keys.every((k) => {
    const v = (est as Record<string, unknown>)[k];
    if (v == null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v as object).length === 0;
    return false;
  });
}

const TITOLI_STUDIO_OPTIONS = [
  "Nessuno",
  "Diploma",
  "Laurea triennale",
  "Laurea magistrale",
  "Master/Dottorato",
] as const;

type ColKey =
  | "email"
  | "citta"
  | "titolo_studio"
  | "esperienza"
  | "ultimo_ruolo"
  | "lingue"
  | "competenze"
  | "tag"
  | "stato"
  | "punteggio"
  | "data"
  | "note";

const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "citta", label: "Città" },
  { key: "titolo_studio", label: "Titolo di studio" },
  { key: "esperienza", label: "Esperienza" },
  { key: "ultimo_ruolo", label: "Ultimo ruolo" },
  { key: "lingue", label: "Lingue" },
  { key: "competenze", label: "Competenze" },
  { key: "tag", label: "Tag" },
  { key: "stato", label: "Stato" },
  { key: "punteggio", label: "Miglior punteggio" },
  { key: "data", label: "Data candidatura" },
  { key: "note", label: "Note HR" },
];

const DEFAULT_COLS: ColKey[] = [
  "email",
  "citta",
  "titolo_studio",
  "esperienza",
  "ultimo_ruolo",
  "competenze",
  "tag",
  "stato",
  "punteggio",
  "data",
];

type SortKey = "data" | "punteggio" | "esperienza" | "cognome";

type Row = {
  candidato: Candidato;
  estratte: Estratte | null;
  stato: StatoPool;
  tags: string[];
  bestScore: number | null;
  bestAnalisi: Analisi | null;
  allAnalisi: Analisi[];
  scorePerPosizione: Map<string, number>; // posizione_id -> punteggio
};

function TalentPoolPage() {
  const queryClient = useQueryClient();

  // Persisted UI maps
  const [statiMap, setStatiMap] = useState<Record<string, StatoPool>>(() => loadMap<StatoPool>(STATI_POOL_KEY));
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>(() => loadMap<string[]>(TAGS_KEY));
  const [visibleCols, setVisibleCols] = useState<ColKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLS;
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) return JSON.parse(raw) as ColKey[];
    } catch {
      // ignore
    }
    return DEFAULT_COLS;
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(COLS_KEY, JSON.stringify(visibleCols));
  }, [visibleCols]);

  // Filters
  const [search, setSearch] = useState("");
  const [citta, setCitta] = useState("");
  const [titoloStudio, setTitoloStudio] = useState<string>("tutti");
  const [espRange, setEspRange] = useState<[number, number]>([0, 20]);
  const [lingueSel, setLingueSel] = useState<string[]>([]);
  const [statoFilter, setStatoFilter] = useState<StatoPool | "tutti">("tutti");
  const [dataFrom, setDataFrom] = useState("");
  const [dataTo, setDataTo] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "data", dir: "desc" });

  const [posizioneFilter, setPosizioneFilter] = useState<string>("");
  const [macrocategoriaFilter, setMacrocategoriaFilter] = useState<string>("");

  // Talent search by posizione
  const [cercaPosId, setCercaPosId] = useState<string>("");

  // Detail / associa dialog
  const [openCandidatoId, setOpenCandidatoId] = useState<string | null>(null);
  const [associaOpen, setAssociaOpen] = useState(false);
  const [associaCandidatoId, setAssociaCandidatoId] = useState<string | null>(null);
  const [associaPosId, setAssociaPosId] = useState<string>("");
  const [tagInput, setTagInput] = useState("");

  // Data
  const { data: candidati, isLoading: loadingCand } = useQuery({
    queryKey: ["talent-pool", "candidati"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidati")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Candidato[];
    },
  });

  const { data: analisi } = useQuery({
    queryKey: ["talent-pool", "analisi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analisi")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Analisi[];
    },
  });

  const { data: posizioni } = useQuery({
    queryKey: ["talent-pool", "posizioni"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("id, titolo, reparto, stato, macrocategoria")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Posizione, "id" | "titolo" | "reparto" | "stato" | "macrocategoria">[];
    },
  });

  const posizioniAperte = useMemo(
    () => (posizioni ?? []).filter((p) => p.stato === "aperta"),
    [posizioni],
  );

  // Build rows
  const rows: Row[] = useMemo(() => {
    if (!candidati) return [];
    const analisiByCand = new Map<string, Analisi[]>();
    for (const a of analisi ?? []) {
      const arr = analisiByCand.get(a.candidato_id) ?? [];
      arr.push(a);
      analisiByCand.set(a.candidato_id, arr);
    }
    return candidati.map<Row>((c) => {
      const estratte = (c.informazioni_estratte as Estratte | null) ?? null;
      const all = analisiByCand.get(c.id) ?? [];
      // best score across all analyses
      let bestScore: number | null = null;
      let bestAnalisi: Analisi | null = null;
      const scorePerPos = new Map<string, number>();
      for (const a of all) {
        if (a.best_score != null) {
          if (bestScore == null || a.best_score > bestScore) {
            bestScore = a.best_score;
            bestAnalisi = a;
          }
        }
        const r = a.risultato as unknown as Risultato | null;
        for (const v of r?.valutazioni ?? []) {
          const prev = scorePerPos.get(v.posizione_id);
          if (prev == null || v.punteggio > prev) scorePerPos.set(v.posizione_id, v.punteggio);
        }
      }
      return {
        candidato: c,
        estratte,
        stato: statiMap[c.id] ?? "attivo",
        tags: (c.tags ?? []).length > 0 ? (c.tags as string[]) : (tagsMap[c.id] ?? []),
        bestScore,
        bestAnalisi,
        allAnalisi: all,
        scorePerPosizione: scorePerPos,
      };
    });
  }, [candidati, analisi, statiMap, tagsMap]);

  // Unique helpers for filter options
  const tuttiTitoli = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const t = r.estratte?.titolo_studio?.trim();
      if (t) s.add(t);
    }
    return Array.from(s).sort();
  }, [rows]);

  const tutteLingue = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      for (const l of r.estratte?.lingue ?? []) {
        if (l.lingua) s.add(l.lingua.trim());
      }
    }
    return Array.from(s).sort();
  }, [rows]);

  const tuttiTag = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) for (const t of r.tags) s.add(t);
    return Array.from(s).sort();
  }, [rows]);

  const tutteMacrocategorie = useMemo(() => {
    const s = new Set<string>();
    for (const p of posizioni ?? []) {
      if (p.macrocategoria?.trim()) s.add(p.macrocategoria.trim());
    }
    return Array.from(s).sort();
  }, [posizioni]);

  // Filtered + sorted
  const filtered: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cittaQ = citta.trim().toLowerCase();
    const from = dataFrom ? new Date(dataFrom) : null;
    const to = dataTo ? new Date(`${dataTo}T23:59:59`) : null;
    const out = rows.filter((r) => {
      if (statoFilter !== "tutti" && r.stato !== statoFilter) return false;
      if (titoloStudio !== "tutti" && r.estratte?.titolo_studio !== titoloStudio) return false;
      const esp = parseEsperienza(r.estratte?.anni_esperienza);
      if (esp < espRange[0] || esp > espRange[1]) return false;
      if (lingueSel.length > 0) {
        const own = new Set((r.estratte?.lingue ?? []).map((l) => l.lingua));
        if (!lingueSel.every((l) => own.has(l))) return false;
      }
      if (cittaQ) {
        const c = (r.estratte?.residenza ?? "").toLowerCase();
        if (!c.includes(cittaQ)) return false;
      }
      if (tagFilter.length > 0) {
        if (!tagFilter.every((t) => r.tags.includes(t))) return false;
      }
      if (posizioneFilter) {
        const hasAnalisi = r.allAnalisi.some((a) => a.posizioni_ids.includes(posizioneFilter));
        if (!hasAnalisi) return false;
      }
      if (macrocategoriaFilter) {
        const hasMacrocategoria = r.allAnalisi.some((a) =>
          a.posizioni_ids.some((pid) => {
            const pos = posizioni?.find((p) => p.id === pid);
            return pos?.macrocategoria === macrocategoriaFilter;
          })
        );
        if (!hasMacrocategoria) return false;
      }
      if (from || to) {
        const d = new Date(r.candidato.created_at);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (q) {
        const hay = [
          r.candidato.nome,
          r.candidato.cognome,
          r.estratte?.email,
          r.estratte?.ultimo_ruolo,
          (r.estratte?.competenze_tecniche ?? []).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      switch (sort.key) {
        case "data":
          return (
            (new Date(a.candidato.created_at).getTime() -
              new Date(b.candidato.created_at).getTime()) *
            dir
          );
        case "punteggio":
          return ((a.bestScore ?? -1) - (b.bestScore ?? -1)) * dir;
        case "esperienza":
          return (
            (parseEsperienza(a.estratte?.anni_esperienza) -
              parseEsperienza(b.estratte?.anni_esperienza)) *
            dir
          );
        case "cognome":
          return a.candidato.cognome.localeCompare(b.candidato.cognome) * dir;
      }
    });
    return out;
  }, [
    rows,
    search,
    citta,
    titoloStudio,
    espRange,
    lingueSel,
    statoFilter,
    dataFrom,
    dataTo,
    tagFilter,
    posizioneFilter,
    macrocategoriaFilter,
    posizioni,
    sort,
  ]);

  // Talent search results (per posizione)
  const cercaResults: Row[] = useMemo(() => {
    if (!cercaPosId) return [];
    const list = rows
      .map((r) => ({ r, score: r.scorePerPosizione.get(cercaPosId) ?? null }))
      .filter((x) => x.score != null) as { r: Row; score: number }[];
    list.sort((a, b) => b.score - a.score);
    return list.map((x) => ({ ...x.r, bestScore: x.score }));
  }, [rows, cercaPosId]);

  const cercaDaRivalutare = useMemo(
    () => cercaResults.filter((r) => r.stato === "rivalutare" && (r.bestScore ?? 0) > 60),
    [cercaResults],
  );

  // Mutations
  const updateStato = (cid: string, s: StatoPool) => {
    setStatiMap((prev) => {
      const next = { ...prev, [cid]: s };
      saveMap(STATI_POOL_KEY, next);
      return next;
    });
    toast.success(`Stato aggiornato: ${STATO_BADGE[s].label}`);
  };

  const updateTags = async (cid: string, tags: string[]) => {
    // Persistenza primaria su DB; fallback su localStorage in caso di errore RLS
    setTagsMap((prev) => {
      const next = { ...prev, [cid]: tags };
      saveMap(TAGS_KEY, next);
      return next;
    });
    const { error } = await supabase.from("candidati").update({ tags }).eq("id", cid);
    if (error) {
      toast.error("Tag salvati solo localmente");
    } else {
      void queryClient.invalidateQueries({ queryKey: ["talent-pool", "candidati"] });
    }
  };

  const noteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.from("candidati").update({ note }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota aggiornata");
      void queryClient.invalidateQueries({ queryKey: ["talent-pool", "candidati"] });
    },
    onError: (e) => handleDbError(e, "Errore aggiornamento nota"),
  });

  // --- Modifica manuale dei dati estratti ---
  const [editEstratte, setEditEstratte] = useState(false);
  const [editForm, setEditForm] = useState<{
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    residenza: string;
    nazionalita: string;
    titolo_studio: string;
    istituto: string;
    anni_esperienza: string;
    ultimo_ruolo: string;
    competenze_tecniche: string; // separato da virgola/newline
    lingue: Lingua[];
  } | null>(null);

  const startEdit = (cand: Candidato, est: Estratte | null) => {
    setEditForm({
      nome: cand.nome ?? "",
      cognome: cand.cognome ?? "",
      email: est?.email ?? "",
      telefono: est?.telefono ?? "",
      residenza: est?.residenza ?? "",
      nazionalita: est?.nazionalita ?? "",
      titolo_studio: est?.titolo_studio ?? "",
      istituto: est?.istituto ?? "",
      anni_esperienza: est?.anni_esperienza ?? "",
      ultimo_ruolo: est?.ultimo_ruolo ?? "",
      competenze_tecniche: (est?.competenze_tecniche ?? []).join(", "),
      lingue: (est?.lingue ?? []).map((l) => ({ lingua: l.lingua ?? "", livello: l.livello ?? "" })),
    });
    setEditEstratte(true);
  };

  const saveEstratteMutation = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: Estratte | null }) => {
      if (!editForm) return;
      const competenze = editForm.competenze_tecniche
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const lingue = editForm.lingue
        .map((l) => ({ lingua: l.lingua.trim(), livello: (l.livello ?? "").trim() || undefined }))
        .filter((l) => l.lingua);
      const nextEstratte: Estratte & { _modificato_manualmente: boolean } = {
        ...(current ?? {}),
        email: editForm.email.trim() || undefined,
        telefono: editForm.telefono.trim() || undefined,
        residenza: editForm.residenza.trim() || undefined,
        nazionalita: editForm.nazionalita.trim() || undefined,
        titolo_studio: editForm.titolo_studio.trim() || undefined,
        istituto: editForm.istituto.trim() || undefined,
        anni_esperienza: editForm.anni_esperienza.trim() || undefined,
        ultimo_ruolo: editForm.ultimo_ruolo.trim() || undefined,
        competenze_tecniche: competenze,
        lingue,
        _modificato_manualmente: true,
      };
      const { error } = await supabase
        .from("candidati")
        .update({
          nome: editForm.nome.trim() || "—",
          cognome: editForm.cognome.trim() || "—",
          informazioni_estratte: nextEstratte as never,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dati aggiornati");
      setEditEstratte(false);
      setEditForm(null);
      void queryClient.invalidateQueries({ queryKey: ["talent-pool", "candidati"] });
      void queryClient.invalidateQueries({ queryKey: ["talent-pool"] });
    },
    onError: (e) => handleDbError(e, "Errore aggiornamento dati"),
  });

  // --- Inserimento manuale (per candidati con errore o dati vuoti) ---
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCandidato, setManualCandidato] = useState<Candidato | null>(null);
  const [manualForm, setManualForm] = useState({
    nome: "",
    cognome: "",
    email: "",
    telefono: "",
    residenza: "",
    nazionalita: "",
    titolo_studio: "Nessuno" as (typeof TITOLI_STUDIO_OPTIONS)[number],
    istituto: "",
    anni_esperienza: "",
    ultimo_ruolo: "",
    competenze_tecniche: "",
    lingue: [] as Lingua[],
  });

  const openManualDialog = (c: Candidato) => {
    const est = (c.informazioni_estratte as Estratte | null) ?? null;
    setManualCandidato(c);
    setManualForm({
      nome: c.nome === "In elaborazione..." ? "" : c.nome ?? "",
      cognome: c.cognome === "" ? "" : c.cognome ?? "",
      email: est?.email ?? "",
      telefono: est?.telefono ?? "",
      residenza: est?.residenza ?? "",
      nazionalita: est?.nazionalita ?? "",
      titolo_studio:
        (TITOLI_STUDIO_OPTIONS as readonly string[]).includes(est?.titolo_studio ?? "")
          ? (est!.titolo_studio as (typeof TITOLI_STUDIO_OPTIONS)[number])
          : "Nessuno",
      istituto: est?.istituto ?? "",
      anni_esperienza: est?.anni_esperienza ?? "",
      ultimo_ruolo: est?.ultimo_ruolo ?? "",
      competenze_tecniche: (est?.competenze_tecniche ?? []).join("\n"),
      lingue: (est?.lingue ?? []).map((l) => ({ lingua: l.lingua ?? "", livello: l.livello ?? "" })),
    });
    setManualOpen(true);
  };

  const manualSaveMutation = useMutation({
    mutationFn: async () => {
      if (!manualCandidato) return;
      const nome = manualForm.nome.trim();
      const cognome = manualForm.cognome.trim();
      if (!nome || !cognome) throw new Error("Nome e cognome sono obbligatori");
      const competenze = manualForm.competenze_tecniche
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      const lingue = manualForm.lingue
        .map((l) => ({ lingua: l.lingua.trim(), livello: (l.livello ?? "").trim() || undefined }))
        .filter((l) => l.lingua);
      const nextEstratte = {
        email: manualForm.email.trim() || undefined,
        telefono: manualForm.telefono.trim() || undefined,
        residenza: manualForm.residenza.trim() || undefined,
        nazionalita: manualForm.nazionalita.trim() || undefined,
        titolo_studio: manualForm.titolo_studio,
        istituto: manualForm.istituto.trim() || undefined,
        anni_esperienza: manualForm.anni_esperienza.trim() || undefined,
        ultimo_ruolo: manualForm.ultimo_ruolo.trim() || undefined,
        competenze_tecniche: competenze,
        lingue,
        _modificato_manualmente: true,
        _inserimento_manuale: true,
      };
      const { error } = await supabase
        .from("candidati")
        .update({
          nome,
          cognome,
          informazioni_estratte: nextEstratte as never,
          stato_analisi: "completato_manualmente" as never,
          note_errore: null,
        })
        .eq("id", manualCandidato.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dati inseriti correttamente");
      setManualOpen(false);
      setManualCandidato(null);
      void queryClient.invalidateQueries({ queryKey: ["talent-pool", "candidati"] });
      void queryClient.invalidateQueries({ queryKey: ["talent-pool"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Errore salvataggio";
      toast.error(msg);
    },
  });

  // Estrae il messaggio completo restituito dalla edge function (incluso body).
  const extractInvokeError = async (error: any): Promise<string> => {
    try {
      const ctx = error?.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) return String(body.error);
        return JSON.stringify(body);
      }
      if (ctx && typeof ctx.text === "function") {
        const txt = await ctx.text();
        if (txt) return txt;
      }
    } catch {
      // ignora
    }
    return error?.message || "Errore sconosciuto";
  };

  const associaMutation = useMutation({
    mutationFn: async ({ candidatoId, posizioneId }: { candidatoId: string; posizioneId: string }) => {
      const { error } = await supabase.functions.invoke("analizza-cv", {
        body: { candidato_id: candidatoId, posizioni_ids: [posizioneId], extract_only: false },
      });
      if (error) throw new Error(await extractInvokeError(error));
    },
    onSuccess: () => {
      toast.success("Analisi avviata sulla nuova posizione");
      setAssociaOpen(false);
      setAssociaCandidatoId(null);
      setAssociaPosId("");
      void queryClient.invalidateQueries({ queryKey: ["talent-pool", "analisi"] });
    },
    onError: (e: any) => {
      console.error("[associa] errore edge function:", e);
      toast.error(e?.message || "Errore associazione posizione", { duration: 10000 });
    },
  });

  // Rilancia l'analisi per un singolo candidato (es. dopo "errore_estrazione").
  const retryMutation = useMutation({
    mutationFn: async (candidatoId: string) => {
      const cand = (candidati ?? []).find((c) => c.id === candidatoId);
      // Posizione: usa quella già associata, altrimenti la prima aperta.
      let posId = cand?.posizione_id ?? null;
      if (!posId) posId = posizioniAperte[0]?.id ?? null;
      if (!posId) throw new Error("Nessuna posizione aperta disponibile per la rianalisi.");
      await supabase.from("candidati").update({ stato_analisi: "in_attesa", note_errore: null }).eq("id", candidatoId);
      const { error } = await supabase.functions.invoke("analizza-cv", {
        body: { candidato_id: candidatoId, posizioni_ids: [posId], extract_only: false },
      });
      if (error) throw new Error(await extractInvokeError(error));
    },
    onSuccess: () => {
      toast.success("Analisi rilanciata");
      void queryClient.invalidateQueries({ queryKey: ["talent-pool", "candidati"] });
      void queryClient.invalidateQueries({ queryKey: ["talent-pool", "analisi"] });
    },
    onError: (e: any) => {
      console.error("[retry] errore edge function:", e);
      toast.error(e?.message || "Errore nel rilancio dell'analisi", { duration: 10000 });
    },
  });

  const openCandidato = useMemo(
    () => rows.find((r) => r.candidato.id === openCandidatoId) ?? null,
    [rows, openCandidatoId],
  );

  const exportCSV = (data: Row[], filename: string) => {
    if (data.length === 0) {
      toast.error("Nessun dato da esportare");
      return;
    }
    const csv = Papa.unparse(
      data.map((r) => ({
        Nome: r.candidato.nome,
        Cognome: r.candidato.cognome,
        Email: r.estratte?.email ?? "",
        Citta: r.estratte?.residenza ?? "",
        TitoloStudio: r.estratte?.titolo_studio ?? "",
        AnniEsperienza: r.estratte?.anni_esperienza ?? "",
        UltimoRuolo: r.estratte?.ultimo_ruolo ?? "",
        Lingue: (r.estratte?.lingue ?? []).map((l) => l.lingua).join(", "),
        Competenze: (r.estratte?.competenze_tecniche ?? []).join(", "),
        Tag: r.tags.join(", "),
        Stato: STATO_BADGE[r.stato].label,
        MigliorPunteggio: r.bestScore ?? "",
        DataCandidatura: fmtDate(r.candidato.created_at),
        Note: r.candidato.note ?? "",
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch("");
    setCitta("");
    setTitoloStudio("tutti");
    setEspRange([0, 20]);
    setLingueSel([]);
    setStatoFilter("tutti");
    setDataFrom("");
    setDataTo("");
    setTagFilter([]);
    setPosizioneFilter("");
    setMacrocategoriaFilter("");
  };

  const showCol = (k: ColKey) => visibleCols.includes(k);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Talent Pool</h1>
          <p className="text-muted-foreground">
            Archivio storico candidati — riusa profili ricevuti per nuove posizioni
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportCSV(filtered, "talent-pool.csv")}>
            <Download className="h-4 w-4 mr-2" />
            Esporta CSV
          </Button>
        </div>
      </div>

      {/* Cerca nei CV storici */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Cerca nei CV storici
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Seleziona una posizione aperta per ordinare i candidati per compatibilità
            (usa punteggi già calcolati).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[260px]">
              <Label className="text-xs">Posizione</Label>
              <Select value={cercaPosId} onValueChange={setCercaPosId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona posizione aperta" />
                </SelectTrigger>
                <SelectContent>
                  {posizioniAperte.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titolo}
                      {p.reparto ? ` — ${p.reparto}` : ""}
                    </SelectItem>
                  ))}
                  {posizioniAperte.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nessuna posizione aperta
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            {cercaPosId && (
              <Button variant="ghost" onClick={() => setCercaPosId("")}>
                Pulisci
              </Button>
            )}
          </div>

          {cercaPosId && cercaDaRivalutare.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-sm">
                  Da rivalutare con punteggio &gt; 60 ({cercaDaRivalutare.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {cercaDaRivalutare.map((r) => (
                  <button
                    key={r.candidato.id}
                    onClick={() => setOpenCandidatoId(r.candidato.id)}
                    className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm hover:bg-muted"
                  >
                    <span className="font-medium">
                      {r.candidato.nome} {r.candidato.cognome}
                    </span>
                    <Badge className={scoreColor(r.bestScore)}>{r.bestScore}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {cercaPosId && (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Esperienza</TableHead>
                    <TableHead>Compatibilità</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cercaResults.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        Nessun candidato ha un punteggio per questa posizione.
                      </TableCell>
                    </TableRow>
                  )}
                  {cercaResults.slice(0, 50).map((r) => (
                    <TableRow key={r.candidato.id}>
                      <TableCell>
                        <div className="font-medium">
                          {r.candidato.nome} {r.candidato.cognome}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.estratte?.ultimo_ruolo ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATO_BADGE[r.stato].className}>
                          {STATO_BADGE[r.stato].label}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.estratte?.anni_esperienza ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={scoreColor(r.bestScore)}>{r.bestScore}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenCandidatoId(r.candidato.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtri */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" /> Filtri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label className="text-xs">Ricerca libera</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Nome, cognome, email, competenze, ruolo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Città / residenza</Label>
              <Input
                placeholder="Es. Milano"
                value={citta}
                onChange={(e) => setCitta(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Stato candidato</Label>
              <Select
                value={statoFilter}
                onValueChange={(v) => setStatoFilter(v as StatoPool | "tutti")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATI.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label className="text-xs">Posizione candidata</Label>
              <Select value={posizioneFilter} onValueChange={setPosizioneFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tutte le posizioni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tutte le posizioni</SelectItem>
                  {(posizioni ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titolo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Macrocategoria</Label>
              <Select value={macrocategoriaFilter} onValueChange={setMacrocategoriaFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tutte</SelectItem>
                  {tutteMacrocategorie.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Periodo da</Label>
              <Input type="date" value={dataFrom} onChange={(e) => setDataFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Periodo a</Label>
              <Input type="date" value={dataTo} onChange={(e) => setDataTo(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs">
                Anni esperienza: {espRange[0]} – {espRange[1] >= 20 ? "20+" : espRange[1]}
              </Label>
              <Slider
                min={0}
                max={20}
                step={1}
                value={espRange}
                onValueChange={(v) => setEspRange([v[0], v[1]] as [number, number])}
                className="mt-3"
              />
            </div>
            <div>
              <Label className="text-xs">Lingue parlate</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {lingueSel.length === 0
                      ? "Tutte"
                      : `${lingueSel.length} selezionate`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuLabel>Seleziona lingue</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {tutteLingue.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Nessuna lingua</div>
                  )}
                  {tutteLingue.map((l) => (
                    <DropdownMenuCheckboxItem
                      key={l}
                      checked={lingueSel.includes(l)}
                      onCheckedChange={(chk) =>
                        setLingueSel((prev) =>
                          chk ? [...prev, l] : prev.filter((x) => x !== l),
                        )
                      }
                    >
                      {l}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div>
              <Label className="text-xs">Tag</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {tagFilter.length === 0 ? "Tutti" : `${tagFilter.length} selezionati`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuLabel>Filtra per tag</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {tuttiTag.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Nessun tag</div>
                  )}
                  {tuttiTag.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t}
                      checked={tagFilter.includes(t)}
                      onCheckedChange={(chk) =>
                        setTagFilter((prev) =>
                          chk ? [...prev, t] : prev.filter((x) => x !== t),
                        )
                      }
                    >
                      {t}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reimposta filtri
            </Button>
            <div className="flex gap-2">
              <Select
                value={`${sort.key}:${sort.dir}`}
                onValueChange={(v) => {
                  const [k, d] = v.split(":") as [SortKey, "asc" | "desc"];
                  setSort({ key: k, dir: d });
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data:desc">Data candidatura ↓</SelectItem>
                  <SelectItem value="data:asc">Data candidatura ↑</SelectItem>
                  <SelectItem value="punteggio:desc">Punteggio ↓</SelectItem>
                  <SelectItem value="punteggio:asc">Punteggio ↑</SelectItem>
                  <SelectItem value="esperienza:desc">Esperienza ↓</SelectItem>
                  <SelectItem value="esperienza:asc">Esperienza ↑</SelectItem>
                  <SelectItem value="cognome:asc">Cognome A→Z</SelectItem>
                  <SelectItem value="cognome:desc">Cognome Z→A</SelectItem>
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Columns3 className="h-4 w-4 mr-2" />
                    Colonne
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>Mostra colonne</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLS.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.key}
                      checked={visibleCols.includes(c.key)}
                      onCheckedChange={(chk) =>
                        setVisibleCols((prev) =>
                          chk ? [...prev, c.key] : prev.filter((k) => k !== c.key),
                        )
                      }
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabella */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {loadingCand ? "Caricamento…" : `${filtered.length} candidati`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Nome e cognome</TableHead>
                  {showCol("email") && <TableHead>Email</TableHead>}
                  {showCol("citta") && <TableHead>Città</TableHead>}
                  {showCol("titolo_studio") && <TableHead>Titolo di studio</TableHead>}
                  {showCol("esperienza") && <TableHead>Esperienza</TableHead>}
                  {showCol("ultimo_ruolo") && <TableHead>Ultimo ruolo</TableHead>}
                  {showCol("lingue") && <TableHead>Lingue</TableHead>}
                  {showCol("competenze") && <TableHead>Competenze</TableHead>}
                  {showCol("tag") && <TableHead>Tag</TableHead>}
                  {showCol("stato") && <TableHead>Stato</TableHead>}
                  {showCol("punteggio") && <TableHead>Miglior punt.</TableHead>}
                  {showCol("data") && <TableHead>Data</TableHead>}
                  {showCol("note") && <TableHead>Note</TableHead>}
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleCols.length + 2} className="text-center text-muted-foreground py-10">
                      Nessun candidato corrisponde ai filtri.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow key={r.candidato.id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => setOpenCandidatoId(r.candidato.id)}
                        className="hover:underline text-left"
                      >
                        {r.candidato.nome} {r.candidato.cognome}
                      </button>
                      {isModificatoManualmente(r.estratte) && (
                        <Badge
                          className="ml-2 align-middle bg-blue-500/15 text-blue-700 border border-blue-500/30 dark:text-blue-400"
                          title="Dati modificati manualmente"
                        >
                          <PenLine className="h-3 w-3 mr-1" />
                          Modificato
                        </Badge>
                      )}
                      {r.candidato.nome === "In elaborazione..." && (
                        <Badge className="ml-2 bg-yellow-500/15 text-yellow-700 border border-yellow-500/30 dark:text-yellow-400">
                          ⚠ Dati incompleti
                        </Badge>
                      )}
                      {r.candidato.stato_analisi === "errore_estrazione" && (
                        <span className="inline-flex items-center gap-2 ml-2 align-middle">
                          <Badge className="bg-red-500/15 text-red-700 border border-red-500/30 dark:text-red-400">
                            Estrazione fallita
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            disabled={retryMutation.isPending}
                            onClick={() => retryMutation.mutate(r.candidato.id)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Riprova
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={() => openManualDialog(r.candidato)}
                          >
                            <FormInput className="h-3 w-3 mr-1" />
                            Compila manualmente
                          </Button>
                        </span>
                      )}
                      {r.candidato.stato_analisi !== "errore_estrazione" &&
                        !isCompletatoManualmente(r.candidato) &&
                        isEstratteVuoto(r.estratte) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs ml-2 align-middle"
                            onClick={() => openManualDialog(r.candidato)}
                          >
                            <FormInput className="h-3 w-3 mr-1" />
                            Compila manualmente
                          </Button>
                        )}
                      {isCompletatoManualmente(r.candidato) && (
                        <Badge className="ml-2 align-middle bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Compilato manualmente
                        </Badge>
                      )}
                      {r.candidato.note_errore && r.candidato.stato_analisi === "errore_estrazione" && (
                        <div className="text-xs text-muted-foreground mt-1">{r.candidato.note_errore}</div>
                      )}
                    </TableCell>
                    {showCol("email") && (
                      <TableCell className="text-sm">{r.estratte?.email ?? "—"}</TableCell>
                    )}
                    {showCol("citta") && (
                      <TableCell className="text-sm">{r.estratte?.residenza ?? "—"}</TableCell>
                    )}
                    {showCol("titolo_studio") && (
                      <TableCell className="text-sm">{r.estratte?.titolo_studio ?? "—"}</TableCell>
                    )}
                    {showCol("esperienza") && (
                      <TableCell className="text-sm">{r.estratte?.anni_esperienza ?? "—"}</TableCell>
                    )}
                    {showCol("ultimo_ruolo") && (
                      <TableCell className="text-sm">{r.estratte?.ultimo_ruolo ?? "—"}</TableCell>
                    )}
                    {showCol("lingue") && (
                      <TableCell className="text-sm">
                        {(r.estratte?.lingue ?? []).map((l) => l.lingua).join(", ") || "—"}
                      </TableCell>
                    )}
                    {showCol("competenze") && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[260px]">
                          {(r.estratte?.competenze_tecniche ?? []).slice(0, 4).map((c, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {c}
                            </Badge>
                          ))}
                          {(r.estratte?.competenze_tecniche?.length ?? 0) > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{(r.estratte?.competenze_tecniche?.length ?? 0) - 4}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {showCol("tag") && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <Badge key={t} variant="outline" className={`text-xs ${tagChipClass(t)}`}>
                              {t}
                            </Badge>
                          ))}
                          {r.tags.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {showCol("stato") && (
                      <TableCell>
                        <Badge className={STATO_BADGE[r.stato].className}>
                          {STATO_BADGE[r.stato].label}
                        </Badge>
                      </TableCell>
                    )}
                    {showCol("punteggio") && (
                      <TableCell>
                        {r.bestScore != null ? (
                          <Badge className={scoreColor(r.bestScore)}>{r.bestScore}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    {showCol("data") && (
                      <TableCell className="text-sm whitespace-nowrap">
                        {fmtDate(r.candidato.created_at)}
                      </TableCell>
                    )}
                    {showCol("note") && (
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {r.candidato.note ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenCandidatoId(r.candidato.id)}
                          title="Apri scheda"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" title="Cambia stato">
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Cambia stato</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                              checked={r.stato === "attivo"}
                              onCheckedChange={() => updateStato(r.candidato.id, "attivo")}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Attivo
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              checked={r.stato === "rivalutare"}
                              onCheckedChange={() => updateStato(r.candidato.id, "rivalutare")}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-2" /> Da rivalutare
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              checked={r.stato === "archiviato"}
                              onCheckedChange={() => updateStato(r.candidato.id, "archiviato")}
                            >
                              <Archive className="h-3.5 w-3.5 mr-2" /> Archiviato
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              checked={r.stato === "non_idoneo"}
                              onCheckedChange={() => updateStato(r.candidato.id, "non_idoneo")}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-2" /> Non idoneo
                            </DropdownMenuCheckboxItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Associa a posizione"
                          onClick={() => {
                            setAssociaCandidatoId(r.candidato.id);
                            setAssociaPosId("");
                            setAssociaOpen(true);
                          }}
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet
        open={!!openCandidatoId}
        onOpenChange={(v) => !v && setOpenCandidatoId(null)}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {openCandidato && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {openCandidato.candidato.nome} {openCandidato.candidato.cognome}
                </SheetTitle>
                <SheetDescription>
                  Candidatura del {fmtDate(openCandidato.candidato.created_at)}
                </SheetDescription>
                {isModificatoManualmente(openCandidato.estratte) && (
                  <Badge className="mt-2 w-fit bg-blue-500/15 text-blue-700 border border-blue-500/30 dark:text-blue-400">
                    <PenLine className="h-3 w-3 mr-1" />
                    Dati modificati manualmente
                  </Badge>
                )}
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Stato + tags */}
                <div className="space-y-2">
                  <Label className="text-xs">Stato</Label>
                  <Select
                    value={openCandidato.stato}
                    onValueChange={(v) => updateStato(openCandidato.candidato.id, v as StatoPool)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attivo">Attivo</SelectItem>
                      <SelectItem value="rivalutare">Da rivalutare</SelectItem>
                      <SelectItem value="archiviato">Archiviato</SelectItem>
                      <SelectItem value="non_idoneo">Non idoneo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Tag</Label>
                  <div className="flex flex-wrap gap-1">
                    {openCandidato.tags.map((t) => (
                      <Badge key={t} variant="outline" className={`text-xs ${tagChipClass(t)}`}>
                        {t}
                        <button
                          className="ml-1 hover:text-destructive"
                          onClick={() =>
                            void updateTags(
                              openCandidato.candidato.id,
                              openCandidato.tags.filter((x) => x !== t),
                            )
                          }
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Aggiungi tag…"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagInput.trim()) {
                          const t = tagInput.trim();
                          if (!openCandidato.tags.includes(t)) {
                            void updateTags(openCandidato.candidato.id, [...openCandidato.tags, t]);
                          }
                          setTagInput("");
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const t = tagInput.trim();
                        if (!t) return;
                        if (!openCandidato.tags.includes(t)) {
                          void updateTags(openCandidato.candidato.id, [...openCandidato.tags, t]);
                        }
                        setTagInput("");
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Estratti */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">Dati estratti dal CV</h3>
                    {!editEstratte ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => startEdit(openCandidato.candidato, openCandidato.estratte)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Modifica dati
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setEditEstratte(false);
                          setEditForm(null);
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Annulla
                      </Button>
                    )}
                  </div>

                  {!editEstratte && (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <Info label="Email" value={openCandidato.estratte?.email} />
                        <Info label="Telefono" value={openCandidato.estratte?.telefono} />
                        <Info label="Residenza" value={openCandidato.estratte?.residenza} />
                        <Info label="Nazionalità" value={openCandidato.estratte?.nazionalita} />
                        <Info label="Titolo di studio" value={openCandidato.estratte?.titolo_studio} />
                        <Info label="Istituto" value={openCandidato.estratte?.istituto} />
                        <Info label="Anni esperienza" value={openCandidato.estratte?.anni_esperienza} />
                        <Info label="Ultimo ruolo" value={openCandidato.estratte?.ultimo_ruolo} />
                      </div>
                      {(openCandidato.estratte?.competenze_tecniche?.length ?? 0) > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-muted-foreground mb-1">Competenze</div>
                          <div className="flex flex-wrap gap-1">
                            {openCandidato.estratte?.competenze_tecniche?.map((c, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {(openCandidato.estratte?.lingue?.length ?? 0) > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-muted-foreground mb-1">Lingue</div>
                          <div className="flex flex-wrap gap-1">
                            {openCandidato.estratte?.lingue?.map((l, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {l.lingua}
                                {l.livello ? ` (${l.livello})` : ""}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {editEstratte && editForm && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Nome</Label>
                          <Input
                            value={editForm.nome}
                            onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cognome</Label>
                          <Input
                            value={editForm.cognome}
                            onChange={(e) => setEditForm({ ...editForm, cognome: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Email</Label>
                          <Input
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Telefono</Label>
                          <Input
                            value={editForm.telefono}
                            onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Residenza</Label>
                          <Input
                            value={editForm.residenza}
                            onChange={(e) => setEditForm({ ...editForm, residenza: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Nazionalità</Label>
                          <Input
                            value={editForm.nazionalita}
                            onChange={(e) => setEditForm({ ...editForm, nazionalita: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Titolo di studio</Label>
                          <Input
                            value={editForm.titolo_studio}
                            onChange={(e) => setEditForm({ ...editForm, titolo_studio: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Istituto</Label>
                          <Input
                            value={editForm.istituto}
                            onChange={(e) => setEditForm({ ...editForm, istituto: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Anni esperienza</Label>
                          <Input
                            value={editForm.anni_esperienza}
                            onChange={(e) => setEditForm({ ...editForm, anni_esperienza: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Ultimo ruolo</Label>
                          <Input
                            value={editForm.ultimo_ruolo}
                            onChange={(e) => setEditForm({ ...editForm, ultimo_ruolo: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">
                          Competenze tecniche (separate da virgola o a capo)
                        </Label>
                        <Textarea
                          rows={3}
                          value={editForm.competenze_tecniche}
                          onChange={(e) =>
                            setEditForm({ ...editForm, competenze_tecniche: e.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Lingue</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              setEditForm({
                                ...editForm,
                                lingue: [...editForm.lingue, { lingua: "", livello: "" }],
                              })
                            }
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Aggiungi
                          </Button>
                        </div>
                        {editForm.lingue.length === 0 && (
                          <p className="text-xs text-muted-foreground">Nessuna lingua.</p>
                        )}
                        {editForm.lingue.map((l, i) => (
                          <div key={i} className="flex gap-2">
                            <Input
                              placeholder="Lingua"
                              value={l.lingua}
                              onChange={(e) => {
                                const next = [...editForm.lingue];
                                next[i] = { ...next[i], lingua: e.target.value };
                                setEditForm({ ...editForm, lingue: next });
                              }}
                            />
                            <Input
                              placeholder="Livello"
                              value={l.livello ?? ""}
                              onChange={(e) => {
                                const next = [...editForm.lingue];
                                next[i] = { ...next[i], livello: e.target.value };
                                setEditForm({ ...editForm, lingue: next });
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const next = editForm.lingue.filter((_, idx) => idx !== i);
                                setEditForm({ ...editForm, lingue: next });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          className="flex-1"
                          disabled={saveEstratteMutation.isPending}
                          onClick={() =>
                            saveEstratteMutation.mutate({
                              id: openCandidato.candidato.id,
                              current: openCandidato.estratte,
                            })
                          }
                        >
                          {saveEstratteMutation.isPending ? "Salvataggio…" : "Salva modifiche"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditEstratte(false);
                            setEditForm(null);
                          }}
                        >
                          Annulla
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Punteggi */}
                <div>
                  <h3 className="font-semibold text-sm mb-2">
                    Punteggi per posizione ({openCandidato.scorePerPosizione.size})
                  </h3>
                  {openCandidato.scorePerPosizione.size === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessuna analisi.</p>
                  ) : (
                    <div className="space-y-1">
                      {Array.from(openCandidato.scorePerPosizione.entries())
                        .sort((a, b) => b[1] - a[1])
                        .map(([pid, score]) => {
                          const p = posizioni?.find((x) => x.id === pid);
                          return (
                            <div
                              key={pid}
                              className="flex items-center justify-between text-sm rounded border px-2 py-1"
                            >
                              <span className="truncate">{p?.titolo ?? "Posizione rimossa"}</span>
                              <Badge className={scoreColor(score)}>{score}</Badge>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Note HR */}
                <div className="space-y-2">
                  <Label className="text-xs">Note HR</Label>
                  <Textarea
                    defaultValue={openCandidato.candidato.note ?? ""}
                    rows={4}
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (val !== (openCandidato.candidato.note ?? "")) {
                        noteMutation.mutate({ id: openCandidato.candidato.id, note: val });
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Salvataggio automatico quando lasci il campo.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setAssociaCandidatoId(openCandidato.candidato.id);
                      setAssociaPosId("");
                      setAssociaOpen(true);
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Associa a nuova posizione
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Inserimento manuale dialog */}
      <Dialog
        open={manualOpen}
        onOpenChange={(v) => {
          if (!v) {
            setManualOpen(false);
            setManualCandidato(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Inserimento manuale dati CV — {manualCandidato?.nome} {manualCandidato?.cognome}
            </DialogTitle>
            <DialogDescription>
              Compila i campi che riesci a ricavare dal CV. I dati saranno marcati come
              inseriti manualmente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">
                  Nome <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={manualForm.nome}
                  onChange={(e) => setManualForm({ ...manualForm, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Cognome <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={manualForm.cognome}
                  onChange={(e) => setManualForm({ ...manualForm, cognome: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={manualForm.email}
                  onChange={(e) => setManualForm({ ...manualForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefono</Label>
                <Input
                  value={manualForm.telefono}
                  onChange={(e) => setManualForm({ ...manualForm, telefono: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Residenza</Label>
                <Input
                  value={manualForm.residenza}
                  onChange={(e) => setManualForm({ ...manualForm, residenza: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nazionalità</Label>
                <Input
                  value={manualForm.nazionalita}
                  onChange={(e) => setManualForm({ ...manualForm, nazionalita: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Titolo di studio</Label>
                <Select
                  value={manualForm.titolo_studio}
                  onValueChange={(v) =>
                    setManualForm({
                      ...manualForm,
                      titolo_studio: v as (typeof TITOLI_STUDIO_OPTIONS)[number],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TITOLI_STUDIO_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Istituto</Label>
                <Input
                  value={manualForm.istituto}
                  onChange={(e) => setManualForm({ ...manualForm, istituto: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Anni di esperienza</Label>
                <Input
                  type="number"
                  min={0}
                  value={manualForm.anni_esperienza}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, anni_esperienza: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ultimo ruolo</Label>
                <Input
                  value={manualForm.ultimo_ruolo}
                  onChange={(e) => setManualForm({ ...manualForm, ultimo_ruolo: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Competenze tecniche (una per riga)</Label>
              <Textarea
                rows={4}
                value={manualForm.competenze_tecniche}
                onChange={(e) =>
                  setManualForm({ ...manualForm, competenze_tecniche: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Lingue</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setManualForm({
                      ...manualForm,
                      lingue: [...manualForm.lingue, { lingua: "", livello: "" }],
                    })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Aggiungi lingua
                </Button>
              </div>
              {manualForm.lingue.length === 0 && (
                <p className="text-xs text-muted-foreground">Nessuna lingua inserita.</p>
              )}
              {manualForm.lingue.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Lingua (es. Inglese)"
                    value={l.lingua}
                    onChange={(e) => {
                      const next = [...manualForm.lingue];
                      next[i] = { ...next[i], lingua: e.target.value };
                      setManualForm({ ...manualForm, lingue: next });
                    }}
                  />
                  <Input
                    placeholder="Livello (es. B2)"
                    value={l.livello ?? ""}
                    onChange={(e) => {
                      const next = [...manualForm.lingue];
                      next[i] = { ...next[i], livello: e.target.value };
                      setManualForm({ ...manualForm, lingue: next });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setManualForm({
                        ...manualForm,
                        lingue: manualForm.lingue.filter((_, idx) => idx !== i),
                      })
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setManualOpen(false);
                setManualCandidato(null);
              }}
            >
              Annulla
            </Button>
            <Button
              disabled={manualSaveMutation.isPending}
              onClick={() => manualSaveMutation.mutate()}
            >
              {manualSaveMutation.isPending ? "Salvataggio…" : "Salva dati"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Associa dialog */}
      <Dialog open={associaOpen} onOpenChange={setAssociaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Associa a nuova posizione</DialogTitle>
            <DialogDescription>
              Verrà lanciata una nuova analisi AI sulla posizione selezionata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Posizione</Label>
            <Select value={associaPosId} onValueChange={setAssociaPosId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona posizione aperta" />
              </SelectTrigger>
              <SelectContent>
                {posizioniAperte.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.titolo}
                    {p.reparto ? ` — ${p.reparto}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssociaOpen(false)}>
              Annulla
            </Button>
            <Button
              disabled={!associaCandidatoId || !associaPosId || associaMutation.isPending}
              onClick={() =>
                associaCandidatoId &&
                associaPosId &&
                associaMutation.mutate({
                  candidatoId: associaCandidatoId,
                  posizioneId: associaPosId,
                })
              }
            >
              {associaMutation.isPending ? "Avvio…" : "Lancia analisi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate">{value || "—"}</div>
    </div>
  );
}
