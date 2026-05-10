
CREATE TYPE public.stato_analisi AS ENUM ('in_attesa', 'analizzato');
CREATE TYPE public.canale_provenienza AS ENUM ('linkedin', 'sito', 'referral', 'altro');

CREATE TABLE public.candidati (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  canale public.canale_provenienza,
  note TEXT,
  cv_path TEXT,
  cv_filename TEXT,
  posizione_id UUID REFERENCES public.posizioni(id) ON DELETE SET NULL,
  stato_analisi public.stato_analisi NOT NULL DEFAULT 'in_attesa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.candidati ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura pubblica candidati" ON public.candidati FOR SELECT USING (true);
CREATE POLICY "Inserimento pubblico candidati" ON public.candidati FOR INSERT WITH CHECK (true);
CREATE POLICY "Modifica pubblica candidati" ON public.candidati FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Eliminazione pubblica candidati" ON public.candidati FOR DELETE USING (true);

CREATE TRIGGER candidati_updated_at BEFORE UPDATE ON public.candidati
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket per i CV (privato, accessibile via signed URL)
INSERT INTO storage.buckets (id, name, public) VALUES ('cvs', 'cvs', false);

CREATE POLICY "Lettura pubblica CV" ON storage.objects FOR SELECT
  USING (bucket_id = 'cvs');
CREATE POLICY "Upload pubblico CV" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cvs');
CREATE POLICY "Aggiornamento pubblico CV" ON storage.objects FOR UPDATE
  USING (bucket_id = 'cvs');
CREATE POLICY "Eliminazione pubblica CV" ON storage.objects FOR DELETE
  USING (bucket_id = 'cvs');
