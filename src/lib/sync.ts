// ------------------------------------------------------------------
// Trazer as aulas do modo aula da plataforma para o computador.
// As apresentações (PDF) também vêm, para a aula abrir sem internet.
// ------------------------------------------------------------------
import { native } from "./native";
import { store } from "./store";
import type { BFolder, BLesson } from "./types";

export type ImportResult = { aulas: number; pdfs: number; falhas: string[] };

export async function importFromPlatform(step: (msg: string) => void): Promise<ImportResult> {
  step("Buscando as aulas na plataforma…");
  const raw = JSON.parse(await native.baixarAulas()) as { lessons?: BLesson[]; folders?: BFolder[] } | BLesson[];
  const lessons = Array.isArray(raw) ? raw : (raw.lessons ?? []);
  const folders = Array.isArray(raw) ? [] : (raw.folders ?? []);
  const { site } = await native.config();
  const em = new Date().toISOString();

  const decks = lessons.filter((l) => l.deck?.fileId);
  const falhas: string[] = [];
  let pdfs = 0;
  for (const [i, l] of decks.entries()) {
    const id = l.deck!.fileId;
    if (await native.temArquivo(id)) continue;
    step(`Baixando apresentação ${i + 1} de ${decks.length}: ${l.deck!.name}`);
    try {
      await native.baixarArquivo(id);
      pdfs++;
    } catch (e) {
      falhas.push(`${l.title}: ${e instanceof Error ? e.message : "falhou"}`);
    }
  }
  store.merge(
    lessons.map((l) => ({ ...l, origem: { site, em } })),
    folders,
  );
  return { aulas: lessons.length, pdfs, falhas };
}

export type EnvioResult = { aulas: number; pdfs: number; falhas: string[] };

/**
 * Guarda na plataforma (nuvem) as aulas deste computador, com os PDFs.
 * Junta com o que já está no site: em cada aula vale a versão mais nova.
 */
export async function enviarParaPlataforma(step: (msg: string) => void): Promise<EnvioResult> {
  step("Conferindo o que já está na plataforma…");
  const raw = JSON.parse(await native.baixarAulas()) as { lessons?: BLesson[]; folders?: BFolder[] } | BLesson[];
  const remoto = Array.isArray(raw) ? raw : (raw.lessons ?? []);
  const pastasRemotas = Array.isArray(raw) ? [] : (raw.folders ?? []);
  const { lessons, folders } = store.get();
  const porId = new Map(remoto.map((l) => [l.id, l]));
  const falhas: string[] = [];
  let pdfs = 0;

  const finais: BLesson[] = [];
  for (const l of lessons) {
    const r = porId.get(l.id);
    porId.delete(l.id);
    const usa = !r || l.updatedAt >= r.updatedAt ? l : r;
    if (usa === l && l.deck) {
      // o PDF também vai para a nuvem
      try {
        if (!(await native.plataformaTemArquivo(l.deck.fileId)) && (await native.temArquivo(l.deck.fileId))) {
          step(`Enviando o PDF de “${l.title}”…`);
          await native.plataformaEnviarArquivo(l.deck.fileId, l.deck.name);
          pdfs++;
        }
      } catch (e) {
        falhas.push(`${l.title}: ${e instanceof Error ? e.message : "PDF não enviado"}`);
      }
    }
    // o site não guarda estes campos do aplicativo
    const { origem: _o, roteiroId: _r, ...limpo } = usa;
    finais.push(limpo);
  }
  // as que só existem no site continuam lá
  finais.push(...porId.values());

  const ids = new Set(folders.map((f) => f.id));
  const pastas = [...folders, ...pastasRemotas.filter((f) => !ids.has(f.id))];
  step("Guardando as aulas na plataforma…");
  await native.plataformaEnviarAulas({ lessons: finais.slice(0, 200), folders: pastas.slice(0, 300) });
  return { aulas: lessons.length, pdfs, falhas };
}
