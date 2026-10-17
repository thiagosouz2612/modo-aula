// ------------------------------------------------------------------
// O que aparece no projetor. O apresentador monta a "tela" e manda
// pronta (texto já carregado, slide já desenhado em imagem): as telas
// da projeção só desenham, sem precisar da Bíblia nem do PDF.
// ------------------------------------------------------------------
import {
  cleanTranslit, cleanWord, isHebrew, loadBook, loadCatalog, loadOriginal, parseRef, refLabel, splitGloss, tagVerse,
  type Catalog, type OrigWord, type Ref,
} from "./bible";
import type { BMark, BPassage } from "./types";

/** palavra do original: [texto, transliteração, sentido, Strong] */
export type Word = [text: string, translit: string, gloss: string, strong: string];
/** palavra da tradução ligada ao original: [início, fim, índice da palavra original] */
export type Tag = [number, number, number];
export type SVerse = { n: number; text?: string; words?: Word[]; tags?: Tag[] };
/** traducao · strong (tradução com as palavras ligadas ao original) · original · interlinear */
export type Vista = "traducao" | "strong" | "original" | "interlinear";

/** a palavra estudada, mostrada ao lado do texto no projetor */
export type Palavra = {
  heb: boolean;
  texto: string; // como está no versículo
  translit: string;
  lema: string; // forma do dicionário
  lemaTranslit: string;
  strong: string;
  sentido: string;
  base?: string;
  aqui?: string; // sentido neste versículo
  classe?: string;
  gramatica?: string;
  vezes?: number;
  definicao?: string; // definição do léxico em português
};

export type Scene =
  | { k: "logo"; titulo?: string }
  | { k: "preto" }
  | { k: "slide"; img: string; n: number; total: number }
  | {
      k: "texto";
      ref: string;
      versao: string;
      vista: Vista;
      heb: boolean;
      verses: SVerse[];
      marks: BMark[];
      parte?: [number, number];
      palavra?: Palavra;
      /** palavra escolhida: "versículo:índice" (fica destacada) */
      sel?: string;
    };

export type Tela = { s: Scene; tema: "noite" | "papel"; escala: number };

export const isTrad = (v: Vista) => v === "traducao" || v === "strong";
export const markKey = (vista: Vista, versao: string) => (isTrad(vista) ? versao : "orig");
export const vistaOf = (v: BPassage["view"]): Vista => (v === "original" || v === "interlinear" || v === "strong" ? v : "traducao");
export const VISTAS: [Vista, string][] = [
  ["traducao", "Tradução"],
  ["strong", "Strong"],
  ["original", "Original"],
  ["interlinear", "Interlinear"],
];

export type Loaded = {
  ref: Ref;
  label: string;
  heb: boolean;
  verses: SVerse[];
  /** palavras completas do original (com gramática), por versículo — só no apresentador */
  orig: Record<number, OrigWord[]>;
};

/** carrega o trecho na versão e na forma pedidas */
export async function loadPassage(refText: string, versao: string, vista: Vista, cat?: Catalog): Promise<Loaded> {
  const catalog = cat ?? (await loadCatalog());
  const ref = parseRef(refText, catalog);
  if (!ref) throw new Error(`Não entendi a referência “${refText}”.`);
  const heb = isHebrew(ref.book.id, catalog);
  const label = refLabel(ref);

  const [chs, origCh] = await Promise.all([
    isTrad(vista) ? loadBook(versao, ref.book.id) : Promise.resolve(null),
    vista === "traducao" ? Promise.resolve(null) : loadOriginal(ref.book.id, ref.chapter).catch(() => null),
  ]);
  const orig: Record<number, OrigWord[]> = {};
  if (origCh) for (const [k, v] of Object.entries(origCh)) orig[Number(k)] = v;

  if (chs) {
    const ch = chs[ref.chapter - 1] ?? [];
    const from = ref.from ?? 1;
    const to = Math.min(ref.to ?? (ref.from ? ref.from : ch.length), ch.length);
    const verses: SVerse[] = [];
    for (let v = from; v <= to; v++) {
      const text = ch[v - 1];
      if (!text) continue;
      const sv: SVerse = { n: v, text };
      if (vista === "strong" && orig[v]) sv.tags = tagsOf(text, orig[v]);
      verses.push(sv);
    }
    return { ref, label, heb, verses, orig };
  }

  const nums = Object.keys(orig).map(Number).sort((a, b) => a - b);
  if (!nums.length) throw new Error("Texto original indisponível para este trecho.");
  const from = ref.from ?? nums[0];
  const to = ref.to ?? (ref.from ? ref.from : nums[nums.length - 1]);
  const verses: SVerse[] = [];
  for (let v = from; v <= to; v++) {
    const ws = orig[v];
    if (!ws) continue;
    verses.push({ n: v, words: ws.map((w) => [cleanWord(w[0]), cleanTranslit(w[1], heb), splitGloss(w[4]).main, w[2]] as Word) });
  }
  return { ref, label, heb, verses, orig };
}

/** posições das palavras da tradução que se ligam ao original */
function tagsOf(text: string, words: OrigWord[]): Tag[] {
  const out: Tag[] = [];
  let pos = 0;
  for (const t of tagVerse(text, words)) {
    if (t.word !== undefined) out.push([pos, pos + t.text.length, t.word]);
    pos += t.text.length;
  }
  return out;
}
