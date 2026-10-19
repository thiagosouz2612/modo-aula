// ------------------------------------------------------------------
// Ponte com a parte nativa (Rust). Dentro do aplicativo usa o Tauri;
// aberto num navegador comum (para testar a interface) usa um modo de
// demonstração que guarda no navegador.
// ------------------------------------------------------------------
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const isNative = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type Config = { site: string; usuario?: string | null; nome?: string | null; conectado: boolean; pasta: string };
export type BibliaStatus = { arquivos: number; bytes: number; versoes: string[]; originais: number };
export type Progresso = { feitos: number; total: number; falhas: number; fim: boolean; erro?: string | null };
export type Info = { porta: number; enderecos: string[]; telas: number };
export type Monitor = { indice: number; nome: string; largura: number; altura: number; principal: boolean };

const errText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Algo deu errado.");
async function call<T>(cmd: string, args?: Record<string, unknown>, opts?: { headers: Record<string, string> }): Promise<T> {
  try {
    return await invoke<T>(cmd, args as never, opts);
  } catch (e) {
    throw new Error(errText(e));
  }
}

// ---------------- modo de demonstração (navegador) ----------------
const demoFiles = new Map<string, ArrayBuffer>();
const demoTr = new Map<string, string>();
const demoCfg: Config = { site: "https://teologiabethel.com.br", conectado: false, pasta: "(navegador)" };

export const native = {
  lerDados: (): Promise<string> => (isNative ? call("ler_dados") : Promise.resolve(localStorage.getItem("modo-aula") ?? "null")),
  salvarDados: (json: string): Promise<void> => (isNative ? call("salvar_dados", { json }) : Promise.resolve(localStorage.setItem("modo-aula", json))),

  salvarArquivo: async (id: string, data: ArrayBuffer): Promise<void> => {
    if (!isNative) return void demoFiles.set(id, data);
    await call("salvar_arquivo", data as never, { headers: { "x-id": id } });
  },
  lerArquivo: async (id: string): Promise<ArrayBuffer> => {
    if (!isNative) {
      const f = demoFiles.get(id);
      if (!f) throw new Error("Arquivo não encontrado neste computador.");
      return f;
    }
    return call<ArrayBuffer>("ler_arquivo", { id });
  },
  temArquivo: (id: string): Promise<boolean> => (isNative ? call("tem_arquivo", { id }) : Promise.resolve(demoFiles.has(id))),
  apagarArquivo: (id: string): Promise<void> => (isNative ? call("apagar_arquivo", { id }) : Promise.resolve(void demoFiles.delete(id))),

  config: (): Promise<Config> => (isNative ? call("config") : Promise.resolve({ ...demoCfg })),
  definirSite: (site: string): Promise<string> => (isNative ? call("definir_site", { site }) : Promise.resolve((demoCfg.site = site))),

  biblia: async (caminho: string): Promise<ArrayBuffer> => {
    if (!isNative) {
      const r = await fetch(`/biblia-dev/${caminho}`);
      if (!r.ok) throw new Error(r.status === 404 ? "404" : "Bíblia indisponível");
      return r.arrayBuffer();
    }
    return call<ArrayBuffer>("biblia", { caminho });
  },
  bibliaStatus: (): Promise<BibliaStatus> =>
    isNative ? call("biblia_status") : Promise.resolve({ arquivos: 0, bytes: 0, versoes: [], originais: 0 }),
  baixarBiblia: (versoes: string[], originais: boolean): Promise<void> =>
    isNative ? call("baixar_biblia", { versoes, originais }) : Promise.reject(new Error("Disponível no aplicativo.")),
  apagarBiblia: (): Promise<void> => (isNative ? call("apagar_biblia") : Promise.resolve()),

  // roteiros (esboços)
  roteiroLer: (nome: string): Promise<string | null> =>
    isNative ? call("roteiro_ler", { nome }) : Promise.resolve(localStorage.getItem(`roteiro:${nome}`)),
  roteiroSalvar: (nome: string, texto: string): Promise<void> =>
    isNative ? call("roteiro_salvar", { nome, texto }) : Promise.resolve(localStorage.setItem(`roteiro:${nome}`, texto)),
  roteiroApagar: (nome: string): Promise<void> =>
    isNative ? call("roteiro_apagar", { nome }) : Promise.resolve(localStorage.removeItem(`roteiro:${nome}`)),
  plataformaRoteiros: (nota?: string): Promise<string> =>
    isNative ? call("plataforma_roteiros", { nota: nota ?? null }) : Promise.reject(new Error("Disponível no aplicativo.")),
  plataformaRoteirosSalvar: (corpo: unknown): Promise<void> =>
    isNative ? call("plataforma_roteiros_salvar", { corpo: JSON.stringify(corpo) }) : Promise.reject(new Error("Disponível no aplicativo.")),

  plataformaEnviarAulas: (corpo: unknown): Promise<void> =>
    isNative ? call("plataforma_enviar_aulas", { corpo: JSON.stringify(corpo) }) : Promise.reject(new Error("Disponível no aplicativo.")),
  plataformaTemArquivo: (id: string): Promise<boolean> => (isNative ? call("plataforma_tem_arquivo", { id }) : Promise.resolve(false)),
  plataformaEnviarArquivo: (id: string, nome: string): Promise<void> =>
    isNative ? call("plataforma_enviar_arquivo", { id, nome }) : Promise.reject(new Error("Disponível no aplicativo.")),
  /** grava a cópia de segurança em Documentos\Modo Aula (devolve o caminho) */
  salvarCopia: async (conteudo: string, nome: string): Promise<string> => {
    if (isNative) return call("salvar_copia", { conteudo, nome });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([conteudo], { type: "application/json" }));
    a.download = `${nome}.json`;
    a.click();
    return `Downloads/${nome}.json`;
  },

  /** definição do léxico em português (já guardada) */
  traducaoLexico: (strong: string): Promise<string | null> =>
    isNative ? call("traducao_lexico", { strong }) : Promise.resolve(demoTr.get(strong) ?? null),
  /** traduz a definição do léxico (precisa de internet uma vez) */
  traduzirLexico: async (strong: string, texto: string): Promise<string> => {
    if (isNative) return call("traduzir_lexico", { strong, texto });
    const t = texto; // modo de teste (navegador): devolve o próprio texto
    demoTr.set(strong, t);
    return t;
  },

  entrar: (usuario: string, senha: string): Promise<string> =>
    isNative ? call("entrar", { usuario, senha }) : Promise.reject(new Error("Disponível no aplicativo.")),
  sair: (): Promise<void> => (isNative ? call("sair") : Promise.resolve()),
  baixarAulas: (): Promise<string> => (isNative ? call("baixar_aulas") : Promise.reject(new Error("Disponível no aplicativo."))),
  baixarArquivo: (id: string): Promise<number> => (isNative ? call("baixar_arquivo", { id }) : Promise.reject(new Error("Disponível no aplicativo."))),

  transmitir: (estado: string): Promise<void> => {
    if (!isNative) {
      demoChannel?.postMessage(estado);
      return Promise.resolve();
    }
    return call("transmitir", { estado });
  },
  guardarImagem: async (id: string, data: ArrayBuffer): Promise<void> => {
    if (!isNative) return void demoImgs.set(id, URL.createObjectURL(new Blob([data], { type: "image/jpeg" })));
    await call("guardar_imagem", data as never, { headers: { "x-id": id } });
  },
  temImagem: (id: string): Promise<boolean> => (isNative ? call("tem_imagem", { id }) : Promise.resolve(demoImgs.has(id))),
  infoTransmissao: (): Promise<Info> => (isNative ? call("info_transmissao") : Promise.resolve({ porta: 7777, enderecos: ["192.168.0.12"], telas: 0 })),

  listarMonitores: (): Promise<Monitor[]> =>
    isNative
      ? call("listar_monitores")
      : Promise.resolve([
          { indice: 0, nome: "Monitor do notebook", largura: 1920, altura: 1080, principal: true },
          { indice: 1, nome: "Projetor (HDMI)", largura: 1280, altura: 720, principal: false },
        ]),
  abrirProjetor: (monitor: number): Promise<void> => {
    if (!isNative) {
      window.open("/tela.html?demo=1", "tela", "width=960,height=540");
      return Promise.resolve();
    }
    return call("abrir_projetor", { monitor });
  },
  fecharProjetor: (): Promise<void> => (isNative ? call("fechar_projetor") : Promise.resolve()),
};

/** no navegador, a "projeção" de teste ouve por este canal */
export const demoChannel = typeof BroadcastChannel !== "undefined" && !isNative ? new BroadcastChannel("modo-aula-demo") : null;
export const demoImgs = new Map<string, string>();

export function on<T>(event: string, fn: (payload: T) => void): () => void {
  if (!isNative) return () => {};
  let off: UnlistenFn | null = null;
  let dead = false;
  void listen<T>(event, (e) => fn(e.payload)).then((u) => (dead ? u() : (off = u)));
  return () => {
    dead = true;
    off?.();
  };
}

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`.replace(".", ",");
