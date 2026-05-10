import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogIn, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthState =
  | { loading: true }
  | { loading: false; session: Session | null; isHr: boolean | null };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true });

  const refreshRole = async (session: Session | null) => {
    if (!session) {
      setState({ loading: false, session: null, isHr: null });
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "hr")
      .maybeSingle();
    setState({ loading: false, session, isHr: !!data });
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer DB query to avoid deadlocks inside the auth callback
      setTimeout(() => { void refreshRole(session); }, 0);
    });
    supabase.auth.getSession().then(({ data }) => { void refreshRole(data.session); });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state.session) return <LoginScreen />;
  if (!state.isHr) return <PendingApprovalScreen />;

  return <>{children}</>;
}

function PendingApprovalScreen() {
  const onLogout = async () => {
    await supabase.auth.signOut();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-base font-semibold">Account in attesa di approvazione</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Il tuo account è stato creato ma non ha ancora i permessi per accedere all'area HR.
          Contatta un amministratore per ricevere l'accesso.
        </p>
        <Button variant="outline" className="mt-6" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
          Esci
        </Button>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account creato. Un amministratore deve approvarlo prima dell'accesso.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore di autenticazione");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">
            CV
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">CV Analyzer</h1>
            <p className="mt-1 text-xs text-muted-foreground">Accesso area HR</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {mode === "login" ? "Accedi" : "Crea account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "login" ? "Non hai un account?" : "Hai già un account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="font-medium text-primary hover:underline"
          >
            {mode === "login" ? "Registrati" : "Accedi"}
          </button>
        </p>
        {mode === "signup" && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            I nuovi account devono essere approvati da un amministratore.
          </p>
        )}
      </div>
    </div>
  );
}
