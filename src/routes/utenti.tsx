import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/utenti")({
  beforeLoad: async () => {
    const { redirect } = await import("@tanstack/react-router");
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) throw redirect({ to: "/" });
    const { data: adminCheck } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminCheck) throw redirect({ to: "/" });
  },
  component: UtentiPage,
});

type ProfileRow = { id: string; email: string; created_at: string };
type RoleRow = { user_id: string; role: "hr" | "admin" };

function UtentiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    setMeId(uid);
    if (!uid) { setLoading(false); return; }

    const { data: adminCheck } = await supabase
      .from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    const admin = !!adminCheck;
    setIsAdmin(admin);

    if (admin) {
      const [{ data: ps }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("id, email, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      setProfiles((ps as ProfileRow[]) ?? []);
      setRoles((rs as RoleRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const rolesOf = (uid: string) => roles.filter((r) => r.user_id === uid).map((r) => r.role);

  const grantHr = async (uid: string) => {
    setBusyId(uid);
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "hr" });
    setBusyId(null);
    if (error) { toast.error("Impossibile concedere l'accesso"); return; }
    toast.success("Accesso HR concesso");
    void load();
  };

  const revokeHr = async (uid: string) => {
    setBusyId(uid);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "hr");
    setBusyId(null);
    if (error) { toast.error("Impossibile rimuovere l'accesso"); return; }
    toast.success("Accesso HR rimosso");
    void load();
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h2 className="text-base font-semibold">Accesso riservato</h2>
        <p className="mt-1 text-sm text-muted-foreground">Solo gli amministratori possono gestire gli utenti.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.navigate({ to: "/" })}>Torna alla Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gestione utenti</h1>
        <p className="text-sm text-muted-foreground">Approva o revoca l'accesso HR per gli utenti registrati.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Ruoli</th>
              <th className="px-4 py-2">Registrato</th>
              <th className="px-4 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const rs = rolesOf(p.id);
              const isHr = rs.includes("hr");
              const isAdminUser = rs.includes("admin");
              const isMe = p.id === meId;
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{p.email}{isMe && <span className="ml-2 text-xs text-muted-foreground">(tu)</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {isAdminUser && <Badge variant="secondary">admin</Badge>}
                      {isHr && <Badge>hr</Badge>}
                      {!isHr && !isAdminUser && <Badge variant="outline">in attesa</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString("it-IT")}</td>
                  <td className="px-4 py-3 text-right">
                    {isHr ? (
                      <Button size="sm" variant="outline" disabled={busyId === p.id || isMe} onClick={() => revokeHr(p.id)}>
                        <UserX className="h-4 w-4" /> Revoca HR
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busyId === p.id} onClick={() => grantHr(p.id)}>
                        <UserCheck className="h-4 w-4" /> Concedi HR
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {profiles.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nessun utente registrato.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
