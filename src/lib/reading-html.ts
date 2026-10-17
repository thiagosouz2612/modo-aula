// ------------------------------------------------------------------
// Ponte entre o editor de texto (HTML) e o formato salvo do texto da
// aula (lib/reading.ts). Usado pelo editor do professor, pela
// importação do Word e ao colar texto de outro lugar.
// ------------------------------------------------------------------
import { footnotesOf, inline, parseReading, segText, type Block, type Seg } from "./reading";

// números de versículo (<sup>16</sup>) viram algarismos sobrescritos no texto (¹⁶)
const SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const supDigits = (n: string) => n.replace(/\d/g, (d) => SUPS[Number(d)]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function segsHtml(segs: Seg[]) {
  return segs
    .map((s) => {
      let t = esc(s.t);
      if (s.u) t = `<u>${t}</u>`;
      if (s.i) t = `<i>${t}</i>`;
      if (s.b) t = `<b>${t}</b>`;
      return t;
    })
    .join("");
}

// texto de um bloco com as marcas de nota ([^1]) no lugar
function blockHtml(b: Block) {
  if (!b.notes?.length) return segsHtml(b.segs);
  const notes = [...b.notes].sort((x, y) => x.at - y.at);
  const ref = (id: string) => `<sup>[^${esc(id)}]</sup>`;
  let html = "";
  let pos = 0;
  let k = 0;
  for (const sg of b.segs) {
    let t = sg.t;
    let start = pos;
    while (k < notes.length && notes[k].at <= start + t.length) {
      const cut = notes[k].at - start;
      html += segsHtml([{ ...sg, t: t.slice(0, cut) }]) + ref(notes[k].id);
      t = t.slice(cut);
      start = notes[k].at;
      k++;
    }
    html += segsHtml([{ ...sg, t }]);
    pos += sg.t.length;
  }
  while (k < notes.length) html += ref(notes[k++].id);
  return html;
}

// tabela, linha do tempo e fluxo no editor (células editáveis)
export const GRID_CLASS = { table: "r-tabela", timeline: "r-linha", flow: "r-fluxo" } as const;
function gridHtml(b: Block) {
  const rows = b.rows ?? [];
  if (b.type === "flow")
    return `<ol class="${GRID_CLASS.flow}">${rows.map((cells) => `<li>${segsHtml(cells[0] ?? [])}${cells[1]?.length ? ` | ${segsHtml(cells[1])}` : ""}</li>`).join("")}</ol>`;
  const cols = b.type === "timeline" ? 2 : Math.max(1, ...rows.map((r) => r.length));
  const cls = b.type === "timeline" ? GRID_CLASS.timeline : GRID_CLASS.table;
  const tr = rows
    .map((cells, i) => {
      const tag = b.type === "table" && i === 0 ? "th" : "td";
      return `<tr>${Array.from({ length: cols }, (_, k) => `<${tag}>${cells[k]?.length ? segsHtml(cells[k]) : "<br>"}</${tag}>`).join("")}</tr>`;
    })
    .join("");
  return `<table class="${cls}"><tbody>${tr}</tbody></table>`;
}

// texto salvo -> HTML do editor
export function readingToHtml(src: string | undefined): string {
  const blocks = parseReading(src);
  const notes = footnotesOf(blocks);
  if (!blocks.length && !Object.keys(notes).length) return "<p><br></p>";
  let html = "";
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  for (const b of blocks) {
    const inner = blockHtml(b);
    if (b.type === "li" || b.type === "ol") {
      const want = b.type === "li" ? "ul" : "ol";
      if (list !== want) {
        close();
        html += want === "ol" && b.n && b.n !== 1 ? `<ol start="${b.n}">` : `<${want}>`;
        list = want;
      }
      html += `<li>${inner}</li>`;
      continue;
    }
    close();
    if (b.rows) {
      html += gridHtml(b);
      continue;
    }
    if (b.type === "verse") {
      html += `<blockquote class="verse"><p>${inner}</p>${b.ref ? `<cite>${esc(b.ref)}</cite>` : ""}</blockquote>`;
      continue;
    }
    if (b.type === "callout") {
      html += `<p class="destaque">${inner}</p>`;
      continue;
    }
    html += b.type === "h1" ? `<h1>${inner}</h1>` : b.type === "h2" ? `<h2>${inner}</h2>` : b.type === "quote" ? `<blockquote>${inner}</blockquote>` : `<p>${inner}</p>`;
  }
  close();
  // notas de rodapé no fim, como "[^1]: texto"
  for (const [id, text] of Object.entries(notes)) html += `<p class="fn-def">[^${esc(id)}]: ${segsHtml(inline(text))}</p>`;
  return html;
}

// ---------------- HTML -> texto salvo ----------------
type Run = { t: string; b?: boolean; i?: boolean; u?: boolean };
const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "PRE", "FIGURE", "HR"]);
const SKIP = new Set(["SCRIPT", "STYLE", "IMG", "SVG", "VIDEO", "AUDIO", "IFRAME", "OBJECT", "NOSCRIPT", "TITLE", "META", "LINK", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);

function runs(node: Node, f: Omit<Run, "t"> = {}, out: Run[] = []): Run[] {
  if (node.nodeType === 3) {
    out.push({ ...f, t: (node.nodeValue ?? "").replace(/\u200b/g, "").replace(/\s+/g, " ") });
    return out;
  }
  if (node.nodeType !== 1) return out;
  const el = node as HTMLElement;
  if (SKIP.has(el.tagName)) return out;
  if (el.tagName === "BR") {
    out.push({ t: " " });
    return out;
  }
  const st = el.style;
  const g = { ...f };
  if (el.tagName === "B" || el.tagName === "STRONG" || /^(bold|[6-9]00)$/.test(st?.fontWeight ?? "")) g.b = true;
  if (el.tagName === "I" || el.tagName === "EM" || st?.fontStyle === "italic") g.i = true;
  if (el.tagName === "U" || /underline/.test(st?.textDecoration ?? "") || /underline/.test(st?.textDecorationLine ?? "")) g.u = true;
  // alguns editores marcam "não negrito" dentro de um negrito
  if (st?.fontWeight === "normal" || st?.fontWeight === "400") g.b = false;
  for (const c of Array.from(el.childNodes)) runs(c, g, out);
  return out;
}

// junta pedaços com a mesma formatação e põe as marcas sem espaço por dentro
function inlineText(node: Node): string {
  const list = runs(node);
  const merged: Run[] = [];
  for (const r of list) {
    const last = merged.at(-1);
    if (last && Boolean(last.b) === Boolean(r.b) && Boolean(last.i) === Boolean(r.i) && Boolean(last.u) === Boolean(r.u)) last.t += r.t;
    else merged.push({ ...r });
  }
  let out = "";
  for (const r of merged) {
    if (!r.t) continue;
    if (!r.b && !r.i && !r.u) {
      out += r.t;
      continue;
    }
    const m = r.t.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    out += m[2] ? m[1] + segText({ t: m[2], b: r.b, i: r.i, u: r.u }) + m[3] : r.t;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function htmlToReading(root: Node): string {
  const out: string[] = [];
  let para: Node[] = [];
  const flushPara = () => {
    if (!para.length) return;
    const holder = document.createElement("span");
    for (const n of para) holder.appendChild(n.cloneNode(true));
    const t = inlineText(holder);
    if (t) out.push(t);
    para = [];
  };

  const walk = (node: Node) => {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 1 && SKIP.has((c as Element).tagName)) continue;
      if (c.nodeType !== 1 || !BLOCK.has((c as Element).tagName)) {
        para.push(c);
        continue;
      }
      flushPara();
      const el = c as HTMLElement;
      const tag = el.tagName;
      if (tag === "HR") continue;
      if (/^H[1-6]$/.test(tag)) {
        const mark = tag === "H1" ? "#" : "##";
        // título com blocos dentro (ex.: lista): cada linha vira um título
        const parts = Array.from(el.querySelectorAll("li, p, div")).filter((x) => !x.querySelector("li, p, div"));
        for (const t of (parts.length ? parts.map((x) => inlineText(x)) : [inlineText(el)]).map((x) => x.replace(/^\*\*(.*)\*\*$/, "$1"))) // título já é destacado
          if (t) out.push(`${mark} ${t}`);
      } else if (tag === "BLOCKQUOTE" && el.classList.contains("verse")) {
        // versículo em destaque: texto + referência (<cite>)
        const clone = el.cloneNode(true) as HTMLElement;
        const ref = Array.from(clone.querySelectorAll("cite")).map((c) => (c.textContent ?? "").replace(/^[\s—–-]+/, "").trim()).filter(Boolean).join(" ");
        clone.querySelectorAll("cite").forEach((c) => c.remove());
        clone.querySelectorAll("sup").forEach((x) => {
          const t = (x.textContent ?? "").trim();
          x.replaceWith(document.createTextNode(/^\d+$/.test(t) ? supDigits(t) : t));
        });
        const t = inlineText(clone);
        if (t) out.push(`:::versiculo${ref ? ` ${ref}` : ""}\n${t}\n:::`);
      } else if ((tag === "P" || tag === "DIV") && el.classList.contains("destaque")) {
        const t = inlineText(el);
        if (t) out.push(`:::destaque\n${t}\n:::`);
      } else if (tag === "OL" && el.classList.contains("r-fluxo")) {
        const steps = Array.from(el.children)
          .filter((li) => li.tagName === "LI")
          .map((li) => inlineText(li))
          .filter(Boolean);
        if (steps.length) out.push(`:::fluxo\n${steps.join("\n")}\n:::`);
      } else if (tag === "BLOCKQUOTE") {
        const inner = htmlToReading(el).split(/\n{2,}/).filter(Boolean);
        for (const p of inner) out.push(`> ${p.replace(/^(#{1,3}|>|-|\d+\.)\s+/, "")}`);
      } else if (tag === "UL" || tag === "OL") {
        let n = Number(el.getAttribute("start")) || 1;
        const items: string[] = [];
        for (const li of Array.from(el.children)) {
          if (li.tagName !== "LI") continue;
          // sublistas viram itens do mesmo nível
          const nested = Array.from(li.querySelectorAll(":scope > ul > li, :scope > ol > li"));
          const clone = li.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("ul,ol").forEach((x) => x.remove());
          const t = inlineText(clone);
          if (t) items.push(tag === "UL" ? `- ${t}` : `${n++}. ${t}`);
          for (const sub of nested) {
            const st = inlineText(sub);
            if (st) items.push(`- ${st}`);
          }
        }
        if (items.length) out.push(items.join("\n"));
      } else if (tag === "TABLE" || tag === "THEAD" || tag === "TBODY") {
        // tabelas (do editor ou coladas do Word) continuam tabelas; a linha do tempo tem a classe r-linha
        const table = tag === "TABLE" ? el : el.closest("table") ?? el;
        const kind = table.classList.contains("r-linha") ? "linha-do-tempo" : "tabela";
        const rows: string[] = [];
        for (const tr of Array.from(el.querySelectorAll("tr"))) {
          const cells = Array.from(tr.children).map((td) => inlineText(td).replace(/\|/g, "/"));
          if (cells.some(Boolean)) rows.push(cells.join(" | "));
        }
        if (rows.length) out.push(`:::${kind}\n${rows.join("\n")}\n:::`);
      } else if (tag === "LI") {
        const t = inlineText(el);
        if (t) out.push(`- ${t}`);
      } else {
        // p, div, section...: se tiver blocos dentro, entra; senão é um parágrafo
        if (Array.from(el.children).some((x) => BLOCK.has(x.tagName))) walk(el);
        else {
          const t = inlineText(el);
          if (t) out.push(t);
        }
      }
    }
  };
  walk(root);
  flushPara();
  return out.join("\n\n").trim();
}

export function htmlStringToReading(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // notas de rodapé/de fim do Word: <sup><a href="#footnote-1">[1]</a></sup> e <li id="footnote-1">...</li>
  const defs: string[] = [];
  doc.body.querySelectorAll<HTMLElement>('li[id^="footnote-"], li[id^="endnote-"]').forEach((li) => {
    const id = li.id.replace(/^(footnote|endnote)-/, "");
    li.querySelectorAll('a[href^="#footnote-ref"], a[href^="#endnote-ref"]').forEach((a) => a.remove());
    const t = inlineText(li).replace(/\s*↑\s*$/, "");
    if (t) defs.push(`[^${id}]: ${t}`);
    const list = li.parentElement;
    li.remove();
    if (list && !list.children.length) list.remove();
  });
  doc.body.querySelectorAll<HTMLAnchorElement>('a[href^="#footnote-"], a[href^="#endnote-"]').forEach((a) => {
    const id = a.getAttribute("href")!.replace(/^#(footnote|endnote)-/, "");
    let el: HTMLElement = a;
    while (el.parentElement && el.parentElement.tagName === "SUP") el = el.parentElement;
    el.replaceWith(doc.createTextNode(`[^${id}]`));
  });
  const body = htmlToReading(doc.body);
  return defs.length ? `${body}\n\n${defs.join("\n")}` : body;
}

// texto puro (colado) -> formato salvo: linha em branco separa parágrafos
export const plainToReading = (text: string) =>
  text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

// ---------------- Word (.docx) ----------------
export async function docxToReading(blob: Blob): Promise<string> {
  const mammoth = (await import("mammoth/mammoth.browser")) as unknown as {
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }, opts?: object) => Promise<{ value: string }>;
  };
  const { value } = await mammoth.convertToHtml(
    { arrayBuffer: await blob.arrayBuffer() },
    {
      styleMap: [
        "u => u",
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Título'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Subtítulo'] => h2:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Intense Quote'] => blockquote:fresh",
        "p[style-name='Citação'] => blockquote:fresh",
        "p[style-name='Citação Intensa'] => blockquote:fresh",
      ],
    },
  );
  return htmlStringToReading(value); // as imagens do Word ficam de fora do texto
}
