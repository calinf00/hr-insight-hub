ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;

CREATE POLICY "Utenti aggiornano il proprio profilo"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);