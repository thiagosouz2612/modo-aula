// ------------------------------------------------------------------
// Palco: desenha uma "tela" do Modo Aula. É o mesmo componente no
// projetor, nas telas da rede e na prévia do apresentador, então o que
// o professor vê é exatamente o que a turma vê.
// ------------------------------------------------------------------
import { useLayoutEffect, useRef, type Ref } from "react";
import { isTrad, type Palavra, type Scene, type SVerse, type Tela } from "../lib/scene";
import type { BMark } from "../lib/types";
import { LogoCompleto } from "./ui";

/** onde estão as imagens dos slides (servidor local do aplicativo) */
let imgBase = "";
const imgOverride = new Map<string, string>();
export const setImgBase = (b: string) => void (imgBase = b);
export const setImgUrl = (id: string, url: string) => void imgOverride.set(id, url);
export const imgUrl = (id: string) => (id.startsWith("blob:") ? id : (imgOverride.get(id) ?? `${imgBase}/img/${id}`));

/** clique numa palavra ligada ao original (versículo e índice da palavra) */
export type OnWord = (n: number, i: number) => void;

export function Palco({ tela, textRef, mini = false, onWord }: { tela: Tela; textRef?: Ref<HTMLDivElement>; mini?: boolean; onWord?: OnWord }) {
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
      {s.k === "texto" && <TextoScene s={s} escala={tela.escala} textRef={textRef} mini={mini} tema={tema} onWord={onWord} />}
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
  s, escala, textRef, mini, tema, onWord,
}: { s: TextoS; escala: number; textRef?: Ref<HTMLDivElement>; mini: boolean; tema: Tela["tema"]; onWord?: OnWord }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const side = Boolean(s.palavra);
  const key = JSON.stringify([s.ref, s.versao, s.vista, s.verses.map((v) => v.n), s.marks.length, escala, side]);

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
  const label = s.vista === "traducao" ? s.versao : s.vista === "strong" ? `${s.versao} · Strong` : s.heb ? "Hebraico" : "Grego";

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
      <div className={`absolute top-[4.2cqh] left-[4.5cqw] flex items-baseline justify-end gap-[1.2cqw] text-right ${side ? "right-[40cqw]" : "right-[4.5cqw]"}`}>
        <span className="h-px w-[6cqw] self-center bg-lume/60" />
        <span className="font-sans text-[2.9cqh] font-semibold tracking-wide">{s.ref}</span>
        <span className={`font-sans text-[2.1cqh] font-medium tracking-[0.18em] uppercase ${muted}`}>
          {label}
          {s.parte && s.parte[1] > 1 ? ` · ${s.parte[0]} de ${s.parte[1]}` : ""}
        </span>
      </div>
      <div ref={box} className={`absolute top-[12cqh] bottom-[8cqh] left-[6cqw] flex items-center justify-center ${side ? "right-[41cqw]" : "right-[6cqw]"}`}>
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
            s.verses.length === 1 && s.vista !== "interlinear" ? "text-center text-balance" : ""
          } ${onWord ? "palco-clicavel" : ""}`}
        >
          {s.vista === "interlinear" ? (
            <Interlinear s={s} accent={accent} muted={muted} />
          ) : (
            s.verses.map((v, i) => <Verse key={v.n} v={v} s={s} accent={accent} first={i === 0} single={s.verses.length === 1} />)
          )}
        </div>
      </div>
      {s.palavra && <PalavraLado p={s.palavra} tema={tema} />}
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
function PalavraLado({ p, tema }: { p: Palavra; tema: Tela["tema"] }) {
  const muted = tema === "noite" ? "text-ink-400" : "text-[#7c7264]";
  const lemaDiferente = p.lema && p.lema !== p.texto;
  return (
    <aside
      className={`entra absolute top-0 right-0 bottom-0 flex w-[37cqw] flex-col overflow-hidden px-[3cqw] py-[5cqh] ${
        tema === "noite" ? "bg-[#14161b]/95 shadow-[-2cqw_0_6cqw_rgba(0,0,0,.45)]" : "bg-white/90 shadow-[-2cqw_0_6cqw_rgba(0,0,0,.08)]"
      }`}
    >
      <p className="font-sans text-[1.9cqh] font-bold tracking-[0.2em] text-lume uppercase">
        {p.heb ? "Hebraico" : "Grego"} · Strong {p.strong.replace(/^([GH])0*(\d+).*$/, "$1$2")}
      </p>
      <p lang={p.heb ? "he" : "grc"} dir={p.heb ? "rtl" : "ltr"} className={`mt-[2.5cqh] text-left text-[8.5cqh] leading-[1.1] ${p.heb ? "font-hebrew" : "font-greek"}`}>
        {p.lema || p.texto}
      </p>
      <p className={`mt-[1cqh] font-sans text-[2.8cqh] italic ${muted}`}>{p.lemaTranslit || p.translit}</p>
      <p className="mt-[3cqh] font-serif text-[5cqh] leading-tight font-semibold text-lume">{p.sentido || "—"}</p>
      {p.base && <p className={`mt-[0.8cqh] font-sans text-[2.3cqh] ${muted}`}>palavra-base: {p.base}</p>}
      {p.aqui && <p className={`mt-[0.8cqh] font-sans text-[2.3cqh] ${muted}`}>neste versículo: <b className="font-semibold">{p.aqui}</b></p>}
      <div className={`mt-[3cqh] space-y-[1cqh] border-t pt-[2.5cqh] font-sans text-[2.3cqh] ${tema === "noite" ? "border-white/10" : "border-black/10"}`}>
        {lemaDiferente && (
          <p>
            <span className={muted}>No texto: </span>
            <span className={p.heb ? "font-hebrew" : "font-greek"}>{p.texto}</span> <i className={muted}>({p.translit})</i>
          </p>
        )}
        {p.classe && (
          <p>
            <span className={muted}>Classe: </span>
            {p.classe}
          </p>
        )}
        {p.gramatica && (
          <p>
            <span className={muted}>Gramática: </span>
            {p.gramatica}
          </p>
        )}
        {p.vezes ? (
          <p>
            <span className={muted}>Aparece </span>
            {p.vezes.toLocaleString("pt-BR")} vezes na Bíblia
          </p>
        ) : null}
      </div>
      {p.definicao && (
        <p className={`mt-[2.5cqh] line-clamp-[12] font-sans text-[2.1cqh] leading-snug ${tema === "noite" ? "text-ink-200" : "text-[#3a342d]"}`}>{p.definicao}</p>
      )}
    </aside>
  );
}
