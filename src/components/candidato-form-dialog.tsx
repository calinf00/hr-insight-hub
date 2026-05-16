import { handleDbError } from "@/lib/handle-error";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { findDuplicates, type CandidatoLite } from "@/lib/duplicate-check";

const canali = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "sito", label: "Sito web" },
  { value: "referral", label: "Referral" },
  { value: "altro", label: "Altro" },
] as const;

const NESSUNA = "__nessuna__";

const schema = z.object({
  nome: z.string().trim().min(1, "Il nome è obbligatorio").max(100),
  cognome: z.string().trim().min(1, "Il cognome è obbligatorio").max(100),
  canale: z.string().optional(),
  posizione_id: z.string().optional(),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;
type Posizione = Tables<"posizioni">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CandidatoFormDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [duplicates, setDuplicates] = useState<CandidatoLite[]>([]);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", cognome: "", canale: "", posizione_id: "", note: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ nome: "", cognome: "", canale: "", posizione_id: "", note: "" });
      setFile(null);
    }
  }, [open, form]);

  const { data: posizioni } = useQuery({
    queryKey: ["posizioni", "aperte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("id, titolo, stato")
        .eq("stato", "aperta")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Posizione, "id" | "titolo" | "stato">[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      let cv_path: string | null = null;
      let cv_filename: string | null = null;

      if (file) {
        if (file.type !== "application/pdf") {
          throw new Error("Il CV deve essere in formato PDF");
        }
        if (file.size > 10 * 1024 * 1024) {
          throw new Error("Il file non può superare i 10 MB");
        }
        const ext = "pdf";
        const safeName = `${values.nome}-${values.cognome}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const path = `${crypto.randomUUID()}-${safeName}.${ext}`;
        const { error: upErr } = await supabase.storage.from("cvs").upload(path, file, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (upErr) throw upErr;
        cv_path = path;
        cv_filename = file.name;
      }

      const { error } = await supabase.from("candidati").insert({
        nome: values.nome.trim(),
        cognome: values.cognome.trim(),
        canale: (values.canale || null) as Tables<"candidati">["canale"],
        posizione_id: values.posizione_id || null,
        note: values.note?.trim() || null,
        cv_path,
        cv_filename,
      });
      if (error) {
        if (cv_path) await supabase.storage.from("cvs").remove([cv_path]);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidati"] });
      toast.success("Candidato aggiunto");
      setPendingValues(null);
      setDuplicates([]);
      onOpenChange(false);
    },
    onError: (e: Error) => handleDbError(e, "mutation"),
  });

  // Controlla duplicati per nome+cognome prima di inserire.
  const onSubmit = async (values: FormValues) => {
    const dups = await findDuplicates({ nome: values.nome, cognome: values.cognome });
    if (dups.length > 0) {
      setPendingValues(values);
      setDuplicates(dups);
      return;
    }
    mutation.mutate(values);
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuovo candidato</DialogTitle>
          <DialogDescription>
            Inserisci i dati del candidato e carica il CV in formato PDF.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" {...form.register("nome")} />
              {form.formState.errors.nome && (
                <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cognome">Cognome *</Label>
              <Input id="cognome" {...form.register("cognome")} />
              {form.formState.errors.cognome && (
                <p className="text-xs text-destructive">{form.formState.errors.cognome.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cv">CV (PDF, max 10 MB)</Label>
            <Input
              id="cv"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                Selezionato: {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Canale di provenienza</Label>
              <Select
                value={form.watch("canale") || NESSUNA}
                onValueChange={(v) => form.setValue("canale", v === NESSUNA ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>Non specificato</SelectItem>
                  {canali.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Posizione applicata</Label>
              <Select
                value={form.watch("posizione_id") || NESSUNA}
                onValueChange={(v) => form.setValue("posizione_id", v === NESSUNA ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>Nessuna</SelectItem>
                  {posizioni?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.titolo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" rows={3} {...form.register("note")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvataggio…" : "Aggiungi candidato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
