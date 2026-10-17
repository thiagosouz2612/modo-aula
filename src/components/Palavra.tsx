// ------------------------------------------------------------------
// Estudo da palavra: o que o léxico diz da palavra grega ou hebraica.
// Painel do professor (Bíblia e apresentação) e o resumo que vai para
// o projetor.
// ------------------------------------------------------------------
import { useEffect, useState } from "react";
import {
  cleanTranslit, cleanWord, describeMorph, loadLex, plainDefinition, splitGloss, strongLabel, type LexEntry, type OrigWord,
} from "../lib/bible";
import { native } from "../lib/native";
import type { Palavra } from "../lib/scene";
import { Btn, Icon, Toggle } from "./ui";

/** classe gramatical do léxico em português ("G:N-M" → "subst. masc.") */
export function posLabel(p: string) {
  const [lang, rest = ""] = p.split(":");
  const k = rest.split("-")[0];
  const map: Record<string, string> = {
    N: "substantivo", V: "verbo", A: "adjetivo", ADV: "advérbio", PREP: "preposição", CONJ: "conjunção", PRT: "partícula", P: "pronome", T: "artigo",
    INJ: "interjeição", COND: "conjunção", Adv: "advérbio", Intj: "interjeição", Prep: "preposição", Conj: "conjunção", D: "pronome", R: "pronome",
    I: "pronome", X: "pronome", Q: "pronome",
  };
  const genders: Record<string, string> = { M: "masculino", F: "feminino", N: "neutro" };
  const g = rest.split("-").slice(1).filter((x) => genders[x]).map((x) => genders[x]);
  const name = lang === "N" ? "nome próprio" : (map[k] ?? rest);
  return [name, ...g, lang === "A" ? "(aramaico)" : ""].filter(Boolean).join(" ");
}

export function useWordInfo(word: OrigWord) {
  const [entry, setEntry] = useState<LexEntry | null | undefined>(undefined);
  const [pt, setPt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [raw, rawTr, strong, morph, gloss, parts] = word;
  const heb = strong.startsWith("H");
  const text = cleanWord(raw).replace(/[·,.;:!?·׃]+$/u, "");
  const translit = cleanTranslit(rawTr, heb).replace(/[-]+$/, "");
  const meaning = splitGloss(entry?.g || gloss || "");
  const here = splitGloss(gloss || "");

  useEffect(() => {
    let live = true;
    setEntry(undefined);
    setPt(null);
    setErr("");
    loadLex(strong).then((e) => live && setEntry(e ?? null), () => live && setEntry(null));
    // tradução já guardada neste computador
    void native.traducaoLexico(strong).then((t) => live && t && setPt(t));
    return () => {
      live = false;
    };
  }, [strong]);

  const def = entry ? plainDefinition(entry.d) : "";
  async function translate() {
    if (!def) return;
    setBusy(true);
    setErr("");
    try {
      setPt(await native.traduzirLexico(strong, def));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível traduzir.");
    } finally {
      setBusy(false);
    }
  }
  const lemma = entry?.l && entry.l !== text ? entry.l : text;
  return { entry, pt, busy, err, translate, strong, morph, gloss, parts, heb, text, translit, meaning, here, lemma, def };
}

/** resumo da palavra para o projetor */
export function palavraDe(info: ReturnType<typeof useWordInfo>, comDefinicao: boolean): Palavra {
  const { entry, heb, text, translit, lemma, meaning, here, gloss, morph, strong, pt } = info;
  return {
    heb,
    texto: text,
    translit,
    lema: lemma,
    lemaTranslit: entry?.t ? cleanTranslit(entry.t, heb) : translit,
    strong,
    sentido: meaning.main,
    ...(meaning.base ? { base: meaning.base } : {}),
    ...(gloss && entry?.g && gloss !== entry.g ? { aqui: here.main } : {}),
    ...(entry?.p ? { classe: posLabel(entry.p) } : {}),
    ...(morph ? { gramatica: describeMorph(morph, strong) } : {}),
    ...(entry?.n ? { vezes: entry.n } : {}),
    ...(comDefinicao && pt ? { definicao: pt } : {}),
  };
}

/** painel do professor */
export function WordPanel({
  word, refLabel, onClose, onJump, onProjetar, projetando, info: given,
}: {
  word: OrigWord;
  refLabel: string;
  onClose: () => void;
  onJump: (w: OrigWord) => void;
  /** apresentação: mostrar a palavra no projetor */
  onProjetar?: (v: boolean) => void;
  projetando?: boolean;
  info?: ReturnType<typeof useWordInfo>;
}) {
  const own = useWordInfo(word);
  const info = given ?? own;
  const { entry, pt, busy, err, translate, strong, morph, gloss, parts, heb, text, translit, meaning, here, lemma } = info;
  const [ingles, setIngles] = useState(false);
  useEffect(() => setIngles(false), [strong]);
  const origFont = heb ? "font-hebrew" : "font-greek";

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-edge/8 px-5 py-3.5">
        <p className="text-[11px] font-bold tracking-[0.18em] text-lume uppercase">
          {heb ? "Hebraico" : "Grego"} · {refLabel}
        </p>
        <button type="button" onClick={onClose} title="Fechar (Esc)" aria-label="Fechar" className="grid size-8 place-items-center rounded-full text-ink-400 hover:bg-edge/5 hover:text-ink-100">
          <Icon name="x" className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-10" data-select>
        {onProjetar && <Toggle on={Boolean(projetando)} onChange={onProjetar} label={<span className="text-xs font-semibold">Mostrar no projetor</span>} />}

        {(parts ?? []).length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-ink-400">Partes da palavra:</span>
            {(parts ?? []).map(([seg, s, g], i) => (
              <button
                key={i}
                type="button"
                onClick={() => s !== strong && onJump([seg, "", s, "", g])}
                title={g}
                className={`rounded-full px-2.5 py-1 font-bold ${s === strong ? "bg-ink-100 text-ink-950" : "bg-ink-800 text-ink-200 hover:text-lume"}`}
              >
                {strongLabel(s).toLowerCase()}
              </button>
            ))}
          </div>
        )}

        <p dir={heb ? "rtl" : "ltr"} className={`mt-4 text-left text-5xl leading-tight ${origFont}`}>
          {lemma}
        </p>
        <p className="mt-1.5 text-lg text-ink-400 italic">{entry?.t ? cleanTranslit(entry.t, heb) : translit}</p>

        <p className="mt-4 font-serif text-[28px] leading-tight font-semibold text-lume">{entry === undefined && !gloss ? "…" : meaning.main || "—"}</p>
        {meaning.base && <p className="mt-1 text-sm text-ink-400">palavra-base: {meaning.base}</p>}
        {gloss && entry?.g && gloss !== entry.g && (
          <p className="mt-1 text-sm text-ink-400">
            neste versículo: <b className="text-ink-100">{here.main}</b>
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-ink-800 px-2.5 py-1">Strong {strongLabel(strong)}</span>
          {entry?.p && <span className="rounded-full bg-ink-800 px-2.5 py-1">{posLabel(entry.p)}</span>}
          {entry && entry.n > 0 && (
            <span className="rounded-full bg-ink-800 px-2.5 py-1">
              {entry.n.toLocaleString("pt-BR")} {entry.n === 1 ? "vez" : "vezes"} na Bíblia
            </span>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-edge/8 pt-4 text-sm">
          {lemma !== text && (
            <>
              <dt className="text-ink-400">No texto</dt>
              <dd>
                <span className={`text-lg ${origFont}`}>{text}</span> {translit && <span className="text-ink-400 italic">({translit})</span>}
              </dd>
            </>
          )}
          {morph && (
            <>
              <dt className="text-ink-400">Gramática</dt>
              <dd>{describeMorph(morph, strong)}</dd>
            </>
          )}
          {entry?.e && (
            <>
              <dt className="text-ink-400">Em inglês</dt>
              <dd>{entry.e}</dd>
            </>
          )}
        </dl>

        {entry?.d && (
          <div className="mt-5 border-t border-edge/8 pt-4">
            <p className="text-[11px] font-bold tracking-[0.18em] text-ink-400 uppercase">
              O que diz o léxico · {heb ? "BDB (hebraico)" : "Abbott-Smith (grego)"}
            </p>
            {pt ? (
              <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink-100">{pt}</p>
            ) : (
              <div className="mt-2">
                <Btn size="sm" variant="primary" onClick={() => void translate()} disabled={busy}>
                  {busy ? "Traduzindo…" : "Traduzir para o português"}
                </Btn>
                <p className="mt-1.5 text-xs text-ink-400">Precisa de internet só na primeira vez; depois a tradução fica guardada.</p>
              </div>
            )}
            {err && <p className="mt-2 text-xs text-coral">{err}</p>}
            <button type="button" onClick={() => setIngles((v) => !v)} className="mt-3 text-xs font-semibold text-ink-300 underline-offset-4 hover:text-lume hover:underline">
              {ingles ? "Ocultar o original em inglês" : "Ver o léxico original (inglês)"}
            </button>
            {ingles && (
              <div
                className="mt-2 rounded-xl bg-ink-800 p-3 text-[13px] leading-relaxed text-ink-200 [&_b]:font-semibold [&_b]:text-ink-100 [&_i]:italic"
                lang="en"
                dangerouslySetInnerHTML={{ __html: entry.d }}
              />
            )}
          </div>
        )}
        {entry === null && <p className="mt-5 text-sm text-ink-400">Esta palavra não está no léxico.</p>}
      </div>
    </aside>
  );
}
