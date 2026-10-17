// ------------------------------------------------------------------
// Bíblia e Originais: leitura das traduções, do texto original
// (grego e hebraico, com números de Strong) e do léxico.
// Os arquivos são os mesmos da plataforma (.json.gz gerados a partir da
// STEP Bible / Tyndale House, da coletânea "Bíblias" e da tradução Logos).
// ------------------------------------------------------------------

export type BookInfo = { id: string; name: string; chapters: number };
export type VersionInfo = { id: string; name: string; year?: number | null; publisher?: string | null; license?: string | null };
export type Catalog = { versions: VersionInfo[]; books: BookInfo[] };

/** palavra original: [texto, transliteração, Strong, morfologia, glosa, partes?] */
export type Part = [text: string, strong: string, gloss: string];
export type OrigWord = [text: string, translit: string, strong: string, morph: string, gloss: string, parts?: Part[]];
export type OrigChapter = Record<string, OrigWord[]>;

export type LexEntry = {
  l: string; // lema
  t: string; // transliteração
  p: string; // classe (G:V, H:N-M...)
  g: string; // significado em português
  e: string; // significado em inglês (original do léxico)
  d: string; // definição completa do léxico (inglês, HTML simples)
  n: number; // ocorrências no texto
};

export const OT = 39; // os 39 primeiros livros são do Antigo Testamento
export const ABBR: Record<string, string> = {
  GEN: "Gn", EXO: "Êx", LEV: "Lv", NUM: "Nm", DEU: "Dt", JOS: "Js", JDG: "Jz", RUT: "Rt", "1SA": "1Sm", "2SA": "2Sm", "1KI": "1Rs", "2KI": "2Rs",
  "1CH": "1Cr", "2CH": "2Cr", EZR: "Ed", NEH: "Ne", EST: "Et", JOB: "Jó", PSA: "Sl", PRO: "Pv", ECC: "Ec", SNG: "Ct", ISA: "Is", JER: "Jr",
  LAM: "Lm", EZK: "Ez", DAN: "Dn", HOS: "Os", JOL: "Jl", AMO: "Am", OBA: "Ob", JON: "Jn", MIC: "Mq", NAM: "Na", HAB: "Hc", ZEP: "Sf",
  HAG: "Ag", ZEC: "Zc", MAL: "Ml", MAT: "Mt", MRK: "Mc", LUK: "Lc", JHN: "Jo", ACT: "At", ROM: "Rm", "1CO": "1Co", "2CO": "2Co", GAL: "Gl",
  EPH: "Ef", PHP: "Fp", COL: "Cl", "1TH": "1Ts", "2TH": "2Ts", "1TI": "1Tm", "2TI": "2Tm", TIT: "Tt", PHM: "Fm", HEB: "Hb", JAS: "Tg",
  "1PE": "1Pe", "2PE": "2Pe", "1JN": "1Jo", "2JN": "2Jo", "3JN": "3Jo", JUD: "Jd", REV: "Ap",
};

import { native } from "./native";

const BASE = "";
const cache = new Map<string, Promise<unknown>>();

async function readJson(path: string): Promise<unknown> {
  // vem do computador; se ainda não tiver, o aplicativo baixa do site e guarda
  const buf = new Uint8Array(await native.biblia(path.replace(/^\//, "")));
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(buf));
}

function load<T>(url: string): Promise<T> {
  let p = cache.get(url);
  if (!p) {
    p = readJson(url);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p as Promise<T>;
}

export const loadCatalog = () => load<Catalog>(`${BASE}/versoes.json`);
export const loadBook = (version: string, book: string) => load<string[][]>(`${BASE}/textos/${version}/${book}.json.gz`);
export const loadOriginal = (book: string, chapter: number) => load<OrigChapter>(`${BASE}/originais/${book}/${chapter}.json.gz`);

// títulos das perícopes (Berean Standard Bible, domínio público, traduzidos): capítulo -> [versículo, nível, título, paralelos]
export type Heading = [verse: number, level: 1 | 2, title: string, refs: string | null];
export type BookHeadings = Record<string, Heading[]>;
export const loadTitles = (book: string) => load<BookHeadings>(`${BASE}/titulos/${book}.json.gz`).catch(() => ({}) as BookHeadings);
/** títulos de um capítulo, por versículo */
export function headingsByVerse(all: BookHeadings | null | undefined, chapter: number): Map<number, Heading[]> {
  const m = new Map<number, Heading[]>();
  for (const h of all?.[String(chapter)] ?? []) m.set(h[0], [...(m.get(h[0]) ?? []), h]);
  return m;
}

export async function loadLex(strong: string): Promise<LexEntry | undefined> {
  const n = parseInt(strong.slice(1, 5), 10);
  if (Number.isNaN(n)) return undefined;
  const part = `${strong[0]}${String(Math.floor(n / 100)).padStart(2, "0")}`;
  const data = await load<Record<string, LexEntry>>(`${BASE}/lexico/${part}.json.gz`);
  return data[strong] ?? data[strong.slice(0, 5)];
}

/** número de Strong para exibir: G1448, H7225 (sem zeros à esquerda nem sufixo) */
export function strongLabel(s: string) {
  const m = s.match(/^([GH])0*(\d+)/);
  return m ? `${m[1]}${m[2]}` : s;
}

/** "terra: país/planeta" → sentido principal "país/planeta" e palavra-base "terra" */
export function splitGloss(g: string): { main: string; base?: string } {
  const i = g.indexOf(": ");
  if (i < 0) return { main: g };
  return { main: g.slice(i + 2), base: g.slice(0, i) };
}
/** palavra como aparece no texto, sem o sinal de parágrafo */
export const cleanWord = (w: string) => w.replace(/¶/g, "").trim();
/** transliteração mais simples de ler (sem pontos de sílaba e sem maiúsculas de tonicidade) */
export const cleanTranslit = (t: string, heb: boolean) => (heb ? t.replace(/\./g, "").toLowerCase() : t);

export const isHebrew = (book: string, catalog?: Catalog) => {
  if (!catalog) return false;
  return catalog.books.findIndex((b) => b.id === book) < OT;
};

// ---------------- morfologia em português ----------------
const G_POS: Record<string, string> = {
  N: "Substantivo", V: "Verbo", A: "Adjetivo", T: "Artigo", P: "Pronome pessoal", R: "Pronome relativo", D: "Pronome demonstrativo",
  C: "Pronome recíproco", F: "Pronome reflexivo", I: "Pronome interrogativo", X: "Pronome indefinido", Q: "Pronome correlativo",
  K: "Pronome correlativo", S: "Pronome possessivo", PREP: "Preposição", CONJ: "Conjunção", COND: "Conjunção condicional",
  ADV: "Advérbio", PRT: "Partícula", INJ: "Interjeição", HEB: "Palavra hebraica", ARAM: "Palavra aramaica", H: "Palavra hebraica",
};
const CASE: Record<string, string> = { N: "nominativo", G: "genitivo", D: "dativo", A: "acusativo", V: "vocativo" };
const NUM: Record<string, string> = { S: "singular", P: "plural" };
const GEN: Record<string, string> = { M: "masculino", F: "feminino", N: "neutro" };
const TENSE: Record<string, string> = { P: "presente", I: "imperfeito", F: "futuro", A: "aoristo", R: "perfeito", L: "mais-que-perfeito", X: "sem tempo" };
const VOICE: Record<string, string> = {
  A: "ativa", M: "média", P: "passiva", E: "média ou passiva", D: "média (depoente)", O: "passiva (depoente)", N: "média ou passiva (depoente)", Q: "passiva", X: "sem voz",
};
const MOOD: Record<string, string> = { I: "indicativo", S: "subjuntivo", O: "optativo", M: "imperativo", N: "infinitivo", P: "particípio", R: "particípio imperativo" };
const G_SUFFIX: Record<string, string> = {
  P: "nome de pessoa", L: "nome de lugar", T: "título", G: "gentílico", C: "comparativo", S: "superlativo", I: "interrogativo", N: "negativo",
  PRI: "nome próprio indeclinável", LI: "letra", NUI: "numeral indeclinável", OI: "indeclinável", ATT: "forma ática", ABB: "abreviação", K: "crase",
};

function cgn(s: string) {
  // "NSF" → nominativo singular feminino
  const out: string[] = [];
  if (CASE[s[0]]) out.push(CASE[s[0]]);
  if (NUM[s[1]]) out.push(NUM[s[1]]);
  if (s[2] && GEN[s[2]]) out.push(GEN[s[2]]);
  return out.join(" ");
}

function greekMorph(code: string) {
  const main = code.split(" + ")[0];
  const p = main.split("-");
  const pos = G_POS[p[0]] ?? p[0];
  const rest: string[] = [];
  if (p[0] === "V") {
    const m = (p[1] ?? "").match(/^(\d?)([PIFARLX])([AMPEDONQX])([ISOMNPR])$/);
    if (m) {
      rest.push(`${m[1] === "2" ? `${TENSE[m[2]]} 2º` : TENSE[m[2]]}`, `voz ${VOICE[m[3]]}`, MOOD[m[4]]);
      const q = p[2];
      if (q && /^[123][SP]$/.test(q)) rest.push(`${q[0]}ª pessoa do ${NUM[q[1]]}`);
      else if (q) rest.push(cgn(q));
    }
  } else if (p[0] === "P" || p[0] === "S" || p[0] === "F") {
    const q = p[1] ?? "";
    const m = q.match(/^([123])?(.*)$/);
    if (m?.[1]) rest.push(`${m[1]}ª pessoa`);
    if (p[0] === "S" && m?.[2] && m[2].length >= 4) {
      rest.push(`(do ${NUM[m[2][0]] ?? ""})`, cgn(m[2].slice(1)));
    } else if (m?.[2]) rest.push(cgn(m[2]));
  } else if (p[1] && /^[NGDAV][SP][MFN]?$/.test(p[1])) {
    rest.push(cgn(p[1]));
  }
  for (const s of p.slice(p[0] === "V" ? 3 : 2)) if (G_SUFFIX[s]) rest.push(G_SUFFIX[s]);
  if (p[1] && G_SUFFIX[p[1]] && !/^[NGDAV][SP]/.test(p[1])) rest.push(G_SUFFIX[p[1]]);
  return [pos, ...rest.filter(Boolean)].join(" · ");
}

const H_STEM: Record<string, string> = {
  q: "Qal", N: "Nifal", p: "Piel", P: "Pual", h: "Hifil", H: "Hofal", t: "Hitpael", o: "Polel", O: "Polal", r: "Hitpolel", m: "Poel",
  M: "Poal", k: "Palel", K: "Pulal", Q: "Qal passivo", l: "Pilpel", L: "Polpal", f: "Hitpalpel", D: "Nitpael", j: "Pealal", i: "Pilel",
  u: "Hotpaal", c: "Tifil", v: "Histafel", w: "Nitpalel", y: "Nitpoel", z: "Hitpoel",
};
const A_STEM: Record<string, string> = {
  q: "Peal", Q: "Peil", u: "Hitpeel", p: "Pael", P: "Itpaal", M: "Hitpaal", a: "Afel", h: "Hafel", s: "Safel", e: "Shafel", H: "Hofal",
  i: "Itpeel", t: "Histafal", v: "Istafal", w: "Hitafel", o: "Polel", z: "Itpoel", r: "Hitpolel", f: "Hitpalpel", b: "Hefal",
  c: "Tifel", m: "Poel", l: "Palpel", L: "Itpalpel", O: "Itpolel", G: "Itafal",
};
const H_CONJ: Record<string, string> = {
  p: "perfeito", q: "perfeito consecutivo", i: "imperfeito", w: "imperfeito consecutivo", h: "coortativo", j: "jussivo",
  v: "imperativo", r: "particípio ativo", s: "particípio passivo", a: "infinitivo absoluto", c: "infinitivo construto",
};
const H_GEN: Record<string, string> = { m: "masculino", f: "feminino", b: "masc./fem.", c: "comum" };
const H_NUM: Record<string, string> = { s: "singular", p: "plural", d: "dual" };
const H_STATE: Record<string, string> = { a: "absoluto", c: "construto", d: "determinado" };
const H_PART: Record<string, string> = {
  a: "Partícula afirmativa", d: "Artigo definido", e: "Partícula exortativa", i: "Partícula interrogativa", j: "Interjeição",
  m: "Partícula demonstrativa", n: "Partícula negativa", o: "Marcador de objeto direto", r: "Partícula relativa", c: "Conjunção",
};
const H_PRON: Record<string, string> = {
  d: "Pronome demonstrativo", f: "Pronome indefinido", i: "Pronome interrogativo", p: "Pronome pessoal", r: "Pronome relativo",
};

function pgn(s: string) {
  const out: string[] = [];
  let i = 0;
  if (/[123]/.test(s[i] ?? "")) out.push(`${s[i++]}ª pessoa`);
  if (H_GEN[s[i]]) out.push(H_GEN[s[i++]]);
  if (H_NUM[s[i]]) out.push(H_NUM[s[i++]]);
  if (H_STATE[s[i]]) out.push(H_STATE[s[i++]]);
  return out;
}

function hebrewMorph(code: string) {
  const aram = code[0] === "A";
  const s = code.slice(1);
  const lang = aram ? "Aramaico" : "Hebraico";
  const t = s[0];
  let out: string[] = [];
  if (t === "V") {
    const stem = (aram ? A_STEM : H_STEM)[s[1]] ?? s[1];
    out = ["Verbo", stem, H_CONJ[s[2]] ?? "", ...pgn(s.slice(3))];
  } else if (t === "N") {
    const kind = s[1] === "p" ? "Nome próprio" : s[1] === "g" ? "Substantivo gentílico" : "Substantivo";
    if (s[1] === "p") {
      const k: Record<string, string> = { m: "de homem", f: "de mulher", l: "de lugar", t: "título" };
      out = [kind, k[s[2]] ?? ""];
    } else out = [kind, ...pgn(s.slice(2))];
  } else if (t === "A") {
    const k: Record<string, string> = { a: "Adjetivo", c: "Numeral cardinal", g: "Adjetivo gentílico", o: "Numeral ordinal" };
    out = [k[s[1]] ?? "Adjetivo", ...pgn(s.slice(2))];
  } else if (t === "P") out = [H_PRON[s[1]] ?? "Pronome", ...pgn(s.slice(2))];
  else if (t === "T") out = [H_PART[s[1]] ?? "Partícula"];
  else if (t === "R") out = ["Preposição"];
  else if (t === "C") out = ["Conjunção"];
  else if (t === "D") out = ["Advérbio"];
  else if (t === "S") {
    const k: Record<string, string> = { d: "Sufixo direcional", h: "He paragógico", n: "Nun paragógico", p: "Sufixo pronominal" };
    out = [k[s[1]] ?? "Sufixo", ...pgn(s.slice(2))];
  } else out = [s];
  return [lang, ...out.filter(Boolean)].join(" · ");
}

export function describeMorph(morph: string, strong: string) {
  if (!morph) return "";
  return strong.startsWith("H") ? hebrewMorph(morph) : greekMorph(morph);
}

// ---------------- Strong em cima da tradução ----------------
// Liga palavras do português às palavras do original pelo significado
// (aproximação automática: marca só quando o sentido bate).
const STOP = new Set(
  "a o as os um uma uns umas de do da dos das e em no na nos nas ao aos à às que se por para com como mas ou nem não sim já eu tu ele ela nós vós eles elas me te lhe nos vos lhes seu sua seus suas meu minha meus minhas teu tua teus tuas nosso nossa vosso vossa isto isso aquilo este esta estes estas esse essa esses essas aquele aquela aqueles aquelas pelo pela pelos pelas num numa quem qual quais quando onde porque pois então também mais muito todo toda todos todas ser estar ter haver foi era são é há".split(" "),
);
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function prefix(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
function matches(w: string, g: string) {
  if (w === g) return true;
  if (w.length < 3 || g.length < 3) return false;
  if (w === g + "s" || g === w + "s" || w === g + "es" || g === w + "es") return true;
  const p = prefix(w, g);
  return p >= 4 && p >= Math.min(w.length, g.length) - 3;
}

export type Token = { text: string; word?: number }; // word = índice da palavra original
/** divide o versículo em pedaços e marca os que correspondem a uma palavra do original */
export function tagVerse(text: string, words: OrigWord[] | undefined): Token[] {
  const parts = text.split(/([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)/u);
  if (!words?.length) return [{ text }];
  const cands = words.map((w, i) => {
    const glosses = [w[4], ...(w[5]?.map((p) => p[2]) ?? [])]
      .join(" ")
      .split(/[^\p{L}]+/u)
      .map(fold)
      .filter((g) => g.length >= 3 && !STOP.has(g));
    // artigos, partículas e prefixos não recebem marca
    const skip = /^(T|PRT|CONJ|COND|PREP|HT|HC|HR|AT|AC|AR)/.test(w[3].replace(/-.*/, "")) || /^H(T[do]|C|R)/.test(w[3]);
    return { i, glosses: skip ? [] : glosses };
  });
  const used = new Set<number>();
  return parts
    .filter((p) => p !== "")
    .map((p) => {
      if (!/\p{L}/u.test(p)) return { text: p };
      const f = fold(p);
      if (STOP.has(f) || f.length < 3) return { text: p };
      for (const c of cands) {
        if (used.has(c.i)) continue;
        if (c.glosses.some((g) => matches(f, g))) {
          used.add(c.i);
          return { text: p, word: c.i };
        }
      }
      return { text: p };
    });
}

// ---------------- definição do léxico ----------------
export function plainDefinition(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// ---------------- referência bíblica ("Jo 3:16", "1 Coríntios 13.4-7", "Sl 23") ----------------
export type Ref = { book: BookInfo; chapter: number; from?: number; to?: number };
const foldName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[\s.]/g, "");

export function parseRef(text: string, cat: Catalog): Ref | null {
  const m = text.trim().match(/^([1-3]?\s*[\p{L}][\p{L}\s.]*?)\s*(\d+)(?:\s*[:.,]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/u);
  if (!m) return null;
  const raw = m[1].toLowerCase().replace(/[\s.]/g, "");
  const name = foldName(m[1]);
  const book =
    cat.books.find((b) => (ABBR[b.id] ?? "").toLowerCase() === raw) ??
    cat.books.find((b) => foldName(ABBR[b.id] ?? "") === name) ??
    cat.books.find((b) => foldName(b.name) === name) ??
    cat.books.find((b) => name.length >= 3 && foldName(b.name).startsWith(name));
  const chapter = Number(m[2]);
  if (!book || chapter < 1 || chapter > book.chapters) return null;
  const from = m[3] ? Number(m[3]) : undefined;
  const to = m[4] ? Number(m[4]) : from;
  if (from !== undefined && to !== undefined && to < from) return null;
  return { book, chapter, from, to };
}

export const refLabel = (r: Ref) =>
  `${r.book.name} ${r.chapter}${r.from ? `:${r.from}${r.to && r.to !== r.from ? `-${r.to}` : ""}` : ""}`;

/** texto do trecho (versículos numerados quando há mais de um) */
export async function passage(r: Ref, version: string): Promise<{ verses: { n: number; text: string }[]; label: string }> {
  const chs = await loadBook(version, r.book.id);
  const ch = chs[r.chapter - 1] ?? [];
  const from = r.from ?? 1;
  const to = Math.min(r.to ?? (r.from ? r.from : ch.length), ch.length);
  const verses: { n: number; text: string }[] = [];
  for (let v = from; v <= to; v++) if (ch[v - 1]) verses.push({ n: v, text: ch[v - 1] });
  return { verses, label: refLabel(r.from ? { ...r, from, to } : r) };
}
