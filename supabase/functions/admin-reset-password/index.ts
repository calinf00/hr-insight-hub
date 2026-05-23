import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface RequestBody {
  userId: string;
  newPassword: string;
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
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
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json() as RequestBody;
    const { userId, newPassword } = body;

    if (!userId || typeof userId !== "string") {
      return jsonResponse({ error: "userId is required" }, 400);
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return jsonResponse({ error: "newPassword must be at least 6 characters" }, 400);
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verifica che il chiamante abbia ruolo admin
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "admin");

    if (rolesError || !roles || roles.length === 0) {
      return jsonResponse({ error: "Forbidden: admin role required" }, 403);
    }

    const { data: targetUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getUserError) {
      return jsonResponse({ error: getUserError.message }, 400);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 400);
    }

    // Recupera email admin
    const { data: callerUser } = await supabaseAdmin.auth.admin.getUserById(callerUserId);

    await supabaseAdmin.from("admin_log").insert({
      admin_id: callerUserId,
      admin_email: callerUser?.user?.email ?? null,
      action: "reset_password",
      target_user_id: userId,
      target_email: targetUser?.user?.email ?? null,
    });

    return jsonResponse({ success: true }, 200);
  } catch (err: any) {
    console.error("admin-reset-password error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
