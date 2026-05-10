
-- 1. Remove public policies on cvs bucket
DROP POLICY IF EXISTS "Lettura pubblica CV" ON storage.objects;
DROP POLICY IF EXISTS "Upload pubblico CV" ON storage.objects;
DROP POLICY IF EXISTS "Aggiornamento pubblico CV" ON storage.objects;
DROP POLICY IF EXISTS "Eliminazione pubblica CV" ON storage.objects;

-- 2. Add explicit deny for user_roles INSERT/UPDATE/DELETE by non-service users
-- (Only service_role bypasses RLS; no policies = denied for authenticated/anon)
-- Add a restrictive policy to be explicit and defensive
CREATE POLICY "Blocca inserimento ruoli utenti"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "Blocca modifica ruoli utenti"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Blocca eliminazione ruoli utenti"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- 3. Restrict realtime subscriptions to HR users
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo HR può ricevere messaggi realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'hr'::public.app_role));
