
CREATE TABLE IF NOT EXISTS public.app_settings (
  id text PRIMARY KEY DEFAULT 'default',
  openai_api_key text,
  lingua_output text NOT NULL DEFAULT 'Italiano',
  soglia_non_idoneo integer NOT NULL DEFAULT 30,
  escludi_posizioni_chiuse boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 'default'),
  CONSTRAINT app_settings_soglia_range CHECK (soglia_non_idoneo BETWEEN 0 AND 100)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura pubblica settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Inserimento pubblico settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Modifica pubblica settings" ON public.app_settings FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER set_updated_at_app_settings
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
