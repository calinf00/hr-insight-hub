
CREATE TYPE public.posizione_stato AS ENUM ('aperta', 'chiusa');
CREATE TYPE public.titolo_studio AS ENUM ('nessuno', 'diploma', 'laurea_triennale', 'laurea_magistrale', 'master_dottorato');

CREATE TABLE public.posizioni (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titolo TEXT NOT NULL,
  reparto TEXT,
  descrizione TEXT NOT NULL,
  competenze TEXT,
  anni_esperienza INTEGER,
  titolo_studio public.titolo_studio NOT NULL DEFAULT 'nessuno',
  lingue TEXT,
  luogo TEXT,
  stato public.posizione_stato NOT NULL DEFAULT 'aperta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.posizioni ENABLE ROW LEVEL SECURITY;

-- Internal HR tool: no auth yet, allow all access. Tighten when auth is added.
CREATE POLICY "Accesso pubblico lettura posizioni" ON public.posizioni FOR SELECT USING (true);
CREATE POLICY "Accesso pubblico inserimento posizioni" ON public.posizioni FOR INSERT WITH CHECK (true);
CREATE POLICY "Accesso pubblico modifica posizioni" ON public.posizioni FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Accesso pubblico eliminazione posizioni" ON public.posizioni FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER posizioni_updated_at BEFORE UPDATE ON public.posizioni
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
