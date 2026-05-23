CREATE TABLE public.admin_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users NOT NULL,
  admin_email text,
  action text NOT NULL,
  target_user_id uuid REFERENCES auth.users,
  target_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lettura log"
ON public.admin_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_admin_log_created_at ON public.admin_log (created_at DESC);
CREATE INDEX idx_admin_log_admin_id ON public.admin_log (admin_id);
CREATE INDEX idx_admin_log_target_user_id ON public.admin_log (target_user_id);