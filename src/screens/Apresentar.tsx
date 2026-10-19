// ------------------------------------------------------------------
// Apresentação: o professor conduz a aula por aqui (teclado, mouse ou
// passador de slides) e o projetor mostra o palco.
//
// Atalhos: → / espaço / PageDown avançar · ← / PageUp voltar
//          T slides ↔ textos · V um versículo por vez · O tradução/original/interlinear
//          1 2 3 versões · B tela preta · C capa · P projetor · / buscar texto · Esc sair
// ------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Go } from "../main";
import { Palco } from "../components/Palco";
import { Btn, Icon, Kbd, Logo, Seg, Toggle } from "../components/ui";
import { cast, useCast } from "../lib/cast";
import { useCatalog } from "../lib/hooks";
import { addMarks, eraseMarks, MARK_NAMES, MARK_SWATCH, selectionToMarks } from "../lib/marks";
import { demoImgs, isNative, native, type Monitor } from "../lib/native";
import { openDeck, renderPage, slideImage } from "../lib/pdf";
import { loadPassage, markKey, vistaOf, VISTAS, type Loaded, type Palavra, type Scene, type SVerse, type Tela, type Vista } from "../lib/scene";
import type { OrigWord } from "../lib/bible";
import { palavraDe, useWordInfo, WordPanel } from "../components/Palavra";
import { BuscaBiblia } from "../components/Busca";
import { Cronometro } from "../components/Cronometro";
import { RoteiroPainel } from "../components/roteiro/Painel";
import type { OnWord } from "../components/Palco";
import { store, useStore } from "../lib/store";
import { uid, type BLesson, type BMark, type BPassage } from "../lib/types";

type Track = "slides" | "textos";
const NO_MARKS: BMark[] = [];

export function Apresentar({ id, go }: { id: string; go: Go }) {
  const lesson = useStore((s) => s.lessons.find((l) => l.id === id));
  const prefs = useStore((s) => s.prefs);
  const { cat } = useCatalog();
  const { tela, telas, projetor, preto } = useCast();

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [deckErr, setDeckErr] = useState("");
  const [track, setTrack] = useState<Track>(lesson?.deck ? "slides" : "textos");
  const [slide, setSlide] = useState(1);
  const [pi, setPi] = useState(0); // texto atual
  const [vi, setViRaw] = useState(0); // versão atual (índice em versions)
  // versão escolhida na hora (qualquer uma): vale para os próximos textos até voltar às da aula
  const [versaoLivre, setVersaoLivre] = useState<string | null>(null);
  const setVi = (i: number) => (setViRaw(i), setVersaoLivre(null));
  // as versões do texto lado a lado
  const [juntas, setJuntas] = useState(false);
  const [colunas, setColunas] = useState<{ versao: string; verses: SVerse[] }[] | null>(null);
  const [verse, setVerse] = useState(0); // versículo atual (um por vez)
  const [capa, setCapa] = useState(true);
  const [extra, setExtra] = useState<BPassage | null>(null); // texto buscado na hora
  const [tool, setTool] = useState<number | "apagar" | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [painel, setPainel] = useState<"palco" | "roteiro">("palco"); // o que o professor vê no meio
  const [word, setWord] = useState<{ w: OrigWord; n: number; i: number; ref: string } | null>(null);
  const [wordOn, setWordOn] = useState(true); // mostrar a palavra no projetor
  const [palavra, setPalavra] = useState<Palavra | null>(null);
  const [rolagem, setRolagem] = useState(0); // rolagem do painel da palavra (a turma acompanha)
  const stageText = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // abre o PDF
  useEffect(() => {
    if (!lesson?.deck) return;
    let dead = false;
    openDeck(lesson.deck.fileId)
      .then((d) => !dead && setDoc(d))
      .catch(() => !dead && setDeckErr("O PDF desta aula não está neste computador. Abra a aula para baixar ou subir de novo."));
    return () => {
      dead = true;
    };
  }, [lesson?.deck?.fileId]);

  const pages = doc?.numPages ?? lesson?.deck?.pages ?? 0;
  const passages = lesson?.passages ?? [];
  const passage: BPassage | null = extra ?? passages[pi] ?? null;
  const versao = versaoLivre ?? passage?.versions[Math.min(vi, passage.versions.length - 1)] ?? prefs.versao;
  const lado = juntas && !versaoLivre && (passage?.versions.length ?? 0) > 1 && vistaOf(passage?.view ?? "traducao") === "traducao";
  const vista = vistaOf(passage?.view ?? "traducao");
  const key = markKey(vista, versao);
  const marks = passage?.marks?.[key] ?? NO_MARKS;

  // carrega o texto atual
  useEffect(() => {
    setLoaded(null);
    setLoadErr("");
    if (!passage || !cat) return;
    let dead = false;
    loadPassage(passage.ref, versao, vista, cat)
      .then((l) => !dead && setLoaded(l))
      .catch((e) => !dead && setLoadErr(e instanceof Error && e.message !== "404" ? e.message : "Este texto não está disponível nesta versão."));
    return () => {
      dead = true;
    };
  }, [passage?.ref, versao, vista, cat]);

  // lado a lado: carrega as outras versões do texto
  useEffect(() => {
    setColunas(null);
    if (!lado || !passage || !cat) return;
    let dead = false;
    Promise.all(passage.versions.map((v) => loadPassage(passage.ref, v, "traducao", cat).then((l) => ({ versao: v, verses: l.verses }))))
      .then((c) => !dead && setColunas(c))
      .catch(() => !dead && setColunas(null));
    return () => {
      dead = true;
    };
  }, [lado, passage?.ref, passage?.versions.join(","), cat]);

  const total = loaded?.verses.length ?? 0;
  const split = prefs.porVerso && total >= 2;
  const cur = Math.min(verse, Math.max(0, total - 1));

  // a cena que vai para o projetor
  const [slideImg, setSlideImg] = useState<string | null>(null);
  useEffect(() => {
    if (track !== "slides" || !lesson?.deck || !doc) return;
    let dead = false;
    const fileId = lesson.deck.fileId;
    void slideImage(fileId, slide).then((img) => !dead && setSlideImg(isNative ? img : (demoImgs.get(img) ?? img)));
    // prepara o próximo
    if (slide < pages) void slideImage(fileId, slide + 1).catch(() => {});
    return () => {
      dead = true;
    };
  }, [track, slide, doc, lesson?.deck?.fileId]);

  const scene: Scene | null = useMemo(() => {
    if (capa) return { k: "logo", titulo: lesson?.title };
    if (track === "slides") return slideImg ? { k: "slide", img: slideImg, n: slide, total: pages } : null;
    if (!loaded) return null;
    const verses = split ? [loaded.verses[cur]] : loaded.verses;
    const r = loaded.ref;
    const ref = split ? `${r.book.name} ${r.chapter}:${loaded.verses[cur].n}` : loaded.label;
    const nAtual = loaded.verses[cur]?.n;
    const cols =
      lado && colunas
        ? colunas.map((c) => ({ versao: c.versao, verses: split ? c.verses.filter((v) => v.n === nAtual) : c.verses }))
        : undefined;
    return {
      k: "texto", ref, versao, vista, heb: loaded.heb, verses, marks,
      ...(cols ? { colunas: cols } : {}),
      parte: split ? [cur + 1, total] : undefined,
      ...(word ? { sel: `${word.n}:${word.i}` } : {}),
      ...(word && palavra ? { palavra: { ...palavra, rolagem } } : {}),
    };
  }, [capa, track, slideImg, slide, pages, loaded, split, cur, versao, vista, marks, lesson?.title, word, palavra, rolagem, lado, colunas]);

  // mostra outro texto na hora (busca ou referência do léxico)
  const mostrarRef = (ref: string) => {
    const p: BPassage = { id: uid(), ref, versions: [versao], view: "traducao" };
    setExtra(p);
    setViRaw(0);
    setVerse(0);
    setCapa(false);
    setTrack("textos");
    setPainel("palco");
  };

  // mudou o texto: fecha a palavra
  useEffect(() => {
    setWord(null);
  }, [passage?.ref, vista, cur, track, capa]);

  // clique numa palavra do texto (original, interlinear ou Strong)
  const onWord: OnWord = (n, i) => {
    if (tool !== null || !loaded) return;
    const w = loaded.orig[n]?.[i];
    if (!w) return;
    if (word && word.n === n && word.i === i) return setWord(null);
    setWord({ w, n, i, ref: `${loaded.ref.book.name} ${loaded.ref.chapter}:${n}` });
  };

  useEffect(() => {
    if (scene && !preto) cast.show(scene);
  }, [scene, preto, prefs.tema, prefs.escala]);

  // ---------------- navegação ----------------
  const next = useCallback(() => {
    if (capa) return setCapa(false);
    if (track === "slides") return setSlide((s) => Math.min(pages, s + 1));
    if (split && cur < total - 1) return setVerse(cur + 1);
    if (extra) return;
    if (pi < passages.length - 1) {
      setPi(pi + 1);
      setViRaw(0);
      setVerse(0);
    }
  }, [capa, track, pages, split, cur, total, extra, pi, passages.length]);

  const prev = useCallback(() => {
    if (capa) return;
    if (track === "slides") return setSlide((s) => Math.max(1, s - 1));
    if (split && cur > 0) return setVerse(cur - 1);
    if (extra) return;
    if (pi > 0) {
      setPi(pi - 1);
      setViRaw(0);
      setVerse(Number.MAX_SAFE_INTEGER); // último versículo do anterior
    }
  }, [capa, track, split, cur, extra, pi]);

  const updatePassage = (f: (p: BPassage) => BPassage) => {
    if (!passage) return;
    if (extra) return setExtra(f(extra));
    store.patchLesson(id, (l) => ({ ...l, passages: l.passages.map((x) => (x.id === passage.id ? f(x) : x)) }));
  };
  const setVista = (v: Vista) => updatePassage((p) => ({ ...p, view: v }));
  const cycleVista = () => setVista(VISTAS[(VISTAS.findIndex(([v]) => v === vista) + 1) % VISTAS.length][0]);

  const goTrack = (t: Track) => {
    setCapa(false);
    if (t === "slides" && !lesson?.deck) return;
    if (t === "textos" && !passages.length && !extra) return;
    setTrack(t);
  };

  // teclado (e passador de slides)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (typing) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        return search.current?.focus();
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) (e.preventDefault(), next());
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) (e.preventDefault(), prev());
      else if (k === "b" || k === "B" || k === "." || k === ",") cast.toggleBlack();
      else if (k === "t" || k === "T" || k === "Tab") (e.preventDefault(), setPainel("palco"), goTrack(track === "slides" ? "textos" : "slides"));
      else if (k === "r" || k === "R") setPainel((v) => (v === "roteiro" ? "palco" : "roteiro"));
      else if (k === "v" || k === "V") store.setPrefs({ porVerso: !prefs.porVerso });
      else if (k === "o" || k === "O") cycleVista();
      else if (k === "c" || k === "C") setCapa((c) => !c);
      else if (k === "p" || k === "P") void (projetor ? cast.closeProjector() : cast.openProjector());
      else if (k === "/") (e.preventDefault(), search.current?.focus());
      else if (/^[1-3]$/.test(k) && passage && passage.versions[Number(k) - 1]) setVi(Number(k) - 1);
      else if (k === "Home") track === "slides" ? setSlide(1) : (setPi(0), setVerse(0));
      else if (k === "End") track === "slides" && setSlide(pages);
      else if (k === "Escape") {
        if (word) setWord(null);
        else if (extra) setExtra(null);
        else if (tool !== null) setTool(null);
        else go({ r: "aula", id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ao sair, o projetor volta para a capa do Modo Aula
  useEffect(() => () => cast.show({ k: "logo" }), []);

  // marca-texto: soltou o mouse com texto selecionado
  const onMouseUp = () => {
    if (tool === null || !stageText.current || !passage) return;
    const sel = selectionToMarks(stageText.current, tool === "apagar" ? 0 : tool);
    if (!sel.length) return;
    window.getSelection()?.removeAllRanges();
    updatePassage((p) => {
      const list = p.marks?.[key] ?? [];
      const nextList = tool === "apagar" ? eraseMarks(list, sel) : addMarks(list, sel);
      return { ...p, marks: { ...(p.marks ?? {}), [key]: nextList } };
    });
  };

  if (!lesson) return null;
  const notes = track === "slides" ? lesson.notes?.[String(slide)] : undefined;

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* barra de cima */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-edge/5 bg-ink-900 px-3">
        <Btn variant="ghost" size="sm" onClick={() => go({ r: "aula", id })} title="Sair (Esc)">
          <Icon name="voltar" className="size-4" /> Sair
        </Btn>
        <Logo className="size-6 text-lume" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{lesson.title}</p>
        <Seg
          size="sm"
          value={painel === "roteiro" ? "roteiro" : track}
          onChange={(v) => (v === "roteiro" ? setPainel("roteiro") : (setPainel("palco"), goTrack(v)))}
          options={[
            ["slides", <span key="s" className={!lesson.deck ? "opacity-40" : ""}>Slides {pages ? `· ${pages}` : ""}</span>],
            ["textos", <span key="t" className={!passages.length ? "opacity-40" : ""}>Textos · {passages.length}</span>],
            ["roteiro", <span key="r">📝 Roteiro</span>],
          ]}
        />
        <div className="flex flex-1 items-center justify-end gap-2">
          <Cronometro />
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${telas ? "bg-sage/12 text-sage" : "bg-ink-800 text-ink-400"}`}>
            <span className={`size-1.5 rounded-full ${telas ? "pulso bg-sage" : "bg-ink-500"}`} />
            {telas ? `Ao vivo · ${telas} ${telas === 1 ? "tela" : "telas"}` : "Nenhuma tela"}
          </span>
          <Btn size="sm" variant={preto ? "primary" : "soft"} onClick={() => cast.toggleBlack()} title="Tela preta (B)">
            <Icon name="preto" className="size-3.5" /> {preto ? "Voltar a mostrar" : "Tela preta"}
          </Btn>
          <ProjectorButton />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)_300px]">
        {/* lista */}
        <aside className="min-h-0 overflow-y-auto border-r border-edge/5 bg-ink-900/60 p-3">
          {track === "slides" ? (
            doc ? (
              <div className="space-y-2">
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => (setCapa(false), setSlide(n))}
                    className={`relative block w-full overflow-hidden rounded-lg ring-2 transition-colors ${!capa && n === slide ? "ring-lume" : "ring-transparent hover:ring-edge/15"}`}
                  >
                    <SlideThumb doc={doc} fileId={lesson.deck!.fileId} n={n} />
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[10px] font-bold text-ink-200">{n}</span>
                    {lesson.notes?.[String(n)] && <span className="absolute top-1 right-1 size-2 rounded-full bg-lume" title="Tem comentário" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="p-2 text-xs text-ink-400">{deckErr || "Abrindo os slides…"}</p>
            )
          ) : (
            <div className="space-y-1">
              {passages.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => (setCapa(false), setExtra(null), setPi(i), setViRaw(0), setVerse(0))}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                    !capa && !extra && i === pi ? "bg-lume/12 ring-1 ring-lume/30 ring-inset" : "hover:bg-edge/[.04]"
                  }`}
                >
                  <p className={`font-serif text-[15px] font-semibold ${!capa && !extra && i === pi ? "text-lume" : ""}`}>{p.ref}</p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {p.versions.join(" · ")} · {VISTAS.find(([v]) => v === vistaOf(p.view))?.[1]}
                  </p>
                </button>
              ))}
              {extra && (
                <div className="mt-3 rounded-xl bg-sky/10 px-3 py-2.5 ring-1 ring-sky/30 ring-inset">
                  <p className="text-[10px] font-bold tracking-wider text-sky uppercase">Buscado agora</p>
                  <p className="font-serif text-[15px] font-semibold">{extra.ref}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Btn
                      size="sm"
                      onClick={() => {
                        const at = Math.min(pi + 1, passages.length);
                        store.patchLesson(id, (l) => {
                          const list = [...l.passages];
                          list.splice(at, 0, extra);
                          return { ...l, passages: list };
                        });
                        setExtra(null);
                        setPi(at);
                      }}
                    >
                      Pôr na aula
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setExtra(null)}>
                      Fechar
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* palco (ou o roteiro, que só o professor vê) */}
        {painel === "roteiro" ? (
          <section className="min-h-0 min-w-0">
            <RoteiroPainel lesson={lesson} />
          </section>
        ) : (
        <section className="flex min-h-0 min-w-0 flex-col p-5">
          <div className="relative grid min-h-0 flex-1 place-items-center">
            <Stage tela={tela} textRef={stageText} onWord={onWord} onRolar={setRolagem} onMouseUp={onMouseUp} marking={tool !== null} loading={!scene && !loadErr} error={!capa && track === "textos" ? loadErr : ""} />
          </div>
          {/* controles do texto */}
          <div className="mt-4 flex min-h-12 flex-wrap items-center justify-center gap-3">
            <Btn size="sm" variant="ghost" onClick={prev} title="Voltar (←)">
              <Icon name="voltar" className="size-4" />
            </Btn>
            {track === "textos" && passage ? (
              <>
                <div className="flex gap-1">
                  {passage.versions.map((v, i) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVi(i)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                        v === versao ? "bg-lume/15 text-lume ring-lume/35" : "text-ink-300 ring-edge/8 hover:text-ink-100"
                      }`}
                      title={`Versão ${i + 1}`}
                    >
                      {v}
                    </button>
                  ))}
                  <select
                    value={versaoLivre ?? ""}
                    onChange={(e) => setVersaoLivre(e.target.value || null)}
                    title="Mostrar este texto em outra versão (vale para os próximos até voltar)"
                    className={`h-7 w-36 rounded-lg px-1.5 text-xs font-bold ring-1 ring-inset ${versaoLivre ? "bg-lume/15 text-lume ring-lume/35" : "bg-transparent text-ink-300 ring-edge/8"}`}
                  >
                    <option value="">{versaoLivre ? "Voltar às da aula" : "Outra versão…"}</option>
                    {(cat?.versions ?? []).map((v) => (
                      <option key={v.id} value={v.id} title={v.name}>
                        {v.id} — {v.name}
                      </option>
                    ))}
                  </select>
                  {passage.versions.length > 1 && vista === "traducao" && !versaoLivre && (
                    <button
                      type="button"
                      onClick={() => setJuntas((j) => !j)}
                      title="Mostrar as versões lado a lado"
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${juntas ? "bg-lume/15 text-lume ring-lume/35" : "text-ink-300 ring-edge/8 hover:text-ink-100"}`}
                    >
                      Lado a lado
                    </button>
                  )}
                </div>
                <Seg size="sm" value={vista} options={VISTAS} onChange={setVista} />
                <Toggle on={prefs.porVerso} onChange={(v) => store.setPrefs({ porVerso: v })} label={<span className="text-xs font-semibold">1 versículo por vez</span>} />
                <span className="h-6 w-px bg-edge/8" />
                <div className="flex items-center gap-1" role="group" aria-label="Marca-texto">
                  {MARK_SWATCH.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      title={`Marca-texto ${MARK_NAMES[i].toLowerCase()} — selecione o texto no palco`}
                      onClick={() => setTool(tool === i ? null : i)}
                      className={`size-6 rounded-full ring-2 ring-offset-2 ring-offset-ink-950 transition-transform ${tool === i ? "scale-110 ring-ink-100" : "ring-transparent hover:scale-105"}`}
                      style={{ background: c }}
                    />
                  ))}
                  <button
                    type="button"
                    title="Apagar destaque — selecione o trecho"
                    onClick={() => setTool(tool === "apagar" ? null : "apagar")}
                    className={`grid size-7 place-items-center rounded-full ${tool === "apagar" ? "bg-ink-100 text-ink-950" : "text-ink-300 hover:bg-edge/5"}`}
                  >
                    <Icon name="borracha" className="size-4" />
                  </button>
                  {marks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => updatePassage((p) => ({ ...p, marks: { ...(p.marks ?? {}), [key]: [] } }))}
                      className="ml-1 text-[11px] font-semibold text-ink-400 hover:text-coral"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </>
            ) : track === "slides" ? (
              <span className="text-sm font-semibold text-ink-300 tabular-nums">
                Slide {slide} de {pages}
              </span>
            ) : null}
            <Btn size="sm" variant="ghost" onClick={next} title="Avançar (→)">
              <Icon name="seta" className="size-4" />
            </Btn>
          </div>
          {tool !== null && (
            <p className="mt-2 text-center text-xs text-lume">
              {tool === "apagar" ? "Selecione no palco o trecho para apagar o destaque." : "Selecione com o mouse o trecho do texto no palco para destacar."} <Kbd>Esc</Kbd> para sair.
            </p>
          )}
        </section>

        )}

        {/* lateral */}
        {word ? (
          <aside className="min-h-0 border-l border-edge/5 bg-ink-900">
            <WordSide
              word={word.w}
              refLabel={word.ref}
              on={wordOn}
              setOn={setWordOn}
              onPalavra={(p) => (setPalavra(p), setRolagem(0))}
              onRef={(r) => mostrarRef(r.split(",")[0].trim())}
              onClose={() => setWord(null)}
              onJump={(w) => setWord({ ...word, w })}
            />
          </aside>
        ) : (
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-edge/5 bg-ink-900/60 p-4">
          {painel === "roteiro" && (
            <div>
              <p className="mb-1.5 flex items-center justify-between text-[11px] font-bold tracking-[0.18em] text-ink-400 uppercase">
                No projetor agora
                <button type="button" onClick={() => setPainel("palco")} className="tracking-normal normal-case text-lume hover:underline">
                  ver grande
                </button>
              </p>
              <div className="aspect-video overflow-hidden rounded-lg ring-1 ring-edge/10">
                <Palco tela={tela} mini />
              </div>
              <div className="mt-2 flex justify-center gap-1">
                <Btn size="sm" variant="soft" onClick={prev} title="Voltar (←)">
                  <Icon name="voltar" className="size-4" />
                </Btn>
                <Btn size="sm" variant="soft" onClick={next} title="Avançar (→)">
                  <Icon name="seta" className="size-4" />
                </Btn>
              </div>
            </div>
          )}
          <p className="-mb-2 text-[11px] font-bold tracking-[0.18em] text-ink-400 uppercase">Mostrar outro texto</p>
          <BuscaBiblia
            versao={passage?.versions[0] ?? prefs.versao}
            inputRef={search}
            placeholder="Hb 11:1 ou parte do versículo  ( / )"
            onPick={mostrarRef}
          />
          <Upcoming lesson={lesson} doc={doc} track={track} slide={slide} pages={pages} pi={pi} split={split} cur={cur} total={total} capa={capa} loaded={loaded} />
          {notes && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold tracking-[0.18em] text-ink-400 uppercase">Comentário do slide</p>
              <p className="rounded-xl bg-ink-850 p-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-200 ring-1 ring-edge/5 ring-inset">{notes}</p>
            </div>
          )}
          <div className="mt-auto rounded-xl bg-ink-850 p-3 text-[11px] leading-6 text-ink-400 ring-1 ring-edge/5 ring-inset">
            <p className="mb-1 font-bold tracking-[0.18em] uppercase">Atalhos</p>
            <p><Kbd>→</Kbd> <Kbd>←</Kbd> avançar e voltar · <Kbd>T</Kbd> slides/textos</p>
            <p><Kbd>V</Kbd> versículo por vez · <Kbd>O</Kbd> original · <Kbd>1</Kbd>–<Kbd>3</Kbd> versão</p>
            <p><Kbd>B</Kbd> tela preta · <Kbd>C</Kbd> capa · <Kbd>P</Kbd> projetor · <Kbd>/</Kbd> buscar</p>
            <p><Kbd>R</Kbd> roteiro (só o senhor vê)</p>
            <p className="mt-1 leading-snug">No original, interlinear ou Strong, clique numa palavra para ver o que o léxico diz.</p>
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}

// ---------------- palco do apresentador ----------------

function Stage({
  tela, textRef, onWord, onRolar, onMouseUp, marking, loading, error,
}: { tela: Tela; textRef: React.Ref<HTMLDivElement>; onWord: OnWord; onRolar: (f: number) => void; onMouseUp: () => void; marking: boolean; loading: boolean; error: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const w = Math.min(W, (H * 16) / 9);
      setSize({ w, h: (w * 9) / 16 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="absolute inset-0 grid place-items-center">
      <div
        onMouseUp={onMouseUp}
        className={`relative overflow-hidden rounded-xl shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] ring-1 ring-edge/10 ${marking ? "cursor-text ring-lume/60" : ""}`}
        style={{ width: size.w, height: size.h }}
      >
        <Palco tela={tela} textRef={textRef} mini onWord={marking ? undefined : onWord} onRolar={onRolar} />
        {(loading || error) && (
          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 text-center text-xs text-ink-300">{error || "Carregando…"}</div>
        )}
      </div>
    </div>
  );
}

const thumbs = new Map<string, string>();
function SlideThumb({ doc, fileId, n }: { doc: PDFDocumentProxy; fileId: string; n: number }) {
  const k = `${fileId}:${n}`;
  const [src, setSrc] = useState(thumbs.get(k) ?? "");
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (src) return;
    let dead = false;
    // só desenha quando aparece na lista
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const c = await renderPage(doc, n, 448, 252);
      const url = c.toDataURL("image/jpeg", 0.8);
      thumbs.set(k, url);
      if (!dead) setSrc(url);
    });
    if (el.current) io.observe(el.current);
    return () => {
      dead = true;
      io.disconnect();
    };
  }, [k, src, doc, n]);
  return (
    <div ref={el} className="grid aspect-video w-full place-items-center bg-black">
      {src && <img src={src} alt={`Slide ${n}`} className="max-h-full max-w-full" draggable={false} />}
    </div>
  );
}

function Upcoming({
  lesson, doc, track, slide, pages, pi, split, cur, total, capa, loaded,
}: {
  lesson: BLesson; doc: PDFDocumentProxy | null; track: Track; slide: number; pages: number; pi: number;
  split: boolean; cur: number; total: number; capa: boolean; loaded: Loaded | null;
}) {
  let body: React.ReactNode = <p className="text-sm text-ink-500">Fim desta parte.</p>;
  if (capa) body = <p className="text-sm text-ink-300">Começar a aula ({track === "slides" ? "slide 1" : (lesson.passages[0]?.ref ?? "")})</p>;
  else if (track === "slides" && slide < pages && doc)
    body = (
      <div className="overflow-hidden rounded-lg ring-1 ring-edge/10">
        <SlideThumb key={slide + 1} doc={doc} fileId={lesson.deck!.fileId} n={slide + 1} />
      </div>
    );
  else if (track === "textos") {
    if (split && cur < total - 1 && loaded) {
      const v = loaded.verses[cur + 1];
      body = (
        <div>
          <p className="text-xs font-semibold text-lume">Versículo {v.n}</p>
          <p
            dir={!v.text && loaded.heb ? "rtl" : "ltr"}
            className={`mt-1 line-clamp-4 text-sm leading-relaxed text-ink-300 ${v.text ? "font-serif" : loaded.heb ? "font-hebrew text-base" : "font-greek text-base"}`}
          >
            {v.text ?? v.words?.map((w) => w[0]).join(" ")}
          </p>
        </div>
      );
    } else if (lesson.passages[pi + 1]) body = <p className="font-serif text-base font-semibold">{lesson.passages[pi + 1].ref}</p>;
  }
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold tracking-[0.18em] text-ink-400 uppercase">A seguir</p>
      {body}
    </div>
  );
}

function ProjectorButton() {
  const { projetor } = useCast();
  const monitor = useStore((s) => s.prefs.monitor);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Monitor[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) void native.listarMonitores().then(setList).catch(() => setList([]));
  }, [open]);
  const pick = async (i: number) => {
    setErr("");
    store.setPrefs({ monitor: i });
    try {
      await cast.openProjector(i);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível abrir.");
    }
  };
  return (
    <div className="relative">
      <Btn size="sm" variant={projetor ? "live" : "primary"} onClick={() => setOpen((o) => !o)} title="Projetor (P)">
        <Icon name="projetor" className="size-4" /> {projetor ? "Projetor ligado" : "Projetor"}
      </Btn>
      {open && (
        <div className="absolute top-11 right-0 z-30 w-72 rounded-2xl bg-ink-800 p-2 shadow-2xl ring-1 ring-edge/10">
          <p className="px-2 pt-1 pb-2 text-[11px] font-bold tracking-[0.18em] text-ink-400 uppercase">Abrir a projeção em</p>
          {list.map((m) => (
            <button
              key={m.indice}
              type="button"
              onClick={() => void pick(m.indice)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-edge/5 ${m.indice === monitor ? "bg-edge/[.04]" : ""}`}
            >
              <Icon name="tela" className="size-5 text-ink-300" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{m.nome}</span>
                <span className="text-xs text-ink-400">
                  {m.largura}×{m.altura}
                  {m.principal ? " · esta tela" : ""}
                </span>
              </span>
              {m.indice === monitor && <Icon name="check" className="size-4 text-lume" />}
            </button>
          ))}
          {list.length === 1 && <p className="px-3 py-2 text-xs text-ink-400">Só um monitor encontrado. Ligue o projetor (HDMI) e abra esta lista de novo.</p>}
          {projetor && (
            <button type="button" onClick={() => void cast.closeProjector().then(() => setOpen(false))} className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-coral hover:bg-coral/10">
              Fechar a janela do projetor
            </button>
          )}
          {err && <p className="px-3 py-2 text-xs text-coral">{err}</p>}
        </div>
      )}
    </div>
  );
}

/** painel da palavra: calcula o resumo que vai para o projetor */
function WordSide({
  word, refLabel, on, setOn, onPalavra, onClose, onJump, onRef,
}: {
  word: OrigWord; refLabel: string; on: boolean; setOn: (v: boolean) => void;
  onPalavra: (p: Palavra | null) => void; onClose: () => void; onJump: (w: OrigWord) => void; onRef: (r: string) => void;
}) {
  const info = useWordInfo(word);
  const resumo = JSON.stringify(on ? palavraDe(info, true) : null);
  useEffect(() => {
    onPalavra(JSON.parse(resumo));
  }, [resumo]);
  useEffect(() => () => onPalavra(null), []);
  return <WordPanel word={word} refLabel={refLabel} info={info} onClose={onClose} onJump={onJump} onProjetar={setOn} projetando={on} onRef={onRef} autoTraduzir />;
}
