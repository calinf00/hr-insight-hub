ALTER TABLE public.candidati
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_candidati_tags ON public.candidati USING GIN (tags);
