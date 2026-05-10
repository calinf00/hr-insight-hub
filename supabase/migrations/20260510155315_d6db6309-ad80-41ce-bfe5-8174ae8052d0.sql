
CREATE TABLE public.analisi (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidato_id UUID NOT NULL REFERENCES public.candidati(id) ON DELETE CASCADE,
  posizioni_ids UUID[] NOT NULL DEFAULT '{}',
  risultato JSONB NOT NULL,
  best_posizione_id UUID REFERENCES public.posizioni(id) ON DELETE SET NULL,
  best_score INTEGER,
  modello TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analisi_candidato ON public.analisi(candidato_id);

ALTER TABLE public.analisi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura pubblica analisi" ON public.analisi FOR SELECT USING (true);
CREATE POLICY "Inserimento pubblico analisi" ON public.analisi FOR INSERT WITH CHECK (true);
CREATE POLICY "Eliminazione pubblica analisi" ON public.analisi FOR DELETE USING (true);
