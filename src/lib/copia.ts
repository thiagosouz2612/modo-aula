// ------------------------------------------------------------------
// Cópia de segurança em arquivo: aulas, pastas, ajustes e roteiros
// num único .json (os PDFs ficam de fora: vão para a plataforma).
// ------------------------------------------------------------------
import { native } from "./native";
import { getContent, loadRoteiros, restaurarRoteiros, useRoteirosState } from "./roteiros";
import { store } from "./store";
import type { Store } from "./types";

type Copia = { app: "modo-aula"; versao: 1; em: string; dados: Store; roteiros: { index: ReturnType<typeof useRoteirosState>["index"]; textos: Record<string, string> } };

export async function salvarCopia(): Promise<string> {
  await loadRoteiros();
  const { index } = useRoteirosState();
  const textos: Record<string, string> = {};
  for (const n of index.notes) textos[n.id] = await getContent(n.id);
  const em = new Date().toISOString();
  const copia: Copia = { app: "modo-aula", versao: 1, em, dados: store.get(), roteiros: { index, textos } };
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const nome = `Modo Aula - copia ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}h${p2(d.getMinutes())}`;
  return native.salvarCopia(JSON.stringify(copia), nome);
}

/** junta a cópia com o que já está no computador (o que existe aqui não é apagado) */
export async function restaurarCopia(file: File): Promise<{ aulas: number; roteiros: number }> {
  let c: Copia;
  try {
    c = JSON.parse(await file.text());
  } catch {
    throw new Error("Este arquivo não é uma cópia do Modo Aula.");
  }
  if (c?.app !== "modo-aula" || !c.dados) throw new Error("Este arquivo não é uma cópia do Modo Aula.");
  store.merge(c.dados.lessons ?? [], c.dados.folders ?? []);
  const n = await restaurarRoteiros(c.roteiros?.index, c.roteiros?.textos ?? {});
  return { aulas: c.dados.lessons?.length ?? 0, roteiros: n };
}
