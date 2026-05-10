
-- 1. Rimuovi colonna openai_api_key (gestita come secret)
ALTER TABLE public.app_settings DROP COLUMN IF EXISTS openai_api_key;

-- 2. Sistema ruoli
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('hr', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Utenti vedono i propri ruoli" ON public.user_roles;
CREATE POLICY "Utenti vedono i propri ruoli" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. Auto-assegnazione ruolo hr a ogni nuovo signup
CREATE OR REPLACE FUNCTION public.handle_new_user_assign_hr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'hr')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_hr ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_hr
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_assign_hr();

-- 4. Rimuovi policy pubbliche e ricrea per soli HR autenticati
-- POSIZIONI
DROP POLICY IF EXISTS "Accesso pubblico lettura posizioni" ON public.posizioni;
DROP POLICY IF EXISTS "Accesso pubblico inserimento posizioni" ON public.posizioni;
DROP POLICY IF EXISTS "Accesso pubblico modifica posizioni" ON public.posizioni;
DROP POLICY IF EXISTS "Accesso pubblico eliminazione posizioni" ON public.posizioni;

CREATE POLICY "HR lettura posizioni" ON public.posizioni
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR inserimento posizioni" ON public.posizioni
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR modifica posizioni" ON public.posizioni
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'hr')) WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR eliminazione posizioni" ON public.posizioni
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'hr'));

-- CANDIDATI
DROP POLICY IF EXISTS "Lettura pubblica candidati" ON public.candidati;
DROP POLICY IF EXISTS "Inserimento pubblico candidati" ON public.candidati;
DROP POLICY IF EXISTS "Modifica pubblica candidati" ON public.candidati;
DROP POLICY IF EXISTS "Eliminazione pubblica candidati" ON public.candidati;

CREATE POLICY "HR lettura candidati" ON public.candidati
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR inserimento candidati" ON public.candidati
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR modifica candidati" ON public.candidati
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'hr')) WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR eliminazione candidati" ON public.candidati
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'hr'));

-- ANALISI
DROP POLICY IF EXISTS "Lettura pubblica analisi" ON public.analisi;
DROP POLICY IF EXISTS "Inserimento pubblico analisi" ON public.analisi;
DROP POLICY IF EXISTS "Eliminazione pubblica analisi" ON public.analisi;

CREATE POLICY "HR lettura analisi" ON public.analisi
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR inserimento analisi" ON public.analisi
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR eliminazione analisi" ON public.analisi
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'hr'));

-- CAMPI PERSONALIZZATI
DROP POLICY IF EXISTS "Lettura pubblica campi" ON public.campi_personalizzati;
DROP POLICY IF EXISTS "Inserimento pubblico campi" ON public.campi_personalizzati;
DROP POLICY IF EXISTS "Modifica pubblica campi" ON public.campi_personalizzati;
DROP POLICY IF EXISTS "Eliminazione pubblica campi" ON public.campi_personalizzati;

CREATE POLICY "HR lettura campi" ON public.campi_personalizzati
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR inserimento campi" ON public.campi_personalizzati
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR modifica campi" ON public.campi_personalizzati
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'hr')) WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR eliminazione campi" ON public.campi_personalizzati
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'hr'));

-- APP SETTINGS
DROP POLICY IF EXISTS "Lettura pubblica settings" ON public.app_settings;
DROP POLICY IF EXISTS "Inserimento pubblico settings" ON public.app_settings;
DROP POLICY IF EXISTS "Modifica pubblica settings" ON public.app_settings;

CREATE POLICY "HR lettura settings" ON public.app_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR inserimento settings" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR modifica settings" ON public.app_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'hr')) WITH CHECK (public.has_role(auth.uid(), 'hr'));

-- 5. Storage policies per bucket cvs (privato, solo HR)
DROP POLICY IF EXISTS "Lettura pubblica cvs" ON storage.objects;
DROP POLICY IF EXISTS "Inserimento pubblico cvs" ON storage.objects;
DROP POLICY IF EXISTS "Modifica pubblica cvs" ON storage.objects;
DROP POLICY IF EXISTS "Eliminazione pubblica cvs" ON storage.objects;
DROP POLICY IF EXISTS "HR lettura cvs" ON storage.objects;
DROP POLICY IF EXISTS "HR upload cvs" ON storage.objects;
DROP POLICY IF EXISTS "HR modifica cvs" ON storage.objects;
DROP POLICY IF EXISTS "HR eliminazione cvs" ON storage.objects;

CREATE POLICY "HR lettura cvs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR upload cvs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs' AND public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR modifica cvs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs' AND public.has_role(auth.uid(), 'hr'))
  WITH CHECK (bucket_id = 'cvs' AND public.has_role(auth.uid(), 'hr'));
CREATE POLICY "HR eliminazione cvs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cvs' AND public.has_role(auth.uid(), 'hr'));
