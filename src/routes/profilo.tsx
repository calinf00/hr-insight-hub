import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { User as UserIcon, Mail, Shield, Calendar, Clock, Lock, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/profilo")({
  head: () => ({ meta: [{ title: "Profilo — CV Analyzer" }] }),
  component: ProfiloPage,
});

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function ProfiloPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [initialDisplayName, setInitialDisplayName] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      toast.error("Sessione non valida");
      setLoading(false);
      return;
    }
    const u = userData.user;
    setUser(u);

    const [{ data: profile }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", u.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.id),
    ]);

    const dn = profile?.display_name ?? "";
    setDisplayName(dn);
    setInitialDisplayName(dn);
    setRoles((rolesData ?? []).map((r) => r.role as string));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInitialDisplayName(displayName.trim());
    toast.success("Profilo aggiornato");
  };

  const roleLabel = (r: string) =>
    r === "admin" ? "Admin" : r === "hr" ? "HR" : r;

  const dirty = displayName.trim() !== initialDisplayName.trim();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Profilo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestisci le informazioni del tuo account.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento…
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Informazioni account</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> Email
                </div>
                <div className="text-sm text-foreground">{user?.email ?? "—"}</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" /> Ruolo
                </div>
                <div className="flex flex-wrap gap-1">
                  {roles.length === 0 ? (
                    <Badge variant="outline">In attesa</Badge>
                  ) : (
                    roles.map((r) => (
                      <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                        {roleLabel(r)}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> Registrato il
                </div>
                <div className="text-sm text-foreground">{formatDate(user?.created_at)}</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Ultimo accesso
                </div>
                <div className="text-sm text-foreground">{formatDate(user?.last_sign_in_at)}</div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Nome visualizzato</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Come vuoi essere mostrato nell'applicazione.
              </p>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Nome visualizzato</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Es. Mario Rossi"
                  maxLength={120}
                />
              </div>
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvataggio…</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> Salva modifiche</>
                )}
              </Button>
            </form>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <div className="mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Sicurezza</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Per modificare la tua password vai alla sezione dedicata nelle impostazioni.
            </p>
            <Button asChild variant="outline">
              <Link to="/impostazioni" hash="sicurezza-account">
                Cambia password
              </Link>
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
