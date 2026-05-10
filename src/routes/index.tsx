import { useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, FileText, Sparkles, Clock, TrendingUp, Award } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — CV Analyzer" }] }),
  component: Dashboard,
});

type Posizione = Tables<"posizioni">;
type Candidato = Tables<"candidati">;
type Analisi = Tables<"analisi">;

function Dashboard() {
  const queryClient = useQueryClient();

  const { data: posizioni = [] } = useQuery({
    queryKey: ["dashboard", "posizioni"],
    queryFn: async () => {
      const { data, error } = await supabase.from("posizioni").select("*");
      if (error) throw error;
      return data as Posizione[];
    },
  });

  const { data: candidati = [] } = useQuery({
    queryKey: ["dashboard", "candidati"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidati")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Candidato[];
    },
  });

  const { data: analisi = [] } = useQuery({
    queryKey: ["dashboard", "analisi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analisi")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Analisi[];
    },
  });

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "posizioni" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard", "posizioni"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "candidati" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard", "candidati"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "analisi" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard", "analisi"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const posizioniAperte = useMemo(
    () => posizioni.filter((p) => p.stato === "aperta").length,
    [posizioni]
  );

  const cvUltimoMese = useMemo(() => {
    const trentaGiorniFa = new Date();
    trentaGiorniFa.setDate(trentaGiorniFa.getDate() - 30);
    return candidati.filter(
      (c) => c.cv_path && new Date(c.created_at) >= trentaGiorniFa
    ).length;
  }, [candidati]);

  const analisiCompletate = analisi.length;
  const inAttesa = useMemo(
    () => candidati.filter((c) => c.stato_analisi === "in_attesa").length,
    [candidati]
  );

  const ultimiCv = useMemo(
    () => candidati.filter((c) => c.cv_path).slice(0, 5),
    [candidati]
  );

  const posizioniMap = useMemo(() => {
    const m = new Map<string, Posizione>();
    posizioni.forEach((p) => m.set(p.id, p));
    return m;
  }, [posizioni]);

  // Posizioni più richieste: conta candidati associati per posizione_id
  const posizioniRichieste = useMemo(() => {
    const counts = new Map<string, number>();
    candidati.forEach((c) => {
      if (c.posizione_id) {
        counts.set(c.posizione_id, (counts.get(c.posizione_id) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([id, count]) => ({ posizione: posizioniMap.get(id), count }))
      .filter((r) => r.posizione)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [candidati, posizioniMap]);

  const candidatiMap = useMemo(() => {
    const m = new Map<string, Candidato>();
    candidati.forEach((c) => m.set(c.id, c));
    return m;
  }, [candidati]);

  // Alta compatibilità: best_score > 80
  const altaCompatibilita = useMemo(() => {
    return analisi
      .filter((a) => (a.best_score ?? 0) > 80)
      .sort((a, b) => (b.best_score ?? 0) - (a.best_score ?? 0))
      .map((a) => ({
        analisi: a,
        candidato: candidatiMap.get(a.candidato_id),
        posizione: a.best_posizione_id ? posizioniMap.get(a.best_posizione_id) : null,
      }))
      .filter((r) => r.candidato);
  }, [analisi, candidatiMap, posizioniMap]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Panoramica in tempo reale di posizioni, candidati e analisi AI.
        </p>
      </div>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Posizioni aperte"
          value={posizioniAperte}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <KpiCard
          title="CV caricati (30 gg)"
          value={cvUltimoMese}
          icon={<FileText className="h-4 w-4" />}
        />
        <KpiCard
          title="Analisi AI completate"
          value={analisiCompletate}
          icon={<Sparkles className="h-4 w-4" />}
        />
        <KpiCard
          title="In attesa di analisi"
          value={inAttesa}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ultimi CV */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Ultimi CV caricati
            </CardTitle>
            <CardDescription>Gli ultimi 5 CV ricevuti.</CardDescription>
          </CardHeader>
          <CardContent>
            {ultimiCv.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun CV caricato.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ultimiCv.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          to="/candidati/$id"
                          params={{ id: c.id }}
                          className="font-medium hover:underline"
                        >
                          {c.nome} {c.cognome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("it-IT")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.stato_analisi === "analizzato" ? "default" : "secondary"}>
                          {c.stato_analisi === "analizzato" ? "Analizzato" : "In attesa"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Posizioni più richieste */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Posizioni più richieste
            </CardTitle>
            <CardDescription>Posizioni con più candidati associati.</CardDescription>
          </CardHeader>
          <CardContent>
            {posizioniRichieste.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna posizione con candidati associati.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posizione</TableHead>
                    <TableHead>Reparto</TableHead>
                    <TableHead className="text-right">Candidati</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posizioniRichieste.map(({ posizione, count }) => (
                    <TableRow key={posizione!.id}>
                      <TableCell className="font-medium">{posizione!.titolo}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {posizione!.reparto ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{count}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alta compatibilità */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-4 w-4" /> Candidati con alta compatibilità
          </CardTitle>
          <CardDescription>
            Punteggio di compatibilità superiore all'80%, ordinati per punteggio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {altaCompatibilita.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun candidato ha ancora raggiunto una compatibilità superiore all'80%.
            </p>
          ) : (
            <div className="space-y-3">
              {altaCompatibilita.map(({ analisi: a, candidato, posizione }) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/candidati/$id"
                      params={{ id: candidato!.id }}
                      className="font-medium hover:underline"
                    >
                      {candidato!.nome} {candidato!.cognome}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">
                      {posizione ? `Migliore match: ${posizione.titolo}` : "—"}
                    </p>
                  </div>
                  <div className="flex w-48 items-center gap-3">
                    <Progress value={a.best_score ?? 0} className="flex-1" />
                    <span className="w-10 text-right text-sm font-semibold">
                      {a.best_score ?? 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-primary">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
