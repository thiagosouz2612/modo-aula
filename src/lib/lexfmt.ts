// ------------------------------------------------------------------
// Organiza a definição do léxico (Abbott-Smith / BDB) para ler e
// projetar: cada sentido numa linha ("1.", "(a)"), o texto sem as
// referências no meio e as referências bíblicas separadas, já com as
// abreviações em português (Mat.5:43 → Mt 5:43).
// ------------------------------------------------------------------
import { ABBR } from "./bible";

export type LexLinha = { nivel: 0 | 1 | 2; marca?: string; texto: string; refs: string[] };

// Mat.5:43 · 1Co.13:4-7 · Jhn.3:16ff. · Rom.3:21, 22 · 2Pe.1:5-7
const REF = /\b((?:[1-3]\s?)?[A-Z][a-z]{1,2}[a-z]?)\.\s?(\d{1,3}):(\d{1,3})(?:\s?[-–]\s?\d{1,3})?(?:\s?ff?\.?)?((?:\s?,\s?\d{1,3}(?::\d{1,3})?(?:\s?[-–]\s?\d{1,3})?(?![\w.]))*)/g;
const ALIAS: Record<string, string> = { AC: "ACT", LK: "LUK", MK: "MRK", MT: "MAT", JN: "JHN", RO: "ROM", EZE: "EZK", JOE: "JOL", NAH: "NAM", SOS: "SNG", SOL: "SNG", PHI: "PHP", JDE: "JUD", MAR: "MRK", JOH: "JHN", JAM: "JAS" };

function refPt(livro: string, cap: string, vers: string, full: string) {
  const id = livro.replace(/\s/g, "").toUpperCase();
  const pt = ABBR[id] ?? ABBR[ALIAS[id] ?? ""];
  if (!pt) return null;
  const resto = full.slice(full.indexOf(":") + 1 + vers.length).replace(/\s+/g, " ").trim();
  return `${pt} ${cap}:${vers}${resto && !/^ff?\.?$/.test(resto) ? resto.replace(/^(\s?[-–])/, "-").replace(/\s?ff?\.?/, "") : ""}`.replace(/\s?,\s?/g, ", ").trim();
}

function limpa(t: string) {
  return t
    .replace(/\(\s*[,;]?\s*\)/g, "")
    .replace(/\s*,\s*(?=[,;.:])/g, "")
    .replace(/[,;]\s*[,;]+/g, ";")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;.:])/g, "$1")
    .replace(/(^|:)\s*[,;]\s*/g, "$1 ")
    .replace(/[,;]\s*$/g, "")
    .trim();
}

/** html: definição original (com <br>, <b>…); texto: tradução em linhas */
export function estruturar(def: string, html: boolean): LexLinha[] {
  const partes = html ? def.split(/<br\s*\/?>/i) : def.split(/\n+/);
  const out: LexLinha[] = [];
  for (const parte of partes) {
    let t = (html ? parte.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&") : parte).replace(/\s+/g, " ").trim();
    if (!t) continue;
    // às vezes vários sentidos vêm na mesma linha: "1. … 2. …"
    const pedacos = t.split(/\s(?=(?:\d{1,2}\.|\([a-z]\))\s)/);
    for (let p of pedacos) {
      p = p.trim();
      let nivel: LexLinha["nivel"] = 0;
      let marca: string | undefined;
      const n = p.match(/^(\d{1,2})\.\s+/);
      const l = p.match(/^\(([a-z])\)\s+/);
      if (n) (nivel = 1, (marca = n[1]), (p = p.slice(n[0].length)));
      else if (l) (nivel = 2, (marca = l[1]), (p = p.slice(l[0].length)));
      const refs: string[] = [];
      t = p.replace(REF, (full, livro: string, cap: string, vers: string) => {
        const r = refPt(livro, cap, vers, full);
        if (!r) return full;
        refs.push(r);
        return "";
      });
      const texto = limpa(t);
      if (!texto && !refs.length) continue;
      out.push({ nivel, marca, texto, refs });
    }
  }
  return out;
}
