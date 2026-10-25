import { useRef, useState } from "react";
import { Bold, Eye, Highlighter, Link2, List, Pencil } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { paragraphs } from "@/custom/reporting/render";

const NEWLINE = String.fromCharCode(10);

/** What the formatted text looks like, with the report's own colours. */
const PREVIEW_CLASSES =
  "min-h-20 space-y-2 rounded-md border border-border bg-background p-3 text-sm leading-relaxed [&_a]:font-semibold [&_a]:text-[#f11c41] [&_a]:underline [&_mark]:bg-transparent [&_mark]:font-bold [&_mark]:text-[#f11c41] [&_strong]:font-bold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5";

/**
 * A text box for the report's texts with the formatting one click away:
 * bold, the red highlight, a link and a list, with their shortcuts (Ctrl+B,
 * Ctrl+K) and a "with format" view. The text keeps the same light markup the
 * report understands (**bold**, ==highlight==, [text](https://…), "- " lists),
 * so nothing has to be typed by hand.
 */
export function RichTextField({
  value,
  onChange,
  rows = 4,
  placeholder,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  id?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const range = useRef({ start: 0, end: 0 });
  const [preview, setPreview] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const apply = (next: string, from: number, to: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(from, to);
    });
  };

  const wrap = (open: string, close: string, fallback: string) => {
    const element = ref.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const chosen = value.slice(start, end);
    // Already wrapped: the second click takes the marks off.
    if (
      chosen &&
      value.slice(Math.max(0, start - open.length), start) === open &&
      value.slice(end, end + close.length) === close
    ) {
      apply(
        value.slice(0, start - open.length) +
          chosen +
          value.slice(end + close.length),
        start - open.length,
        end - open.length,
      );
      return;
    }
    const text = chosen || fallback;
    apply(
      value.slice(0, start) + open + text + close + value.slice(end),
      start + open.length,
      start + open.length + text.length,
    );
  };

  const toggleList = () => {
    const element = ref.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const from = value.lastIndexOf(NEWLINE, start - 1) + 1;
    const nextBreak = value.indexOf(NEWLINE, end);
    const to = nextBreak === -1 ? value.length : nextBreak;
    const lines = value.slice(from, to).split(NEWLINE);
    const allBullets = lines.every((line) => line.startsWith("- "));
    const changed = lines
      .map((line) => (allBullets ? line.slice(2) : `- ${line}`))
      .join(NEWLINE);
    apply(
      value.slice(0, from) + changed + value.slice(to),
      from,
      from + changed.length,
    );
  };

  const openLink = () => {
    const element = ref.current;
    if (!element) return;
    range.current = {
      start: element.selectionStart,
      end: element.selectionEnd,
    };
    const chosen = value.slice(range.current.start, range.current.end).trim();
    setLinkUrl(/^https?:\/\//i.test(chosen) ? chosen : "");
    setLinkOpen(true);
  };

  const insertLink = () => {
    const { start, end } = range.current;
    const chosen = value.slice(start, end).trim();
    let url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    const label =
      chosen && !/^https?:\/\//i.test(chosen) ? chosen : "texto del enlace";
    const markup = `[${label}](${url})`;
    setLinkOpen(false);
    apply(
      value.slice(0, start) + markup + value.slice(end),
      start + 1,
      start + 1 + label.length,
    );
  };

  const tool = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    pressed = false,
  ) => (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="xs"
      title={label}
      aria-label={label}
      disabled={preview}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >
      {icon}
    </Button>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
        {tool(
          "Negrita (Ctrl+B)",
          <Bold className="size-3.5" aria-hidden />,
          () => wrap("**", "**", "texto"),
        )}
        {tool(
          "Resaltar en rojo",
          <Highlighter className="size-3.5" aria-hidden />,
          () => wrap("==", "==", "texto"),
        )}
        {tool(
          "Enlace (Ctrl+K)",
          <Link2 className="size-3.5" aria-hidden />,
          openLink,
          linkOpen,
        )}
        {tool("Lista", <List className="size-3.5" aria-hidden />, toggleList)}
        <span className="ml-auto" />
        <Button
          type="button"
          variant={preview ? "secondary" : "ghost"}
          size="xs"
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? (
            <Pencil className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
          {preview ? "Editar" : "Ver con formato"}
        </Button>
      </div>
      {linkOpen ? (
        <div className="flex gap-1.5">
          <Input
            autoFocus
            value={linkUrl}
            placeholder="Pega la dirección (https://…)"
            aria-label="Dirección del enlace"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                insertLink();
              }
              if (event.key === "Escape") setLinkOpen(false);
            }}
          />
          <Button type="button" size="sm" onClick={insertLink}>
            Insertar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setLinkOpen(false)}
          >
            Cancelar
          </Button>
        </div>
      ) : null}
      {preview ? (
        <div
          className={PREVIEW_CLASSES}
          // The text is escaped by the report's own renderer first.
          dangerouslySetInnerHTML={{
            __html: value.trim()
              ? paragraphs(value)
              : "<p>Todavía no hay texto.</p>",
          }}
        />
      ) : (
        <Textarea
          ref={ref}
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const key = event.key.toLowerCase();
            if (key === "b") {
              event.preventDefault();
              wrap("**", "**", "texto");
            } else if (key === "k") {
              event.preventDefault();
              openLink();
            }
          }}
        />
      )}
    </div>
  );
}
