import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/analisi")({
  head: () => ({ meta: [{ title: "Analisi AI — CV Analyzer" }] }),
  component: () => (
    <PagePlaceholder
      title="Analisi AI"
      description="Risultati del matching AI tra candidati e posizioni aperte."
    />
  ),
});
