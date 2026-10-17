// ------------------------------------------------------------------
// O roteiro (esboço) da aula dentro da apresentação: só o professor vê.
// Os slides e os textos continuam no projetor enquanto ele lê.
// ------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from "react";
import { createNote, getContent, KINDS, loadRoteiros, sanitize, saveContent, speakMinutes, useRoteiros } from "../../lib/roteiros";
import { store, useStore } from "../../lib/store";
import type { BLesson } from "../../lib/types";
import { Btn, Icon } from "../ui";
import { RoteiroEditor, type EditorHandle } from "./Editor";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function RoteiroPainel({ lesson }: { lesson: BLesson }) {
  const st = useRoteiros();
  const note = st.index.notes.find((n) => n.id === lesson.roteiroId);
  const [html, setHtml] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const tam = useStore((s) => s.prefs.roteiroFonte);
  const setTam = (f: (t: number) => number) => store.setPrefs({ roteiroFonte: Math.round(f(tam) * 100) / 100 });
  const [trocar, setTrocar] = useState(false);
  const corpo = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorHandle>(null);
  useEffect(() => void loadRoteiros(), []);

  useEffect(() => {
    setHtml(null);
    setEditando(false);
    if (!note) return;
    let live = true;
    void getContent(note.id).then((h) => live && setHtml(h));
    return () => {
      live = false;
    };
  }, [note?.id, st.status]);

  const titulos = useMemo(() => {
    if (!html) return [];
    const d = document.createElement("div");
    d.innerHTML = html;
    return [...d.querySelectorAll("h1,h2,h3")].map((x) => ({ level: Number(x.tagName[1]), text: x.textContent?.trim() || "—" }));
  }, [html]);

  const escolher = (rid: string | undefined) => {
    store.patchLesson(lesson.id, (l) => ({ ...l, roteiroId: rid }));
    setTrocar(false);
  };

  if (!note || trocar) return <Escolher lesson={lesson} atual={note?.id} onPick={escolher} onCancel={note ? () => setTrocar(false) : undefined} />;

  const irPara = (i: number) => {
    if (editando) return editor.current?.scrollToHeading(i);
    (corpo.current?.querySelectorAll("h1,h2,h3")[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // marcar tarefa (☐) clicando nela, mesmo fora da edição
  const clicar = (e: React.MouseEvent) => {
    const li = (e.target as HTMLElement).closest("ul.check > li");
    if (!li || !corpo.current || html === null) return;
    li.setAttribute("data-done", li.getAttribute("data-done") === "true" ? "false" : "true");
    const h = sanitize(corpo.current.innerHTML);
    setHtml(h);
    void saveContent(note.id, h);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge/8 px-6 py-3">
        <span className="text-2xl">{note.icon || KINDS[note.kind].icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">{note.title || "Sem título"}</p>
          <p className="text-xs text-ink-400">
            Roteiro · só o senhor vê · ~{speakMinutes(note.words)} min de fala
          </p>
        </div>
        {titulos.length > 1 && (
          <select value="" onChange={(e) => e.target.value !== "" && irPara(Number(e.target.value))} className="h-8 max-w-52 rounded-lg bg-ink-800 px-2 text-xs font-semibold">
            <option value="">Ir para…</option>
            {titulos.map((t, i) => (
              <option key={i} value={i}>
                {"  ".repeat(t.level - 1)}
                {t.text}
              </option>
            ))}
          </select>
        )}
        {!editando && (
          <div className="flex items-center rounded-lg bg-ink-800">
            <button type="button" onClick={() => setTam((t) => Math.max(0.9, t - 0.1))} className="h-8 px-2.5 text-xs font-bold hover:text-lume" title="Letra menor">
              A−
            </button>
            <button type="button" onClick={() => setTam((t) => Math.min(2.4, t + 0.1))} className="h-8 px-2.5 text-sm font-bold hover:text-lume" title="Letra maior">
              A+
            </button>
          </div>
        )}
        <Btn size="sm" variant={editando ? "primary" : "soft"} onClick={() => (editor.current?.flush(), setEditando((v) => !v))}>
          <Icon name={editando ? "check" : "caneta"} className="size-4" /> {editando ? "Pronto" : "Editar"}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => setTrocar(true)} title="Usar outro roteiro nesta aula">
          Trocar
        </Btn>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-10 pt-6 pb-24">
        <div className="mx-auto max-w-3xl">
          {html === null ? (
            <p className="text-sm text-ink-400">Abrindo…</p>
          ) : editando ? (
            <RoteiroEditor key={note.id} ref={editor} html={html} onChange={(h) => (setHtml(h), void saveContent(note.id, h))} />
          ) : (
            <div
              ref={corpo}
              onClick={clicar}
              className="roteiro aula"
              style={{ "--aula-size": `${tam}rem` } as React.CSSProperties}
              dangerouslySetInnerHTML={{ __html: sanitize(html) || "<p>(roteiro vazio)</p>" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Escolher({ lesson, atual, onPick, onCancel }: { lesson: BLesson; atual?: string; onPick: (id: string | undefined) => void; onCancel?: () => void }) {
  const st = useRoteiros();
  const [q, setQ] = useState("");
  const list = st.index.notes
    .filter((n) => !q.trim() || fold(`${n.title} ${n.excerpt}`).includes(fold(q.trim())))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 60);
  return (
    <div className="h-full overflow-y-auto px-10 py-8">
      <div className="mx-auto max-w-2xl">
        <p className="font-display text-2xl font-semibold">Roteiro desta aula</p>
        <p className="mt-1 text-sm text-ink-400">Escolha o esboço que o senhor vai seguir. Só aparece aqui para o senhor; a turma continua vendo os slides e os textos.</p>
        <div className="mt-5 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar roteiro" className="h-10 flex-1 rounded-xl bg-ink-850 px-3.5 text-sm ring-1 ring-edge/8 outline-none ring-inset focus:ring-lume/60" />
          <Btn
            variant="primary"
            onClick={() => onPick(createNote({ kind: "aula", template: "aula", title: lesson.title }))}
          >
            <Icon name="mais" /> Novo roteiro
          </Btn>
          {onCancel && (
            <Btn variant="ghost" onClick={onCancel}>
              Cancelar
            </Btn>
          )}
        </div>
        <div className="mt-4 space-y-1.5">
          {list.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onPick(n.id)}
              className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left ring-1 ring-inset ${n.id === atual ? "bg-lume/10 ring-lume/40" : "bg-ink-850 ring-edge/6 hover:ring-lume/40"}`}
            >
              <span className="text-2xl">{n.icon || KINDS[n.kind].icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{n.title || "Sem título"}</span>
                <span className="line-clamp-2 text-xs text-ink-400">{n.excerpt}</span>
              </span>
            </button>
          ))}
          {!list.length && (
            <p className="rounded-2xl border border-dashed border-edge/15 px-4 py-8 text-center text-sm text-ink-400">
              {st.index.notes.length ? "Nada encontrado." : "Ainda não há roteiros. Crie um novo ou entre com o login da plataforma para trazer os das Notas."}
            </p>
          )}
          {atual && (
            <button type="button" onClick={() => onPick(undefined)} className="mt-2 text-xs font-semibold text-ink-400 hover:text-coral">
              Tirar o roteiro desta aula
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
