// ------------------------------------------------------------------
// Montar a aula: textos bíblicos (na ordem da aula) e a apresentação.
// ------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import type { Go } from "../main";
import { Btn, Card, Icon, inputCls, Seg } from "../components/ui";
import { parseRef, refLabel, type Catalog } from "../lib/bible";
import { useCatalog, useDebounced } from "../lib/hooks";
import { fmtBytes, native } from "../lib/native";
import { countPages, forgetDeck, openDeck, renderPage } from "../lib/pdf";
import { loadPassage, vistaOf, type Vista } from "../lib/scene";
import { store, useStore } from "../lib/store";
import { uid, type BLesson, type BPassage } from "../lib/types";

export function AulaEditor({ id, go }: { id: string; go: Go }) {
  const lesson = useStore((s) => s.lessons.find((l) => l.id === id));
  const folders = useStore((s) => s.folders);
  const { cat, err } = useCatalog();
  if (!lesson)
    return (
      <div className="p-10">
        <Btn variant="ghost" onClick={() => go({ r: "aulas" })}>
          <Icon name="voltar" /> Aulas
        </Btn>
        <p className="mt-6 text-ink-400">Esta aula não existe mais.</p>
      </div>
    );
  const save = (patch: Partial<BLesson>) => store.saveLesson({ ...lesson, ...patch });

  return (
    <div className="mx-auto max-w-[1180px] px-10 pt-6 pb-20">
      <div className="flex items-center justify-between gap-3">
        <Btn variant="ghost" size="sm" onClick={() => go({ r: "aulas" })}>
          <Icon name="voltar" className="size-4" /> Aulas
        </Btn>
        <div className="flex items-center gap-2">
          <Btn
            variant="danger"
            size="sm"
            onClick={() => {
              if (!confirm(`Apagar a aula “${lesson.title}” deste computador?`)) return;
              if (lesson.deck && !lesson.origem) void native.apagarArquivo(lesson.deck.fileId);
              store.deleteLesson(lesson.id);
              go({ r: "aulas" });
            }}
          >
            <Icon name="lixo" className="size-4" /> Apagar
          </Btn>
          <Btn variant="primary" size="lg" onClick={() => go({ r: "apresentar", id })}>
            <Icon name="play" /> Apresentar
          </Btn>
        </div>
      </div>

      <input
        value={lesson.title}
        onChange={(e) => save({ title: e.target.value })}
        className="mt-6 w-full bg-transparent font-serif text-[38px] leading-tight font-semibold tracking-tight outline-none placeholder:text-ink-600"
        placeholder="Título da aula"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-400">
        {folders.length > 0 && (
          <select
            value={lesson.folderId ?? ""}
            onChange={(e) => save({ folderId: e.target.value || undefined })}
            className="rounded-lg bg-ink-850 px-2.5 py-1.5 text-xs font-semibold text-ink-200 ring-1 ring-edge/8 outline-none ring-inset"
          >
            <option value="">Sem pasta</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        {lesson.origem && <span>Trazida da plataforma em {new Date(lesson.origem.em).toLocaleDateString("pt-BR")}</span>}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-ink-300 uppercase">
            <Icon name="biblia" className="size-4 text-lume" /> Textos bíblicos
          </h2>
          <AddPassage cat={cat} catErr={err} onAdd={(p) => save({ passages: [...lesson.passages, p] })} />
          <div className="mt-3 space-y-2.5">
            {lesson.passages.map((p, i) => (
              <PassageRow
                key={p.id}
                p={p}
                cat={cat}
                first={i === 0}
                last={i === lesson.passages.length - 1}
                onChange={(np) => save({ passages: lesson.passages.map((x) => (x.id === p.id ? np : x)) })}
                onMove={(d) => {
                  const list = [...lesson.passages];
                  const [it] = list.splice(i, 1);
                  list.splice(i + d, 0, it);
                  save({ passages: list });
                }}
                onRemove={() => save({ passages: lesson.passages.filter((x) => x.id !== p.id) })}
              />
            ))}
            {!lesson.passages.length && <p className="rounded-xl border border-dashed border-edge/10 px-4 py-6 text-center text-sm text-ink-500">Nenhum texto ainda. Digite uma referência acima.</p>}
          </div>
        </section>

        <aside>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-ink-300 uppercase">
            <Icon name="pdf" className="size-4 text-lume" /> Apresentação
          </h2>
          <DeckCard lesson={lesson} save={save} />
        </aside>
      </div>
    </div>
  );
}

// ---------------- adicionar texto ----------------

function AddPassage({ cat, catErr, onAdd }: { cat: Catalog | null; catErr: string; onAdd: (p: BPassage) => void }) {
  const versao = useStore((s) => s.prefs.versao);
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 200);
  const ref = cat && q ? parseRef(q, cat) : null;
  const [preview, setPreview] = useState("");

  useEffect(() => {
    setPreview("");
    if (!ref) return;
    let dead = false;
    loadPassage(q, versao, "traducao", cat!)
      .then((l) => !dead && setPreview(l.verses.map((v) => v.text).join(" ").slice(0, 220)))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [q, versao, cat, ref?.book.id]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    const r = cat ? parseRef(t, cat) : null;
    if (cat && !r) return;
    onAdd({ id: uid(), ref: r ? refLabel(r).replace(/^(\S+)/, (m) => m) : t, versions: [versao], view: "traducao" });
    setText("");
  };

  return (
    <Card className="p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="busca" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Referência: Jo 3:16-18, Sl 23, Romanos 5.1"
            className={`${inputCls} pl-9`}
          />
        </div>
        <Btn variant="primary" onClick={add} disabled={!text.trim() || (Boolean(cat) && !ref)}>
          <Icon name="mais" /> Adicionar
        </Btn>
      </div>
      {q && (
        <p className="mt-2.5 px-1 text-[13px] leading-relaxed text-ink-400">
          {!cat ? (
            <span className="text-coral">{catErr || "Carregando a Bíblia…"}</span>
          ) : ref ? (
            <>
              <span className="font-semibold text-ink-100">{refLabel(ref)}</span>
              {preview && <span className="font-serif"> — {preview}…</span>}
            </>
          ) : (
            <span className="text-coral">Não entendi a referência. Ex.: Jo 3:16, 1Co 13:4-7, Sl 23.</span>
          )}
        </p>
      )}
    </Card>
  );
}

// ---------------- um texto da aula ----------------

const VISTAS: [Vista, string][] = [
  ["traducao", "Tradução"],
  ["original", "Original"],
  ["interlinear", "Interlinear"],
];

function PassageRow({
  p, cat, first, last, onChange, onMove, onRemove,
}: {
  p: BPassage; cat: Catalog | null; first: boolean; last: boolean;
  onChange: (p: BPassage) => void; onMove: (d: number) => void; onRemove: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const ok = cat ? Boolean(parseRef(p.ref, cat)) : true;
  useEffect(() => {
    if (!cat || !ok) return;
    let dead = false;
    loadPassage(p.ref, p.versions[0] ?? "NAA", "traducao", cat)
      .then((l) => !dead && setText(l.verses.map((v) => v.text).join(" ")))
      .catch(() => !dead && setText(""));
    return () => {
      dead = true;
    };
  }, [p.ref, p.versions[0], cat, ok]);

  const marks = Object.values(p.marks ?? {}).reduce((n, l) => n + l.length, 0);
  return (
    <Card className="group p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-serif text-lg font-semibold">{p.ref}</p>
            {!ok && <span className="text-xs font-semibold text-coral">referência não reconhecida</span>}
            {marks > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                <Icon name="caneta" className="size-3.5 text-lume" /> {marks} {marks === 1 ? "destaque" : "destaques"}
              </span>
            )}
          </div>
          {text && <p className="mt-1 line-clamp-2 font-serif text-[13.5px] leading-relaxed text-ink-400">{text}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <IconBtn icon="sobe" label="Subir" disabled={first} onClick={() => onMove(-1)} />
          <IconBtn icon="desce" label="Descer" disabled={last} onClick={() => onMove(1)} />
          <IconBtn icon="lixo" label="Remover" onClick={onRemove} danger />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <VersionPicker cat={cat} value={p.versions} onChange={(versions) => onChange({ ...p, versions })} />
        <span className="mx-1 h-5 w-px bg-edge/8" />
        <Seg size="sm" value={vistaOf(p.view)} options={VISTAS} onChange={(view) => onChange({ ...p, view })} />
      </div>
    </Card>
  );
}

export function IconBtn({ icon, label, onClick, disabled, danger }: { icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-lg transition-colors disabled:opacity-25 ${danger ? "text-ink-400 hover:bg-coral/10 hover:text-coral" : "text-ink-400 hover:bg-edge/5 hover:text-ink-100"}`}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

function VersionPicker({ cat, value, onChange }: { cat: Catalog | null; value: string[]; onChange: (v: string[]) => void }) {
  const others = (cat?.versions ?? []).filter((v) => !value.includes(v.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-lume/12 py-1 pr-1 pl-2.5 text-xs font-bold text-lume ring-1 ring-lume/25 ring-inset">
          {v}
          {value.length > 1 && (
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded p-0.5 hover:bg-lume/20" aria-label={`Tirar ${v}`}>
              <Icon name="x" className="size-3" />
            </button>
          )}
        </span>
      ))}
      {value.length < 3 && others.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
          className="w-auto rounded-lg bg-ink-800 px-2 py-1 text-xs font-semibold text-ink-300 ring-1 ring-edge/8 outline-none ring-inset"
        >
          <option value="">+ versão</option>
          {others.map((v) => (
            <option key={v.id} value={v.id} title={v.name}>
              {v.id}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ---------------- apresentação (PDF) ----------------

function DeckCard({ lesson, save }: { lesson: BLesson; save: (p: Partial<BLesson>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [has, setHas] = useState<boolean | null>(null);
  const deck = lesson.deck;

  useEffect(() => {
    setHas(null);
    if (deck) void native.temArquivo(deck.fileId).then(setHas);
  }, [deck?.fileId]);

  async function pick(f: File) {
    setErr("");
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return setErr("Escolha um arquivo PDF. No PowerPoint: Arquivo → Exportar → PDF.");
    setBusy("Lendo o PDF…");
    try {
      const data = await f.arrayBuffer();
      const pages = await countPages(data);
      const fileId = `deck-${uid()}`;
      setBusy("Guardando no computador…");
      await native.salvarArquivo(fileId, data);
      if (deck && !lesson.origem) void native.apagarArquivo(deck.fileId);
      if (deck) forgetDeck(deck.fileId);
      save({ deck: { fileId, name: f.name, size: f.size, pages }, notes: undefined });
    } catch {
      setErr("Não foi possível abrir este PDF.");
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }

  async function fromPlatform() {
    if (!deck) return;
    setBusy("Baixando da plataforma…");
    setErr("");
    try {
      await native.baixarArquivo(deck.fileId);
      setHas(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível baixar.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="overflow-hidden">
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
      {deck ? (
        <>
          <div className="aspect-video bg-black">{has && <Thumb fileId={deck.fileId} />}</div>
          <div className="p-4">
            <p className="truncate text-sm font-semibold">{deck.name}</p>
            <p className="mt-0.5 text-xs text-ink-400">
              {deck.pages} slides{deck.size ? ` · ${fmtBytes(deck.size)}` : ""}
              {lesson.notes && Object.keys(lesson.notes).length ? ` · ${Object.keys(lesson.notes).length} comentários` : ""}
            </p>
            {has === false && (
              <div className="mt-3 rounded-xl bg-lume/10 p-3 text-xs text-lume ring-1 ring-lume/25 ring-inset">
                O PDF desta aula ainda não está neste computador.
                {lesson.origem && (
                  <Btn size="sm" variant="primary" className="mt-2 w-full" onClick={fromPlatform} disabled={Boolean(busy)}>
                    <Icon name="baixar" className="size-4" /> Baixar da plataforma
                  </Btn>
                )}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Btn size="sm" onClick={() => input.current?.click()} disabled={Boolean(busy)} className="flex-1">
                Trocar PDF
              </Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => {
                  if (!confirm("Tirar a apresentação desta aula?")) return;
                  if (!lesson.origem) void native.apagarArquivo(deck.fileId);
                  save({ deck: undefined, notes: undefined });
                }}
              >
                Remover
              </Btn>
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={Boolean(busy)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void pick(f);
          }}
          className="flex w-full flex-col items-center gap-2 px-6 py-12 text-center transition-colors hover:bg-edge/[.02]"
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-lume/12 text-lume">
            <Icon name="pdf" className="size-6" />
          </span>
          <span className="mt-1 font-semibold">Subir os slides em PDF</span>
          <span className="text-xs text-ink-400">Clique ou arraste o arquivo aqui. Fica guardado neste computador.</span>
        </button>
      )}
      {(busy || err) && <p className={`border-t border-edge/5 px-4 py-2.5 text-xs ${err ? "text-coral" : "text-ink-300"}`}>{err || busy}</p>}
    </Card>
  );
}

function Thumb({ fileId }: { fileId: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    void openDeck(fileId)
      .then((d) => renderPage(d, 1, 720, 405))
      .then((c) => {
        if (dead || !box.current) return;
        c.className = "h-full w-full object-contain";
        box.current.replaceChildren(c);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [fileId]);
  return <div ref={box} className="grid h-full w-full place-items-center [&>canvas]:max-h-full [&>canvas]:max-w-full" />;
}
