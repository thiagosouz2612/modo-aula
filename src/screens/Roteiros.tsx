// ------------------------------------------------------------------
// Roteiros (notas/esboços): os mesmos da plataforma, com o mesmo
// editor. Guardados no computador e sincronizados com o site.
// ------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Go } from "../main";
import { RoteiroEditor, type EditorHandle } from "../components/roteiro/Editor";
import { Btn, Card, Icon, inputCls } from "../components/ui";
import { abaixo, DRAG, FolderIcon, ItemMenu, PastasLado, Vista } from "../components/Pastas";
import { store, useStore } from "../lib/store";
import {
  ago, createFolder, createNote, deleteFolder, deleteNote, duplicateNote, renameFolder, getContent, ICONS, importFile, KINDS, loadRoteiros, patchNote, saveContent,
  speakMinutes, syncRoteiros, TEMPLATES, useRoteiros, type Kind, type RNote,
} from "../lib/roteiros";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function SyncPill() {
  const st = useRoteiros();
  const label =
    st.sync === "syncing"
      ? "Sincronizando…"
      : st.sync === "ok"
        ? `Sincronizado ${st.at ? ago(st.at) : ""}`
        : st.sync === "offline"
          ? "Sem internet · salvo neste computador"
          : st.sync === "error"
            ? (st.syncMsg ?? "Não sincronizou")
            : "Salvo neste computador";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        st.sync === "ok" ? "bg-sage/12 text-sage" : st.sync === "error" ? "bg-coral/12 text-coral" : "bg-ink-800 text-ink-400"
      }`}
      title={st.syncMsg}
    >
      <span className={`size-1.5 rounded-full ${st.sync === "syncing" ? "pulso bg-lume" : st.sync === "ok" ? "bg-sage" : st.sync === "error" ? "bg-coral" : "bg-ink-500"}`} />
      <span className="max-w-72 truncate">{label}</span>
    </span>
  );
}

export function Roteiros({ go }: { go: Go }) {
  const st = useRoteiros();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "todos">("todos");
  const [folder, setFolder] = useState("todas");
  const [novo, setNovo] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => void loadRoteiros(), []);

  const vista = useStore((s) => s.prefs.vistaRoteiros);
  const pastas = st.index.folders;
  const semPasta = (n: RNote) => !n.folderId || !pastas.some((f) => f.id === n.folderId);
  const dentro = useMemo(() => (folder === "todas" || folder === "sem" ? null : abaixo(pastas, folder)), [pastas, folder]);
  const contar = (id: string) =>
    id === "todas" ? st.index.notes.length : id === "sem" ? st.index.notes.filter(semPasta).length : st.index.notes.filter((n) => abaixo(pastas, id).has(n.folderId ?? "")).length;
  const pastaAtual = pastas.find((f) => f.id === folder);
  const apagar = (n: RNote) => confirm(`Excluir o roteiro “${n.title || "Sem título"}”? Ele também sai da plataforma na próxima sincronização.`) && deleteNote(n.id);
  const list = useMemo(() => {
    const f = fold(q.trim());
    return st.index.notes
      .filter((n) => kind === "todos" || n.kind === kind)
      .filter((n) => folder === "todas" || (folder === "sem" ? semPasta(n) : dentro?.has(n.folderId ?? "")))
      .filter((n) => !f || fold(`${n.title} ${n.excerpt}`).includes(f))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
  }, [st.index.notes, q, kind, folder, dentro]);

  const criar = (template: string) => {
    const t = TEMPLATES.find((x) => x.id === template);
    const id = createNote({ kind: t?.kind ?? "outro", template, folderId: folder !== "todas" && folder !== "sem" ? folder : undefined });
    setNovo(false);
    go({ r: "roteiro", id });
  };
  const importar = async (f: File) => {
    setMsg("Importando…");
    try {
      const { title, html } = await importFile(f);
      const id = createNote({ kind: "aula", title, html, folderId: pastaAtual?.id });
      setMsg("");
      go({ r: "roteiro", id });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível importar.");
    }
  };

  return (
    <div className="mx-auto max-w-[1320px] px-10 pt-10 pb-16">
      <input ref={fileInput} type="file" accept=".docx,.pdf,.txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] text-lume uppercase">Notas</p>
          <h1 className="mt-2 font-display text-[40px] leading-none font-semibold tracking-tight">Roteiros</h1>
          <div className="mt-3 flex items-center gap-2">
            <SyncPill />
            <button type="button" onClick={() => void syncRoteiros()} className="text-xs font-semibold text-ink-400 hover:text-lume">
              Sincronizar agora
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <Btn onClick={() => fileInput.current?.click()}>
            <Icon name="baixar" /> Importar arquivo
          </Btn>
          <Btn variant="primary" onClick={() => setNovo(true)}>
            <Icon name="mais" /> Novo roteiro
          </Btn>
        </div>
      </header>
      {msg && <p className="mt-4 text-sm text-ink-300">{msg}</p>}

      <div className="mt-8 flex gap-8">
        <PastasLado
          pastas={pastas}
          contar={contar}
          atual={folder}
          setAtual={setFolder}
          criar={createFolder}
          renomear={renameFolder}
          apagar={deleteFolder}
          soltar={(id, pasta) => patchNote(id, { folderId: pasta })}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-lg font-semibold">
              {pastaAtual ? (
                <>
                  <FolderIcon color={pastaAtual.color} className="size-5" /> {pastaAtual.name}
                </>
              ) : folder === "sem" ? (
                "Sem pasta"
              ) : (
                "Todos os roteiros"
              )}
            </p>
            <div className="relative ml-auto w-64">
              <Icon name="busca" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nos roteiros" className={`${inputCls} pl-9`} />
            </div>
            <Vista value={vista} onChange={(v) => store.setPrefs({ vistaRoteiros: v })} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {([["todos", "Todos"], ...Object.entries(KINDS).map(([k, v]) => [k, `${v.icon} ${v.plural}`])] as [Kind | "todos", string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${kind === k ? "bg-lume/15 text-lume ring-lume/40" : "text-ink-300 ring-edge/8 hover:text-ink-100"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <Card className="mt-6 grid place-items-center px-6 py-16 text-center">
              <span className="text-4xl">📝</span>
              <p className="mt-4 font-display text-xl font-semibold">{st.index.notes.length ? (q ? "Nada encontrado" : "Pasta vazia") : "Nenhum roteiro ainda"}</p>
              <p className="mt-2 max-w-md text-sm text-ink-400">
                {st.index.notes.length
                  ? "Arraste roteiros para cá ou crie um novo dentro desta pasta."
                  : "Os roteiros que o senhor escreve nas Notas da plataforma aparecem aqui depois de entrar com o login (Ajustes → Plataforma). Também dá para criar aqui mesmo."}
              </p>
            </Card>
          ) : vista === "lista" ? (
            <div className="mt-5 overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-edge/6 ring-inset">
              {list.map((n, i) => (
                <div
                  key={n.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(DRAG, n.id)}
                  onClick={() => go({ r: "roteiro", id: n.id })}
                  className={`flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-edge/[.03] ${i ? "border-t border-edge/6" : ""}`}
                >
                  <span className="text-2xl">{n.icon || KINDS[n.kind].icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[17px] font-semibold">
                      {n.pinned && "📌 "}
                      {n.title || "Sem título"}
                    </p>
                    <p className="truncate text-xs text-ink-400">{n.excerpt}</p>
                  </div>
                  {!pastaAtual && n.folderId && (
                    <span className="hidden shrink-0 items-center gap-1.5 text-xs text-ink-400 md:flex">
                      <FolderIcon color={pastas.find((f) => f.id === n.folderId)?.color} /> {pastas.find((f) => f.id === n.folderId)?.name}
                    </span>
                  )}
                  <span className="w-24 shrink-0 text-right text-xs text-ink-400">{KINDS[n.kind].label}</span>
                  <span className="w-20 shrink-0 text-right text-xs text-ink-500">{ago(n.updatedAt)}</span>
                  <ItemMenu
                    pastas={pastas}
                    atual={n.folderId}
                    mover={(pasta) => patchNote(n.id, { folderId: pasta })}
                    acoes={[
                      { label: n.pinned ? "Desafixar" : "Fixar no topo", onClick: () => patchNote(n.id, { pinned: !n.pinned || undefined }) },
                      { label: "Excluir", danger: true, onClick: () => apagar(n) },
                    ]}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
              {list.map((n) => (
                <div key={n.id} draggable onDragStart={(e) => e.dataTransfer.setData(DRAG, n.id)} className="relative">
                  <NoteCard n={n} onOpen={() => go({ r: "roteiro", id: n.id })} />
                  <div className="absolute top-3 right-3">
                    <ItemMenu
                      pastas={pastas}
                      atual={n.folderId}
                      mover={(pasta) => patchNote(n.id, { folderId: pasta })}
                      acoes={[
                        { label: n.pinned ? "Desafixar" : "Fixar no topo", onClick: () => patchNote(n.id, { pinned: !n.pinned || undefined }) },
                        { label: "Excluir", danger: true, onClick: () => apagar(n) },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {novo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={() => setNovo(false)}>
          <div className="w-full max-w-2xl rounded-3xl bg-ink-850 p-6 shadow-2xl ring-1 ring-edge/10" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-2xl font-semibold">Novo roteiro</p>
            <p className="mt-1 text-sm text-ink-400">Escolha um modelo para começar.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => criar(t.id)} className="rounded-2xl bg-ink-800 p-4 text-left ring-1 ring-edge/5 hover:ring-lume/50">
                  <p className="font-semibold">
                    {KINDS[t.kind].icon} {t.title}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">{t.text}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteCard({ n, onOpen }: { n: RNote; onOpen: () => void }) {
  const k = KINDS[n.kind];
  return (
    <button type="button" onClick={onOpen} className="group flex h-full w-full flex-col rounded-2xl bg-ink-850 p-5 text-left ring-1 ring-edge/6 transition-transform ring-inset hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-3xl">{n.icon || k.icon}</span>
        {n.pinned && <span className="mr-9 text-xs text-lume">📌</span>}
      </div>
      <p className="mt-3 line-clamp-2 font-display text-lg leading-snug font-semibold">{n.title || "Sem título"}</p>
      <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-400">{n.excerpt}</p>
      <p className="mt-auto pt-3 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
        <span style={{ color: k.color }} className="brightness-150">{k.label}</span> · {ago(n.updatedAt)} · ~{speakMinutes(n.words)} min
      </p>
    </button>
  );
}

// ---------------- um roteiro ----------------

export function RoteiroScreen({ id, go }: { id: string; go: Go }) {
  const st = useRoteiros();
  const note = st.index.notes.find((n) => n.id === id);
  const [html, setHtml] = useState<string | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const [outline, setOutline] = useState<{ level: number; text: string }[]>([]);
  const editor = useRef<EditorHandle>(null);
  useEffect(() => void loadRoteiros(), []);
  useEffect(() => {
    if (st.status !== "ready") return;
    let live = true;
    setHtml(null);
    void getContent(id).then((h) => live && setHtml(h));
    return () => {
      live = false;
      editor.current?.flush();
    };
  }, [id, st.status]);
  const readOutline = useCallback((h: string) => {
    const d = document.createElement("div");
    d.innerHTML = h;
    setOutline([...d.querySelectorAll("h1,h2,h3")].map((x) => ({ level: Number(x.tagName[1]), text: x.textContent?.trim() || "Sem título" })));
  }, []);
  useEffect(() => {
    if (html !== null) readOutline(html);
  }, [html, readOutline]);
  const onChange = useCallback(
    (h: string) => {
      setHtml(h);
      void saveContent(id, h);
    },
    [id],
  );

  if (!note)
    return (
      <div className="p-10">
        <Btn variant="ghost" onClick={() => go({ r: "roteiros" })}>
          <Icon name="voltar" /> Roteiros
        </Btn>
        <p className="mt-6 text-ink-400">{st.status === "ready" ? "Este roteiro não existe mais." : "Abrindo…"}</p>
      </div>
    );
  const kind = KINDS[note.kind];

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-edge/8 bg-ink-950/95 px-6 backdrop-blur">
        <Btn variant="ghost" size="sm" onClick={() => (editor.current?.flush(), go({ r: "roteiros" }))}>
          <Icon name="voltar" className="size-4" /> Roteiros
        </Btn>
        <SyncPill />
        <div className="ml-auto flex items-center gap-1">
          <Btn size="sm" variant="ghost" onClick={() => patchNote(note.id, { pinned: !note.pinned || undefined })}>
            {note.pinned ? "Desafixar" : "📌 Fixar"}
          </Btn>
          <Btn
            size="sm"
            variant="ghost"
            onClick={async () => {
              editor.current?.flush();
              const nid = await duplicateNote(note.id);
              if (nid) go({ r: "roteiro", id: nid });
            }}
          >
            Duplicar
          </Btn>
          <Btn
            size="sm"
            variant="danger"
            onClick={() => {
              if (!confirm(`Excluir o roteiro “${note.title || "Sem título"}”? Ele também sai da plataforma na próxima sincronização.`)) return;
              deleteNote(note.id);
              go({ r: "roteiros" });
            }}
          >
            <Icon name="lixo" className="size-4" /> Excluir
          </Btn>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-10 px-8">
        <main className="mx-auto min-w-0 max-w-3xl flex-1 pt-10 pb-24">
          <div className="relative">
            <button type="button" onClick={() => setIconOpen((v) => !v)} className="grid size-14 place-items-center rounded-2xl text-4xl hover:bg-ink-800" title="Trocar o ícone">
              {note.icon || kind.icon}
            </button>
            {iconOpen && (
              <div className="absolute top-full left-0 z-40 mt-2 grid w-72 grid-cols-6 gap-1 rounded-2xl bg-ink-850 p-2 shadow-xl ring-1 ring-edge/10">
                {ICONS.map((ic) => (
                  <button key={ic} type="button" onClick={() => (patchNote(note.id, { icon: ic }), setIconOpen(false))} className="grid aspect-square place-items-center rounded-xl text-2xl hover:bg-ink-800">
                    {ic}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            value={note.title}
            onChange={(e) => patchNote(note.id, { title: e.target.value }, true)}
            onKeyDown={(e) => e.key === "Enter" && editor.current?.focus()}
            placeholder="Sem título"
            autoFocus={!note.title}
            className="mt-3 block w-full bg-transparent font-display text-[2.4rem] leading-tight font-semibold outline-none placeholder:text-ink-600"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <select
              value={note.kind}
              onChange={(e) => {
                const k = e.target.value as Kind;
                patchNote(note.id, { kind: k, icon: !note.icon || note.icon === kind.icon ? KINDS[k].icon : note.icon });
              }}
              className="h-8 rounded-full bg-ink-800 px-3 text-xs font-semibold"
            >
              {Object.entries(KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.icon} {v.label}
                </option>
              ))}
            </select>
            <select
              value={note.folderId ?? ""}
              onChange={(e) => {
                if (e.target.value === "__nova") {
                  const name = prompt("Nome da pasta nova:");
                  if (name?.trim()) patchNote(note.id, { folderId: createFolder(name) });
                  return;
                }
                patchNote(note.id, { folderId: e.target.value || undefined });
              }}
              className="h-8 rounded-full bg-ink-800 px-3 text-xs font-semibold"
            >
              <option value="">Sem pasta</option>
              {st.index.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value="__nova">+ Pasta nova…</option>
            </select>
            <span className="px-1 text-ink-400">
              {note.words.toLocaleString("pt-BR")} palavras · ~{speakMinutes(note.words)} min de fala
            </span>
          </div>
          <div className="mt-8">{html !== null && <RoteiroEditor key={note.id} ref={editor} html={html} onChange={onChange} />}</div>
        </main>
        {outline.length > 1 && (
          <aside className="sticky top-20 hidden h-fit max-h-[calc(100vh-7rem)] w-56 shrink-0 overflow-y-auto pt-10 xl:block">
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Nesta nota</p>
            <ul className="space-y-0.5 border-l border-edge/10">
              {outline.map((h, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => editor.current?.scrollToHeading(i)}
                    className={`-ml-px block w-full truncate border-l-2 border-transparent py-1 text-left text-sm text-ink-400 hover:border-lume hover:text-ink-100 ${
                      h.level === 1 ? "pl-3 font-semibold" : h.level === 2 ? "pl-5" : "pl-7 text-xs"
                    }`}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
