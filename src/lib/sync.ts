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
