ALTER TYPE public.stato_analisi ADD VALUE IF NOT EXISTS 'errore_estrazione';
ALTER TABLE public.candidati ADD COLUMN IF NOT EXISTS note_errore text;