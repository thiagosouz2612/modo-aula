// ------------------------------------------------------------------
// Palco: desenha uma "tela" do Modo Aula. É o mesmo componente no
// projetor, nas telas da rede e na prévia do apresentador, então o que
// o professor vê é exatamente o que a turma vê.
// ------------------------------------------------------------------
import { useLayoutEffect, useRef, type Ref } from "react";
import { isTrad, type Palavra, type Scene, type SVerse, type Tela } from "../lib/scene";
import type { BMark } from "../lib/types";
import { LogoCompleto } from "./ui";
import { Definicao } from "./Definicao";

/** onde estão as imagens dos slides (servidor local do aplicativo) */
let imgBase = "";
const imgOverride = new Map<string, string>();
export const setImgBase = (b: string) => void (imgBase = b);
export const setImgUrl = (id: string, url: string) => void imgOverride.set(id, url);
export const imgUrl = (id: string) => (id.startsWith("blob:") ? id : (imgOverride.get(id) ?? `${imgBase}/img/${id}`));

/** clique numa palavra ligada ao original (versículo e índice da palavra) */
export type OnWord = (n: number, i: number) => void;

export function Palco({
  tela, textRef, mini = false, onWord, onRolar,
}: { tela: Tela; textRef?: Ref<HTMLDivElement>; mini?: boolean; onWord?: OnWord; onRolar?: (f: number) => void }) {
  const { s, tema } = tela;
  const dark = tema === "noite" || s.k === "preto" || s.k === "slide";
  return (
    <div
      className={`tema-${tema} ${tema === "noite" ? "escuro" : "claro"} relative h-full w-full overflow-hidden ${dark ? "text-paper" : "text-[#1d1a16]"}`}
      style={{
        containerType: "size",
        background:
          s.k === "preto" || s.k === "slide"
            ? "#000"
            : tema === "noite"
              ? "radial-gradient(120% 90% at 50% 0%, #161a21 0%, #07080a 65%)"
              : "radial-gradient(120% 90% at 50% 0%, #fbf8f2 0%, #efe8db 70%)",
      }}
    >
      {s.k === "logo" && <LogoScene titulo={s.titulo} tema={tema} />}
      {s.k === "slide" && <img src={imgUrl(s.img)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />}
      {s.k === "texto" && <TextoScene s={s} escala={tela.escala} textRef={textRef} mini={mini} tema={tema} onWord={onWord} onRolar={onRolar} />}
    </div>
  );
}

function LogoScene({ titulo, tema }: { titulo?: string; tema: Tela["tema"] }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-[4cqh] text-center">
        <LogoCompleto tom={tema === "noite" ? "branco" : "cor"} style={{ height: titulo ? "13cqh" : "17cqh", width: "auto" }} />
        {titulo && (
          <>
            <span className="h-[0.4cqh] w-[8cqw] rounded-full bg-marca" />
            <p className="max-w-[80cqw] font-serif text-[6cqh] leading-tight font-medium text-balance">{titulo}</p>
          </>
        )}
      </div>
    </div>
  );
}

type TextoS = Extract<Scene, { k: "texto" }>;

function TextoScene({
  s, escala, textRef, mini, tema, onWord, onRolar,
}: { s: TextoS; escala: number; textRef?: Ref<HTMLDivElement>; mini: boolean; tema: Tela["tema"]; onWord?: OnWord; onRolar?: (f: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const side = Boolean(s.palavra);
  const key = JSON.stringify([s.ref, s.versao, s.vista, s.verses.map((v) => v.n), s.marks.length, escala, side, s.colunas?.map((c) => c.versao)]);

  // maior letra que cabe na tela (busca binária), limitada pela escala escolhida
  useLayoutEffect(() => {
    const el = box.current;
    const tx = inner.current;
    if (!el || !tx) return;
    const fit = () => {
      const H = el.clientHeight;
      const W = el.clientWidth;
      if (!H || !W) return;
      const max = Math.min(H * 0.11, W * (side ? 0.09 : 0.065)) * escala;
      let lo = Math.max(6, H * 0.02);
      let hi = max;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        tx.style.fontSize = `${mid}px`;
        if (tx.scrollHeight <= H && tx.scrollWidth <= W + 1) lo = mid;
        else hi = mid;
      }
      tx.style.fontSize = `${lo}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [key]);

  const orig = !isTrad(s.vista);
  const hebFont = s.heb && orig;
  const accent = "text-lume";
  const muted = tema === "noite" ? "text-ink-400" : "text-[#7c7264]";
  const label = s.colunas ? s.colunas.map((c) => c.versao).join(" · ") : s.vista === "traducao" ? s.versao : s.vista === "strong" ? `${s.versao} · Strong` : s.heb ? "Hebraico" : "Grego";

  // clique numa palavra (só no apresentador)
  const click = (e: React.MouseEvent) => {
    if (!onWord) return;
    if (window.getSelection()?.toString()) return; // estava selecionando para o marca-texto
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-w]");
    if (!el) return;
    const [n, i] = el.dataset.w!.split(":").map(Number);
    onWord(n, i);
  };

  return (
    <>
      <div className={`absolute top-[4.2cqh] left-[4.5cqw] flex items-baseline justify-end gap-[1.2cqw] text-right ${side ? "right-[43cqw]" : "right-[4.5cqw]"}`}>
        <span className="h-px w-[6cqw] self-center bg-lume/60" />
        <span className="font-sans text-[2.9cqh] font-semibold tracking-wide">{s.ref}</span>
        <span className={`font-sans text-[2.1cqh] font-medium tracking-[0.18em] uppercase ${muted}`}>
          {label}
          {s.parte && s.parte[1] > 1 ? ` · ${s.parte[0]} de ${s.parte[1]}` : ""}
        </span>
      </div>
      <div ref={box} className={`absolute top-[12cqh] bottom-[8cqh] left-[6cqw] flex items-center justify-center ${side ? "right-[44cqw]" : "right-[6cqw]"}`}>
        <div
          ref={(el) => {
            (inner as { current: HTMLDivElement | null }).current = el;
            if (typeof textRef === "function") textRef(el);
            else if (textRef) (textRef as { current: HTMLDivElement | null }).current = el;
          }}
          key={key}
          dir={hebFont ? "rtl" : "ltr"}
          onClick={click}
          className={`palco-texto max-h-full w-full ${mini ? "" : "entra"} ${hebFont ? "font-hebrew leading-[1.55]" : orig ? "font-greek leading-[1.45]" : "font-serif leading-[1.42]"} ${
            s.verses.length === 1 && s.vista !== "interlinear" && !s.colunas ? "text-center text-balance" : ""
          } ${onWord ? "palco-clicavel" : ""}`}
        >
          {s.colunas ? (
            <div className="grid text-left" style={{ gridTemplateColumns: `repeat(${s.colunas.length}, minmax(0, 1fr))`, columnGap: "1.4em" }}>
              {s.colunas.map((c) => (
                <div key={c.versao}>
                  <p className={`mb-[0.4em] font-sans text-[0.42em] font-bold tracking-[0.2em] uppercase ${accent}`}>{c.versao}</p>
                  {c.verses.map((v, i) => (
                    <Verse key={v.n} v={v} s={{ ...s, marks: [], vista: "traducao" }} accent={accent} first={i === 0} single={c.verses.length === 1} />
                  ))}
                </div>
              ))}
            </div>
          ) : s.vista === "interlinear" ? (
            <Interlinear s={s} accent={accent} muted={muted} />
          ) : (
            s.verses.map((v, i) => <Verse key={v.n} v={v} s={s} accent={accent} first={i === 0} single={s.verses.length === 1} />)
          )}
        </div>
      </div>
      {s.palavra && <PalavraLado p={s.palavra} tema={tema} onRolar={onRolar} />}
    </>
  );
}

const verseText = (v: SVerse) => v.text ?? (v.words ?? []).map((w) => w[0]).join(" ");

/** pedaços do texto com destaque (marca-texto) e ligação ao original (Strong) */
function pieces(text: string, marks: BMark[], tags: SVerse["tags"]) {
  const cuts = new Set([0, text.length]);
  for (const m of marks) (cuts.add(Math.max(0, m[1])), cuts.add(Math.min(text.length, m[2])));
  for (const t of tags ?? []) (cuts.add(t[0]), cuts.add(t[1]));
  const pts = [...cuts].filter((x) => x >= 0 && x <= text.length).sort((a, b) => a - b);
  const out: { t: string; c?: number; w?: number }[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    if (b <= a) continue;
    const c = marks.find((m) => m[1] <= a && m[2] >= b)?.[3];
    const w = tags?.find((t) => t[0] <= a && t[1] >= b)?.[2];
    out.push({ t: text.slice(a, b), c, w });
  }
  return out;
}

function Verse({ v, s, accent, first, single }: { v: SVerse; s: TextoS; accent: string; first: boolean; single: boolean }) {
  const mine = s.marks.filter((m) => m[0] === v.n);
  const num = !single && (
    <sup data-nomark className={`mr-[0.25em] font-sans text-[0.5em] font-bold ${accent}`}>
      {v.n}
    </sup>
  );
  // original: cada palavra é clicável
  if (v.words) {
    let pos = 0;
    return (
      <span data-mv={v.n}>
        {!first && " "}
        {num}
        {v.words.map((w, i) => {
          if (!w[0]) return null;
          const st = pos;
          pos += w[0].length + 1;
          const c = mine.find((m) => m[1] < st + w[0].length && m[2] > st)?.[3];
          const sel = s.sel === `${v.n}:${i}`;
          return (
            <span key={i}>
              {i > 0 && " "}
              <span data-w={`${v.n}:${i}`} className={`palavra ${c !== undefined ? `marca marca-${c}` : ""} ${sel ? "palavra-sel" : ""}`}>
                {w[0]}
              </span>
            </span>
          );
        })}
      </span>
    );
  }
  return (
    <span data-mv={v.n}>
      {!first && " "}
      {num}
      {pieces(verseText(v), mine, s.vista === "strong" ? v.tags : undefined).map((p, i) => {
        const cls = [p.c !== undefined ? `marca marca-${p.c}` : "", p.w !== undefined ? "palavra ligada" : "", p.w !== undefined && s.sel === `${v.n}:${p.w}` ? "palavra-sel" : ""]
          .filter(Boolean)
          .join(" ");
        return p.w !== undefined ? (
          <span key={i} data-w={`${v.n}:${p.w}`} className={cls}>
            {p.t}
          </span>
        ) : (
          <span key={i} className={cls || undefined}>
            {p.t}
          </span>
        );
      })}
    </span>
  );
}

function Interlinear({ s, accent, muted }: { s: TextoS; accent: string; muted: string }) {
  return (
    <div className="flex flex-wrap items-start gap-y-[0.5em]" style={{ columnGap: "0.6em" }}>
      {s.verses.map((v) => {
        const mine = s.marks.filter((m) => m[0] === v.n);
        let pos = 0;
        return (
          <span key={v.n} data-mv={v.n} className="contents">
            {s.verses.length > 1 && (
              <sup data-nomark className={`self-start pt-[0.3em] font-sans text-[0.42em] font-bold ${accent}`}>
                {v.n}
              </sup>
            )}
            {(v.words ?? []).map((w, i) => {
              if (!w[0]) return null;
              const st = pos;
              pos += w[0].length + 1;
              const c = mine.find((m) => m[1] < st + w[0].length && m[2] > st)?.[3];
              const sel = s.sel === `${v.n}:${i}`;
              return (
                <span key={i} data-w={`${v.n}:${i}`} className={`palavra inline-flex flex-col items-center rounded-[0.2em] px-[0.1em] text-center ${sel ? "palavra-sel" : ""}`}>
                  {i > 0 && <span className="sr-only"> </span>}
                  <span className={c !== undefined ? `marca marca-${c}` : ""}>{w[0]}</span>
                  <span data-nomark dir="ltr" className={`font-sans text-[0.36em] italic ${muted}`}>
                    {w[1]}
                  </span>
                  <span data-nomark dir="ltr" className={`max-w-[9em] font-sans text-[0.4em] leading-tight font-medium ${accent}`}>
                    {w[2]}
                  </span>
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

/** a palavra estudada, ao lado do texto (o que a turma vê) */
function PalavraLado({ p, tema, onRolar }: { p: Palavra; tema: Tela["tema"]; onRolar?: (f: number) => void }) {
  const muted = tema === "noite" ? "text-ink-400" : "text-[#7c7264]";
  const lemaDiferente = p.lema && p.lema !== p.texto;
  const box = useRef<HTMLDivElement>(null);
  const meu = useRef(false);
  // a turma acompanha a rolagem que o professor faz no painel
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || meu.current) return void (meu.current = false);
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.round((p.rolagem ?? 0) * Math.max(0, max));
  }, [p.rolagem, p.strong]);
  let quadro = 0;
  return (
    <aside
      ref={box}
      onScroll={(e) => {
        if (!onRolar) return;
        const el = e.currentTarget;
        cancelAnimationFrame(quadro);
        quadro = requestAnimationFrame(() => {
          const max = el.scrollHeight - el.clientHeight;
          meu.current = true;
          onRolar(max > 0 ? Math.round((el.scrollTop / max) * 1000) / 1000 : 0);
        });
      }}
      className={`entra absolute top-0 right-0 bottom-0 w-[40cqw] overflow-y-auto px-[3cqw] py-[5cqh] ${onRolar ? "" : "sem-barra"} ${
        tema === "noite" ? "bg-[#14161b]/95 shadow-[-2cqw_0_6cqw_rgba(0,0,0,.45)]" : "bg-white/90 shadow-[-2cqw_0_6cqw_rgba(0,0,0,.08)]"
      }`}
    >
      <p className="font-sans text-[1.9cqh] font-bold tracking-[0.2em] text-lume uppercase">
        {p.heb ? "Hebraico" : "Grego"} · Strong {p.strong.replace(/^([GH])0*(\d+).*$/, "$1$2")}
      </p>
      <div className="mt-[2cqh] flex flex-wrap items-baseline gap-x-[1.5cqw]">
        <p lang={p.heb ? "he" : "grc"} dir={p.heb ? "rtl" : "ltr"} className={`text-[7.5cqh] leading-[1.15] ${p.heb ? "font-hebrew" : "font-greek"}`}>
          {p.lema || p.texto}
        </p>
        <p className={`font-sans text-[2.6cqh] italic ${muted}`}>{p.lemaTranslit || p.translit}</p>
      </div>
      <p className="mt-[1.5cqh] font-serif text-[4.6cqh] leading-tight font-semibold text-lume">{p.sentido || "—"}</p>
      {(p.base || p.aqui) && (
        <p className={`mt-[0.8cqh] font-sans text-[2.2cqh] ${muted}`}>
          {p.base && <>palavra-base: {p.base}</>}
          {p.base && p.aqui && " · "}
          {p.aqui && (
            <>
              neste versículo: <b className="font-semibold">{p.aqui}</b>
            </>
          )}
        </p>
      )}
      <div className={`mt-[2.5cqh] grid grid-cols-[auto_1fr] gap-x-[1.2cqw] gap-y-[0.8cqh] border-t pt-[2cqh] font-sans text-[2.1cqh] ${tema === "noite" ? "border-white/10" : "border-black/10"}`}>
        {lemaDiferente && (
          <>
            <span className={muted}>No texto</span>
            <span>
              <span className={p.heb ? "font-hebrew" : "font-greek"}>{p.texto}</span> <i className={muted}>({p.translit})</i>
            </span>
          </>
        )}
        {p.classe && (
          <>
            <span className={muted}>Classe</span>
            <span>{p.classe}</span>
          </>
        )}
        {p.gramatica && (
          <>
            <span className={muted}>Gramática</span>
            <span>{p.gramatica}</span>
          </>
        )}
        {p.vezes ? (
          <>
            <span className={muted}>Aparece</span>
            <span>{p.vezes.toLocaleString("pt-BR")} vezes na Bíblia</span>
          </>
        ) : null}
      </div>
      {p.linhas && p.linhas.length > 0 && (
        <div className={`mt-[2.5cqh] border-t pt-[2cqh] font-sans text-[2.1cqh] ${tema === "noite" ? "border-white/10 text-ink-200" : "border-black/10 text-[#3a342d]"}`}>
          <p className={`mb-[1.2cqh] text-[1.7cqh] font-bold tracking-[0.18em] uppercase ${muted}`}>O que diz o léxico{p.lingua === "en" ? " (inglês)" : ""}</p>
          <Definicao linhas={p.linhas} grande tema={tema} />
        </div>
      )}
    </aside>
  );
}
