import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — CV Analyzer" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <PagePlaceholder
      title="Dashboard"
      description="Panoramica rapida: posizioni aperte, CV caricati e analisi completate."
    />
  );
}
