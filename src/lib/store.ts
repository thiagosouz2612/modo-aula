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

/** completa o que faltar numa aula (aulas antigas, da plataforma ou de uma cópia) */
export function normLesson(l: Partial<BLesson> & { id: string }): BLesson {
  const agora = new Date().toISOString();
  const passages = (Array.isArray(l.passages) ? l.passages : [])
    .filter((p) => p && typeof p === "object" && typeof p.ref === "string")
    .map((p) => ({
      ...p,
      id: typeof p.id === "string" && p.id ? p.id : Math.random().toString(36).slice(2, 10),
      versions: Array.isArray(p.versions) && p.versions.length ? p.versions.filter((v) => typeof v === "string") : [DEFAULT_PREFS.versao],
      view: p.view ?? "traducao",
    }));
  return {
    ...l,
    id: String(l.id),
    title: typeof l.title === "string" ? l.title : "",
    passages,
    createdAt: typeof l.createdAt === "string" ? l.createdAt : agora,
    updatedAt: typeof l.updatedAt === "string" ? l.updatedAt : agora,
  };
}
const normLessons = (ls: unknown): BLesson[] =>
  Array.isArray(ls) ? ls.filter((l) => l && typeof l === "object" && typeof l.id === "string" && l.id).map(normLesson) : [];
const normFolders = (fs: unknown): BFolder[] =>
  Array.isArray(fs) ? fs.filter((f) => f && typeof f === "object" && typeof f.id === "string").map((f) => ({ ...f, name: typeof f.name === "string" && f.name ? f.name : "Pasta" })) : [];

export async function loadStore() {
  try {
    const raw = JSON.parse(await native.lerDados()) as Partial<Store> | null;
    if (raw && typeof raw === "object") {
      state = {
        lessons: normLessons(raw.lessons),
        folders: normFolders(raw.folders),
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
  // ---------------- pastas das aulas ----------------
  createFolder(name: string, parentId?: string) {
    const f: BFolder = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.trim() || "Pasta", ...(parentId ? { parentId } : {}) };
    set({ ...state, folders: [...state.folders, f] });
    return f.id;
  },
  renameFolder(id: string, name: string) {
    set({ ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)) });
  },
  /** apaga a pasta: as aulas e subpastas sobem para a pasta de cima */
  deleteFolder(id: string) {
    const f = state.folders.find((x) => x.id === id);
    set({
      ...state,
      folders: state.folders.filter((x) => x.id !== id).map((x) => (x.parentId === id ? { ...x, parentId: f?.parentId } : x)),
      lessons: state.lessons.map((l) => (l.folderId === id ? { ...l, folderId: f?.parentId } : l)),
    });
  },
  moveLesson(id: string, folderId?: string) {
    set({ ...state, lessons: state.lessons.map((l) => (l.id === id ? { ...l, folderId } : l)) });
  },
  deleteLesson(id: string) {
    set({ ...state, lessons: state.lessons.filter((x) => x.id !== id) });
  },
  /** junta as aulas trazidas da plataforma (a da plataforma substitui a de mesmo id) */
  merge(lessons: BLesson[], folders: BFolder[]) {
    lessons = normLessons(lessons);
    folders = normFolders(folders);
    const ids = new Set(lessons.map((l) => l.id));
    const fids = new Set(folders.map((f) => f.id));
    // a pasta e o roteiro escolhidos aqui continuam valendo
    const local = new Map(state.lessons.map((l) => [l.id, l]));
    lessons = lessons.map((l) => {
      const o = local.get(l.id);
      return o ? { ...l, folderId: o.folderId, ...(o.roteiroId ? { roteiroId: o.roteiroId } : {}) } : l;
    });
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
