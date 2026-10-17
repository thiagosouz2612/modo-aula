// ------------------------------------------------------------------
// Apresentações em PDF: abre do computador, desenha o slide e prepara
// a imagem (JPEG) que vai para o projetor.
// ------------------------------------------------------------------
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { native } from "./native";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function openPdf(data: ArrayBuffer) {
  // o pdf.js toma conta do buffer: passa uma cópia
  return pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false }).promise;
}

export function openDeck(fileId: string): Promise<PDFDocumentProxy> {
  let p = docs.get(fileId);
  if (!p) {
    p = native.lerArquivo(fileId).then(openPdf);
    p.catch(() => docs.delete(fileId));
    docs.set(fileId, p);
  }
  return p;
}
export const forgetDeck = (fileId: string) => docs.delete(fileId);

export async function countPages(data: ArrayBuffer) {
  const d = await openPdf(data);
  const n = d.numPages;
  void d.destroy();
  return n;
}

/** desenha a página cabendo em w×h (pixels de verdade) */
export async function renderPage(doc: PDFDocumentProxy, n: number, w: number, h: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const fit = Math.min(w / base.width, h / base.height);
  const vp = page.getViewport({ scale: fit });
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(vp.width));
  c.height = Math.max(1, Math.round(vp.height));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}

const ready = new Map<string, Promise<string>>();

/** imagem do slide para o projetor (feita uma vez por slide) */
export function slideImage(fileId: string, n: number): Promise<string> {
  const id = `${fileId}-p${n}`.replace(/[^\w-]/g, "_").slice(0, 96);
  let p = ready.get(id);
  if (!p) {
    p = (async () => {
      if (await native.temImagem(id)) return id;
      const doc = await openDeck(fileId);
      const c = await renderPage(doc, n, 1920, 1080);
      const blob = await new Promise<Blob>((ok, err) => c.toBlob((b) => (b ? ok(b) : err(new Error("imagem"))), "image/jpeg", 0.9));
      await native.guardarImagem(id, await blob.arrayBuffer());
      return id;
    })();
    p.catch(() => ready.delete(id));
    ready.set(id, p);
  }
  return p;
}
