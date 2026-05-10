import { handleDbError } from "@/lib/handle-error";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PosizioneFormDialog } from "@/components/posizione-form-dialog";

export const Route = createFileRoute("/posizioni")({
  head: () => ({ meta: [{ title: "Posizioni Aperte — CV Analyzer" }] }),
  component: PosizioniPage,
});

type Posizione = Tables<"posizioni">;
type Filtro = "tutte" | "aperta" | "chiusa";

function PosizioniPage() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Posizione | null>(null);
  const [toDelete, setToDelete] = useState<Posizione | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["posizioni"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Posizione[];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filtro === "tutte") return data;
    return data.filter((p) => p.stato === filtro);
  }, [data, filtro]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("posizioni").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posizioni"] });
      toast.success("Posizione eliminata");
      setToDelete(null);
    },
    onError: (e: Error) => handleDbError(e, "mutation"),
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Posizioni Aperte</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestisci le job description e i ruoli attualmente attivi.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" />
          Aggiungi posizione
        </Button>
      </div>

      <div className="mb-4">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="tutte">Tutte</TabsTrigger>
            <TabsTrigger value="aperta">Aperte</TabsTrigger>
            <TabsTrigger value="chiusa">Chiuse</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titolo ruolo</TableHead>
              <TableHead>Reparto</TableHead>
              <TableHead>Data apertura</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                  Caricamento…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-8 w-8 opacity-50" />
                    <p className="text-sm">Nessuna posizione da mostrare</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.titolo}</TableCell>
                  <TableCell className="text-muted-foreground">{p.reparto || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={p.stato === "aperta" ? "default" : "secondary"}>
                      {p.stato === "aperta" ? "Aperta" : "Chiusa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditing(p); setFormOpen(true); }}
                        aria-label="Modifica"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToDelete(p)}
                        aria-label="Elimina"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PosizioneFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        posizione={editing}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la posizione?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare <strong>{toDelete?.titolo}</strong>. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
