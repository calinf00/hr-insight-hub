import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/impostazioni")({
  head: () => ({ meta: [{ title: "Impostazioni — CV Analyzer" }] }),
  component: () => (
    <PagePlaceholder
      title="Impostazioni"
      description="Configura i campi da estrarre dai CV e le opzioni dell'applicazione."
    />
  ),
});
