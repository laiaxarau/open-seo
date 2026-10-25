import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Link2,
  Sparkles,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Switch } from "@/client/components/ui/switch";
import { Textarea } from "@/client/components/ui/textarea";
import { AuditCard, auditPageTypes } from "@/custom/reporting/client/AuditCard";
import { pageTypesKey } from "@/custom/reporting/client/PageTypesSection";
import { needsNewAudit } from "@/custom/reporting/auditQuality";
import { publicUrl } from "@/custom/reporting/client/ReportingPage";
import {
  AiAnalysisEditor,
  RoadmapEditor,
} from "@/custom/reporting/client/NotesEditors";
import { RichTextField } from "@/custom/reporting/client/RichTextField";
import { renderReportDocument } from "@/custom/reporting/render";
import { CARLOS, signerFor, type Signer } from "@/custom/reporting/signers";
import {
  REPORT_SECTIONS,
  REPORT_TABS,
  type ReportFull,
  type ReportNotes,
} from "@/custom/reporting/types";
import {
  draftClientReportWithAi,
  getClientReport,
  getReportingAiStatus,
  prepareClientReportWithAi,
  getReportPageTypes,
  refreshClientReport,
  saveClientReport,
  setClientReportShared,
} from "@/serverFunctions/reporting";

const NEWLINE = String.fromCharCode(10);
/** Notes saved under these keys are the analysis text of a tab, not a note
 *  under a block. */
const PANEL_NOTE_KEYS = new Set([
  "evolucion",
  "posiciones",
  "consultas",
  "origen",
  "temas",
  "oportunidades",
  "tecnico",
]);
const euroFormat = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
const euro = (value: number) => euroFormat.format(value);
const pathOnly = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

function Editor({
  report,
  projectId,
}: {
  report: ReportFull;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(report.title);
  const [client, setClient] = useState(report.clientName ?? "");
  const [notes, setNotes] = useState<ReportNotes>(report.notes);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const change = (patch: Partial<ReportNotes>) => {
    setNotes((previous) => ({ ...previous, ...patch }));
    setDirty(true);
  };
  const refetch = () =>
    queryClient.invalidateQueries({
      queryKey: ["client-report", projectId, report.id],
    });

  const save = useMutation({
    mutationFn: () =>
      saveClientReport({
        data: {
          projectId,
          reportId: report.id,
          title: title.trim() || report.title,
          clientName: client.trim() || null,
          notes,
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      setError(null);
      await refetch();
      void queryClient.invalidateQueries({
        queryKey: ["client-reports", projectId],
      });
      setVersion((value) => value + 1);
    },
    onError: () => setError("No se pudo guardar. Prueba de nuevo."),
  });
  const aiStatus = useQuery({
    queryKey: ["client-report-ai", projectId],
    queryFn: () => getReportingAiStatus({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });
  // "Redactar con IA": summary, analysis of every tab and ideas, saved by the
  // server in one go.
  const draft = useMutation({
    mutationFn: () =>
      prepareClientReportWithAi({ data: { projectId, reportId: report.id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(
          result.reason === "no_key"
            ? "La redacción con IA no está activada (falta la clave de Anthropic)."
            : result.reason === "busy"
              ? "Este informe ya se está preparando. Espera un par de minutos."
              : `La IA no ha podido redactar ahora${result.detail ? ` (${result.detail})` : ""}. Prueba de nuevo.`,
        );
        return;
      }
      setError(null);
      setInfo(`Texto redactado y guardado. Coste: ${euro(result.costEur)}.`);
      setNotes(result.notes);
      setDirty(false);
      void refetch();
      setVersion((value) => value + 1);
    },
    onError: () =>
      setError("La IA no ha podido redactar ahora. Prueba de nuevo."),
  });
  const editOption = (
    ideaIndex: number,
    optionIndex: number,
    patch: { title?: string; description?: string },
  ) =>
    change({
      titleIdeas: notes.titleIdeas.map((entry, at) =>
        at === ideaIndex
          ? {
              ...entry,
              options: entry.options.map((option, oi) =>
                oi === optionIndex ? { ...option, ...patch } : option,
              ),
            }
          : entry,
      ),
    });
  const share = useMutation({
    mutationFn: (shared: boolean) =>
      setClientReportShared({
        data: { projectId, reportId: report.id, shared },
      }),
    onSuccess: async () => {
      await refetch();
      void queryClient.invalidateQueries({
        queryKey: ["client-reports", projectId],
      });
    },
  });
  const refresh = useMutation({
    mutationFn: () =>
      refreshClientReport({ data: { projectId, reportId: report.id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(
          "No se pudieron actualizar los datos (revisa Search Console).",
        );
        return;
      }
      setError(null);
      await refetch();
      setVersion((value) => value + 1);
    },
    onError: () => setError("No se pudieron actualizar los datos."),
  });

  // A new report prepares itself the first time it opens: Microaudit on the
  // example pages of each page type (when they are defined), then the AI
  // writes the summary and the analysis of every tab, and it is all saved.
  const typesQuery = useQuery({
    queryKey: pageTypesKey(projectId),
    queryFn: () => getReportPageTypes({ data: { projectId } }),
  });
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const prepared = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [auditNote, setAuditNote] = useState<string | null>(null);
  useEffect(() => {
    if (prepared.current || !aiStatus.data || !typesQuery.data) return;
    const types = typesQuery.data;
    const needsAi =
      aiStatus.data.available &&
      !report.notes.message.trim() &&
      Object.keys(report.notes.sectionNotes).length === 0;
    // Audits stored before the detail was kept have no "passed" counts.
    const stale = report.snapshot.audits.some((audit) => needsNewAudit(audit));
    const needsAudit =
      types.length > 0 && (report.snapshot.audits.length === 0 || stale);
    prepared.current = true;
    if (!needsAi && !needsAudit) return;
    void (async () => {
      setPreparing(true);
      setError(null);
      try {
        if (needsAudit) {
          const run = await auditPageTypes(
            projectId,
            report.id,
            types,
            setInfo,
          );
          setAuditNote(
            run.failed
              ? `Se han auditado ${run.done} de ${run.total} páginas. Microaudit ha respondido: ${run.failed}`
              : `Auditoría terminada: ${run.done} páginas${run.reused > 0 ? ` (${run.reused} reutilizadas de auditorías anteriores)` : ""}.`,
          );
        }
        if (needsAi) {
          setInfo(
            "Redactando el resumen y el análisis con IA (hasta 3 minutos)…",
          );
          const prepared = await prepareClientReportWithAi({
            data: { projectId, reportId: report.id },
          });
          if (prepared.ok) {
            setNotes(prepared.notes);
            setDirty(false);
          } else if (prepared.reason === "busy") {
            setError(
              "Este informe ya se está preparando en otra pestaña. Espera un par de minutos y recarga.",
            );
          } else {
            setError(
              `La IA no ha podido redactar el informe${prepared.detail ? ` (${prepared.detail})` : ""}. Prueba «Redactar con IA».`,
            );
          }
        }
        setInfo("Informe preparado.");
        await refetch();
        setVersion((value) => value + 1);
      } catch {
        setError(
          "No se pudo preparar el informe del todo. Revisa los botones.",
        );
      } finally {
        setPreparing(false);
      }
    })();
  }, [aiStatus.data, typesQuery.data]);

  // Warns before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const [openTabs, setOpenTabs] = useState<Record<string, boolean>>({});
  // The preview is drawn here with the text as it is being edited, so every
  // switch and every change shows at once (a short pause after typing).
  const [signer, setSigner] = useState<Signer>(CARLOS);
  useEffect(() => {
    void signerFor(report.createdBy).then(setSigner);
  }, [report.createdBy]);
  const [settled, setSettled] = useState({ notes, title, client });
  useEffect(() => {
    const timer = setTimeout(() => setSettled({ notes, title, client }), 600);
    return () => clearTimeout(timer);
  }, [notes, title, client]);
  const previewHtml = useMemo(() => {
    try {
      return renderReportDocument(
        {
          ...report,
          title: settled.title.trim() || report.title,
          clientName: settled.client.trim() || null,
          notes: settled.notes,
        },
        "preview",
        signer,
      );
    } catch {
      return null;
    }
  }, [report, settled, signer]);
  const frame = useRef<HTMLIFrameElement>(null);
  const lastView = useRef({ y: 0, tab: "" });
  // Remember where the reader was just before the page is replaced.
  useEffect(() => {
    const timer = setInterval(() => {
      const view = frame.current?.contentWindow;
      if (!view) return;
      lastView.current = {
        y: view.scrollY,
        tab: view.location.hash.replace("#", ""),
      };
    }, 400);
    return () => clearInterval(timer);
  }, []);
  const restoreFrame = () => {
    const view = frame.current?.contentWindow;
    if (!view) return;
    const { y, tab } = lastView.current;
    if (tab) {
      view.document.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.click();
    }
    view.document.documentElement.style.scrollBehavior = "auto";
    view.scrollTo(0, y);
  };

  const hidden = new Set(notes.hidden);
  const toggleSection = (id: string, visible: boolean) =>
    change({
      hidden: visible
        ? notes.hidden.filter((item) => item !== id)
        : [...notes.hidden, id],
    });

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link to="/p/$projectId/reporting" params={{ projectId }} />
            }
          >
            <ArrowLeft className="size-4" aria-hidden />
            Informes
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">
            Editar informe
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {preparing ? (
            <p className="text-sm text-muted-foreground">
              Preparando el informe (auditoría e IA): puede tardar un par de
              minutos.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!error && info ? (
            <p className="text-sm text-muted-foreground">{info}</p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={
              draft.isPending ||
              preparing ||
              !aiStatus.data ||
              !aiStatus.data.available
            }
            title={
              aiStatus.data?.available
                ? `El informe se redacta solo al crearlo. Úsalo para volver a redactar el resumen, el análisis de cada pestaña y las ideas (${aiStatus.data.model}); sustituye el texto actual.`
                : "Para activarlo hay que añadir la clave de Anthropic (ANTHROPIC_API_KEY)."
            }
            onClick={() => draft.mutate()}
          >
            <Sparkles className="size-3.5" aria-hidden />
            {draft.isPending
              ? "Redactando…"
              : notes.message.trim()
                ? "Volver a redactar con IA"
                : "Redactar con IA"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {refresh.isPending ? "Actualizando…" : "Actualizar datos"}
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? "Guardando…"
              : dirty
                ? "Guardar cambios"
                : "Guardado"}
          </Button>
        </div>
      </div>

      {preparing ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border bg-muted/50 p-4 text-sm"
        >
          <RefreshCw className="size-4 animate-spin" aria-hidden />
          <div>
            <p className="font-medium">Preparando el informe</p>
            <p className="text-muted-foreground">
              {info ?? "Un momento…"} Primero se auditan las páginas tipo y
              después la IA redacta el resumen y el análisis de cada pestaña.
              Tarda unos minutos: no cierres esta página.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[430px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Compartir con el cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {report.shared ? "Enlace activo" : "Solo lo ves tú"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cualquiera con el enlace puede verlo, sin iniciar sesión.
                  </p>
                </div>
                <Switch
                  checked={report.shared}
                  disabled={share.isPending}
                  onCheckedChange={(checked) => share.mutate(checked)}
                  aria-label="Compartir informe"
                />
              </div>
              {report.shared ? (
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={publicUrl(report.token)}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Enlace para el cliente"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(publicUrl(report.token))
                        .then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        });
                    }}
                  >
                    <Link2 className="size-4" aria-hidden />
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                  <Button
                    variant="outline"
                    render={
                      <a
                        href={publicUrl(report.token)}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    Abrir
                  </Button>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Coste de la IA en este informe:{" "}
                <strong className="text-foreground">
                  {euro(report.aiCostEur)}
                </strong>{" "}
                ({report.aiCalls}{" "}
                {report.aiCalls === 1 ? "llamada" : "llamadas"}
                ).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Datos del informe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-title">Título</Label>
                <Input
                  id="ed-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setDirty(true);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-client">Cliente</Label>
                <Input
                  id="ed-client"
                  value={client}
                  onChange={(event) => {
                    setClient(event.target.value);
                    setDirty(true);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-message">Resumen ejecutivo</Label>
                <RichTextField
                  id="ed-message"
                  rows={8}
                  value={notes.message}
                  onChange={(value) => change({ message: value })}
                  placeholder="Dos párrafos: cómo ha ido el periodo y por qué, y qué hay que hacer ahora. Sale al principio del informe. Si lo dejas vacío, el informe no lleva resumen."
                />
              </div>
            </CardContent>
          </Card>

          <AuditCard
            projectId={projectId}
            reportId={report.id}
            audits={report.snapshot.audits}
            busy={preparing}
            note={auditNote}
            onChanged={() => void refetch()}
          />

          <Card>
            <CardHeader>
              <CardTitle>Qué sale en el informe</CardTitle>
              <p className="text-xs text-muted-foreground">
                Cada pestaña se puede quitar entera con su interruptor. Dentro,
                cada bloque y el texto de análisis se muestran u ocultan por
                separado. Lo que quitas no se borra: solo deja de verse en el
                informe, y puedes volver a activarlo.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {REPORT_TABS.map((tab) => {
                const tabHidden = hidden.has(`tab:${tab.id}`);
                const open = Boolean(openTabs[tab.id]) && !tabHidden;
                const shownBlocks = tab.blocks.filter(
                  (block) => !hidden.has(block.id),
                ).length;
                const textHidden = tab.note
                  ? hidden.has(`text:${tab.note}`)
                  : false;
                return (
                  <div key={tab.id} className="rounded-xl border border-border">
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() =>
                          setOpenTabs((current) => ({
                            ...current,
                            [tab.id]: !current[tab.id],
                          }))
                        }
                        disabled={tabHidden}
                        aria-expanded={open}
                      >
                        <ChevronDown
                          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            Pestaña «{tab.label}»
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {tabHidden
                              ? "Quitada: no aparece en el informe."
                              : `${shownBlocks} de ${tab.blocks.length} bloques visibles${tab.note ? (textHidden ? " · sin texto de análisis" : " · con texto de análisis") : ""}`}
                          </span>
                        </span>
                      </button>
                      <Switch
                        checked={!tabHidden}
                        onCheckedChange={(checked) =>
                          toggleSection(`tab:${tab.id}`, checked)
                        }
                        aria-label={`Mostrar la pestaña ${tab.label}`}
                      />
                    </div>
                    {open ? (
                      <div className="space-y-4 border-t border-border p-3">
                        {tab.note ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <Label>
                                Texto de análisis (arriba de la pestaña)
                              </Label>
                              <Switch
                                checked={!textHidden}
                                onCheckedChange={(checked) =>
                                  toggleSection(`text:${tab.note}`, checked)
                                }
                                aria-label={`Mostrar el texto de análisis de ${tab.label}`}
                              />
                            </div>
                            {!textHidden ? (
                              <RichTextField
                                rows={5}
                                value={notes.sectionNotes[tab.note] ?? ""}
                                onChange={(value) =>
                                  change({
                                    sectionNotes: {
                                      ...notes.sectionNotes,
                                      [tab.note as string]: value,
                                    },
                                  })
                                }
                                placeholder="Qué ha pasado en esta pestaña, por qué y qué implica."
                              />
                            ) : null}
                          </div>
                        ) : null}
                        {tab.blocks.map((block) => {
                          const visible = !hidden.has(block.id);
                          const hasNote = !PANEL_NOTE_KEYS.has(block.id);
                          return (
                            <div key={block.id} className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <Label>Bloque: {block.label}</Label>
                                <Switch
                                  checked={visible}
                                  onCheckedChange={(checked) =>
                                    toggleSection(block.id, checked)
                                  }
                                  aria-label={`Mostrar el bloque ${block.label}`}
                                />
                              </div>
                              {visible && hasNote ? (
                                <RichTextField
                                  rows={3}
                                  value={notes.sectionNotes[block.id] ?? ""}
                                  onChange={(value) =>
                                    change({
                                      sectionNotes: {
                                        ...notes.sectionNotes,
                                        [block.id]: value,
                                      },
                                    })
                                  }
                                  placeholder="Nota opcional bajo este bloque"
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Hoja de ruta (al final del informe)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Los pasos se editan más abajo, en «Próximos pasos».
                    </p>
                  </div>
                  <Switch
                    checked={!hidden.has("proximos")}
                    onCheckedChange={(checked) =>
                      toggleSection("proximos", checked)
                    }
                    aria-label="Mostrar la hoja de ruta"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <AiAnalysisEditor notes={notes} change={change} />

          <RoadmapEditor report={report} notes={notes} change={change} />
        </div>

        <div className="space-y-2 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Así lo verá el cliente</p>
            <Button
              size="xs"
              variant="outline"
              render={
                <a href={`/rv/${report.id}`} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink className="size-3" aria-hidden />
              Abrir vista previa (con sesión)
            </Button>
          </div>
          <iframe
            ref={frame}
            title="Vista previa del informe"
            {...(previewHtml
              ? { srcDoc: previewHtml }
              : { src: `/rv/${report.id}` })}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            onLoad={restoreFrame}
            className="h-[calc(100vh-7rem)] w-full rounded-xl border border-border bg-card"
          />
          <p className="text-xs text-muted-foreground">
            {dirty
              ? "La vista previa se actualiza mientras escribes. Falta guardar para conservar los cambios."
              : "La vista previa se actualiza mientras escribes."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ReportEditor({
  projectId,
  reportId,
}: {
  projectId: string;
  reportId: string;
}) {
  const query = useQuery({
    queryKey: ["client-report", projectId, reportId],
    queryFn: () => getClientReport({ data: { projectId, reportId } }),
  });
  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <QueryError
          variant="card"
          error={query.error}
          fallback="No se pudo cargar el informe."
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        Este informe no existe.
      </div>
    );
  }
  return (
    <Editor key={query.data.id} report={query.data} projectId={projectId} />
  );
}
