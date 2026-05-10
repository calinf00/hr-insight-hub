import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

interface Props {
  candidato: Tables<"candidati"> | null;
  onClose: () => void;
}

export function CvPreviewDialog({ candidato, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!candidato?.cv_path) return;
    setLoading(true);
    supabase.storage
      .from("cvs")
      .createSignedUrl(candidato.cv_path, 60 * 30)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error || !data) {
          toast.error("Impossibile aprire il CV");
          return;
        }
        setUrl(data.signedUrl);
      });
    return () => { cancelled = true; };
  }, [candidato]);

  return (
    <Dialog open={!!candidato} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>
            CV di {candidato?.nome} {candidato?.cognome}
          </DialogTitle>
          <DialogDescription>
            {candidato?.cv_filename || "Anteprima del curriculum"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 px-6 pb-6 min-h-0">
          {!candidato?.cv_path ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Nessun CV caricato per questo candidato.
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Caricamento anteprima…
            </div>
          ) : url ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                    Apri in nuova scheda
                  </a>
                </Button>
              </div>
              <iframe
                src={url}
                className="h-full w-full rounded-md border border-border bg-muted"
                title="Anteprima CV"
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileText className="h-8 w-8 opacity-50" />
              <p className="text-sm">Anteprima non disponibile</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
