// ------------------------------------------------------------------
// O que está no projetor agora. Qualquer tela do app (apresentação,
// Bíblia) chama show() e todas as telas conectadas recebem.
// ------------------------------------------------------------------
import { useSyncExternalStore } from "react";
import { native, on, isNative } from "./native";
import type { Scene, Tela } from "./scene";
import { store } from "./store";

type CastState = { tela: Tela; telas: number; porta: number; projetor: boolean; preto: boolean; anterior: Scene | null };

let st: CastState = {
  tela: { s: { k: "logo" }, tema: "noite", escala: 1 },
  telas: 0,
  porta: 0,
  projetor: false,
  preto: false,
  anterior: null,
};
const subs = new Set<() => void>();
const set = (p: Partial<CastState>) => {
  st = { ...st, ...p };
  subs.forEach((f) => f());
};

let last = "";
function send(t: Tela) {
  const j = JSON.stringify(t);
  if (j === last) return;
  last = j;
  void native.transmitir(j).catch(() => {});
}

export const cast = {
  get: () => st,
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
  /** mostra uma cena no projetor */
  show(s: Scene) {
    const { tema, escala } = store.get().prefs;
    const tela: Tela = { s, tema, escala };
    set({ tela, preto: false });
    send(tela);
  },
  /** liga/desliga a tela preta (B) sem perder o que estava */
  toggleBlack() {
    const { tema, escala } = store.get().prefs;
    if (st.preto && st.anterior) {
      const tela: Tela = { s: st.anterior, tema, escala };
      set({ preto: false, anterior: null, tela });
      send(tela);
    } else {
      const anterior = st.tela.s;
      const tela: Tela = { s: { k: "preto" }, tema, escala };
      set({ preto: true, anterior, tela });
      send(tela);
    }
  },
  /** reenvia com o tema/escala atuais */
  refresh() {
    const { tema, escala } = store.get().prefs;
    const tela: Tela = { ...st.tela, tema, escala };
    set({ tela });
    send(tela);
  },
  async openProjector(monitor?: number) {
    const m = monitor ?? store.get().prefs.monitor;
    await native.abrirProjetor(m);
    set({ projetor: true });
  },
  async closeProjector() {
    await native.fecharProjetor();
    set({ projetor: false });
  },
};

export const useCast = () => useSyncExternalStore(cast.subscribe, cast.get);

// contagem de telas conectadas e porta do servidor
export function startCast() {
  void native.infoTransmissao().then((i) => set({ telas: i.telas, porta: i.porta }));
  on<number>("telas", (n) => set({ telas: n }));
  on<number>("transmissao-pronta", (porta) => set({ porta }));
  if (isNative) {
    // a janela do projetor pode ser fechada pelo Windows (Alt+F4)
    void import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
      setInterval(() => {
        void WebviewWindow.getByLabel("tela").then((w) => {
          if (Boolean(w) !== st.projetor) set({ projetor: Boolean(w) });
        });
      }, 1500);
    });
  }
}
