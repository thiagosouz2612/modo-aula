// ------------------------------------------------------------------
// Início: as aulas do professor.
// ------------------------------------------------------------------
import { useMemo, useState } from "react";
import type { Go } from "../main";
import { Btn, Card, Icon, inputCls } from "../components/ui";
import { native } from "../lib/native";
import { store, useStore } from "../lib/store";
import { importFromPlatform } from "../lib/sync";
import { uid, type BLesson } from "../lib/types";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function Aulas({ go }: { go: Go }) {
  const lessons = useStore((s) => s.lessons);
  const folders = useStore((s) => s.folders);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string>("todas");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const list = useMemo(() => {
    const f = fold(q.trim());
    return [...lessons]
      .filter((l) => folder === "todas" || (folder === "sem" ? !l.folderId : l.folderId === folder))
      .filter((l) => !f || fold(l.title).includes(f) || l.passages.some((p) => fold(p.ref).includes(f)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [lessons, q, folder]);

  const usedFolders = folders.filter((f) => lessons.some((l) => l.folderId === f.id));

  function nova() {
    const now = new Date().toISOString();
    const l: BLesson = { id: uid(), title: "Nova aula", passages: [], createdAt: now, updatedAt: now };
    store.saveLesson(l);
    go({ r: "aula", id: l.id });
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
    <div className="mx-auto max-w-[1180px] px-10 pt-10 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] text-lume uppercase">Modo Aula</p>
          <h1 className="mt-2 font-serif text-[40px] leading-none font-semibold tracking-tight">Suas aulas</h1>
          <p className="mt-3 text-sm text-ink-400">Slides e textos bíblicos prontos para projetar, mesmo sem internet.</p>
        </div>
        <div className="flex gap-2">
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
            busy ? "bg-ink-800 text-ink-200 ring-white/5" : msg?.ok ? "bg-sage/10 text-sage ring-sage/25" : "bg-coral/10 text-coral ring-coral/25"
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

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Icon name="busca" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aula ou texto (ex.: Rm 5)" className={`${inputCls} pl-9`} />
        </div>
        {usedFolders.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[["todas", "Todas"] as const, ...usedFolders.map((f) => [f.id, f.name] as const), ["sem", "Sem pasta"] as const].map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFolder(id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors ${
                  folder === id ? "bg-lume/15 text-lume ring-lume/40" : "text-ink-300 ring-white/8 hover:text-ink-100"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <Card className="mt-8 grid place-items-center px-6 py-16 text-center">
          <Icon name="aulas" className="size-9 text-ink-500" />
          <p className="mt-4 font-serif text-xl font-semibold">{lessons.length ? "Nenhuma aula encontrada" : "Comece pela primeira aula"}</p>
          <p className="mt-2 max-w-md text-sm text-ink-400">
            {lessons.length
              ? "Tente outra busca ou outra pasta."
              : "Crie uma aula com os slides (PDF) e os textos bíblicos, ou traga as aulas que o senhor já montou no modo aula da plataforma."}
          </p>
          {!lessons.length && (
            <div className="mt-6 flex gap-2">
              <Btn onClick={importar}>
                <Icon name="nuvem" /> Trazer da plataforma
              </Btn>
              <Btn variant="primary" onClick={nova}>
                <Icon name="mais" /> Nova aula
              </Btn>
            </div>
          )}
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {list.map((l) => (
            <LessonCard key={l.id} l={l} go={go} folder={folders.find((f) => f.id === l.folderId)?.name} />
          ))}
        </div>
      )}
    </div>
  );
}

function LessonCard({ l, go, folder }: { l: BLesson; go: Go; folder?: string }) {
  const refs = l.passages.slice(0, 3).map((p) => p.ref);
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/6 transition-[transform,box-shadow] ring-inset hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,.8)]">
      <button type="button" onClick={() => go({ r: "aula", id: l.id })} className="block w-full text-left">
        <div className="relative aspect-[16/8] overflow-hidden bg-[radial-gradient(120%_100%_at_50%_0%,#1b2029_0%,#0a0b0e_70%)] px-5 pt-5">
          <span className="absolute top-0 left-1/2 h-full w-24 -translate-x-1/2 bg-[linear-gradient(180deg,rgba(242,181,68,.16),transparent_80%)] [clip-path:polygon(45%_0,55%_0,100%_100%,0_100%)]" />
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
        className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-lume text-ink-950 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        <Icon name="play" className="size-5 translate-x-[1px]" />
      </button>
    </div>
  );
}
