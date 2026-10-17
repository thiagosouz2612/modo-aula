// ------------------------------------------------------------------
// Estado do aplicativo (aulas, pastas, preferências). Fica em memória
// e é gravado no computador logo depois de cada mudança.
// ------------------------------------------------------------------
import { useSyncExternalStore } from "react";
import { native } from "./native";
import { DEFAULT_PREFS, type BLesson, type BFolder, type Prefs, type Store } from "./types";

let state: Store = { lessons: [], folders: [], prefs: DEFAULT_PREFS, versao: 1 };
let loaded = false;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const s of subs) s();
}

export async function loadStore() {
  try {
    const raw = JSON.parse(await native.lerDados()) as Partial<Store> | null;
    if (raw && typeof raw === "object") {
      state = {
        lessons: Array.isArray(raw.lessons) ? raw.lessons : [],
        folders: Array.isArray(raw.folders) ? raw.folders : [],
        prefs: { ...DEFAULT_PREFS, ...(raw.prefs ?? {}) },
        versao: 1,
      };
    }
  } catch {
    /* primeira vez */
  }
  loaded = true;
  emit();
}

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  return native.salvarDados(JSON.stringify(state)).catch(() => {});
}

function set(next: Store) {
  state = next;
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), 500);
}

// grava o que ficou pendente ao fechar (só se houve mudança)
if (typeof window !== "undefined") window.addEventListener("beforeunload", () => void (timer && flush()));

export const store = {
  get: () => state,
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  setPrefs(p: Partial<Prefs>) {
    set({ ...state, prefs: { ...state.prefs, ...p } });
  },
  saveLesson(l: BLesson) {
    const now = { ...l, updatedAt: new Date().toISOString() };
    const has = state.lessons.some((x) => x.id === l.id);
    set({ ...state, lessons: has ? state.lessons.map((x) => (x.id === l.id ? now : x)) : [now, ...state.lessons] });
  },
  /** muda uma aula sem mexer na data (destaques durante a apresentação) */
  patchLesson(id: string, f: (l: BLesson) => BLesson) {
    set({ ...state, lessons: state.lessons.map((x) => (x.id === id ? f(x) : x)) });
  },
  deleteLesson(id: string) {
    set({ ...state, lessons: state.lessons.filter((x) => x.id !== id) });
  },
  /** junta as aulas trazidas da plataforma (a da plataforma substitui a de mesmo id) */
  merge(lessons: BLesson[], folders: BFolder[]) {
    const ids = new Set(lessons.map((l) => l.id));
    const fids = new Set(folders.map((f) => f.id));
    set({
      ...state,
      lessons: [...lessons, ...state.lessons.filter((l) => !ids.has(l.id))],
      folders: [...folders, ...state.folders.filter((f) => !fids.has(f.id))],
    });
  },
};

export function useStore<T>(pick: (s: Store) => T): T {
  return useSyncExternalStore(store.subscribe, () => pick(state));
}
export const useLoaded = () => useSyncExternalStore(store.subscribe, () => loaded);
