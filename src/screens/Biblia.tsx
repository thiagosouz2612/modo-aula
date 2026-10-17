// ------------------------------------------------------------------
// Bíblia: leitura livre (tradução, original e interlinear), estudo da
// palavra (Strong, morfologia, léxico) e projeção na hora.
// Clique nos versículos para escolher; Shift+clique para um trecho.
// ------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { Btn, Card, Icon, inputCls, selCls, Seg } from "../components/ui";
import {
  cleanTranslit, cleanWord, describeMorph, headingsByVerse, isHebrew, loadBook, loadLex, loadOriginal, loadTitles, parseRef, plainDefinition,
  splitGloss, strongLabel, type BookHeadings, type Catalog, type LexEntry, type OrigChapter, type OrigWord,
} from "../lib/bible";
import { cast, useCast } from "../lib/cast";
import { useCatalog } from "../lib/hooks";
import { loadPassage, type Vista } from "../lib/scene";
import { store, useStore } from "../lib/store";
import { uid } from "../lib/types";

const VISTAS: [Vista, string][] = [
  ["traducao", "Tradução"],
  ["original", "Original"],
  ["interlinear", "Interlinear"],
];

export function Biblia() {
  const { cat, err, retry } = useCatalog();
  if (!cat)
    return (
      <div className="grid h-full place-items-center p-10 text-center">
        <div>
          <Icon name="biblia" className="mx-auto size-10 text-ink-500" />
          <p className="mt-4 font-serif text-xl font-semibold">{err ? "A Bíblia ainda não está neste computador" : "Abrindo a Bíblia…"}</p>
          {err && (
            <>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
                Na primeira vez, o Modo Aula baixa a Bíblia da plataforma (precisa de internet). Depois funciona sem internet. Em Ajustes dá para baixar tudo de uma vez.
              </p>
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

function Reader({ cat }: { cat: Catalog }) {
  const prefVersao = useStore((s) => s.prefs.versao);
  const [book, setBook] = useState("JHN");
  const [chapter, setChapter] = useState(3);
  const [versao, setVersao] = useState(prefVersao);
  const [vista, setVista] = useState<Vista>("traducao");
  const [sel, setSel] = useState<[number, number] | null>([16, 16]);
  const [q, setQ] = useState("");
  const [text, setText] = useState<string[] | null>(null);
  const [orig, setOrig] = useState<OrigChapter | null>(null);
  const [titles, setTitles] = useState<BookHeadings | null>(null);
  const [word, setWord] = useState<OrigWord | null>(null);
  const [err, setErr] = useState("");
  const info = cat.books.find((b) => b.id === book)!;
  const heb = isHebrew(book, cat);

  useEffect(() => {
    let dead = false;
    setErr("");
    setText(null);
    setOrig(null);
    if (vista === "traducao")
      loadBook(versao, book)
        .then((b) => !dead && setText(b[chapter - 1] ?? []))
        .catch(() => !dead && setErr("Não foi possível abrir este livro nesta versão (sem internet?)."));
    else
      loadOriginal(book, chapter)
        .then((o) => !dead && setOrig(o))
        .catch(() => !dead && setErr("Não foi possível abrir o texto original (sem internet?)."));
    loadTitles(book).then((t) => !dead && setTitles(t));
    return () => {
      dead = true;
    };
  }, [book, chapter, versao, vista]);

  const heads = useMemo(() => headingsByVerse(titles, chapter), [titles, chapter]);
  const verses: number[] = vista === "traducao" ? (text ?? []).map((_, i) => i + 1) : Object.keys(orig ?? {}).map(Number).sort((a, b) => a - b);

  function go(t: string) {
    const r = parseRef(t, cat);
    if (!r) return setErr(`Não entendi “${t}”.`);
    setBook(r.book.id);
    setChapter(r.chapter);
    setSel(r.from ? [r.from, r.to ?? r.from] : null);
    setQ("");
    setTimeout(() => document.getElementById(`v-${r.from ?? 1}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
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

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-ink-950/90 px-8 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Icon name="busca" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && go(q)} placeholder="Ir para… (Rm 8:28)" className={`${inputCls} pl-9`} />
            </div>
            <select value={book} onChange={(e) => (setBook(e.target.value), setChapter(1), setSel(null))} className={`${selCls} w-44`}>
              <optgroup label="Antigo Testamento">
                {cat.books.slice(0, 39).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Novo Testamento">
                {cat.books.slice(39).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <select value={chapter} onChange={(e) => (setChapter(Number(e.target.value)), setSel(null))} className={`${selCls} w-20`}>
              {Array.from({ length: info.chapters }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
            {vista === "traducao" && (
              <select value={versao} onChange={(e) => setVersao(e.target.value)} className={`${selCls} w-28`}>
                {cat.versions.map((v) => (
                  <option key={v.id} value={v.id} title={v.name}>
                    {v.id}
                  </option>
                ))}
              </select>
            )}
            <div className="ml-auto">
              <Seg size="sm" value={vista} options={VISTAS} onChange={(v) => (setVista(v), setWord(null))} />
            </div>
          </div>
        </div>

        <article className="mx-auto max-w-[860px] px-8 pt-8 pb-40">
          <div className="mb-6 flex items-end justify-between">
            <h1 className="font-serif text-4xl font-semibold tracking-tight">
              {info.name} <span className="text-lume">{chapter}</span>
            </h1>
            <div className="flex gap-1">
              <Btn size="sm" variant="ghost" onClick={() => step(-1)} title="Capítulo anterior">
                <Icon name="voltar" className="size-4" />
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => step(1)} title="Próximo capítulo">
                <Icon name="seta" className="size-4" />
              </Btn>
            </div>
          </div>
          {err && <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{err}</p>}
          <div
            dir={vista !== "traducao" && heb ? "rtl" : "ltr"}
            className={`${vista === "traducao" ? "font-serif text-[19px] leading-[1.85]" : heb ? "font-hebrew text-[24px] leading-[2]" : "font-greek text-[22px] leading-[1.9]"} text-ink-100`}
          >
            {verses.map((n) => {
              const on = sel && n >= sel[0] && n <= sel[1];
              return (
                <span key={n} id={`v-${n}`}>
                  {heads.get(n)?.map((h, i) => (
                    <span key={i} dir="ltr" className={`block font-sans ${h[1] === 1 ? "mt-8 mb-2 text-[15px] font-bold" : "mt-5 mb-1 text-sm font-semibold"} text-lume/90`}>
                      {h[2]}
                    </span>
                  ))}
                  <span
                    onClick={(e) => vista === "traducao" && click(n, e.shiftKey)}
                    className={`rounded-md transition-colors ${on ? "bg-lume/15 ring-1 ring-lume/30" : vista === "traducao" ? "cursor-pointer hover:bg-white/[.04]" : ""}`}
                  >
                    {vista !== "interlinear" && (
                      <sup onClick={(e) => (e.stopPropagation(), click(n, e.shiftKey))} className="mx-1 cursor-pointer font-sans text-[11px] font-bold text-lume">
                        {n}
                      </sup>
                    )}
                    {vista === "traducao" ? (
                      text?.[n - 1]
                    ) : vista === "original" ? (
                      orig?.[String(n)]?.map((w, i) => (
                        <span key={i}>
                          <button type="button" onClick={() => setWord(w)} className={`rounded px-0.5 hover:bg-lume/20 ${word === w ? "bg-lume/25" : ""}`}>
                            {cleanWord(w[0])}
                          </button>{" "}
                        </span>
                      ))
                    ) : (
                      <span className="flex flex-wrap items-start gap-x-4 gap-y-3 py-2">
                        <sup className="pt-3 font-sans text-[11px] font-bold text-lume">{n}</sup>
                        {orig?.[String(n)]?.map((w, i) => (
                          <button key={i} type="button" onClick={() => setWord(w)} className={`flex flex-col items-center rounded-lg px-1.5 py-1 hover:bg-white/5 ${word === w ? "bg-lume/15" : ""}`}>
                            <span>{cleanWord(w[0])}</span>
                            <span dir="ltr" className="font-sans text-[11px] text-ink-400 italic">{cleanTranslit(w[1], heb)}</span>
                            <span dir="ltr" className="font-sans text-[11px] font-semibold text-lume">{splitGloss(w[4]).main}</span>
                            <span dir="ltr" className="font-sans text-[10px] text-ink-500">{strongLabel(w[2])}</span>
                          </button>
                        ))}
                      </span>
                    )}{" "}
                  </span>
                </span>
              );
            })}
          </div>
        </article>

        <ProjectBar refText={refText} versao={versao} vista={vista} cat={cat} />
      </div>
      {word && <WordPanel w={word} heb={heb} onClose={() => setWord(null)} />}
    </div>
  );
}

function ProjectBar({ refText, versao, vista, cat }: { refText: string; versao: string; vista: Vista; cat: Catalog }) {
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
      </Card>
    </div>
  );
}

function WordPanel({ w, heb, onClose }: { w: OrigWord; heb: boolean; onClose: () => void }) {
  const [lex, setLex] = useState<LexEntry | null | undefined>(undefined);
  useEffect(() => {
    let dead = false;
    setLex(undefined);
    loadLex(w[2])
      .then((l) => !dead && setLex(l ?? null))
      .catch(() => !dead && setLex(null));
    return () => {
      dead = true;
    };
  }, [w[2]]);
  const g = splitGloss(w[4]);
  return (
    <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-white/5 bg-ink-900 p-6">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-bold tracking-[0.2em] text-ink-400 uppercase">Estudo da palavra</p>
        <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-100" aria-label="Fechar">
          <Icon name="x" className="size-4" />
        </button>
      </div>
      <p dir={heb ? "rtl" : "ltr"} className={`mt-4 text-5xl ${heb ? "font-hebrew" : "font-greek"}`}>
        {cleanWord(w[0])}
      </p>
      <p className="mt-2 text-sm text-ink-300 italic">{cleanTranslit(w[1], heb)}</p>
      <p className="mt-4 text-lg font-semibold text-lume">{g.main}</p>
      {g.base && <p className="text-xs text-ink-400">palavra-base: {g.base}</p>}
      <dl className="mt-6 space-y-3 text-sm">
        <div>
          <dt className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Strong</dt>
          <dd className="font-semibold">{strongLabel(w[2])}</dd>
        </div>
        {w[3] && (
          <div>
            <dt className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Gramática</dt>
            <dd className="text-ink-200">{describeMorph(w[3], w[2])}</dd>
          </div>
        )}
        {lex && (
          <>
            <div>
              <dt className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Forma do dicionário</dt>
              <dd dir={heb ? "rtl" : "ltr"} className={`text-2xl ${heb ? "font-hebrew" : "font-greek"}`}>
                {lex.l}
              </dd>
              <dd className="text-xs text-ink-400 italic">{lex.t}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Significado</dt>
              <dd className="text-ink-100">{lex.g}</dd>
            </div>
            {lex.n > 0 && (
              <div>
                <dt className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Ocorrências</dt>
                <dd>{lex.n.toLocaleString("pt-BR")} vezes</dd>
              </div>
            )}
            {lex.d && (
              <div>
                <dt className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Léxico (inglês)</dt>
                <dd className="mt-1 max-h-72 overflow-y-auto rounded-xl bg-ink-850 p-3 text-xs leading-relaxed whitespace-pre-line text-ink-300" data-select>
                  {plainDefinition(lex.d)}
                </dd>
              </div>
            )}
          </>
        )}
        {lex === undefined && <p className="text-xs text-ink-500">Carregando o léxico…</p>}
      </dl>
    </aside>
  );
}
