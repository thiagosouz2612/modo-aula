// ------------------------------------------------------------------
// Busca por palavras do versículo (sem precisar da referência).
// Carrega a versão inteira uma vez (fica na memória) e procura todas
// as palavras digitadas, sem ligar para acentos e maiúsculas.
// ------------------------------------------------------------------
import { loadBook, loadCatalog, type BookInfo } from "./bible";

type Linha = { b: BookInfo; c: number; v: number; text: string; norm: string };
const indices = new Map<string, Promise<Linha[]>>();

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function indice(versao: string): Promise<Linha[]> {
  let p = indices.get(versao);
  if (!p) {
    p = (async () => {
      const cat = await loadCatalog();
      const books = await Promise.all(cat.books.map((b) => loadBook(versao, b.id).then((chs) => [b, chs] as const)));
      const out: Linha[] = [];
      for (const [b, chs] of books)
        chs.forEach((ch, ci) =>
          ch.forEach((text, vi) => {
            if (text) out.push({ b, c: ci + 1, v: vi + 1, text, norm: ` ${norm(text)} ` });
          }),
        );
      return out;
    })();
    p.catch(() => indices.delete(versao));
    indices.set(versao, p);
  }
  return p;
}

export type Achado = { ref: string; label: string; text: string; b: string; c: number; v: number };

/** versículos que têm todas as palavras (a frase exata vem primeiro) */
export async function buscarTexto(q: string, versao: string, max = 40): Promise<Achado[]> {
  const n = norm(q);
  const termos = n.split(" ").filter((t) => t.length >= 2);
  if (!termos.length || n.length < 3) return [];
  const linhas = await indice(versao);
  const frase = ` ${n}`;
  const exatas: Linha[] = [];
  const outras: { l: Linha; nota: number }[] = [];
  for (const l of linhas) {
    // cada palavra digitada precisa ser o começo de uma palavra do versículo
    if (!termos.every((t) => l.norm.includes(` ${t}`))) continue;
    if (l.norm.includes(frase)) {
      exatas.push(l);
      if (exatas.length >= max) break;
      continue;
    }
    // mais perto do que foi digitado: palavras inteiras e em sequência
    let nota = termos.filter((t) => l.norm.includes(` ${t} `)).length * 2;
    for (let i = 0; i < termos.length - 1; i++) if (l.norm.includes(` ${termos[i]} ${termos[i + 1]}`)) nota += 3;
    outras.push({ l, nota });
  }
  outras.sort((x, y) => y.nota - x.nota);
  return [...exatas, ...outras.map((o) => o.l)].slice(0, max).map((l) => ({
    ref: `${l.b.name} ${l.c}:${l.v}`,
    label: `${l.b.name} ${l.c}:${l.v}`,
    text: l.text,
    b: l.b.id,
    c: l.c,
    v: l.v,
  }));
}

/** começa a carregar a versão antes da primeira busca */
export const prepararBusca = (versao: string) => void indice(versao).catch(() => {});
