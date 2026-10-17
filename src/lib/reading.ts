// ------------------------------------------------------------------
// Texto de leitura da aula (o material em PDF convertido em texto).
// Formato simples, fácil de editar à mão:
//   # Título           ## Subtítulo
//   > citação          - item de lista      1. item numerado
//   **negrito**  _itálico_  ++sublinhado++   linha em branco separa parágrafos
//   nota de rodapé: [^1] no texto e, em qualquer lugar, a linha "[^1]: texto da nota"
// Blocos especiais (entre linhas ":::"):
//   :::versiculo João 3.16        :::destaque         :::tabela
//   Porque Deus amou o mundo...   Uma frase forte.    Coluna | Coluna
//   :::                           :::                 valor  | valor
//                                                     :::
//   :::linha-do-tempo             :::fluxo
//   1517 | Lutero e as 95 teses   Arrependimento | descrição (opcional)
//   1530 | Confissão de Augsburgo Fé
//   :::                           :::
// O professor não precisa ver isso: o editor tem botões (negrito, título...).
// ------------------------------------------------------------------

export type Seg = { t: string; b?: boolean; i?: boolean; u?: boolean };
export type BlockType = "h1" | "h2" | "p" | "quote" | "li" | "ol" | "verse" | "callout" | "table" | "timeline" | "flow";
export type Block = {
  type: BlockType;
  segs: Seg[];
  plain: string;
  n?: number;
  notes?: { at: number; id: string }[];
  ref?: string; // versículo: a referência (ex.: João 3.16)
  rows?: Seg[][][]; // tabela, linha do tempo e fluxo: linhas > células > texto
};
/** blocos montados em grade (o aluno não destaca dentro deles) */
export const isGridBlock = (b: Block) => b.type === "table" || b.type === "timeline" || b.type === "flow";
const FENCES: Record<string, BlockType> = {
  versiculo: "verse",
  "versículo": "verse",
  destaque: "callout",
  tabela: "table",
  "linha-do-tempo": "timeline",
  linha: "timeline",
  fluxo: "flow",
};
// os blocos do texto e as notas de rodapé (id -> texto, com negrito/itálico)
export type ReadingBlocks = Block[] & { footnotes?: Record<string, string> };
export const footnotesOf = (blocks: Block[]) => (blocks as ReadingBlocks).footnotes ?? {};

// **negrito**, _itálico_ e ++sublinhado++ (podem vir um dentro do outro: **_assim_**)
const TOKENS = /(\*\*(?!\s)[^\n]+?(?<!\s)\*\*|\+\+(?!\s)[^\n]+?(?<!\s)\+\+|(?<![\p{L}\p{N}_])_(?!\s)[^_\n]+?(?<!\s)_(?![\p{L}\p{N}_]))/gu;

export function inline(text: string, base: Omit<Seg, "t"> = {}): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKENS)) {
    if (m.index! > last) out.push({ ...base, t: text.slice(last, m.index) });
    const tok = m[0];
    const inner = tok.startsWith("**") || tok.startsWith("++") ? tok.slice(2, -2) : tok.slice(1, -1);
    const flag = tok.startsWith("**") ? { b: true } : tok.startsWith("++") ? { u: true } : { i: true };
    out.push(...inline(inner, { ...base, ...flag }));
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push({ ...base, t: text.slice(last) });
  return out.filter((s) => s.t);
}

// pedaço de texto de volta ao formato com marcas
export function segText(s: Seg) {
  let t = s.t;
  if (s.u) t = `++${t}++`;
  if (s.i) t = `_${t}_`;
  if (s.b) t = `**${t}**`;
  return t;
}

const NOTE_OPEN = "";
const NOTE_CLOSE = "";

export function parseReading(src: string | undefined): ReadingBlocks {
  if (!src?.trim()) return [];
  // 1) linhas -> blocos crus (texto ainda com as marcas)
  type Raw = { type: BlockType; text: string; n?: number; ref?: string; rows?: string[][] };
  const raws: Raw[] = [];
  const footnotes: Record<string, string> = {};
  let buf: string[] = [];
  let bufType: "p" | "quote" = "p";
  const push = (type: BlockType, text: string, n?: number) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t) raws.push({ type, text: t, n });
  };
  const flush = () => {
    if (buf.length) push(bufType, buf.join(" "));
    buf = [];
  };
  // linhas seguidas viram um parágrafo; linhas seguidas com ">" viram uma citação
  const add = (type: "p" | "quote", text: string) => {
    if (bufType !== type) flush();
    bufType = type;
    buf.push(text);
  };
  // bloco especial aberto (":::tabela" até ":::")
  let fence: { type: BlockType; ref?: string; lines: string[] } | null = null;
  const closeFence = () => {
    if (!fence) return;
    const f = fence;
    fence = null;
    if (f.type === "verse" || f.type === "callout") {
      const t = f.lines.join(" ").replace(/\s+/g, " ").trim();
      if (t) raws.push({ type: f.type, text: t, ref: f.ref });
      return;
    }
    const rows = f.lines
      .filter((l) => l.trim() && !/^\|?\s*:?-{2,}/.test(l.trim())) // ignora a linha "---|---" do markdown
      .map((l) => splitCells(l.trim(), f.type));
    if (rows.length) raws.push({ type: f.type, text: rows.map((r) => r.join(" ")).join(" "), rows });
  };
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (fence) {
      if (/^:::\s*$/.test(line)) closeFence();
      else (fence as { lines: string[] }).lines.push(line);
      continue;
    }
    if ((m = line.match(/^:::\s*([\p{L}-]+)\s*(.*)$/u)) && FENCES[m[1].toLowerCase()]) {
      flush();
      fence = { type: FENCES[m[1].toLowerCase()], ref: m[2].trim() || undefined, lines: [] };
      continue;
    }
    if (!line) flush();
    else if ((m = line.match(/^\[\^([\w-]{1,12})\]:\s*(.*)$/))) { flush(); footnotes[m[1]] = m[2].trim(); }
    else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); push(m[1].length === 1 ? "h1" : "h2", m[2]); }
    else if ((m = line.match(/^>\s?(.*)$/))) add("quote", m[1]);
    else if ((m = line.match(/^[-•–◦*]\s+(.*)$/))) { flush(); push("li", m[1]); }
    else if ((m = line.match(/^(\d{1,3})[.)]\s+(.*)$/))) { flush(); push("ol", m[2], Number(m[1])); }
    else add("p", line);
  }
  flush();
  closeFence(); // bloco sem ":::" de fechamento vai até o fim

  // 2) notas no fim do texto (como vêm do Word ou do PDF): lista numerada final
  //    cujos itens terminam com "↑" ou cujos números aparecem como [n] no texto
  let end = raws.length;
  while (end > 0 && raws[end - 1].type === "ol") end--;
  const tail = raws.slice(end);
  if (tail.length) {
    const body = raws.slice(0, end).map((r) => r.text).join(" ");
    const arrows = tail.filter((r) => /↑\s*$/.test(r.text)).length;
    const cited = tail.filter((r) => body.includes(`[${r.n}]`)).length;
    if (arrows >= Math.ceil(tail.length / 2) || cited >= Math.ceil(tail.length / 2)) {
      for (const r of tail) footnotes[String(r.n)] ??= r.text.replace(/\s*↑\s*$/, "").trim();
      raws.splice(end);
      // título "Notas"/"Referências" logo antes da lista sai junto
      if (raws.length && /^(notas?( de rodap[ée])?|refer[êe]ncias)$/i.test(raws[raws.length - 1].text.replace(/[*_+]/g, ""))) raws.pop();
    }
  }

  // 3) blocos finais: marca de nota [^id] (ou [n] de uma nota existente) vira um número clicável
  const blocks: ReadingBlocks = [];
  for (const r of raws) {
    if (r.rows) {
      const rows = r.rows.map((cells) => cells.map((c) => inline(c)));
      const plain = gridPlain(r.type, rows);
      if (plain) blocks.push({ type: r.type, segs: [{ t: plain }], plain, rows });
      continue;
    }
    let text = r.text.replace(/\[\^([\w-]{1,12})\]/g, (all, id) => (footnotes[id] !== undefined ? `${NOTE_OPEN}${id}${NOTE_CLOSE}` : all));
    text = text.replace(/\[(\d{1,3})\]/g, (all, id) => (footnotes[id] !== undefined ? `${NOTE_OPEN}${id}${NOTE_CLOSE}` : all));
    const raw = inline(text);
    const segs: Seg[] = [];
    const notes: { at: number; id: string }[] = [];
    let pos = 0;
    for (const sg of raw) {
      let t = "";
      const parts = sg.t.split(new RegExp(`${NOTE_OPEN}([\\w-]{1,12})${NOTE_CLOSE}`));
      parts.forEach((part, k) => {
        if (k % 2) notes.push({ at: pos + t.length, id: part });
        else t += part;
      });
      if (t) segs.push({ ...sg, t });
      pos += t.length;
    }
    if (!segs.length) continue;
    blocks.push({ type: r.type, segs, plain: segs.map((x) => x.t).join(""), n: r.n, ...(r.ref ? { ref: r.ref } : {}), ...(notes.length ? { notes } : {}) });
  }
  if (Object.keys(footnotes).length) blocks.footnotes = footnotes;
  return blocks;
}

// células de uma linha: "a | b | c". Linha do tempo sem "|": "1517 – Lutero..." ou "1517: Lutero..."
function splitCells(line: string, type: BlockType): string[] {
  const cut = line.replace(/^\|/, "").replace(/\|$/, "");
  if (cut.includes("|")) {
    const cells = cut.split("|").map((c) => c.trim());
    return type === "table" ? cells : [cells[0], cells.slice(1).join(" | ")].filter((c, i) => i === 0 || c);
  }
  if (type === "timeline") {
    const m = cut.match(/^(.{1,40}?)\s*(?:[–—:]|\s-\s)\s*(.+)$/);
    if (m) return [m[1].trim(), m[2].trim()];
  }
  return [cut.trim()];
}

const segsPlain = (segs: Seg[]) => segs.map((x) => x.t).join("").trim();

// o texto da grade para ouvir em voz alta e para a busca
function gridPlain(type: BlockType, rows: Seg[][][]) {
  return rows
    .map((cells) => {
      const t = cells.map(segsPlain).filter(Boolean);
      if (!t.length) return "";
      const line = type === "table" ? t.join(", ") : t.join(": ");
      return /[.!?:]$/.test(line) ? line : `${line}.`;
    })
    .filter(Boolean)
    .join(" ");
}

export const readingMinutes = (blocks: Block[]) =>
  Math.max(1, Math.round(blocks.reduce((n, b) => n + b.plain.split(/\s+/).length, 0) / 200));

// ------------------------------------------------------------------
// Destaques e comentários do aluno, presos a um trecho do texto.
// Guardam o próprio trecho (q): se o professor mexer no texto, o
// destaque é procurado de novo pelo trecho.
// ------------------------------------------------------------------
export type MarkColor = "amarelo" | "verde" | "azul" | "rosa";
export type Mark = {
  id: string;
  b: number; // bloco
  s: number; // início (no texto do bloco)
  e: number; // fim
  q: string; // trecho marcado
  c: MarkColor;
  note?: string;
  t?: number; // segundo do vídeo quando foi feito
  at: string;
};

export const markColors: Record<MarkColor, { bg: string; dot: string; bar: string; label: string; hex: string }> = {
  amarelo: { bg: "bg-[#fbeeb0]", dot: "bg-[#f1cf3b]", bar: "border-[#e6bf1a]", label: "Amarelo", hex: "#e6bf1a" },
  verde: { bg: "bg-[#d4efd9]", dot: "bg-[#56b36b]", bar: "border-[#3f9b55]", label: "Verde", hex: "#3f9b55" },
  azul: { bg: "bg-[#d9e8f8]", dot: "bg-[#4c8fd6]", bar: "border-[#3a7cc2]", label: "Azul", hex: "#3a7cc2" },
  rosa: { bg: "bg-[#f8d9e2]", dot: "bg-[#e0648a]", bar: "border-[#cf4c74]", label: "Rosa", hex: "#cf4c74" },
};

// onde o destaque está hoje (null = o trecho não existe mais no texto)
export function locate(blocks: Block[], m: Mark): { b: number; s: number; e: number } | null {
  if (blocks[m.b]?.plain.slice(m.s, m.e) === m.q) return { b: m.b, s: m.s, e: m.e };
  let best: { b: number; s: number; e: number } | null = null;
  blocks.forEach((bl, i) => {
    const k = bl.plain.indexOf(m.q);
    if (k >= 0 && (!best || Math.abs(i - m.b) < Math.abs(best.b - m.b))) best = { b: i, s: k, e: k + m.q.length };
  });
  return best;
}

export const fmtVideoTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
