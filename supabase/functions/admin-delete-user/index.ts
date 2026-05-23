import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface RequestBody {
  userId: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function decodeJwtPayload(jwt: string): { sub?: string; [key: string]: unknown } | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = 4 - (payload.length % 4);
    if (padding !== 4) payload += "=".repeat(padding);
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { userId } = body;
    if (!userId || typeof userId !== "string") {
      return jsonResponse({ error: "userId is required" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid Authorization header" }, 403);
    }
    const jwt = authHeader.slice(7);
    const payload = decodeJwtPayload(jwt);
    const callerUserId = payload?.sub;
    if (!callerUserId) {
      return jsonResponse({ error: "Invalid JWT token" }, 403);
    }

    if (callerUserId === userId) {
      return jsonResponse({ error: "Non puoi eliminare il tuo stesso account" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verifica admin
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "admin");
    if (rolesError || !roles || roles.length === 0) {
      return jsonResponse({ error: "Forbidden: admin role required" }, 403);
    }

    // Recupera info target prima della cancellazione
    const { data: targetUser, error: getUserError } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (getUserError) {
      console.error("admin-delete-user getUserById:", getUserError);
      return jsonResponse({ error: "Impossibile eliminare l'account" }, 400);
    }
    const targetEmail = targetUser?.user?.email ?? null;

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("admin-delete-user deleteUser:", deleteError);
      return jsonResponse({ error: "Impossibile eliminare l'account" }, 400);
    }

    const { data: callerUser } = await supabaseAdmin.auth.admin.getUserById(callerUserId);

    await supabaseAdmin.from("admin_log").insert({
      admin_id: callerUserId,
      admin_email: callerUser?.user?.email ?? null,
      action: "delete_user",
      target_user_id: userId,
      target_email: targetEmail,
    });

    return jsonResponse({ success: true }, 200);
  } catch (err: any) {
    console.error("admin-delete-user error:", err);
    return jsonResponse({ error: "Errore durante l'eliminazione" }, 500);
  }
});
