// ------------------------------------------------------------------
// Marca-texto do modo aula: o professor seleciona um trecho do texto
// bíblico e ele fica pintado. Guardamos só [versículo, início, fim, cor]
// (posições dentro do texto do versículo). A tela desenha os destaques
// em pedaços (segments), igual no apresentador e no projetor.
// ------------------------------------------------------------------
import type { BMark } from "./types";

export const MARK_NAMES = ["Amarelo", "Verde", "Azul", "Rosa"];
export const MARK_SWATCH = ["#f6c945", "#5fd38d", "#6aa8ff", "#f27fb8"];

/** os pedaços de texto de um versículo (sem número, †, títulos) */
function textNodes(verse: Element) {
  const out: Text[] = [];
  const walker = document.createTreeWalker(verse, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("[data-nomark]") && verse.contains(n.parentElement.closest("[data-nomark]")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

const verses = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>("[data-mv]"));
const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}\p{M}'’-]/u.test(ch);

/** a seleção do mouse virando destaques (um por versículo, sempre em palavras inteiras) */
export function selectionToMarks(root: Element, color: number): BMark[] {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  const out: BMark[] = [];
  for (const el of verses(root)) {
    if (!range.intersectsNode(el)) continue;
    const v = Number(el.dataset.mv);
    let pos = 0;
    let s = -1;
    let e = -1;
    let full = "";
    for (const n of textNodes(el)) {
      const len = n.data.length;
      if (range.intersectsNode(n)) {
        const a = n === range.startContainer ? range.startOffset : 0;
        const b = n === range.endContainer ? range.endOffset : len;
        if (b > a) {
          if (s < 0) s = pos + a;
          e = pos + b;
        }
      }
      full += n.data;
      pos += len;
    }
    if (s < 0 || e <= s) continue;
    // palavras inteiras, sem espaços nas pontas
    while (s > 0 && isWordChar(full[s - 1]) && isWordChar(full[s])) s--;
    while (e < full.length && isWordChar(full[e - 1]) && isWordChar(full[e])) e++;
    while (s < e && /\s/.test(full[s])) s++;
    while (e > s && /\s/.test(full[e - 1])) e--;
    if (e > s) out.push([v, s, e, color]);
  }
  return out;
}

/** em que versículo/posição caiu um clique */
export function pointToOffset(root: Element, x: number, y: number): { v: number; at: number } | null {
  type CaretDoc = Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const d = document as CaretDoc;
  let node: Node | null = null;
  let off = 0;
  const cp = d.caretPositionFromPoint?.(x, y);
  if (cp) (node = cp.offsetNode), (off = cp.offset);
  else {
    const r = d.caretRangeFromPoint?.(x, y);
    if (r) (node = r.startContainer), (off = r.startOffset);
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const el = node.parentElement?.closest<HTMLElement>("[data-mv]");
  if (!el || !root.contains(el)) return null;
  let pos = 0;
  for (const n of textNodes(el)) {
    if (n === node) return { v: Number(el.dataset.mv), at: pos + off };
    pos += n.data.length;
  }
  return null;
}

/** junta destaques novos com os que já existem (o novo manda onde se sobrepõem) */
export function addMarks(list: BMark[], add: BMark[]): BMark[] {
  let out = [...list];
  for (const m of add) {
    const [v, s, e] = m;
    const next: BMark[] = [];
    for (const o of out) {
      if (o[0] !== v || o[2] <= s || o[1] >= e) next.push(o);
      else {
        // corta o antigo onde o novo passa por cima
        if (o[1] < s) next.push([v, o[1], s, o[3]]);
        if (o[2] > e) next.push([v, e, o[2], o[3]]);
      }
    }
    out = [...next, m];
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** remove os destaques que tocam a seleção */
export function eraseMarks(list: BMark[], cut: BMark[]): BMark[] {
  return list.filter((o) => !cut.some(([v, s, e]) => o[0] === v && o[1] < e && o[2] > s));
}

/** divide o texto de um versículo em pedaços com e sem destaque */
export function segments(text: string, marks: BMark[]): { t: string; c?: number }[] {
  if (!marks.length) return [{ t: text }];
  const out: { t: string; c?: number }[] = [];
  let pos = 0;
  for (const [, s, e, c] of [...marks].sort((a, b) => a[1] - b[1])) {
    const a = Math.max(s, pos);
    const b = Math.min(e, text.length);
    if (b <= a) continue;
    if (a > pos) out.push({ t: text.slice(pos, a) });
    out.push({ t: text.slice(a, b), c });
    pos = b;
  }
  if (pos < text.length) out.push({ t: text.slice(pos) });
  return out;
}
