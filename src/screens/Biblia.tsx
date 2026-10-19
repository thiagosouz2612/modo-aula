// ------------------------------------------------------------------
// Bíblia: leitura livre (tradução, original e interlinear), estudo da
// palavra (Strong, morfologia, léxico) e projeção na hora.
// Clique nos versículos para escolher; Shift+clique para um trecho.
// ------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Card, Icon } from "../components/ui";
import {
  ABBR, cleanTranslit, cleanWord, headingsByVerse, isHebrew, loadBook, loadOriginal, loadTitles, parseRef, tagVerse,
  splitGloss, strongLabel, type BookHeadings, type Catalog, type Heading, type OrigChapter, type OrigWord,
} from "../lib/bible";
import { cast, useCast } from "../lib/cast";
import { useCatalog } from "../lib/hooks";
import { loadPassage, type Vista } from "../lib/scene";
import { WordPanel } from "../components/Palavra";
import { BuscaBiblia } from "../components/Busca";
import { store, useStore } from "../lib/store";
import { uid } from "../lib/types";


export function Biblia() {
  const { cat, err, retry } = useCatalog();
  if (!cat)
    return (
      <div className="grid h-full place-items-center p-10 text-center">
        <div>
          <Icon name="biblia" className="mx-auto size-10 text-ink-500" />
          <p className="mt-4 font-serif text-xl font-semibold">{err ? "Não foi possível abrir a Bíblia" : "Abrindo a Bíblia…"}</p>
          {err && (
            <>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">{err}</p>
              <Btn className="mt-5" onClick={retry}>
                Tentar de novo
              </Btn>
            </>
          )}
        </div>
      </div>
    );
  return <Reader cat={cat} />;
}

type Modo = "traducao" | "original" | "interlinear";

/** menu que fecha ao clicar fora */
function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", f);
    return () => window.removeEventListener("mousedown", f);
  }, [open]);
  return { open, setOpen, ref };
}

function Reader({ cat }: { cat: Catalog }) {
  const prefs = useStore((s) => s.prefs);
  const strongOn = prefs.bibliaStrong ?? true;
  const titulosOn = prefs.bibliaTitulos ?? true;
  const tam = prefs.bibliaTam ?? 20;
  const [book, setBook] = useState("JHN");
  const [chapter, setChapter] = useState(3);
  const [versao, setVersao] = useState(prefs.versao);
  const [modo, setModo] = useState<Modo>("traducao");
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [text, setText] = useState<string[] | null>(null);
  const [orig, setOrig] = useState<OrigChapter | null>(null);
  const [titles, setTitles] = useState<BookHeadings | null>(null);
  const [word, setWord] = useState<OrigWord | null>(null);
  const [wordRef, setWordRef] = useState(0);
  const [err, setErr] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const info = cat.books.find((b) => b.id === book)!;
  const heb = isHebrew(book, cat);
  const trad = modo === "traducao";

  useEffect(() => {
    let dead = false;
    setErr("");
    setText(null);
    setOrig(null);
    if (trad)
      loadBook(versao, book)
        .then((b) => !dead && setText(b[chapter - 1] ?? []))
        .catch(() => !dead && setErr("Não foi possível abrir este livro nesta versão."));
    if (!trad || strongOn)
      loadOriginal(book, chapter)
        .then((o) => !dead && setOrig(o))
        .catch(() => !dead && !trad && setErr("Não foi possível abrir o texto original."));
    loadTitles(book).then((t) => !dead && setTitles(t));
    return () => {
      dead = true;
    };
  }, [book, chapter, versao, trad, strongOn]);

  // capítulo novo: volta ao topo
  useEffect(() => scroller.current?.scrollTo({ top: 0 }), [book, chapter]);

  const heads = useMemo(() => (titulosOn ? headingsByVerse(titles, chapter) : new Map<number, Heading[]>()), [titles, chapter, titulosOn]);
  const verses: number[] = trad ? (text ?? []).map((_, i) => i + 1) : Object.keys(orig ?? {}).map(Number).sort((a, b) => a - b);
  // parágrafos: cada título de perícope começa um novo
  const grupos = useMemo(() => {
    const out: { heads: Heading[]; vs: number[] }[] = [];
    for (const v of verses) {
      const h = heads.get(v);
      if (h?.length || !out.length) out.push({ heads: h ?? [], vs: [] });
      out[out.length - 1].vs.push(v);
    }
    return out;
  }, [verses.join(","), heads]);

  function go(t: string) {
    const r = parseRef(t, cat);
    if (!r) return setErr(`Não entendi “${t}”.`);
    setBook(r.book.id);
    setChapter(r.chapter);
    setSel(r.from ? [r.from, r.to ?? r.from] : null);
    setTimeout(() => document.getElementById(`v-${r.from ?? 1}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  }
  const click = (n: number, shift: boolean) => {
    if (shift && sel) setSel([Math.min(sel[0], n), Math.max(sel[1], n)]);
    else setSel(sel && sel[0] === n && sel[1] === n ? null : [n, n]);
  };
  const refText = sel ? `${info.name} ${chapter}:${sel[0]}${sel[1] !== sel[0] ? `-${sel[1]}` : ""}` : `${info.name} ${chapter}`;
  const step = (d: number) => {
    let c = chapter + d;
    let i = cat.books.findIndex((b) => b.id === book);
    if (c < 1) {
      if (i === 0) return;
      i--;
      c = cat.books[i].chapters;
    } else if (c > info.chapters) {
      if (i === cat.books.length - 1) return;
      i++;
      c = 1;
    }
    setBook(cat.books[i].id);
    setChapter(c);
    setSel(null);
  };
  const abrirPalavra = (w: OrigWord, n: number) => (setWord(w), setWordRef(n));
  const nomeVersao = cat.versions.find((v) => v.id === versao)?.name ?? versao;
  const subtitulo = trad ? nomeVersao : modo === "original" ? (heb ? "Texto hebraico · Códice de Leningrado" : "Texto grego · NA28 / SBLGNT") : `Interlinear · ${heb ? "hebraico" : "grego"} e português`;

  // setas do teclado trocam o capítulo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-full">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* barra de cima, como na plataforma */}
        <div className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-edge/8 bg-ink-950/95 px-5 backdrop-blur">
          <div className="w-60">
            <BuscaBiblia versao={versao} onPick={go} compact placeholder="Buscar: Rm 8:28 ou “o justo…”" />
          </div>
          <div className="flex flex-1 justify-center">
            <div className="flex items-center rounded-full bg-ink-800 ring-1 ring-edge/6 ring-inset">
              <LivroPicker cat={cat} book={book} chapter={chapter} onPick={(b, c) => (setBook(b), setChapter(c), setSel(null))} />
              {trad && (
                <>
                  <span className="h-5 w-px bg-edge/10" />
                  <VersaoPicker cat={cat} versao={versao} onPick={setVersao} />
                </>
              )}
            </div>
          </div>
          <ProjetarBtn refText={refText} versao={versao} vista={trad ? "traducao" : modo} cat={cat} />
          <div className="flex rounded-full bg-ink-800 p-1 ring-1 ring-edge/6 ring-inset">
            {(
              [
                ["traducao", "Tradução"],
                ["original", heb ? "Hebraico" : "Grego"],
                ["interlinear", "Interlinear"],
              ] as [Modo, string][]
            ).map(([m, l]) => (
              <button
                key={m}
                type="button"
                onClick={() => (setModo(m), setWord(null))}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${modo === m ? "bg-ink-850 text-lume shadow-sm ring-1 ring-edge/8" : "text-ink-400 hover:text-ink-100"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <MenuLeitura heb={heb} modo={modo} setModo={(m) => (setModo(m), setWord(null))} strongOn={strongOn} titulosOn={titulosOn} tam={tam} />
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <article className="mx-auto max-w-[720px] px-8 pt-12 pb-40">
            <header className="mb-10 text-center">
              <h1 className="font-display text-[44px] leading-tight font-semibold tracking-tight">
                {info.name} {chapter}
              </h1>
              <p className="mt-1.5 text-xs font-semibold tracking-[0.12em] text-ink-400 uppercase">{subtitulo}</p>
            </header>
            {err && <p className="mb-6 rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{err}</p>}
            {!err && !verses.length && <p className="text-center text-sm text-ink-400">Abrindo…</p>}

            {grupos.map((g, gi) => (
              <section key={gi} className={gi ? "mt-7" : ""}>
                {g.heads.map((h, k) => (
                  <div key={k} className={`${k ? "mt-3" : ""} mb-2.5`}>
                    <p className={`font-nota ${h[1] === 1 ? "text-[17px] font-bold" : "text-[15px] font-semibold"} text-ink-100`}>{h[2]}</p>
                    {h[3] && (
                      <p className="mt-0.5 text-xs">
                        {h[3].split(/;\s*/).map((r, i) => (
                          <span key={i}>
                            {i > 0 && <span className="text-ink-500">; </span>}
                            <button type="button" onClick={() => go(r)} className="text-lume hover:underline">
                              {r}
                            </button>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                ))}
                {modo === "interlinear" ? (
                  <div dir={heb ? "rtl" : "ltr"} className="space-y-5">
                    {g.vs.map((n) => (
                      <div key={n} id={`v-${n}`} className={`flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl px-1 py-1 ${sel && n >= sel[0] && n <= sel[1] ? "bg-lume/10" : ""}`}>
                        <button type="button" onClick={(e) => click(n, e.shiftKey)} className="pt-2 font-nota text-xs font-bold text-lume">
                          {n}
                        </button>
                        {orig?.[String(n)]?.map((w, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => abrirPalavra(w, n)}
                            className={`flex flex-col items-center rounded-lg px-1.5 py-1 hover:bg-edge/5 ${word === w ? "bg-lume/15 ring-1 ring-lume/40" : ""}`}
                          >
                            <span className={heb ? "font-hebrew text-[24px]" : "font-greek text-[22px]"}>{cleanWord(w[0])}</span>
                            <span dir="ltr" className="font-nota text-[11px] text-ink-400 italic">{cleanTranslit(w[1], heb)}</span>
                            <span dir="ltr" className="font-nota text-[11.5px] font-semibold text-lume">{splitGloss(w[4]).main}</span>
                            <span dir="ltr" className="font-nota text-[10px] text-ink-500">{strongLabel(w[2])}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p
                    dir={!trad && heb ? "rtl" : "ltr"}
                    className={`${trad ? "font-display" : heb ? "font-hebrew" : "font-greek"} text-ink-100`}
                    style={{ fontSize: `${trad ? tam : tam + 4}px`, lineHeight: trad ? 1.95 : 2.05, fontVariationSettings: '"opsz" 14' }}
                  >
                    {g.vs.map((n) => {
                      const on = sel && n >= sel[0] && n <= sel[1];
                      const ws = orig?.[String(n)];
                      return (
                        <span key={n} id={`v-${n}`} className={on ? "rounded bg-lume/12 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-lume)_12%,transparent)]" : ""}>
                          <sup
                            onClick={(e) => click(n, e.shiftKey)}
                            title="Escolher este versículo (Shift+clique para um trecho)"
                            className={`mr-0.5 ml-1 cursor-pointer font-nota text-[0.55em] font-semibold ${on ? "text-lume" : "text-ink-400 hover:text-lume"}`}
                          >
                            {n}
                          </sup>
                          {trad
                            ? strongOn && ws
                              ? tagVerse(text?.[n - 1] ?? "", ws).map((tk, k) =>
                                  tk.word !== undefined ? (
                                    <span
                                      key={k}
                                      onClick={() => abrirPalavra(ws[tk.word!], n)}
                                      className={`cursor-pointer rounded-sm hover:bg-lume/12 ${word === ws[tk.word] ? "bg-lume/20" : ""}`}
                                    >
                                      {tk.text}
                                      <sup className="ml-px font-nota text-[0.5em] font-bold text-lume">†</sup>
                                    </span>
                                  ) : (
                                    <span key={k}>{tk.text}</span>
                                  ),
                                )
                              : text?.[n - 1]
                            : ws?.map((w, i) => (
                                <span key={i}>
                                  <span onClick={() => abrirPalavra(w, n)} className={`cursor-pointer rounded px-0.5 hover:bg-lume/15 ${word === w ? "bg-lume/25" : ""}`}>
                                    {cleanWord(w[0])}
                                  </span>{" "}
                                </span>
                              ))}{" "}
                        </span>
                      );
                    })}
                  </p>
                )}
              </section>
            ))}
          </article>
          {sel && <ProjectBar refText={refText} versao={versao} vista={trad ? "traducao" : modo} cat={cat} onClose={() => setSel(null)} />}
        </div>

        {/* capítulo anterior e próximo, nas laterais */}
        <button
          type="button"
          onClick={() => step(-1)}
          title="Capítulo anterior (←)"
          className="absolute top-1/2 left-5 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-2xl bg-ink-800 text-ink-200 shadow-sm ring-1 ring-edge/6 hover:text-lume"
        >
          <Icon name="voltar" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          title="Próximo capítulo (→)"
          className="absolute top-1/2 right-5 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-2xl bg-ink-800 text-ink-200 shadow-sm ring-1 ring-edge/6 hover:text-lume"
        >
          <Icon name="seta" />
        </button>
      </div>
      {word && (
        <div className="w-[380px] shrink-0 border-l border-edge/5 bg-ink-900">
          <WordPanel word={word} refLabel={`${info.name} ${chapter}:${wordRef}`} onClose={() => setWord(null)} onJump={setWord} onRef={(r) => go(r.split(",")[0].trim())} />
        </div>
      )}
    </div>
  );
}

// ---------------- livro e capítulo ----------------
const foldTxt = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function LivroPicker({ cat, book, chapter, onPick }: { cat: Catalog; book: string; chapter: number; onPick: (b: string, c: number) => void }) {
  const { open, setOpen, ref } = usePop();
  const [aberto, setAberto] = useState(book);
  const [q, setQ] = useState("");
  const lista = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setAberto(book);
    setQ("");
    setTimeout(() => lista.current?.querySelector("[data-aberto=true]")?.scrollIntoView({ block: "center" }), 0);
  }, [open]);
  const nome = cat.books.find((b) => b.id === book)?.name ?? book;
  const f = foldTxt(q.trim());
  const secao = (titulo: string, de: number, ate: number) => {
    const itens = cat.books.slice(de, ate).filter((b) => !f || foldTxt(b.name).includes(f) || foldTxt(ABBR[b.id] ?? "").startsWith(f));
    if (!itens.length) return null;
    return (
      <div>
        <p className="px-4 pt-3 pb-1.5 text-[11px] font-bold tracking-[0.14em] text-ink-400 uppercase">{titulo}</p>
        {itens.map((b) => (
          <div key={b.id} data-aberto={aberto === b.id}>
            <button
              type="button"
              onClick={() => setAberto(aberto === b.id ? "" : b.id)}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-edge/[.05] ${b.id === book ? "font-semibold text-lume" : ""}`}
            >
              {b.name}
              <Icon name="chevron" className={`size-4 text-ink-500 transition-transform ${aberto === b.id ? "rotate-180" : ""}`} />
            </button>
            {aberto === b.id && (
              <div className="grid grid-cols-6 gap-1 px-4 pb-3">
                {Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => (onPick(b.id, c), setOpen(false))}
                    className={`grid h-9 place-items-center rounded-lg text-sm font-semibold ${b.id === book && c === chapter ? "bg-marca text-white" : "bg-ink-800 hover:bg-lume/15 hover:text-lume"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-l-full px-4 py-2 text-sm font-semibold hover:text-lume">
        {nome} {chapter}
        <Icon name="chevron" className="size-4" />
      </button>
      {open && (
        <div className="absolute top-11 left-1/2 z-40 flex max-h-[70vh] w-80 -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-ink-850 shadow-2xl ring-1 ring-edge/10">
          <div className="border-b border-edge/8 p-3">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Livro (ex.: João, Sl, 1Co)"
              className="h-9 w-full rounded-xl bg-ink-800 px-3 text-sm ring-1 ring-edge/8 outline-none ring-inset focus:ring-lume/60"
            />
          </div>
          <div ref={lista} className="min-h-0 flex-1 overflow-y-auto pb-2">
            {secao("Antigo Testamento", 0, 39)}
            {secao("Novo Testamento", 39, cat.books.length)}
          </div>
        </div>
      )}
    </div>
  );
}

function VersaoPicker({ cat, versao, onPick }: { cat: Catalog; versao: string; onPick: (v: string) => void }) {
  const { open, setOpen, ref } = usePop();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-r-full px-4 py-2 text-sm font-semibold hover:text-lume" title="Trocar a tradução">
        {versao}
      </button>
      {open && (
        <div className="absolute top-11 left-1/2 z-40 max-h-[70vh] w-80 -translate-x-1/2 overflow-y-auto rounded-2xl bg-ink-850 p-1.5 shadow-2xl ring-1 ring-edge/10">
          {cat.versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => (onPick(v.id), setOpen(false))}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-edge/[.05] ${v.id === versao ? "text-lume" : ""}`}
            >
              <span className="w-14 shrink-0 text-xs font-bold">{v.id}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{v.name}</span>
              {v.id === versao && <Icon name="check" className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- menu "⋯" (modo de leitura) ----------------
function MenuLeitura({ heb, modo, setModo, strongOn, titulosOn, tam }: { heb: boolean; modo: Modo; setModo: (m: Modo) => void; strongOn: boolean; titulosOn: boolean; tam: number }) {
  const { open, setOpen, ref } = usePop();
  const radio = (m: Modo, titulo: string, desc: string) => (
    <button key={m} type="button" onClick={() => setModo(m)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-edge/[.04]">
      <span className={`mt-1 grid size-3.5 shrink-0 place-items-center rounded-full ring-1 ${modo === m ? "bg-marca ring-marca" : "ring-ink-500"}`}>
        {modo === m && <span className="size-1.5 rounded-full bg-white" />}
      </span>
      <span>
        <span className={`block text-sm ${modo === m ? "font-semibold text-lume" : ""}`}>{titulo}</span>
        <span className="block text-xs text-ink-400">{desc}</span>
      </span>
    </button>
  );
  const check = (on: boolean, titulo: string, desc: string, set: () => void) => (
    <button type="button" onClick={set} className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-edge/[.04]">
      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded ${on ? "bg-marca text-white" : "ring-1 ring-ink-500"}`}>{on && <Icon name="check" className="size-3" />}</span>
      <span>
        <span className="block text-sm">{titulo}</span>
        <span className="block text-xs text-ink-400">{desc}</span>
      </span>
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Modo de leitura"
        className={`grid size-9 place-items-center rounded-full ring-1 ring-inset ${open ? "bg-edge/10 ring-edge/20" : "ring-edge/15 hover:bg-edge/5"}`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <circle cx="5.5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18.5" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-40 w-80 rounded-2xl bg-ink-850 p-2 shadow-2xl ring-1 ring-edge/10">
          <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-[0.14em] text-ink-400 uppercase">Modo de leitura</p>
          {radio("traducao", "Tradução", "Texto em português")}
          {radio("original", heb ? "Hebraico" : "Grego", "Toque nas palavras para ver o léxico")}
          {radio("interlinear", "Interlinear", "Original com o significado de cada palavra")}
          <div className="my-2 border-t border-edge/8" />
          {check(strongOn, "Números de Strong na tradução", "Marca com † as palavras ligadas ao original (ligação automática).", () => store.setPrefs({ bibliaStrong: !strongOn }))}
          {check(titulosOn, "Títulos das perícopes", "Divide o capítulo em partes com título e passagens paralelas.", () => store.setPrefs({ bibliaTitulos: !titulosOn }))}
          <div className="mt-1 flex items-center justify-between px-3 py-2">
            <span className="text-sm">Tamanho do texto</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => store.setPrefs({ bibliaTam: Math.max(15, tam - 1) })} className="grid h-9 w-10 place-items-center rounded-lg bg-ink-800 text-sm font-bold hover:text-lume">
                A−
              </button>
              <button type="button" onClick={() => store.setPrefs({ bibliaTam: Math.min(30, tam + 1) })} className="grid h-9 w-10 place-items-center rounded-lg bg-ink-800 text-sm font-bold hover:text-lume">
                A+
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** botão escuro "Projetar" (o capítulo ou o trecho escolhido) */
function ProjetarBtn({ refText, versao, vista, cat }: { refText: string; versao: string; vista: Vista; cat: Catalog }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const l = await loadPassage(refText, versao, vista, cat).catch(() => null);
        if (!l) return;
        cast.show({ k: "texto", ref: l.label, versao, vista, heb: l.heb, verses: l.verses, marks: [] });
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      title={`Projetar ${refText}`}
      className="flex h-9 items-center gap-2 rounded-full bg-ink-100 px-4 text-sm font-semibold text-ink-950 hover:opacity-90"
    >
      <Icon name={ok ? "check" : "projetor"} className="size-4" /> {ok ? "Na tela" : "Projetar"}
    </button>
  );
}

function ProjectBar({ refText, versao, vista, cat, onClose }: { refText: string; versao: string; vista: Vista; cat: Catalog; onClose: () => void }) {
  const lessons = useStore((s) => s.lessons);
  const { telas, projetor } = useCast();
  const [msg, setMsg] = useState("");
  const show = async () => {
    try {
      const l = await loadPassage(refText, versao, vista, cat);
      cast.show({ k: "texto", ref: l.label, versao, vista, heb: l.heb, verses: l.verses, marks: [] });
      setMsg(telas || projetor ? "Na tela agora." : "Pronto. Abra o projetor para a turma ver.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível.");
    }
  };
  return (
    <div className="pointer-events-none sticky bottom-5 z-10 flex justify-center px-6">
      <Card className="pointer-events-auto flex items-center gap-3 bg-ink-800/95 px-4 py-2.5 shadow-2xl backdrop-blur">
        <span className="font-serif text-[15px] font-semibold">{refText}</span>
        <Btn size="sm" variant="primary" onClick={() => void show()}>
          <Icon name="projetor" className="size-4" /> Projetar
        </Btn>
        <Btn size="sm" onClick={() => cast.show({ k: "logo" })} title="Tirar o texto do projetor">
          Limpar
        </Btn>
        {lessons.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const l = lessons.find((x) => x.id === e.target.value);
              if (!l) return;
              store.saveLesson({ ...l, passages: [...l.passages, { id: uid(), ref: refText, versions: [versao], view: vista }] });
              setMsg(`Posto na aula “${l.title}”.`);
            }}
            className="h-8 rounded-lg bg-ink-700 px-2 text-xs font-semibold text-ink-200 outline-none"
          >
            <option value="">Pôr numa aula…</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        )}
        {msg && <span className="text-xs text-ink-400">{msg}</span>}
        <button type="button" onClick={onClose} title="Desmarcar" className="grid size-7 place-items-center rounded-lg text-ink-400 hover:text-ink-100">
          <Icon name="x" className="size-4" />
        </button>
      </Card>
    </div>
  );
}
