import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { History, KeyRound, Loader2, ShieldAlert, ShieldCheck, ShieldMinus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/utenti")({
  beforeLoad: async () => {
    // Run guard only in the browser — supabase auth state is not available during SSR.
    if (typeof window === "undefined") return;
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
type LogRow = {
  id: string;
  admin_id: string;
  admin_email: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  created_at: string;
};

function UtentiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [valError, setValError] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertUser, setAlertUser] = useState<{ id: string; email: string } | null>(null);

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
    if (admin) void loadLogs();
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    const { data } = await supabase
      .from("admin_log")
      .select("id, admin_id, admin_email, action, target_user_id, target_email, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setLogs((data as LogRow[]) ?? []);
    setLogsLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const rolesOf = (uid: string) => roles.filter((r) => r.user_id === uid).map((r) => r.role);

  const actionLabel = (action: string) => {
    switch (action) {
      case "grant_hr": return "Accesso HR concesso";
      case "revoke_hr": return "Accesso HR revocato";
      case "grant_admin": return "Promosso Admin";
      case "revoke_admin": return "Rimosso da Admin";
      case "reset_password": return "Password reimpostata";
      default: return action;
    }
  };

  const actionBadgeVariant = (action: string): "default" | "secondary" | "destructive" | "outline" => {
    if (action.startsWith("grant_")) return "secondary";
    if (action.startsWith("revoke_")) return "destructive";
    return "default";
  };

  const logAction = async (action: string, targetUserId: string) => {
    const { data: sess } = await supabase.auth.getSession();
    const adminId = sess.session?.user.id;
    const adminEmail = sess.session?.user.email ?? null;
    if (!adminId) return;
    const targetEmail = profiles.find((p) => p.id === targetUserId)?.email ?? null;
    await supabase.from("admin_log").insert({
      admin_id: adminId,
      admin_email: adminEmail,
      action,
      target_user_id: targetUserId,
      target_email: targetEmail,
    });
  };

  const grantHr = async (uid: string) => {
    setBusyId(uid);
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "hr" });
    setBusyId(null);
    if (error) { toast.error("Impossibile concedere l'accesso"); return; }
    await logAction("grant_hr", uid);
    toast.success("Accesso HR concesso");
    void load();
    void loadLogs();
  };

  const revokeHr = async (uid: string) => {
    setBusyId(uid);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "hr");
    setBusyId(null);
    if (error) { toast.error("Impossibile rimuovere l'accesso"); return; }
    await logAction("revoke_hr", uid);
    toast.success("Accesso HR rimosso");
    void load();
    void loadLogs();
  };

  const grantAdmin = async (uid: string) => {
    setBusyId(uid);
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    setBusyId(null);
    if (error) { toast.error("Impossibile promuovere ad admin"); return; }
    await logAction("grant_admin", uid);
    toast.success("Utente promosso ad admin");
    void load();
  };

  const openRevokeAdminAlert = (uid: string, email: string) => {
    setAlertUser({ id: uid, email });
    setAlertOpen(true);
  };

  const confirmRevokeAdmin = async () => {
    if (!alertUser) return;
    const targetId = alertUser.id;
    setBusyId(targetId);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", targetId).eq("role", "admin");
    setBusyId(null);
    setAlertOpen(false);
    setAlertUser(null);
    if (error) { toast.error("Impossibile revocare admin"); return; }
    await logAction("revoke_admin", targetId);
    toast.success("Privilegi admin revocati");
    void load();
  };

  const openResetDialog = (uid: string) => {
    setSelectedUserId(uid);
    setNewPassword("");
    setConfirmPassword("");
    setValError(null);
    setDialogOpen(true);
  };

  const closeResetDialog = () => {
    setDialogOpen(false);
    setSelectedUserId(null);
    setNewPassword("");
    setConfirmPassword("");
    setValError(null);
  };

  const handleReset = async () => {
    if (!selectedUserId) return;
    setValError(null);
    if (newPassword.length < 8) {
      setValError("La password deve essere di almeno 8 caratteri");
      return;
    }
    if (newPassword !== confirmPassword) {
      setValError("Le password non coincidono");
      return;
    }
    setResetBusy(true);
    try {
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData.session?.access_token;
      if (!token) throw new Error("Sessione scaduta");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: selectedUserId, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Errore durante il reset");
      }
      toast.success("Password reimpostata");
      closeResetDialog();
    } catch (err: any) {
      toast.error(err.message || "Errore durante il reset");
    } finally {
      setResetBusy(false);
    }
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
                    <div className="flex items-center justify-end gap-2">
                      {!isMe && (
                        <Button size="sm" variant="ghost" disabled={resetBusy} onClick={() => openResetDialog(p.id)}>
                          <KeyRound className="h-4 w-4" /> Reset password
                        </Button>
                      )}
                      {isHr ? (
                        <Button size="sm" variant="outline" disabled={busyId === p.id || isMe} onClick={() => revokeHr(p.id)}>
                          <UserX className="h-4 w-4" /> Revoca HR
                        </Button>
                      ) : (
                        <Button size="sm" disabled={busyId === p.id} onClick={() => grantHr(p.id)}>
                          <UserCheck className="h-4 w-4" /> Concedi HR
                        </Button>
                      )}
                      {isAdminUser ? (
                        <Button size="sm" variant="destructive" disabled={busyId === p.id || isMe} onClick={() => openRevokeAdminAlert(p.id, p.email)}>
                          <ShieldMinus className="h-4 w-4" /> Revoca Admin
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={busyId === p.id || isMe} onClick={() => grantAdmin(p.id)}>
                          <ShieldCheck className="h-4 w-4" /> Promuovi Admin
                        </Button>
                      )}
                    </div>
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

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeResetDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nuova password</Label>
              <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimo 8 caratteri" minLength={8} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma password</Label>
              <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Ripeti la password" />
            </div>
            {valError && <p className="text-sm text-destructive">{valError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeResetDialog} disabled={resetBusy}>Annulla</Button>
              <Button onClick={handleReset} disabled={resetBusy || !newPassword || !confirmPassword}>
                {resetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conferma reset"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma revoca admin</AlertDialogTitle>
            <AlertDialogDescription>
              Stai rimuovendo i privilegi admin a {alertUser?.email}. Sei sicuro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAlertUser(null)}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevokeAdmin}>Conferma</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
