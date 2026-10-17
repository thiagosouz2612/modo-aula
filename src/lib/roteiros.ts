// ------------------------------------------------------------------
// Roteiros (esboços de aula, sermões, estudos): os mesmos da plataforma.
// Ficam guardados no computador (funcionam sem internet) e, com o
// login da plataforma, são sincronizados com o site nos dois sentidos.
// O editor, os modelos e a limpeza do HTML são os mesmos do site.
// ------------------------------------------------------------------
import { useSyncExternalStore } from "react";
import { native } from "./native";

export type Kind = "aula" | "sermao" | "estudo" | "devocional" | "outro";

export type RFolder = { id: string; name: string; parentId?: string; color?: string; createdAt: string };

export type RNote = {
  /** última vez que esteve igual à plataforma (sincronizado) */
  syncedAt?: string;
  id: string;
  title: string;
  icon?: string; // emoji
  kind: Kind;
  folderId?: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
  excerpt: string; // começo do texto (para os cartões e a busca)
  words: number;
};

export type RIndex = { v: 1; folders: RFolder[]; notes: RNote[] };

export const EMPTY_INDEX: RIndex = { v: 1, folders: [], notes: [] };

export const MAX_NOTE_CHARS = 600_000; // ~ 300 páginas
export const MAX_INDEX_CHARS = 1_500_000;

export const KINDS: Record<Kind, { label: string; plural: string; icon: string; color: string }> = {
  aula: { label: "Aula", plural: "Aulas", icon: "🎓", color: "#a91d1e" },
  sermao: { label: "Sermão", plural: "Sermões", icon: "📖", color: "#7a4b12" },
  estudo: { label: "Estudo bíblico", plural: "Estudos bíblicos", icon: "🔎", color: "#1f5f8b" },
  devocional: { label: "Devocional", plural: "Devocionais", icon: "🙏", color: "#2f7a4f" },
  outro: { label: "Anotação", plural: "Anotações", icon: "📝", color: "#5f5a5a" },
};

export const isKind = (k: unknown): k is Kind => typeof k === "string" && k in KINDS;


type State = { status: "loading" | "ready"; index: RIndex; sync: "idle" | "syncing" | "ok" | "offline" | "error"; syncMsg?: string; at?: string };
let state: State = { status: "loading", index: EMPTY_INDEX, sync: "idle" };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const useRoteiros = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );

const IDX = "indice.json";
const fileOf = (id: string) => `${id}.html`;
/** ids apagados aqui e ainda não apagados na plataforma */
let apagados: string[] = [];

export async function loadRoteiros() {
  if (state.status === "ready") return;
  try {
    const raw = JSON.parse((await native.roteiroLer(IDX)) ?? "null") as (RIndex & { apagados?: string[] }) | null;
    if (raw?.notes) {
      apagados = raw.apagados ?? [];
      set({ status: "ready", index: { v: 1, folders: raw.folders ?? [], notes: raw.notes } });
      return;
    }
  } catch {
    /* primeira vez */
  }
  set({ status: "ready", index: EMPTY_INDEX });
}

let idxTimer: ReturnType<typeof setTimeout> | null = null;
function saveIndex(index: RIndex) {
  set({ index });
  if (idxTimer) clearTimeout(idxTimer);
  idxTimer = setTimeout(() => {
    idxTimer = null;
    void native.roteiroSalvar(IDX, JSON.stringify({ ...state.index, apagados }));
    scheduleSync();
  }, 400);
}

const now = () => new Date().toISOString();
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const contentCache = new Map<string, string>();

export async function getContent(id: string): Promise<string> {
  if (contentCache.has(id)) return contentCache.get(id)!;
  const html = (await native.roteiroLer(fileOf(id))) ?? "";
  contentCache.set(id, html);
  return html;
}

export async function saveContent(id: string, html: string) {
  contentCache.set(id, html);
  patchNote(id, { ...summarize(html), updatedAt: now() });
  await native.roteiroSalvar(fileOf(id), html);
}

export function createNote(opts: { kind: Kind; folderId?: string; template?: string; title?: string; html?: string }): string {
  const id = uid();
  const t = TEMPLATES.find((x) => x.id === opts.template);
  const html = opts.html ?? t?.html ?? "<p><br></p>";
  const note: RNote = { id, title: opts.title ?? "", kind: opts.kind, folderId: opts.folderId, createdAt: now(), updatedAt: now(), ...summarize(html) };
  contentCache.set(id, html);
  void native.roteiroSalvar(fileOf(id), html);
  saveIndex({ ...state.index, notes: [note, ...state.index.notes] });
  return id;
}

export function patchNote(id: string, patch: Partial<RNote>, touch = false) {
  saveIndex({
    ...state.index,
    notes: state.index.notes.map((n) => (n.id === id ? { ...n, ...patch, ...(touch ? { updatedAt: now() } : {}) } : n)),
  });
}

export async function duplicateNote(id: string) {
  const n = state.index.notes.find((x) => x.id === id);
  if (!n) return;
  const html = await getContent(id);
  return createNote({ kind: n.kind, folderId: n.folderId, title: `${n.title || "Sem título"} (cópia)`, html });
}

export function deleteNote(id: string) {
  const n = state.index.notes.find((x) => x.id === id);
  if (n?.syncedAt) apagados = [...apagados, id];
  contentCache.delete(id);
  void native.roteiroApagar(fileOf(id));
  saveIndex({ ...state.index, notes: state.index.notes.filter((x) => x.id !== id) });
}

export function createFolder(name: string, parentId?: string) {
  const f: RFolder = { id: uid(), name: name.trim() || "Pasta", parentId, createdAt: now() };
  saveIndex({ ...state.index, folders: [...state.index.folders, f] });
  return f.id;
}
export function renameFolder(id: string, name: string) {
  saveIndex({ ...state.index, folders: state.index.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)) });
}
export function deleteFolder(id: string) {
  const f = state.index.folders.find((x) => x.id === id);
  saveIndex({
    folders: state.index.folders.filter((x) => x.id !== id).map((x) => (x.parentId === id ? { ...x, parentId: f?.parentId } : x)),
    notes: state.index.notes.map((n) => (n.folderId === id ? { ...n, folderId: f?.parentId } : n)),
    v: 1,
  });
}

// ---------------- sincronizar com a plataforma ----------------
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let conectado = false;
export function setConectado(v: boolean) {
  conectado = v;
}
function scheduleSync() {
  if (!conectado) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncRoteiros(), 4000);
}

let syncing: Promise<void> | null = null;
/** traz o que mudou no site e envia o que mudou aqui (vale o mais recente) */
export function syncRoteiros(): Promise<void> {
  syncing ??= doSync().finally(() => (syncing = null));
  return syncing;
}

async function doSync() {
  await loadRoteiros();
  set({ sync: "syncing", syncMsg: undefined });
  let remote: RIndex;
  try {
    const r = JSON.parse(await native.plataformaRoteiros()) as { index?: RIndex };
    remote = { v: 1, folders: r.index?.folders ?? [], notes: r.index?.notes ?? [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return set({ sync: /entre com o seu login|sessão/i.test(msg) ? "error" : "offline", syncMsg: msg });
  }
  try {
    const stamp = now();
    const local = state.index;
    const byId = new Map(local.notes.map((n) => [n.id, n]));
    const remoteIds = new Set(remote.notes.map((n) => n.id));
    const out: RNote[] = [];
    // 1) o que está no site
    for (const r of remote.notes) {
      if (apagados.includes(r.id)) continue; // apagado aqui
      const l = byId.get(r.id);
      if (!l || r.updatedAt > l.updatedAt) {
        const { html } = JSON.parse(await native.plataformaRoteiros(r.id)) as { html?: string };
        await native.roteiroSalvar(fileOf(r.id), html ?? "");
        contentCache.set(r.id, html ?? "");
        out.push({ ...r, syncedAt: stamp });
      } else if (l.updatedAt > r.updatedAt) {
        await native.plataformaRoteirosSalvar({ action: "nota", id: l.id, html: await getContent(l.id) });
        out.push({ ...l, syncedAt: stamp });
      } else out.push({ ...l, syncedAt: stamp });
    }
    // 2) o que só existe aqui: novo (envia) ou apagado no site (apaga aqui)
    for (const l of local.notes) {
      if (remoteIds.has(l.id)) continue;
      if (l.syncedAt && l.updatedAt <= l.syncedAt) {
        await native.roteiroApagar(fileOf(l.id));
        contentCache.delete(l.id);
        continue;
      }
      await native.plataformaRoteirosSalvar({ action: "nota", id: l.id, html: await getContent(l.id) });
      out.push({ ...l, syncedAt: stamp });
    }
    // pastas: junta as duas listas
    const fids = new Set(remote.folders.map((f) => f.id));
    const folders = [...remote.folders, ...local.folders.filter((f) => !fids.has(f.id))];
    const index: RIndex = { v: 1, folders, notes: out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
    await native.plataformaRoteirosSalvar({ action: "index", index: { ...index, notes: index.notes.map(({ syncedAt: _s, ...n }) => n) } });
    apagados = [];
    set({ index, sync: "ok", at: stamp });
    await native.roteiroSalvar(IDX, JSON.stringify({ ...index, apagados }));
  } catch (e) {
    set({ sync: "error", syncMsg: e instanceof Error ? e.message : "Não foi possível sincronizar." });
  }
}

// ---------------- texto ----------------
export function summarize(html: string): { excerpt: string; words: number } {
  if (typeof document === "undefined") return { excerpt: "", words: 0 };
  const d = document.createElement("div");
  d.innerHTML = html;
  d.querySelectorAll("p,h1,h2,h3,li,blockquote,aside,cite").forEach((el) => el.append(" "));
  const text = (d.textContent ?? "").replace(/\s+/g, " ").trim();
  return { excerpt: text.slice(0, 220), words: text ? text.split(" ").length : 0 };
}

/** minutos de fala (pregação/aula falada: ~120 palavras por minuto) */
export const speakMinutes = (words: number) => Math.max(1, Math.round(words / 120));

/** cores do marca-texto (a primeira é a padrão, sem atributo no HTML) */
export const MARKERS = [
  { id: "amarelo", label: "Amarelo", hex: "#fde68a" },
  { id: "rosa", label: "Rosa", hex: "#fbcfe8" },
  { id: "verde", label: "Verde", hex: "#bbf7d0" },
  { id: "azul", label: "Azul", hex: "#bfdbfe" },
  { id: "laranja", label: "Laranja", hex: "#fed7aa" },
  { id: "roxo", label: "Roxo", hex: "#e9d5ff" },
  { id: "vermelho", label: "Vermelho", hex: "#fecaca" },
] as const;
const MARKER_IDS = new Set<string>(MARKERS.map((m) => m.id));

/** cor mais próxima da paleta (para o que vem como rgb/hex do navegador ou de outro editor) */
function nearestMarker(css: string): string {
  let rgb: number[] | null = null;
  const m = css.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = css.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  if (!rgb && h) {
    const x = h[1].length === 3 ? h[1].split("").map((c) => c + c).join("") : h[1];
    rgb = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  }
  if (!rgb) return "amarelo";
  let best: string = "amarelo";
  let dist = Infinity;
  for (const mk of MARKERS) {
    const c = [1, 3, 5].map((i) => parseInt(mk.hex.slice(i, i + 2), 16));
    const d = c.reduce((s, v, i) => s + (v - rgb![i]) ** 2, 0);
    if (d < dist) (dist = d), (best = mk.id);
  }
  return best;
}

const ALLOWED = new Set(["P", "H1", "H2", "H3", "BLOCKQUOTE", "CITE", "ASIDE", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "U", "MARK", "BR", "HR", "A", "SUB", "SUP", "S"]);
const BLOCK_LIKE = new Set(["DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "TABLE", "TR", "FIGURE"]);

/** deixa só o que o editor entende (também limpa o que vem colado de Word, sites, etc.) */
export function sanitize(html: string): string {
  if (typeof document === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      walk(child);
      const tag = child.tagName;
      let target: Element = child;
      if (tag === "SPAN" || tag === "FONT") {
        const style = (child.getAttribute("style") ?? "").toLowerCase();
        const bg = /background(-color)?\s*:\s*(?!transparent|rgba\(0, 0, 0, 0\)|initial|inherit)/.test(style);
        const bold = /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
        const ital = /font-style\s*:\s*italic/.test(style);
        if (bg || bold || ital) {
          const wrap = doc.createElement(bg ? "mark" : bold ? "b" : "i");
          if (bg) {
            const c = nearestMarker(style.match(/background(-color)?\s*:\s*([^;]+)/)?.[2] ?? "");
            if (c !== "amarelo") wrap.setAttribute("data-c", c);
          }
          while (child.firstChild) wrap.appendChild(child.firstChild);
          child.replaceWith(wrap);
          target = wrap;
        } else {
          child.replaceWith(...child.childNodes);
          continue;
        }
      } else if (tag === "H4" || tag === "H5" || tag === "H6") {
        const h = doc.createElement("h3");
        while (child.firstChild) h.appendChild(child.firstChild);
        child.replaceWith(h);
        target = h;
      } else if (BLOCK_LIKE.has(tag) || tag === "TD" || tag === "TH") {
        const hasBlocks = [...child.children].some((c) => /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE|ASIDE|HR)$/.test(c.tagName));
        if (hasBlocks) {
          child.replaceWith(...child.childNodes);
          continue;
        }
        const p = doc.createElement("p");
        while (child.firstChild) p.appendChild(child.firstChild);
        child.replaceWith(p);
        target = p;
      } else if (!ALLOWED.has(tag)) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|META|LINK|TITLE|SVG|IMG|VIDEO|AUDIO|CANVAS|INPUT|BUTTON|SELECT|TEXTAREA|NOSCRIPT|TEMPLATE)$/.test(tag)) child.remove();
        else child.replaceWith(...child.childNodes);
        continue;
      }
      // atributos permitidos
      for (const a of [...target.attributes]) {
        const n = a.name;
        const keep =
          (n === "href" && target.tagName === "A" && /^(https?:|mailto:)/i.test(a.value)) ||
          (n === "class" && /^(UL|ASIDE|BLOCKQUOTE)$/.test(target.tagName) && /^(check|callout|verse)$/.test(a.value)) ||
          (n === "data-done" && target.tagName === "LI") ||
          (n === "data-c" && target.tagName === "MARK" && MARKER_IDS.has(a.value)) ||
          (n === "data-icon" && target.tagName === "ASIDE");
        if (!keep) target.removeAttribute(n);
      }
      if (target.tagName === "A") {
        target.setAttribute("target", "_blank");
        target.setAttribute("rel", "noopener noreferrer");
      }
    }
  };
  walk(root);
  // texto solto no nível de cima vira parágrafo
  for (const node of [...root.childNodes]) {
    if (node.nodeType === 3 && node.textContent?.trim()) {
      const p = doc.createElement("p");
      node.replaceWith(p);
      p.appendChild(node);
    } else if (node.nodeType === 1 && /^(B|STRONG|I|EM|U|MARK|A|S|SUB|SUP|BR)$/.test((node as Element).tagName)) {
      const p = doc.createElement("p");
      node.replaceWith(p);
      p.appendChild(node);
    } else if (node.nodeType === 8) node.remove();
  }
  return root.innerHTML;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** texto puro colado: linhas viram parágrafos e "# ", "> ", "- " viram título, citação e lista */
export function plainToHtml(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!l.trim()) {
      close();
      continue;
    }
    if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) {
      if (list !== "ul") (close(), out.push("<ul>"), (list = "ul"));
      out.push(`<li>${escapeHtml(m[1])}</li>`);
      continue;
    }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (list !== "ol") (close(), out.push("<ol>"), (list = "ol"));
      out.push(`<li>${escapeHtml(m[1])}</li>`);
      continue;
    }
    close();
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) out.push(`<h${m[1].length}>${escapeHtml(m[2])}</h${m[1].length}>`);
    else if ((m = l.match(/^>\s?(.*)$/))) out.push(`<blockquote><p>${escapeHtml(m[1])}</p></blockquote>`);
    else out.push(`<p>${escapeHtml(l)}</p>`);
  }
  close();
  return out.join("");
}

// ---------------- modelos ----------------
export const TEMPLATES: { id: string; kind: Kind; title: string; text: string; html: string }[] = [
  {
    id: "branco",
    kind: "outro",
    title: "Em branco",
    text: "Comece do zero. Digite / para inserir títulos, citações, versículos e listas.",
    html: "<p><br></p>",
  },
  {
    id: "aula",
    kind: "aula",
    title: "Roteiro de aula",
    text: "Objetivo, introdução, tópicos, aplicação e o que levar para a sala.",
    html: [
      '<aside class="callout" data-icon="🎯"><p><b>Objetivo da aula:</b> ao final, o aluno será capaz de…</p></aside>',
      "<h2>Introdução</h2><p>Pergunta ou situação para abrir a aula.</p>",
      "<h2>Desenvolvimento</h2><h3>1. Primeiro tópico</h3><p></p><h3>2. Segundo tópico</h3><p></p><h3>3. Terceiro tópico</h3><p></p>",
      "<h2>Aplicação</h2><p>Como isso muda a vida e o ministério do aluno?</p>",
      "<h2>Conclusão</h2><p></p>",
      "<hr>",
      '<h3>Antes da aula</h3><ul class="check"><li>Conferir os slides</li><li>Levar a lista de chamada</li><li>Separar os textos bíblicos</li></ul>',
    ].join(""),
  },
  {
    id: "sermao",
    kind: "sermao",
    title: "Sermão",
    text: "Texto base, tema, proposição, pontos com ilustrações e apelo.",
    html: [
      '<aside class="callout" data-icon="📖"><p><b>Texto base:</b> clique em “Versículo” (ou digite /versículo) para trazer o texto da Bíblia.</p></aside>',
      "<p><b>Tema:</b> </p><p><b>Proposição:</b> </p>",
      "<h2>Introdução</h2><p></p>",
      "<h2>I. Primeiro ponto</h2><p></p>",
      '<aside class="callout" data-icon="💡"><p><b>Ilustração:</b> </p></aside>',
      "<h2>II. Segundo ponto</h2><p></p>",
      "<h2>III. Terceiro ponto</h2><p></p>",
      "<h2>Conclusão e apelo</h2><p></p>",
    ].join(""),
  },
  {
    id: "estudo",
    kind: "estudo",
    title: "Estudo bíblico",
    text: "Passagem, contexto, observação, interpretação, aplicação e perguntas.",
    html: [
      '<aside class="callout" data-icon="📖"><p><b>Passagem:</b> clique em “Versículo” para trazer o texto da Bíblia.</p></aside>',
      "<h2>Contexto</h2><p>Autor, destinatários, época e propósito.</p>",
      "<h2>Observação</h2><p>O que o texto diz?</p>",
      "<h2>Interpretação</h2><p>O que o texto significava para os primeiros leitores?</p>",
      "<h2>Aplicação</h2><p>O que o texto pede de nós hoje?</p>",
      "<h2>Perguntas para o grupo</h2><ol><li></li><li></li><li></li></ol>",
    ].join(""),
  },
  {
    id: "devocional",
    kind: "devocional",
    title: "Devocional",
    text: "Versículo, reflexão curta e oração.",
    html: [
      '<aside class="callout" data-icon="📖"><p><b>Versículo do dia:</b> clique em “Versículo” para trazer o texto da Bíblia.</p></aside>',
      "<h2>Reflexão</h2><p></p>",
      '<aside class="callout" data-icon="🙏"><p><b>Oração:</b> </p></aside>',
    ].join(""),
  },
];

export const ICONS = ["📝", "🎓", "📖", "🔎", "🙏", "✝️", "🕊️", "🔥", "💡", "⛪", "📜", "🗝️", "⭐", "❤️", "🌱", "🍞", "🍷", "👑", "⚖️", "🌍", "📅", "🎯", "🧭", "🎤"];
export const FOLDER_COLORS = ["#a91d1e", "#c2410c", "#a16207", "#2f7a4f", "#1f5f8b", "#6d28d9", "#5f5a5a"];

// ---------------- datas ----------------
export function ago(iso: string) {
  const d = Date.now() - Date.parse(iso);
  const min = Math.round(d / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: days > 300 ? "numeric" : undefined });
}

// ---------------- importar do Word (ou PDF) ----------------
export async function importFile(file: File): Promise<{ title: string; html: string }> {
  const name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (/\.docx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = (await import("mammoth/mammoth.browser")) as unknown as {
      convertToHtml: (input: { arrayBuffer: ArrayBuffer }, opts?: object) => Promise<{ value: string }>;
    };
    const { value } = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        styleMap: [
          "u => u",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Título'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Subtítulo'] => h2:fresh",
          "p[style-name='Título 1'] => h1:fresh",
          "p[style-name='Título 2'] => h2:fresh",
          "p[style-name='Título 3'] => h3:fresh",
          "p[style-name='Quote'] => blockquote > p:fresh",
          "p[style-name='Intense Quote'] => blockquote > p:fresh",
          "p[style-name='Citação'] => blockquote > p:fresh",
          "p[style-name='Citação Intensa'] => blockquote > p:fresh",
          "highlight => mark",
        ],
      },
    );
    return splitTitle(sanitize(value), name);
  }
  if (/\.(txt|md)$/i.test(file.name) || file.type.startsWith("text/")) return splitTitle(plainToHtml(await file.text()), name);
  throw new Error("Use um arquivo do Word (.docx) ou de texto (.txt).");
}

/** se o documento começa com um título, ele vira o título do roteiro */
function splitTitle(html: string, fallback: string) {
  const d = document.createElement("div");
  d.innerHTML = html;
  // tira linhas vazias do começo
  while (d.firstElementChild && !d.firstElementChild.textContent?.trim() && d.firstElementChild.tagName !== "HR") d.firstElementChild.remove();
  const first = d.firstElementChild;
  let title = fallback;
  if (first && /^H[12]$/.test(first.tagName) && (first.textContent ?? "").trim().length <= 150) {
    title = first.textContent!.trim();
    first.remove();
  }
  return { title, html: d.innerHTML || "<p><br></p>" };
}

