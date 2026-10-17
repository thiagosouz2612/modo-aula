// ------------------------------------------------------------------
// Converte um PDF em texto de leitura (formato de lib/reading.ts).
// Lê as linhas de cada página e monta parágrafos, títulos (letra maior)
// e listas. Tira número de página, cabeçalho e rodapé repetidos e junta
// palavras quebradas com hífen no fim da linha.
// ------------------------------------------------------------------

type Line = { y: number; x: number; size: number; text: string; bold: boolean; page: number };

type TextItem = { str: string; transform: number[]; height: number; width: number; fontName: string; hasEOL?: boolean };

export async function pdfToReading(blob: Blob, onProgress?: (page: number, total: number) => void): Promise<string> {
  // o mesmo pdf.js das apresentações (já configurado em ./pdf)
  const { openPdf } = await import("./pdf");
  const doc = await openPdf(await blob.arrayBuffer());
  const lines: Line[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      onProgress?.(p, doc.numPages);
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const styles = tc.styles as Record<string, { fontFamily?: string }>;
      const items = (tc.items as TextItem[]).filter((i) => typeof i.str === "string" && i.str.trim() !== "" || i.hasEOL);
      // agrupa os pedaços pela altura na página (mesma linha)
      const rows: { y: number; parts: { x: number; w: number; str: string; size: number; bold: boolean }[] }[] = [];
      for (const it of items) {
        if (!it.str) continue;
        const y = it.transform[5];
        const size = Math.round((it.height || Math.hypot(it.transform[2], it.transform[3])) * 10) / 10;
        const font = `${it.fontName} ${styles[it.fontName]?.fontFamily ?? ""}`;
        const part = { x: it.transform[4], w: it.width, str: it.str, size, bold: /bold|black|heavy|semibold/i.test(font) };
        const row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, size * 0.4));
        if (row) row.parts.push(part);
        else rows.push({ y, parts: [part] });
      }
      for (const r of rows) {
        r.parts.sort((a, b) => a.x - b.x);
        let text = "";
        let end = -Infinity;
        for (const pt of r.parts) {
          // espaço quando há distância entre os pedaços
          if (text && pt.x - end > pt.size * 0.18 && !text.endsWith(" ") && !pt.str.startsWith(" ")) text += " ";
          text += pt.str;
          end = pt.x + pt.w;
        }
        text = text.replace(/\s+/g, " ").trim();
        if (!text) continue;
        const size = Math.max(...r.parts.map((p) => p.size));
        const boldChars = r.parts.filter((p) => p.bold).reduce((n, p) => n + p.str.length, 0);
        lines.push({ y: r.y, x: Math.min(...r.parts.map((p) => p.x)), size, text, bold: boldChars > text.length * 0.6, page: p });
      }
      page.cleanup();
    }
  } finally {
    void doc.destroy();
  }
  return linesToReading(lines, doc.numPages);
}

function linesToReading(all: Line[], pages: number): string {
  // ordem de leitura: página, de cima para baixo
  all.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  // cabeçalho/rodapé: mesma linha (sem números) em muitas páginas
  const norm = (t: string) => t.replace(/\d+/g, "#").toLowerCase();
  // em quantas páginas diferentes cada linha aparece
  const seen = new Map<string, Set<number>>();
  for (const l of all) seen.set(norm(l.text), (seen.get(norm(l.text)) ?? new Set()).add(l.page));
  const freq = new Map([...seen].map(([k, v]) => [k, v.size]));
  // em todas as páginas (PDF de 2+ páginas) ou em metade delas (3+ páginas)
  const repeated = (n: number) => (pages >= 2 && n >= pages) || (pages >= 3 && n >= Math.max(3, pages * 0.5));
  const lines = all.filter(
    (l) => !/^(p[áa]g(ina)?\.?\s*)?\d{1,4}(\s*(de|\/)\s*\d{1,4})?$/i.test(l.text) && !repeated(freq.get(norm(l.text)) ?? 0),
  );
  if (!lines.length) return "";

  // tamanho da letra do corpo do texto (o mais comum, pesado pelo tamanho da linha)
  const weight = new Map<number, number>();
  for (const l of lines) weight.set(Math.round(l.size), (weight.get(Math.round(l.size)) ?? 0) + l.text.length);
  const body = [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // espaço normal entre linhas do corpo
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++)
    if (lines[i].page === lines[i - 1].page && Math.round(lines[i].size) === body && Math.round(lines[i - 1].size) === body) gaps.push(lines[i - 1].y - lines[i].y);
  gaps.sort((a, b) => a - b);
  const lineGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : body * 1.3;
  const leftMargin = lines.filter((l) => Math.round(l.size) === body).map((l) => l.x).sort((a, b) => a - b)[0] ?? 0;

  const out: string[] = [];
  let para = "";
  let paraKind: "p" | "quote" = "p";
  const flush = () => {
    if (para) out.push((paraKind === "quote" ? "> " : "") + para.trim(), "");
    para = "";
  };
  let inList = false;
  const bullet = /^([•●▪◦○■□–\-*])\s*(.+)$/;
  const numbered = /^(\d{1,3})[.)]\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const prev = lines[i - 1];
    const big = l.size >= body * 1.18;
    const heading = big || (l.bold && l.text.length < 90 && !/[.;:,]$/.test(l.text) && (!prev || prev.page !== l.page || prev.y - l.y > lineGap * 1.4));

    if (heading) {
      // título em mais de uma linha: junta com o anterior
      const last = out.at(-2);
      if (!para && last?.startsWith("#") && prev && prev.page === l.page && Math.abs(prev.size - l.size) < 0.5 && prev.y - l.y < l.size * 1.8) {
        out[out.length - 2] = `${last} ${l.text}`;
        continue;
      }
      flush();
      if (inList) { out.push(""); inList = false; }
      out.push(`${l.size >= body * 1.5 ? "#" : "##"} ${l.text}`, "");
      continue;
    }

    const near = prev && prev.page === l.page && prev.y - l.y <= lineGap * 1.45;
    let m: RegExpMatchArray | null;
    if ((m = l.text.match(bullet))) { flush(); out.push(`- ${m[2]}`); inList = true; continue; }
    if ((m = l.text.match(numbered))) { flush(); out.push(`${m[1]}. ${m[2]}`); inList = true; continue; }
    // linha que continua o item de lista anterior
    if (inList && near) { out[out.length - 1] = joinText(out[out.length - 1], l.text); continue; }
    if (inList) { out.push(""); inList = false; }

    const isQuote = l.x - leftMargin > body * 2.2 && Math.round(l.size) <= body;
    const newPara =
      !near && !(prev && prev.page !== l.page && !/[.!?:"”]$/.test(para)) // quebra de página no meio da frase: continua
      || (l.x - leftMargin > body * 1.2 && !isQuote && /[.!?:"”]$/.test(prev?.text ?? "")) // recuo de primeira linha
      || (para !== "" && (isQuote ? "quote" : "p") !== paraKind);
    if (newPara) flush();
    if (!para) paraKind = isQuote ? "quote" : "p";
    para = para ? joinText(para, l.text) : l.text;
  }
  flush();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// junta duas linhas; tira o hífen de palavra quebrada ("pala-" + "vra")
function joinText(a: string, b: string) {
  if (/[A-Za-zÀ-ÿ]-$/.test(a) && /^[a-zà-ÿ]/.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}
