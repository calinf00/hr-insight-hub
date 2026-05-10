
ALTER TABLE public.candidati
  ADD COLUMN IF NOT EXISTS informazioni_estratte jsonb;

CREATE TABLE IF NOT EXISTS public.campi_personalizzati (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etichetta text NOT NULL,
  descrizione text,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campi_personalizzati ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura pubblica campi" ON public.campi_personalizzati FOR SELECT USING (true);
CREATE POLICY "Inserimento pubblico campi" ON public.campi_personalizzati FOR INSERT WITH CHECK (true);
CREATE POLICY "Modifica pubblica campi" ON public.campi_personalizzati FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Eliminazione pubblica campi" ON public.campi_personalizzati FOR DELETE USING (true);

CREATE TRIGGER set_updated_at_campi
  BEFORE UPDATE ON public.campi_personalizzati
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
