import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/posizioni")({
  head: () => ({ meta: [{ title: "Posizioni Aperte — CV Analyzer" }] }),
  component: () => (
    <PagePlaceholder
      title="Posizioni Aperte"
      description="Gestisci le job description e i ruoli attualmente attivi."
    />
  ),
});
