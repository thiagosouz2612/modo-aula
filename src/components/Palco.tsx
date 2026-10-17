// ------------------------------------------------------------------
// Palco: desenha uma "tela" do Modo Aula. É o mesmo componente no
// projetor, nas telas da rede e na prévia do apresentador, então o que
// o professor vê é exatamente o que a turma vê.
// ------------------------------------------------------------------
import { useLayoutEffect, useRef, type ReactNode, type Ref } from "react";
import { segments } from "../lib/marks";
import type { Scene, SVerse, Tela, Word } from "../lib/scene";
import type { BMark } from "../lib/types";
import { Logo } from "./ui";

/** onde estão as imagens dos slides (servidor local do aplicativo) */
let imgBase = "";
const imgOverride = new Map<string, string>();
export const setImgBase = (b: string) => void (imgBase = b);
export const setImgUrl = (id: string, url: string) => void imgOverride.set(id, url);
export const imgUrl = (id: string) => (id.startsWith("blob:") ? id : (imgOverride.get(id) ?? `${imgBase}/img/${id}`));

export function Palco({ tela, textRef, mini = false }: { tela: Tela; textRef?: Ref<HTMLDivElement>; mini?: boolean }) {
  const { s, tema } = tela;
  const dark = tema === "noite" || s.k === "preto" || s.k === "slide";
  return (
    <div
      className={`tema-${tema} relative h-full w-full overflow-hidden ${dark ? "text-paper" : "text-[#1d1a16]"}`}
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
      {s.k === "texto" && <TextoScene s={s} escala={tela.escala} textRef={textRef} mini={mini} tema={tema} />}
    </div>
  );
}

function LogoScene({ titulo, tema }: { titulo?: string; tema: Tela["tema"] }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-[2.2cqh] text-center">
        <Logo style={{ width: "11cqh", height: "11cqh" }} />
        {titulo ? (
          <p className="max-w-[80cqw] font-serif text-[6cqh] leading-tight font-medium text-balance">{titulo}</p>
        ) : (
          <p className={`text-[2.4cqh] font-medium tracking-[0.4em] uppercase ${tema === "noite" ? "text-ink-400" : "text-[#8c8172]"}`}>Modo Aula</p>
        )}
      </div>
    </div>
  );
}

type TextoS = Extract<Scene, { k: "texto" }>;

function TextoScene({ s, escala, textRef, mini, tema }: { s: TextoS; escala: number; textRef?: Ref<HTMLDivElement>; mini: boolean; tema: Tela["tema"] }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([s.ref, s.versao, s.vista, s.verses.map((v) => v.n), s.marks.length, escala]);

  // maior letra que cabe na tela (busca binária), limitada pela escala escolhida
  useLayoutEffect(() => {
    const el = box.current;
    const tx = inner.current;
    if (!el || !tx) return;
    const fit = () => {
      const H = el.clientHeight;
      const W = el.clientWidth;
      if (!H || !W) return;
      const max = Math.min(H * 0.11, W * 0.065) * escala;
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

  const orig = s.vista !== "traducao";
  const hebFont = s.heb && orig;
  const accent = tema === "noite" ? "text-lume" : "text-[#9a6a12]";
  const muted = tema === "noite" ? "text-ink-400" : "text-[#7c7264]";

  return (
    <>
      <div className="absolute top-[4.2cqh] right-[4.5cqw] left-[4.5cqw] flex items-baseline justify-end gap-[1.2cqw] text-right">
        <span className={`h-px w-[6cqw] self-center ${tema === "noite" ? "bg-lume/60" : "bg-[#9a6a12]/50"}`} />
        <span className="font-sans text-[2.9cqh] font-semibold tracking-wide">{s.ref}</span>
        <span className={`font-sans text-[2.1cqh] font-medium tracking-[0.18em] uppercase ${muted}`}>
          {s.vista === "traducao" ? s.versao : s.heb ? "Hebraico" : "Grego"}
          {s.parte && s.parte[1] > 1 ? ` · ${s.parte[0]} de ${s.parte[1]}` : ""}
        </span>
      </div>
      <div ref={box} className="absolute inset-x-[7cqw] top-[12cqh] bottom-[8cqh] flex items-center justify-center">
        <div
          ref={(el) => {
            (inner as { current: HTMLDivElement | null }).current = el;
            if (typeof textRef === "function") textRef(el);
            else if (textRef) (textRef as { current: HTMLDivElement | null }).current = el;
          }}
          key={key}
          dir={hebFont ? "rtl" : "ltr"}
          className={`palco-texto max-h-full w-full ${mini ? "" : "entra"} ${hebFont ? "font-hebrew leading-[1.55]" : orig ? "font-greek leading-[1.45]" : "font-serif leading-[1.42]"} ${
            s.verses.length === 1 && s.vista !== "interlinear" ? "text-center text-balance" : ""
          }`}
        >
          {s.vista === "interlinear" ? (
            <Interlinear verses={s.verses} marks={s.marks} accent={accent} muted={muted} />
          ) : (
            s.verses.map((v, i) => (
              <Verse key={v.n} v={v} marks={s.marks} accent={accent} first={i === 0} single={s.verses.length === 1} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

const verseText = (v: SVerse) => v.text ?? (v.words ?? []).map((w) => w[0]).join(" ");

function Marked({ text, marks }: { text: string; marks: BMark[] }): ReactNode {
  return segments(text, marks).map((p, i) =>
    p.c === undefined ? (
      <span key={i}>{p.t}</span>
    ) : (
      <span key={i} className={`marca marca-${p.c}`}>
        {p.t}
      </span>
    ),
  );
}

function Verse({ v, marks, accent, first, single }: { v: SVerse; marks: BMark[]; accent: string; first: boolean; single: boolean }) {
  const mine = marks.filter((m) => m[0] === v.n);
  return (
    <span data-mv={v.n}>
      {!first && " "}
      {!single && (
        <sup data-nomark className={`mr-[0.25em] font-sans text-[0.5em] font-bold ${accent}`}>
          {v.n}
        </sup>
      )}
      <Marked text={verseText(v)} marks={mine} />
    </span>
  );
}

function Interlinear({ verses, marks, accent, muted }: { verses: SVerse[]; marks: BMark[]; accent: string; muted: string }) {
  return (
    <div className="flex flex-wrap items-start gap-y-[0.5em]" style={{ columnGap: "0.6em" }}>
      {verses.map((v) => {
        const mine = marks.filter((m) => m[0] === v.n);
        let pos = 0;
        return (
          <span key={v.n} data-mv={v.n} className="contents">
            {verses.length > 1 && (
              <sup data-nomark className={`self-start pt-[0.3em] font-sans text-[0.42em] font-bold ${accent}`}>
                {v.n}
              </sup>
            )}
            {(v.words ?? []).map((w: Word, i) => {
              const s = pos;
              pos += w[0].length + 1;
              const c = mine.find((m) => m[1] < s + w[0].length && m[2] > s)?.[3];
              return (
                <span key={i} className="inline-flex flex-col items-center text-center">
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
