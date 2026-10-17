// ------------------------------------------------------------------
// O que aparece no projetor. O apresentador monta a "tela" e manda
// pronta (texto já carregado, slide já desenhado em imagem): as telas
// da projeção só desenham, sem precisar da Bíblia nem do PDF.
// ------------------------------------------------------------------
import {
  cleanTranslit, cleanWord, isHebrew, loadBook, loadCatalog, loadOriginal, parseRef, refLabel, splitGloss, type Catalog, type Ref,
} from "./bible";
import type { BMark, BPassage } from "./types";

/** palavra do original: [texto, transliteração, sentido, Strong] */
export type Word = [text: string, translit: string, gloss: string, strong: string];
export type SVerse = { n: number; text?: string; words?: Word[] };
export type Vista = "traducao" | "original" | "interlinear";

export type Scene =
  | { k: "logo"; titulo?: string }
  | { k: "preto" }
  | { k: "slide"; img: string; n: number; total: number }
  | { k: "texto"; ref: string; versao: string; vista: Vista; heb: boolean; verses: SVerse[]; marks: BMark[]; parte?: [number, number] };

export type Tela = { s: Scene; tema: "noite" | "papel"; escala: number };

export const markKey = (vista: Vista, versao: string) => (vista === "traducao" ? versao : "orig");
export const vistaOf = (v: BPassage["view"]): Vista => (v === "original" || v === "interlinear" ? v : "traducao");

export type Loaded = { ref: Ref; label: string; heb: boolean; verses: SVerse[] };

/** carrega o trecho na versão e na forma pedidas */
export async function loadPassage(refText: string, versao: string, vista: Vista, cat?: Catalog): Promise<Loaded> {
  const catalog = cat ?? (await loadCatalog());
  const ref = parseRef(refText, catalog);
  if (!ref) throw new Error(`Não entendi a referência “${refText}”.`);
  const heb = isHebrew(ref.book.id, catalog);
  const label = refLabel(ref);
  if (vista === "traducao") {
    const chs = await loadBook(versao, ref.book.id);
    const ch = chs[ref.chapter - 1] ?? [];
    const from = ref.from ?? 1;
    const to = Math.min(ref.to ?? (ref.from ? ref.from : ch.length), ch.length);
    const verses: SVerse[] = [];
    for (let v = from; v <= to; v++) if (ch[v - 1]) verses.push({ n: v, text: ch[v - 1] });
    return { ref, label, heb, verses };
  }
  const orig = await loadOriginal(ref.book.id, ref.chapter);
  const nums = Object.keys(orig).map(Number).sort((a, b) => a - b);
  const from = ref.from ?? nums[0] ?? 1;
  const to = ref.to ?? (ref.from ? ref.from : nums[nums.length - 1] ?? 1);
  const verses: SVerse[] = [];
  for (let v = from; v <= to; v++) {
    const ws = orig[String(v)];
    if (!ws) continue;
    verses.push({
      n: v,
      words: ws.map((w) => [cleanWord(w[0]), cleanTranslit(w[1], heb), splitGloss(w[4]).main, w[2]] as Word).filter((w) => w[0]),
    });
  }
  return { ref, label, heb, verses };
}
