ALTER TABLE public.posizioni REPLICA IDENTITY FULL;
ALTER TABLE public.candidati REPLICA IDENTITY FULL;
ALTER TABLE public.analisi REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posizioni;
ALTER PUBLICATION supabase_realtime ADD TABLE public.candidati;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analisi;