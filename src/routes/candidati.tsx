import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/candidati")({
  head: () => ({ meta: [{ title: "Candidati — CV Analyzer" }] }),
  component: () => (
    <PagePlaceholder
      title="Candidati"
      description="Carica i CV ricevuti e consulta la lista dei candidati."
    />
  ),
});
