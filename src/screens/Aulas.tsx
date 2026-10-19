// ------------------------------------------------------------------
// Início: as aulas do professor.
// ------------------------------------------------------------------
import { useMemo, useState } from "react";
import type { Go } from "../main";
import { Btn, Card, Icon, inputCls } from "../components/ui";
import { native } from "../lib/native";
import { store, useStore } from "../lib/store";
import { enviarParaPlataforma, importFromPlatform } from "../lib/sync";
import { syncRoteiros } from "../lib/roteiros";
import { uid, type BLesson } from "../lib/types";
import { abaixo, DRAG, FolderIcon, ItemMenu, PastasLado, Vista } from "../components/Pastas";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function Aulas({ go }: { go: Go }) {
  const lessons = useStore((s) => s.lessons);
  const folders = useStore((s) => s.folders);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string>("todas");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const vista = useStore((s) => s.prefs.vistaAulas);
  const dentro = useMemo(() => (folder === "todas" || folder === "sem" ? null : abaixo(folders, folder)), [folders, folder]);
  const list = useMemo(() => {
    const f = fold(q.trim());
    return [...lessons]
      .filter((l) => folder === "todas" || (folder === "sem" ? !l.folderId || !folders.some((x) => x.id === l.folderId) : dentro?.has(l.folderId ?? "")))
      .filter((l) => !f || fold(l.title).includes(f) || l.passages.some((p) => fold(p.ref).includes(f)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [lessons, q, folder, folders, dentro]);
  const contar = (id: string) =>
    id === "todas"
      ? lessons.length
      : id === "sem"
        ? lessons.filter((l) => !l.folderId || !folders.some((x) => x.id === l.folderId)).length
        : lessons.filter((l) => abaixo(folders, id).has(l.folderId ?? "")).length;
  const pastaAtual = folders.find((f) => f.id === folder);
  const apagar = (l: BLesson) => {
    if (!confirm(`Apagar a aula “${l.title}” deste computador?`)) return;
    if (l.deck && !l.origem) void native.apagarArquivo(l.deck.fileId);
    store.deleteLesson(l.id);
  };

  function nova() {
    const now = new Date().toISOString();
    const l: BLesson = { id: uid(), title: "Nova aula", passages: [], createdAt: now, updatedAt: now, ...(pastaAtual ? { folderId: pastaAtual.id } : {}) };
    store.saveLesson(l);
    go({ r: "aula", id: l.id });
  }

  async function enviar() {
    setMsg(null);
    const cfg = await native.config();
    if (!cfg.conectado) return go({ r: "ajustes", aba: "conta" });
    setBusy("Conectando…");
    try {
      const r = await enviarParaPlataforma(setBusy);
      setBusy("Sincronizando os roteiros…");
      await syncRoteiros();
      setMsg({ ok: !r.falhas.length, text: `Guardado na plataforma: ${r.aulas} aulas${r.pdfs ? `, ${r.pdfs} PDFs` : ""} e os roteiros.${r.falhas.length ? ` Não foi: ${r.falhas.join("; ")}` : ""}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Não foi possível guardar na plataforma." });
    } finally {
      setBusy("");
    }
  }

  async function importar() {
    setMsg(null);
    const cfg = await native.config();
    if (!cfg.conectado) return go({ r: "ajustes", aba: "conta" });
    setBusy("Conectando…");
    try {
      const r = await importFromPlatform(setBusy);
      setMsg({
        ok: !r.falhas.length,
        text: `${r.aulas} ${r.aulas === 1 ? "aula trazida" : "aulas trazidas"} da plataforma${r.pdfs ? ` · ${r.pdfs} apresentações baixadas` : ""}.${
          r.falhas.length ? ` Não baixou: ${r.falhas.join("; ")}` : ""
        }`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Não foi possível trazer as aulas." });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1320px] px-10 pt-10 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] text-lume uppercase">Modo Aula</p>
          <h1 className="mt-2 font-serif text-[40px] leading-none font-semibold tracking-tight">Suas aulas</h1>
          <p className="mt-3 text-sm text-ink-400">Slides e textos bíblicos prontos para projetar, mesmo sem internet.</p>
        </div>
        <div className="flex gap-2">
          <Btn onClick={enviar} disabled={Boolean(busy)} title="Guardar as aulas, os PDFs e os roteiros na plataforma (cópia na nuvem)">
            <Icon name="subir" /> Guardar na plataforma
          </Btn>
          <Btn onClick={importar} disabled={Boolean(busy)}>
            <Icon name="nuvem" /> Trazer da plataforma
          </Btn>
          <Btn variant="primary" onClick={nova}>
            <Icon name="mais" /> Nova aula
          </Btn>
        </div>
      </header>

      {(busy || msg) && (
        <div
          className={`mt-6 flex items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${
            busy ? "bg-ink-800 text-ink-200 ring-edge/5" : msg?.ok ? "bg-sage/10 text-sage ring-sage/25" : "bg-coral/10 text-coral ring-coral/25"
          }`}
        >
          {busy && <span className="pulso size-2 rounded-full bg-lume" />}
          <span className="flex-1">{busy || msg?.text}</span>
          {!busy && (
            <button type="button" onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100" aria-label="Fechar">
              <Icon name="x" className="size-4" />
            </button>
          )}
        </div>
      )}

      <div className="mt-8 flex gap-8">
        <PastasLado
          titulo="Pastas"
          pastas={folders}
          contar={contar}
          atual={folder}
          setAtual={setFolder}
          criar={(n, pai) => store.createFolder(n, pai)}
          renomear={(id, n) => store.renameFolder(id, n)}
          apagar={(id) => store.deleteFolder(id)}
          soltar={(id, pasta) => store.moveLesson(id, pasta)}
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
                "Todas as aulas"
              )}
            </p>
            <div className="relative ml-auto w-64">
              <Icon name="busca" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aula ou texto (ex.: Rm 5)" className={`${inputCls} pl-9`} />
            </div>
            <Vista value={vista} onChange={(v) => store.setPrefs({ vistaAulas: v })} />
          </div>

          {list.length === 0 ? (
            <Card className="mt-6 grid place-items-center px-6 py-16 text-center">
              <Icon name="aulas" className="size-9 text-ink-500" />
              <p className="mt-4 font-serif text-xl font-semibold">{lessons.length ? (q ? "Nenhuma aula encontrada" : "Pasta vazia") : "Comece pela primeira aula"}</p>
              <p className="mt-2 max-w-md text-sm text-ink-400">
                {lessons.length
                  ? q
                    ? "Tente outra busca."
                    : "Arraste aulas para cá ou crie uma aula nova dentro desta pasta."
                  : "Crie uma aula com os slides (PDF) e os textos bíblicos, ou traga as aulas que o senhor já montou no modo aula da plataforma."}
              </p>
            </Card>
          ) : vista === "lista" ? (
            <div className="mt-5 overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-edge/6 ring-inset">
              {list.map((l, i) => (
                <div
                  key={l.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(DRAG, l.id)}
                  onClick={() => go({ r: "aula", id: l.id })}
                  className={`group flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-edge/[.03] ${i ? "border-t border-edge/6" : ""}`}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-800 text-lume">
                    <Icon name={l.deck ? "pdf" : "biblia"} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.title}</p>
                    <p className="truncate text-xs text-ink-400">
                      {l.passages.map((p) => p.ref).join(" · ") || "Sem textos"}
                    </p>
                  </div>
                  {!pastaAtual && l.folderId && (
                    <span className="hidden shrink-0 items-center gap-1.5 text-xs text-ink-400 md:flex">
                      <FolderIcon color={folders.find((f) => f.id === l.folderId)?.color} /> {folders.find((f) => f.id === l.folderId)?.name}
                    </span>
                  )}
                  <span className="w-24 shrink-0 text-right text-xs text-ink-400 tabular-nums">
                    {l.deck ? `${l.deck.pages} slides` : ""}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-ink-500 tabular-nums">{new Date(l.updatedAt).toLocaleDateString("pt-BR")}</span>
                  <button
                    type="button"
                    title="Apresentar"
                    onClick={(e) => (e.stopPropagation(), go({ r: "apresentar", id: l.id }))}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-lume opacity-0 group-hover:opacity-100 hover:bg-lume/10"
                  >
                    <Icon name="play" className="size-4" />
                  </button>
                  <ItemMenu pastas={folders} atual={l.folderId} mover={(pasta) => store.moveLesson(l.id, pasta)} acoes={[{ label: "Apagar aula", danger: true, onClick: () => apagar(l) }]} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
              {list.map((l) => (
                <div key={l.id} draggable onDragStart={(e) => e.dataTransfer.setData(DRAG, l.id)} className="relative">
                  <LessonCard l={l} go={go} folder={pastaAtual ? undefined : folders.find((f) => f.id === l.folderId)?.name} />
                  <div className="absolute right-2 bottom-2">
                    <ItemMenu pastas={folders} atual={l.folderId} mover={(pasta) => store.moveLesson(l.id, pasta)} acoes={[{ label: "Apagar aula", danger: true, onClick: () => apagar(l) }]} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonCard({ l, go, folder }: { l: BLesson; go: Go; folder?: string }) {
  const refs = l.passages.slice(0, 3).map((p) => p.ref);
  return (
    <div className="group relative h-full overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-edge/6 transition-[transform,box-shadow] ring-inset hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,.8)]">
      <button type="button" onClick={() => go({ r: "aula", id: l.id })} className="block w-full text-left">
        <div className="relative aspect-[16/8] overflow-hidden bg-[radial-gradient(120%_100%_at_50%_0%,#1b2029_0%,#0a0b0e_70%)] px-5 pt-5">
          <span className="absolute top-0 left-1/2 h-full w-24 -translate-x-1/2 bg-[linear-gradient(180deg,rgba(229,72,77,.2),transparent_80%)] [clip-path:polygon(45%_0,55%_0,100%_100%,0_100%)]" />
          {refs.length ? (
            <div className="relative space-y-1">
              {refs.map((r, i) => (
                <p key={i} className={`font-serif leading-tight ${i === 0 ? "text-[19px] text-paper" : "text-sm text-ink-400"}`}>
                  {r}
                </p>
              ))}
              {l.passages.length > 3 && <p className="text-xs text-ink-500">+{l.passages.length - 3} textos</p>}
            </div>
          ) : (
            <p className="relative font-serif text-sm text-ink-500 italic">Sem textos ainda</p>
          )}
          {l.deck && (
            <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[11px] font-semibold text-ink-200">
              <Icon name="pdf" className="size-3.5" /> {l.deck.pages} slides
            </span>
          )}
        </div>
        <div className="px-5 pt-4 pb-5">
          {folder && <p className="mb-1 text-[11px] font-bold tracking-wider text-lume/80 uppercase">{folder}</p>}
          <p className="line-clamp-2 text-[15px] leading-snug font-semibold">{l.title}</p>
          <p className="mt-1.5 text-xs text-ink-400">
            {l.passages.length} {l.passages.length === 1 ? "texto" : "textos"} · {new Date(l.updatedAt).toLocaleDateString("pt-BR")}
            {l.origem ? " · da plataforma" : ""}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => go({ r: "apresentar", id: l.id })}
        title="Apresentar"
        className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-marca text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        <Icon name="play" className="size-5 translate-x-[1px]" />
      </button>
    </div>
  );
}
