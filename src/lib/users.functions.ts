import { createServerFn } from "@tanstack/react-start";

export const getUserLastSignIns = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    return (data.users || []).map((u) => ({
      id: u.id,
      last_sign_in_at: u.last_sign_in_at,
    }));
  }
);
