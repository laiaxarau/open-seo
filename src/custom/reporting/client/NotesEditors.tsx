import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { RichTextField } from "@/custom/reporting/client/RichTextField";
import {
  parseSteps,
  suggestedSteps,
  type Step,
} from "@/custom/reporting/render";
import type {
  ContentIdea,
  Diagnosis,
  OpportunityIdea,
  ReportFull,
  ReportNotes,
  TitleIdea,
} from "@/custom/reporting/types";

const pathOnly = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

/** A block that opens and closes, with its remove button. */
function Fold({
  title,
  hint,
  open: initial = false,
  onRemove,
  removeLabel = "Quitar",
  actions,
  children,
}: {
  title: string;
  hint?: string;
  open?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {title}
            </span>
            {hint ? (
              <span className="block truncate text-xs text-muted-foreground">
                {hint}
              </span>
            ) : null}
          </span>
        </button>
        {actions}
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={removeLabel}
            title={removeLabel}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 border-t border-border p-3">{children}</div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      {children}
    </div>
  );
}

/** A plain one-line text with its length against the advised maximum. */
function CountedInput({
  value,
  max,
  onChange,
  label,
  multiline = false,
}: {
  value: string;
  max: number;
  onChange: (value: string) => void;
  label: string;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      {multiline ? (
        <Textarea
          rows={2}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <p
        className={`text-right text-xs ${value.length > max ? "text-destructive" : "text-muted-foreground"}`}
      >
        {value.length} / {max} caracteres recomendados
      </p>
    </div>
  );
}

/** A list of short texts (steps, sections): each one apart, with formatting. */
function ListField({
  items,
  onChange,
  addLabel,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <span className="mt-2 w-5 shrink-0 text-right text-xs font-semibold text-muted-foreground">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <RichTextField
              rows={2}
              value={item}
              placeholder={placeholder}
              onChange={(value) =>
                onChange(
                  items.map((entry, at) => (at === index ? value : entry)),
                )
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Quitar este elemento"
            onClick={() => onChange(items.filter((_, at) => at !== index))}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => onChange([...items, ""])}
      >
        <Plus className="size-3.5" aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}

function replaceAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((entry, at) =>
    at === index ? { ...entry, ...patch } : entry,
  );
}

const without = <T,>(list: T[], index: number) =>
  list.filter((_, at) => at !== index);

/** What the AI wrote besides the tab texts: diagnoses, opportunity plans,
 *  titles and new content. Everything opens and closes, and every text can be
 *  formatted. */
export function AiAnalysisEditor({
  notes,
  change,
}: {
  notes: ReportNotes;
  change: (patch: Partial<ReportNotes>) => void;
}) {
  const { diagnoses, opportunityIdeas, titleIdeas, contentIdeas } = notes;
  if (
    diagnoses.length === 0 &&
    opportunityIdeas.length === 0 &&
    titleIdeas.length === 0 &&
    contentIdeas.length === 0
  ) {
    return null;
  }
  const editDiagnosis = (index: number, patch: Partial<Diagnosis>) =>
    change({ diagnoses: replaceAt(diagnoses, index, patch) });
  const editOpportunity = (index: number, patch: Partial<OpportunityIdea>) =>
    change({ opportunityIdeas: replaceAt(opportunityIdeas, index, patch) });
  const editTitle = (index: number, patch: Partial<TitleIdea>) =>
    change({ titleIdeas: replaceAt(titleIdeas, index, patch) });
  const editContent = (index: number, patch: Partial<ContentIdea>) =>
    change({ contentIdeas: replaceAt(contentIdeas, index, patch) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análisis con IA (borrador)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Revísalo: abre cada grupo, edita el texto con formato o quita lo que
          no te convenza. Sale en el informe al guardar.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {diagnoses.length > 0 ? (
          <Fold
            title="Páginas que caen: diagnóstico"
            hint={`${diagnoses.length} ${diagnoses.length === 1 ? "página" : "páginas"} · qué pasa y qué haremos`}
          >
            {diagnoses.map((item, index) => (
              <Fold
                key={item.url}
                title={pathOnly(item.url)}
                removeLabel="Quitar este diagnóstico"
                onRemove={() =>
                  change({ diagnoses: without(diagnoses, index) })
                }
              >
                <Field label="Qué está pasando">
                  <RichTextField
                    rows={5}
                    value={item.text}
                    onChange={(text) => editDiagnosis(index, { text })}
                  />
                </Field>
                <Field label="Qué haremos">
                  <ListField
                    items={item.fixes}
                    addLabel="Añadir una acción"
                    onChange={(fixes) => editDiagnosis(index, { fixes })}
                  />
                </Field>
              </Fold>
            ))}
          </Fold>
        ) : null}

        {opportunityIdeas.length > 0 ? (
          <Fold
            title="Oportunidades: plan de acción"
            hint={`${opportunityIdeas.length} búsquedas · análisis, pasos y resultado esperado`}
          >
            {opportunityIdeas.map((item, index) => (
              <Fold
                key={`${item.query}-${index}`}
                title={`«${item.query}»`}
                removeLabel="Quitar este plan"
                onRemove={() =>
                  change({ opportunityIdeas: without(opportunityIdeas, index) })
                }
              >
                <Field label="Qué pasa">
                  <RichTextField
                    rows={4}
                    value={item.analysis}
                    onChange={(analysis) =>
                      editOpportunity(index, { analysis })
                    }
                  />
                </Field>
                <Field label="Qué hacer, en este orden">
                  <ListField
                    items={item.actions}
                    addLabel="Añadir un paso"
                    onChange={(actions) => editOpportunity(index, { actions })}
                  />
                </Field>
                <Field label="Resultado esperado">
                  <RichTextField
                    rows={3}
                    value={item.result ?? ""}
                    onChange={(result) => editOpportunity(index, { result })}
                  />
                </Field>
              </Fold>
            ))}
          </Fold>
        ) : null}

        {titleIdeas.length > 0 ? (
          <Fold
            title="Títulos y descripciones propuestos"
            hint={`${titleIdeas.length} búsquedas · cómo se verían en Google`}
          >
            {titleIdeas.map((item, index) => (
              <Fold
                key={`${item.query}-${index}`}
                title={`«${item.query}»`}
                hint={item.current ? `Hoy: ${item.current}` : undefined}
                removeLabel="Quitar estas propuestas"
                onRemove={() =>
                  change({ titleIdeas: without(titleIdeas, index) })
                }
              >
                {item.options.map((option, at) => (
                  <div
                    key={at}
                    className="space-y-2 rounded-lg bg-muted/40 p-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Propuesta {String.fromCharCode(65 + at)}
                    </p>
                    <Field label="Título">
                      <CountedInput
                        label="Título propuesto"
                        max={60}
                        value={option.title}
                        onChange={(title) =>
                          editTitle(index, {
                            options: replaceAt(item.options, at, { title }),
                          })
                        }
                      />
                    </Field>
                    <Field label="Descripción">
                      <CountedInput
                        label="Descripción propuesta"
                        max={155}
                        multiline
                        value={option.description}
                        onChange={(description) =>
                          editTitle(index, {
                            options: replaceAt(item.options, at, {
                              description,
                            }),
                          })
                        }
                      />
                    </Field>
                  </div>
                ))}
              </Fold>
            ))}
          </Fold>
        ) : null}

        {contentIdeas.length > 0 ? (
          <Fold
            title="Contenidos nuevos"
            hint={`${contentIdeas.length} ideas · estructura, título, descripción y enlazado`}
          >
            {contentIdeas.map((item, index) => (
              <Fold
                key={`${item.title}-${index}`}
                title={item.title || "Idea sin título"}
                hint={[item.format, item.target ? `«${item.target}»` : ""]
                  .filter(Boolean)
                  .join(" · ")}
                removeLabel="Quitar esta idea"
                onRemove={() =>
                  change({ contentIdeas: without(contentIdeas, index) })
                }
              >
                <Field label="Título del contenido">
                  <Input
                    value={item.title}
                    onChange={(event) =>
                      editContent(index, { title: event.target.value })
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Formato">
                    <Input
                      value={item.format ?? ""}
                      placeholder="Guía, comparativa, ficha…"
                      onChange={(event) =>
                        editContent(index, { format: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Búsqueda a la que apunta">
                    <Input
                      value={item.target ?? ""}
                      onChange={(event) =>
                        editContent(index, { target: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Por qué merece la pena">
                  <RichTextField
                    rows={3}
                    value={item.reason}
                    onChange={(reason) => editContent(index, { reason })}
                  />
                </Field>
                <Field label="Qué debe resolver la página">
                  <RichTextField
                    rows={3}
                    value={item.intent ?? ""}
                    onChange={(intent) => editContent(index, { intent })}
                  />
                </Field>
                <Field label="Estructura recomendada (apartados)">
                  <ListField
                    items={item.outline ?? []}
                    addLabel="Añadir un apartado"
                    onChange={(outline) => editContent(index, { outline })}
                  />
                </Field>
                <Field label="Título SEO">
                  <CountedInput
                    label="Título SEO"
                    max={60}
                    value={item.metaTitle ?? ""}
                    onChange={(metaTitle) => editContent(index, { metaTitle })}
                  />
                </Field>
                <Field label="Descripción SEO">
                  <CountedInput
                    label="Descripción SEO"
                    max={155}
                    multiline
                    value={item.metaDescription ?? ""}
                    onChange={(metaDescription) =>
                      editContent(index, { metaDescription })
                    }
                  />
                </Field>
                <Field label="Dirección sugerida">
                  <Input
                    value={item.slug ?? ""}
                    placeholder="blog/titulo-del-contenido"
                    onChange={(event) =>
                      editContent(index, { slug: event.target.value })
                    }
                  />
                </Field>
                <Field label="Enlazar desde estas páginas">
                  <div className="space-y-2">
                    {(item.linkFrom ?? []).map((url, at) => (
                      <div key={at} className="flex gap-2">
                        <Input
                          value={url}
                          aria-label="Página desde la que enlazar"
                          onChange={(event) =>
                            editContent(index, {
                              linkFrom: (item.linkFrom ?? []).map(
                                (entry, to) =>
                                  to === at ? event.target.value : entry,
                              ),
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Quitar esta página"
                          onClick={() =>
                            editContent(index, {
                              linkFrom: without(item.linkFrom ?? [], at),
                            })
                          }
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        editContent(index, {
                          linkFrom: [...(item.linkFrom ?? []), "https://"],
                        })
                      }
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Añadir una página
                    </Button>
                  </div>
                </Field>
                <Field label="Resultado esperado">
                  <RichTextField
                    rows={2}
                    value={item.result ?? ""}
                    onChange={(result) => editContent(index, { result })}
                  />
                </Field>
              </Fold>
            ))}
          </Fold>
        ) : null}
      </CardContent>
    </Card>
  );
}

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

/** The roadmap in the text format the report reads (see parseSteps). */
function serializeSteps(steps: Step[]): string {
  return steps
    .map((step) =>
      [
        oneLine(step.title) || "Paso sin título",
        step.why.trim() ? `Por qué: ${oneLine(step.why)}` : "",
        step.how.filter((item) => item.trim()).length > 0
          ? `Cómo: ${step.how
              .filter((item) => item.trim())
              .map((item) => oneLine(item).replaceAll(";", ","))
              .join("; ")}`
          : "",
        step.impact.trim() ? `Impacto: ${oneLine(step.impact)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

/** The roadmap step by step: action, why, how and impact, each with
 *  formatting, in an order that can be changed. */
export function RoadmapEditor({
  report,
  notes,
  change,
}: {
  report: ReportFull;
  notes: ReportNotes;
  change: (patch: Partial<ReportNotes>) => void;
}) {
  const [steps, setSteps] = useState<Step[]>(() => parseSteps(notes.nextSteps));
  // The text can also change from outside (the AI writes it again).
  useEffect(() => {
    if (notes.nextSteps !== serializeSteps(steps)) {
      setSteps(parseSteps(notes.nextSteps));
    }
    // Only when the saved text changes, not on every edit of the steps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.nextSteps]);

  const commit = (next: Step[]) => {
    setSteps(next);
    change({ nextSteps: serializeSteps(next) });
  };
  const edit = (index: number, patch: Partial<Step>) =>
    commit(replaceAt(steps, index, patch));
  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hoja de ruta</CardTitle>
        <p className="text-xs text-muted-foreground">
          Los pasos del final del informe, del más importante al menos. Cada uno
          lleva la acción, por qué, cómo y el impacto esperado.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Sin pasos propios</p>
            <p className="text-muted-foreground">
              El informe usa ahora los pasos calculados con los datos. Puedes
              partir de ellos para editarlos o escribir los tuyos.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => commit(suggestedSteps(report))}
              >
                Empezar con los pasos calculados
              </Button>
            </div>
          </div>
        ) : null}
        {steps.map((step, index) => (
          <Fold
            key={index}
            title={`${String(index + 1).padStart(2, "0")} · ${step.title || "Paso sin título"}`}
            removeLabel="Quitar este paso"
            onRemove={() => commit(without(steps, index))}
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Subir este paso"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Bajar este paso"
                  disabled={index === steps.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
              </>
            }
          >
            <Field label="Acción (empieza por un verbo)">
              <RichTextField
                rows={2}
                value={step.title}
                onChange={(title) => edit(index, { title })}
              />
            </Field>
            <Field label="Por qué">
              <RichTextField
                rows={3}
                value={step.why}
                onChange={(why) => edit(index, { why })}
              />
            </Field>
            <Field label="Cómo (pasos concretos)">
              <ListField
                items={step.how}
                addLabel="Añadir un paso"
                onChange={(how) => edit(index, { how })}
              />
            </Field>
            <Field label="Impacto esperado">
              <RichTextField
                rows={2}
                value={step.impact}
                onChange={(impact) => edit(index, { impact })}
              />
            </Field>
          </Fold>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            commit([...steps, { title: "", why: "", how: [], impact: "" }])
          }
        >
          <Plus className="size-3.5" aria-hidden />
          Añadir un paso
        </Button>
      </CardContent>
    </Card>
  );
}
