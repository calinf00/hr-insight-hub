CREATE POLICY "Admin inserisce log"
  ON public.admin_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));