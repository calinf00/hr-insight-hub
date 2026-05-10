import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const titoliStudio = [
  { value: "nessuno", label: "Nessuno" },
  { value: "diploma", label: "Diploma" },
  { value: "laurea_triennale", label: "Laurea triennale" },
  { value: "laurea_magistrale", label: "Laurea magistrale" },
  { value: "master_dottorato", label: "Master / Dottorato" },
] as const;

const schema = z.object({
  titolo: z.string().trim().min(1, "Il titolo è obbligatorio").max(200),
  reparto: z.string().trim().max(120).optional().or(z.literal("")),
  descrizione: z.string().trim().min(1, "La descrizione è obbligatoria").max(5000),
  competenze: z.string().trim().max(2000).optional().or(z.literal("")),
  anni_esperienza: z
    .union([z.coerce.number().int().min(0).max(60), z.literal("")])
    .optional(),
  titolo_studio: z.enum([
    "nessuno",
    "diploma",
    "laurea_triennale",
    "laurea_magistrale",
    "master_dottorato",
  ]),
  lingue: z.string().trim().max(300).optional().or(z.literal("")),
  luogo: z.string().trim().max(200).optional().or(z.literal("")),
  stato: z.enum(["aperta", "chiusa"]),
});

type FormValues = z.infer<typeof schema>;

type Posizione = Tables<"posizioni">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posizione?: Posizione | null;
}

export function PosizioneFormDialog({ open, onOpenChange, posizione }: Props) {
  const queryClient = useQueryClient();
  const isEdit = !!posizione;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      titolo: "",
      reparto: "",
      descrizione: "",
      competenze: "",
      anni_esperienza: "",
      titolo_studio: "nessuno",
      lingue: "",
      luogo: "",
      stato: "aperta",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        titolo: posizione?.titolo ?? "",
        reparto: posizione?.reparto ?? "",
        descrizione: posizione?.descrizione ?? "",
        competenze: posizione?.competenze ?? "",
        anni_esperienza: posizione?.anni_esperienza ?? "",
        titolo_studio: posizione?.titolo_studio ?? "nessuno",
        lingue: posizione?.lingue ?? "",
        luogo: posizione?.luogo ?? "",
        stato: posizione?.stato ?? "aperta",
      });
    }
  }, [open, posizione, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        titolo: values.titolo.trim(),
        reparto: values.reparto?.trim() || null,
        descrizione: values.descrizione.trim(),
        competenze: values.competenze?.trim() || null,
        anni_esperienza:
          values.anni_esperienza === "" || values.anni_esperienza == null
            ? null
            : Number(values.anni_esperienza),
        titolo_studio: values.titolo_studio,
        lingue: values.lingue?.trim() || null,
        luogo: values.luogo?.trim() || null,
        stato: values.stato,
      };

      if (isEdit && posizione) {
        const { error } = await supabase
          .from("posizioni")
          .update(payload)
          .eq("id", posizione.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("posizioni").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posizioni"] });
      toast.success(isEdit ? "Posizione aggiornata" : "Posizione creata");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const stato = form.watch("stato");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica posizione" : "Nuova posizione"}</DialogTitle>
          <DialogDescription>
            Compila i dati del ruolo. I campi contrassegnati con * sono obbligatori.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="grid gap-4 py-2"
        >
          <div className="grid gap-2">
            <Label htmlFor="titolo">Titolo del ruolo *</Label>
            <Input id="titolo" {...form.register("titolo")} />
            {form.formState.errors.titolo && (
              <p className="text-xs text-destructive">{form.formState.errors.titolo.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reparto">Reparto / Area aziendale</Label>
            <Input id="reparto" {...form.register("reparto")} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="descrizione">Descrizione del ruolo e responsabilità *</Label>
            <Textarea id="descrizione" rows={4} {...form.register("descrizione")} />
            {form.formState.errors.descrizione && (
              <p className="text-xs text-destructive">{form.formState.errors.descrizione.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="competenze">Competenze richieste</Label>
            <Textarea
              id="competenze"
              rows={3}
              placeholder="Elenco separato da virgole, es: React, TypeScript, Node.js"
              {...form.register("competenze")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="anni_esperienza">Anni di esperienza minimi</Label>
              <Input
                id="anni_esperienza"
                type="number"
                min={0}
                max={60}
                {...form.register("anni_esperienza")}
              />
            </div>
            <div className="grid gap-2">
              <Label>Titolo di studio richiesto</Label>
              <Select
                value={form.watch("titolo_studio")}
                onValueChange={(v) => form.setValue("titolo_studio", v as FormValues["titolo_studio"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {titoliStudio.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="lingue">Lingue richieste</Label>
              <Input id="lingue" placeholder="Es: Italiano, Inglese B2" {...form.register("lingue")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="luogo">Luogo di lavoro</Label>
              <Input id="luogo" placeholder="Es: Milano / Remoto" {...form.register("luogo")} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label className="text-sm">Stato</Label>
              <p className="text-xs text-muted-foreground">
                {stato === "aperta" ? "La posizione è aperta a candidature" : "La posizione è chiusa"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Chiusa</span>
              <Switch
                checked={stato === "aperta"}
                onCheckedChange={(c) => form.setValue("stato", c ? "aperta" : "chiusa")}
              />
              <span className="text-sm text-muted-foreground">Aperta</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Crea posizione"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
