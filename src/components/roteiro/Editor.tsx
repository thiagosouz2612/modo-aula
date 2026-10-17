// ------------------------------------------------------------------
// Editor dos roteiros, no espírito do Notion: escreve-se direto na
// página; "/" abre o menu de blocos; atalhos de Markdown ("# ", "> ",
// "- ", "1. ", "[] ", "---") viram título, citação, listas e divisor;
// a barra de cima tem o essencial para quem prefere clicar.
// ------------------------------------------------------------------
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MARKERS, escapeHtml, importFile, plainToHtml, sanitize } from "../../lib/roteiros";
import { loadCatalog, parseRef, passage, type Catalog } from "../../lib/bible";

export type EditorHandle = { flush: () => void; scrollToHeading: (i: number) => void; focus: () => void };

type Fmt = { block: string; b: boolean; i: boolean; u: boolean; mark: boolean; ul: boolean; ol: boolean; check: boolean };
const NONE: Fmt = { block: "p", b: false, i: false, u: false, mark: false, ul: false, ol: false, check: false };

const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const CALLOUT_ICONS = ["💡", "🎯", "⚠️", "🙏", "📌", "❓", "🔥", "✝️"];

type Cmd = { id: string; label: string; hint: string; keys: string; icon: React.ReactNode; shortcut?: string };
const COMMANDS: Cmd[] = [
  { id: "p", label: "Texto", hint: "Parágrafo comum", keys: "texto paragrafo normal", icon: <span className="text-[15px]">Aa</span> },
  { id: "h1", label: "Título", hint: "Título grande da seção", keys: "titulo h1 grande", icon: <span className="font-serif text-base font-bold">T</span>, shortcut: "#" },
  { id: "h2", label: "Subtítulo", hint: "Ponto ou parte da nota", keys: "subtitulo h2 ponto parte", icon: <span className="font-serif text-sm font-bold">T</span>, shortcut: "##" },
  { id: "h3", label: "Tópico", hint: "Item menor dentro de um ponto", keys: "topico h3 item", icon: <span className="text-xs font-bold">T</span>, shortcut: "###" },
  { id: "ul", label: "Lista com marcadores", hint: "Itens soltos", keys: "lista marcadores bullet", icon: <Glyph d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />, shortcut: "-" },
  { id: "ol", label: "Lista numerada", hint: "Passos em ordem", keys: "lista numerada numeros ordem", icon: <Glyph d="M10 6h10M10 12h10M10 18h10M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />, shortcut: "1." },
  { id: "check", label: "Lista de tarefas", hint: "O que preparar ou fazer", keys: "tarefas checklist caixa marcar fazer", icon: <Glyph d="M4 5h4v4H4zM4 15h4v4H4zM11 7h9M11 17h9M5 7l1 1 2-2" />, shortcut: "[]" },
  { id: "quote", label: "Citação", hint: "Frase de um autor ou trecho", keys: "citacao frase autor aspas", icon: <Glyph d="M7 7h4v4c0 3-2 5-4 5M14 7h4v4c0 3-2 5-4 5" />, shortcut: ">" },
  { id: "verse", label: "Versículo bíblico", hint: "Busca o texto na Bíblia (ex.: Jo 3:16)", keys: "versiculo biblia texto passagem referencia", icon: <span className="text-base">📖</span> },
  { id: "callout", label: "Destaque", hint: "Caixa para ilustração, alerta ou oração", keys: "destaque caixa ilustracao alerta nota callout", icon: <span className="text-base">💡</span> },
  { id: "hr", label: "Divisor", hint: "Linha separando as partes", keys: "divisor linha separador", icon: <Glyph d="M4 12h16" />, shortcut: "---" },
];

export const RoteiroEditor = forwardRef<EditorHandle, { html: string; onChange: (html: string) => void; onOutline?: () => void }>(function RoteiroEditor(
  { html, onChange, onOutline },
  handle,
) {
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<string>("");
  const [fmt, setFmt] = useState<Fmt>(NONE);
  const [slash, setSlash] = useState<{ x: number; y: number; up: boolean; query: string; sel: number } | null>(null);
  const slashAt = useRef<{ node: Node; offset: number } | null>(null);
  const [verseOpen, setVerseOpen] = useState(false);
  const savedRange = useRef<Range | null>(null);
  const [insertMenu, setInsertMenu] = useState(false);
  const [markColor, setMarkColor] = useState<string>("amarelo");
  const [markMenu, setMarkMenu] = useState(false);
  const markBtn = useRef<HTMLButtonElement>(null);
  const insertBtn = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // alça ao lado do bloco (como no Notion): + insere um bloco, ⠿ arrasta ou abre opções
  const [hover, setHover] = useState<{ el: HTMLElement; top: number } | null>(null);
  const [blockMenu, setBlockMenu] = useState<HTMLElement | null>(null);
  const [plusMenu, setPlusMenu] = useState<HTMLElement | null>(null);
  const [plusQuery, setPlusQuery] = useState("");
  const plusBtn = useRef<HTMLButtonElement>(null);
  const dragging = useRef<HTMLElement | null>(null);
  const [drop, setDrop] = useState<{ top: number; el: HTMLElement; after: boolean } | null>(null);
  const handleBtn = useRef<HTMLButtonElement>(null);
  const [importing, setImporting] = useState("");

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const outlineRef = useRef(onOutline);
  outlineRef.current = onOutline;

  // carrega o texto uma vez (o editor é recriado ao trocar de roteiro)
  useEffect(() => {
    if (!root.current) return;
    const clean = sanitize(html) || "<p><br></p>";
    root.current.innerHTML = clean;
    last.current = clean;
    exec("defaultParagraphSeparator", "p");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!root.current) return;
    const v = sanitize(root.current.innerHTML);
    if (v === last.current) return;
    last.current = v;
    onChangeRef.current(v);
    outlineRef.current?.();
  }, []);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(emit, 600);
  }, [emit]);
  useEffect(() => () => emit(), [emit]);

  useImperativeHandle(handle, () => ({
    flush: emit,
    focus: () => root.current?.focus(),
    scrollToHeading: (i) => {
      const h = root.current?.querySelectorAll("h1,h2,h3")[i] as HTMLElement | undefined;
      h?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }));

  // ------------------------------------------------ onde está o cursor
  const topBlock = (n: Node | null): HTMLElement | null => {
    const r = root.current;
    while (n && n.parentNode !== r) n = n.parentNode;
    return (n as HTMLElement) ?? null;
  };
  const caretBlock = (): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !root.current?.contains(sel.anchorNode)) return null;
    let n: Node | null = sel.anchorNode;
    while (n && n !== root.current) {
      if (n.nodeType === 1 && /^(P|H1|H2|H3|LI|CITE)$/.test((n as Element).tagName)) return n as HTMLElement;
      n = n.parentNode;
    }
    return null;
  };

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      const r = root.current;
      if (!r || !sel?.rangeCount || !r.contains(sel.anchorNode)) return;
      const blockTag = String(document.queryCommandValue("formatBlock") || "p").toLowerCase().replace(/[<>]/g, "");
      const anchor = sel.anchorNode?.nodeType === 1 ? (sel.anchorNode as Element) : sel.anchorNode?.parentElement;
      const inQuote = anchor?.closest("blockquote");
      const next: Fmt = {
        block: inQuote ? "quote" : blockTag === "div" ? "p" : blockTag,
        b: document.queryCommandState("bold"),
        i: document.queryCommandState("italic"),
        u: document.queryCommandState("underline"),
        mark: Boolean(anchor?.closest("mark, span[style*='background']")),
        ul: document.queryCommandState("insertUnorderedList") && !anchor?.closest("ul.check"),
        ol: document.queryCommandState("insertOrderedList"),
        check: Boolean(anchor?.closest("ul.check")),
      };
      setFmt((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
      // dica na linha vazia
      r.querySelectorAll(".is-empty-focus").forEach((el) => {
        el.classList.remove("is-empty-focus");
        if (!el.getAttribute("class")) el.removeAttribute("class");
        el.removeAttribute("data-ph");
      });
      const b = caretBlock();
      if (b && sel.isCollapsed && !b.textContent && /^(P|H1|H2|H3)$/.test(b.tagName) && !(b.parentElement === r && r.children.length === 1)) {
        b.classList.add("is-empty-focus");
        b.setAttribute("data-ph", b.tagName === "H1" ? "Título" : b.tagName === "H2" ? "Subtítulo" : b.tagName === "H3" ? "Tópico" : "Digite / para inserir um bloco");
      }
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------ comandos
  const focus = () => {
    if (document.activeElement !== root.current) root.current?.focus();
  };
  const run = (cmd: string, value?: string) => {
    focus();
    exec("styleWithCSS", "false");
    exec(cmd, value);
    schedule();
  };
  const leaveList = () => {
    const a = window.getSelection()?.anchorNode;
    const el = a?.nodeType === 1 ? (a as Element) : a?.parentElement;
    const ul = el?.closest("ul,ol");
    if (!ul) return;
    exec(ul.tagName === "OL" ? "insertOrderedList" : "insertUnorderedList");
  };
  const setBlock = (tag: "p" | "h1" | "h2" | "h3") => {
    focus();
    leaveList();
    // sair de citação/destaque: o parágrafo volta para o corpo do texto
    const b = caretBlock();
    const box = b?.parentElement?.closest("blockquote, aside");
    if (box && b) unwrapFrom(box as HTMLElement, b);
    run("formatBlock", tag.toUpperCase());
  };
  const unwrapFrom = (box: HTMLElement, b: HTMLElement) => {
    const p = document.createElement("p");
    p.innerHTML = b.innerHTML || "<br>";
    box.after(p);
    // o resto da caixa depois do parágrafo continua na caixa
    b.remove();
    box.querySelector("cite:empty")?.remove();
    if (!box.textContent?.trim()) box.remove();
    placeCaret(p, true);
  };
  const placeCaret = (el: Node, end = false) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(!end);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  };

  /** insere um bloco depois do bloco atual (ou no lugar dele, se estiver vazio) */
  const insertBlock = (htmlStr: string, caretSelector?: string) => {
    focus();
    const r = root.current!;
    const sel = window.getSelection();
    const cur = sel?.rangeCount && r.contains(sel.anchorNode) ? topBlock(sel.anchorNode) : (r.lastElementChild as HTMLElement | null);
    const tpl = document.createElement("template");
    tpl.innerHTML = htmlStr;
    const nodes = [...tpl.content.childNodes];
    if (cur && !cur.textContent?.trim() && /^(P|H1|H2|H3)$/.test(cur.tagName)) cur.replaceWith(...nodes);
    else if (cur) cur.after(...nodes);
    else r.append(...nodes);
    // sempre há um parágrafo depois, para continuar escrevendo
    const lastNode = nodes[nodes.length - 1] as HTMLElement;
    let after = lastNode.nextElementSibling;
    if (!after || after.tagName !== "P") {
      after = document.createElement("p");
      after.innerHTML = "<br>";
      lastNode.after(after);
    }
    const target = caretSelector ? (nodes.find((n) => n.nodeType === 1 && (n as Element).matches(caretSelector)) as Element | undefined) ?? (nodes[0] as Element).querySelector?.(caretSelector) : null;
    placeCaret(target ?? after, Boolean(target));
    schedule();
  };

  /** bloco de texto solto no corpo (parágrafo ou título), onde está o cursor */
  const plainTop = (): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !root.current?.contains(sel.anchorNode)) return null;
    const t = topBlock(sel.anchorNode);
    return t && /^(P|H1|H2|H3|DIV)$/.test(t.tagName) ? t : null;
  };
  const wrapTop = (t: HTMLElement, outer: string, inner: string, cls?: string) => {
    const box = document.createElement(outer);
    if (cls) box.className = cls;
    const el = document.createElement(inner);
    el.innerHTML = t.innerHTML.replace(/^(<br>)+$/, "") || "<br>";
    box.appendChild(el);
    t.replaceWith(box);
    placeCaret(el, true);
    schedule();
  };

  const toggleCheck = () => {
    const t = plainTop();
    if (t) return wrapTop(t, "ul", "li", "check");
    focus();
    const a = window.getSelection()?.anchorNode;
    const el = a?.nodeType === 1 ? (a as Element) : a?.parentElement;
    const inCheck = el?.closest("ul.check");
    if (inCheck) {
      exec("insertUnorderedList");
    } else {
      if (el?.closest("ol")) exec("insertOrderedList");
      if (!el?.closest("ul")) exec("insertUnorderedList");
      const a2 = window.getSelection()?.anchorNode;
      const el2 = a2?.nodeType === 1 ? (a2 as Element) : a2?.parentElement;
      el2?.closest("ul")?.classList.add("check");
    }
    schedule();
  };
  const toggleList = (kind: "ul" | "ol") => {
    focus();
    const a = window.getSelection()?.anchorNode;
    const el = a?.nodeType === 1 ? (a as Element) : a?.parentElement;
    const check = el?.closest("ul.check");
    if (check && kind === "ul") {
      check.classList.remove("check");
      if (!check.getAttribute("class")) check.removeAttribute("class");
      schedule();
      return;
    }
    const t = plainTop();
    if (t) return wrapTop(t, kind, "li");
    run(kind === "ul" ? "insertUnorderedList" : "insertOrderedList");
  };
  const toggleQuote = () => {
    focus();
    const b = caretBlock();
    const q = b?.closest("blockquote");
    if (q && b) return unwrapFrom(q as HTMLElement, b);
    const t = plainTop();
    if (t) return wrapTop(t, "blockquote", "p");
    leaveList();
    run("formatBlock", "BLOCKQUOTE");
  };
  const markAtCaret = () => {
    const a = window.getSelection()?.anchorNode;
    const el = a?.nodeType === 1 ? (a as Element) : a?.parentElement;
    return el?.closest("mark, span[style*='background']") as HTMLElement | null | undefined;
  };
  /** pinta a seleção com a cor; com o cursor dentro de um destaque, troca a cor dele */
  const paintMark = (id: string) => {
    focus();
    const color = MARKERS.find((m) => m.id === id) ?? MARKERS[0];
    setMarkColor(color.id);
    const sel = window.getSelection();
    const m = markAtCaret();
    if (sel?.isCollapsed) {
      if (!m) return;
      if (m.tagName === "MARK") {
        if (color.id === "amarelo") m.removeAttribute("data-c");
        else m.setAttribute("data-c", color.id);
      } else m.style.backgroundColor = color.hex;
      schedule();
      return;
    }
    exec("styleWithCSS", "true");
    exec("hiliteColor", color.hex);
    exec("styleWithCSS", "false");
    schedule();
  };
  const removeMark = () => {
    focus();
    const m = markAtCaret();
    if (m) m.replaceWith(...m.childNodes);
    else if (!window.getSelection()?.isCollapsed) {
      exec("styleWithCSS", "true");
      exec("hiliteColor", "transparent");
      exec("styleWithCSS", "false");
    }
    schedule();
  };
  // botão "A": tira o destaque se o cursor estiver num; senão pinta com a última cor usada
  const toggleMark = () => {
    focus();
    if (markAtCaret() && window.getSelection()?.isCollapsed) return removeMark();
    paintMark(markColor);
  };
  const callout = () => insertBlock('<aside class="callout" data-icon="💡"><p><br></p></aside>', "p");
  const divider = () => insertBlock("<hr>");

  const apply = (id: string) => {
    if (id === "p" || id === "h1" || id === "h2" || id === "h3") return setBlock(id);
    if (id === "ul" || id === "ol") return toggleList(id);
    if (id === "check") return toggleCheck();
    if (id === "quote") return toggleQuote();
    if (id === "callout") return callout();
    if (id === "hr") return divider();
    if (id === "verse") {
      const sel = window.getSelection();
      savedRange.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      setVerseOpen(true);
    }
  };

  // ------------------------------------------------ menu "/"
  const filtered = useMemo(() => {
    const q = fold(slash?.query ?? "");
    return COMMANDS.filter((c) => !q || fold(c.label).includes(q) || c.keys.includes(q));
  }, [slash?.query]);

  const closeSlash = () => {
    setSlash(null);
    slashAt.current = null;
  };
  const chooseSlash = (c: Cmd) => {
    // apaga o "/texto" digitado
    const at = slashAt.current;
    const sel = window.getSelection();
    if (at && sel?.rangeCount) {
      const r = document.createRange();
      r.setStart(at.node, Math.max(0, at.offset - 1));
      r.setEnd(sel.anchorNode!, sel.anchorOffset);
      sel.removeAllRanges();
      sel.addRange(r);
      exec("delete");
    }
    closeSlash();
    apply(c.id);
  };
  const updateSlash = () => {
    const at = slashAt.current;
    const sel = window.getSelection();
    if (!at || !sel?.rangeCount) return closeSlash();
    if (sel.anchorNode !== at.node || sel.anchorOffset < at.offset) return closeSlash();
    const q = (at.node.textContent ?? "").slice(at.offset, sel.anchorOffset);
    if (/\s/.test(q) || q.length > 24) return closeSlash();
    setSlash((s) => (s ? { ...s, query: q, sel: 0 } : s));
  };

  // ------------------------------------------------ teclado
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (slash) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = filtered.length || 1;
        setSlash((s) => (s ? { ...s, sel: (s.sel + (e.key === "ArrowDown" ? 1 : n - 1)) % n } : s));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[slash.sel]) {
          e.preventDefault();
          chooseSlash(filtered[slash.sel]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // linha criada pelo "+" e deixada só com a "/": volta a ficar vazia
        const at = slashAt.current;
        const blk = at?.node.parentElement;
        if (at && blk && blk.tagName === "P" && blk.textContent === "/") {
          blk.innerHTML = "<br>";
          placeCaret(blk);
        }
        closeSlash();
        return;
      }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.altKey && /^[0-3]$/.test(e.key)) {
      e.preventDefault();
      setBlock(e.key === "0" ? "p" : (`h${e.key}` as "h1"));
      return;
    }
    if (mod && e.shiftKey && (e.key === "h" || e.key === "H")) {
      e.preventDefault();
      toggleMark();
      return;
    }

    const sel = window.getSelection();
    const b = caretBlock();

    // "/" abre o menu de blocos
    if (e.key === "/" && !mod) {
      requestAnimationFrame(() => {
        const s = window.getSelection();
        if (!s?.rangeCount) return;
        const node = s.anchorNode!;
        const text = node.textContent ?? "";
        const at = text.lastIndexOf("/", s.anchorOffset - 1);
        if (at < 0) return;
        const before = text.slice(0, at);
        if (before && !/\s$/.test(before)) return; // "e/ou" não abre o menu
        slashAt.current = { node, offset: at + 1 };
        const typed = text.slice(at + 1, s.anchorOffset);
        if (/\s/.test(typed)) return;
        const rect = s.getRangeAt(0).getBoundingClientRect();
        const box = rect.height ? rect : (node.nodeType === 1 ? (node as Element) : node.parentElement!).getBoundingClientRect();
        const up = box.bottom + 340 > window.innerHeight;
        setSlash({ x: Math.min(box.left, window.innerWidth - 300), y: up ? box.top - 6 : box.bottom + 6, up, query: typed, sel: 0 });
      });
      return;
    }

    // atalhos de Markdown no começo da linha
    if (e.key === " " && b && sel?.isCollapsed && b.tagName !== "CITE") {
      const r = document.createRange();
      r.selectNodeContents(b);
      r.setEnd(sel.anchorNode!, sel.anchorOffset);
      const before = r.toString();
      const map: Record<string, string> = { "#": "h1", "##": "h2", "###": "h3", ">": "quote", "-": "ul", "*": "ul", "1.": "ol", "[]": "check", "[ ]": "check" };
      const id = map[before];
      if (id && !(b.tagName === "LI" && (id === "ul" || id === "ol"))) {
        e.preventDefault();
        const s = window.getSelection()!;
        s.removeAllRanges();
        s.addRange(r);
        exec("delete");
        apply(id);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && b) {
      // "---" + Enter = divisor
      if (b.tagName === "P" && b.textContent === "---") {
        e.preventDefault();
        b.innerHTML = "<br>";
        placeCaret(b);
        divider();
        return;
      }
      // Enter na referência do versículo: continua abaixo da citação
      if (b.tagName === "CITE") {
        e.preventDefault();
        const q = b.closest("blockquote")!;
        const p = document.createElement("p");
        p.innerHTML = "<br>";
        q.after(p);
        placeCaret(p);
        schedule();
        return;
      }
      // linha vazia dentro de citação/destaque: sai da caixa
      const box = b.parentElement?.closest("blockquote, aside");
      if (box && b.tagName === "P" && !b.textContent) {
        e.preventDefault();
        unwrapFrom(box as HTMLElement, b);
        schedule();
        return;
      }
      // título + Enter = texto normal na linha seguinte
      if (/^H[1-3]$/.test(b.tagName) && sel?.isCollapsed) {
        const r = document.createRange();
        r.selectNodeContents(b);
        r.setStart(sel.anchorNode!, sel.anchorOffset);
        if (!r.toString()) {
          e.preventDefault();
          const p = document.createElement("p");
          p.innerHTML = "<br>";
          b.after(p);
          placeCaret(p);
          schedule();
          return;
        }
      }
      // nova tarefa começa desmarcada
      if (b.tagName === "LI" && b.closest("ul.check")) {
        requestAnimationFrame(() => {
          const nb = caretBlock();
          if (nb?.tagName === "LI") nb.removeAttribute("data-done");
        });
      }
    }

    // Backspace no começo de um título/citação: vira texto normal
    if (e.key === "Backspace" && b && sel?.isCollapsed) {
      const r = document.createRange();
      r.selectNodeContents(b);
      r.setEnd(sel.anchorNode!, sel.anchorOffset);
      if (!r.toString()) {
        if (/^H[1-3]$/.test(b.tagName)) {
          e.preventDefault();
          setBlock("p");
          return;
        }
        const box = b.parentElement?.closest("blockquote, aside");
        if (box && b.tagName === "P" && box.firstElementChild === b) {
          e.preventDefault();
          unwrapFrom(box as HTMLElement, b);
          const moved = (box.isConnected ? box.nextElementSibling : null) as HTMLElement | null;
          if (moved) placeCaret(moved);
          schedule();
          return;
        }
      }
    }

    // Tab nas listas: recuo
    if (e.key === "Tab" && b?.tagName === "LI") {
      e.preventDefault();
      run(e.shiftKey ? "outdent" : "indent");
    }
  };

  const onInput = () => {
    if (slashAt.current) updateSlash();
    // o navegador às vezes cria <div> ou deixa a página vazia
    const r = root.current!;
    if (!r.firstElementChild) r.innerHTML = "<p><br></p>";
    schedule();
  };

  // clique na caixinha da tarefa ou no ícone do destaque
  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const li = t.closest("ul.check > li") as HTMLElement | null;
    if (li && e.clientX - li.getBoundingClientRect().left < 26) {
      e.preventDefault();
      li.setAttribute("data-done", li.getAttribute("data-done") === "true" ? "false" : "true");
      schedule();
      return;
    }
    const aside = t.closest("aside.callout") as HTMLElement | null;
    if (aside && t === aside && e.clientX - aside.getBoundingClientRect().left < 40) {
      const cur = aside.getAttribute("data-icon") ?? "💡";
      aside.setAttribute("data-icon", CALLOUT_ICONS[(CALLOUT_ICONS.indexOf(cur) + 1) % CALLOUT_ICONS.length]);
      schedule();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    e.preventDefault();
    if (html) exec("insertHTML", sanitize(html));
    else if (/\n/.test(text) || /^(#{1,3}|>|[-*•]|\d+[.)])\s/.test(text)) exec("insertHTML", plainToHtml(text));
    else exec("insertText", text);
    schedule();
  };

  // ------------------------------------------------ versículo
  const insertVerse = (htmlStr: string) => {
    setVerseOpen(false);
    focus();
    if (savedRange.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
    insertBlock(htmlStr);
  };

  // ------------------------------------------------ alça dos blocos (+ e arrastar)
  const blockAt = (y: number): HTMLElement | null => {
    const r = root.current;
    if (!r) return null;
    let best: HTMLElement | null = null;
    for (const c of Array.from(r.children) as HTMLElement[]) {
      if (c.getBoundingClientRect().top - 6 > y) break;
      best = c;
    }
    return best;
  };
  const showHandle = (el: HTMLElement | null) => {
    if (!el || !wrap.current) return setHover(null);
    const w = wrap.current.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el.tagName === "UL" || el.tagName === "OL" || el.tagName === "BLOCKQUOTE" || el.tagName === "ASIDE" ? (el.firstElementChild as HTMLElement) ?? el : el);
    const lh = parseFloat(cs.lineHeight) || 28;
    setHover((h) => {
      const top = b.top - w.top + (el.tagName === "ASIDE" ? 12 : 0) + Math.min(lh, b.height) / 2 - 14;
      return h?.el === el && Math.abs(h.top - top) < 1 ? h : { el, top };
    });
  };
  const onWrapMove = (e: React.MouseEvent) => {
    if (dragging.current || blockMenu || plusMenu) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-gutter]")) return;
    if (t.closest('[role="toolbar"]')) return setHover(null);
    showHandle(blockAt(e.clientY));
  };
  /** "+" escolheu um bloco: cria uma linha abaixo (ou usa a linha vazia) e aplica */
  const insertFromPlus = (el: HTMLElement, id: string) => {
    setPlusMenu(null);
    setPlusQuery("");
    const empty = el.tagName === "P" && !el.textContent?.trim();
    const target = empty ? el : document.createElement("p");
    if (!empty) {
      target.innerHTML = "<br>";
      el.after(target);
    }
    root.current?.focus();
    placeCaret(target);
    setHover(null);
    if (id !== "p") apply(id);
    schedule();
  };
  const endDrag = () => {
    dragging.current?.classList.remove("is-dragging");
    dragging.current = null;
    setDrop(null);
  };
  /** onde o bloco cairia, para a altura y do mouse */
  const dropAt = (y: number) => {
    if (!wrap.current || !root.current) return null;
    const kids = Array.from(root.current.children) as HTMLElement[];
    let target = kids[kids.length - 1];
    let after = true;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        target = k;
        after = false;
        break;
      }
    }
    if (!target) return null;
    const w = wrap.current.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    return { el: target, after, top: (after ? r.bottom + 4 : r.top - 4) - w.top };
  };
  // arrastar pela alça ⠿ (feito com o mouse, funciona em qualquer navegador);
  // um clique sem mexer abre o menu do bloco
  const startHandle = (e: React.PointerEvent, el: HTMLElement) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let target: ReturnType<typeof dropAt> = null;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!moved) {
        moved = true;
        dragging.current = el;
        el.classList.add("is-dragging");
        document.body.style.cursor = "grabbing";
      }
      target = dropAt(ev.clientY);
      setDrop(target);
      // rola a página quando chega perto das bordas
      if (ev.clientY < 90) window.scrollBy(0, -12);
      else if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      if (!moved) {
        setBlockMenu(el);
        return;
      }
      if (target && target.el !== el) {
        if (target.after) target.el.after(el);
        else target.el.before(el);
        schedule();
      }
      endDrag();
      showHandle(el);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const blockAction = (el: HTMLElement, id: string) => {
    setBlockMenu(null);
    const r = root.current!;
    if (id === "del") {
      el.remove();
      if (!r.firstElementChild) r.innerHTML = "<p><br></p>";
      setHover(null);
      schedule();
      return;
    }
    if (id === "dup") {
      el.after(el.cloneNode(true));
      schedule();
      return;
    }
    if (id === "up" || id === "down") {
      const sib = id === "up" ? el.previousElementSibling : el.nextElementSibling;
      if (sib) id === "up" ? sib.before(el) : sib.after(el);
      showHandle(el);
      schedule();
      return;
    }
    // transformar: põe o cursor no bloco e aplica
    r.focus();
    const first = el.matches("ul,ol,blockquote,aside") ? (el.querySelector("li,p") as HTMLElement | null) ?? el : el;
    placeCaret(first, true);
    apply(id);
  };

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseMove={onWrapMove}
      onMouseLeave={() => !blockMenu && !plusMenu && !dragging.current && setHover(null)}
    >
      {/* alça do bloco: + e arrastar (aparece ao passar o mouse, como no Notion) */}
      {hover && (
        <div data-gutter className="absolute -left-[3.75rem] z-10 hidden items-center sm:flex" style={{ top: hover.top }}>
          <button
            type="button"
            title="Adicionar um bloco abaixo"
            aria-label="Adicionar um bloco abaixo"
            ref={plusBtn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPlusMenu(hover.el)}
            className="grid size-7 place-items-center rounded-md text-ink-400/70 hover:bg-ink-800 hover:text-ink-100"
          >
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button
            ref={handleBtn}
            type="button"
            data-handle
            title="Arraste para mover · clique para mais opções"
            aria-label="Mover ou editar o bloco"
            onPointerDown={(e) => startHandle(e, hover.el)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setBlockMenu(hover.el))}
            className="grid h-7 w-5 cursor-grab touch-none place-items-center rounded-md text-ink-400/70 hover:bg-ink-800 hover:text-ink-100 active:cursor-grabbing"
          >
            <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor" aria-hidden="true">
              {[2, 8, 14].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.5" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.5" />])}
            </svg>
          </button>
        </div>
      )}
      {drop && <div className="pointer-events-none absolute -left-2 right-0 z-10 h-[3px] rounded-full bg-[#60a5fa]" style={{ top: drop.top - 1 }} />}
      {plusMenu && (
        <Popover anchor={plusBtn.current} onClose={() => (setPlusMenu(null), setPlusQuery(""))} width={288}>
          <input
            autoFocus
            value={plusQuery}
            onChange={(e) => setPlusQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const q = fold(plusQuery);
                const first = COMMANDS.find((c) => !q || fold(c.label).includes(q) || c.keys.includes(q));
                if (first) (e.preventDefault(), insertFromPlus(plusMenu, first.id));
              }
            }}
            placeholder="Buscar bloco…"
            className="mb-1 h-9 w-full rounded-lg bg-ink-800 px-3 text-sm outline-none"
          />
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Inserir abaixo</p>
          {COMMANDS.filter((c) => {
            const q = fold(plusQuery);
            return !q || fold(c.label).includes(q) || c.keys.includes(q);
          }).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => insertFromPlus(plusMenu, c.id)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left hover:bg-ink-800"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-edge/10 bg-ink-850">{c.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{c.label}</span>
                <span className="block truncate text-xs text-ink-400">{c.hint}</span>
              </span>
            </button>
          ))}
        </Popover>
      )}
      {blockMenu && (
        <Popover anchor={handleBtn.current} onClose={() => setBlockMenu(null)} width={240}>
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Transformar em</p>
          {COMMANDS.filter((c) => ["p", "h1", "h2", "h3", "quote", "ul", "check"].includes(c.id)).map((c) => (
            <button key={c.id} type="button" onClick={() => blockAction(blockMenu, c.id)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-sm hover:bg-ink-800">
              <span className="grid size-7 shrink-0 place-items-center rounded-md border border-edge/10">{c.icon}</span>
              {c.label}
            </button>
          ))}
          <div className="my-1 border-t border-edge/10" />
          {(
            [
              ["up", "↑", "Mover para cima"],
              ["down", "↓", "Mover para baixo"],
              ["dup", "⧉", "Duplicar"],
              ["del", "🗑", "Apagar"],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => blockAction(blockMenu, id)}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-sm hover:bg-ink-800 ${id === "del" ? "text-lume" : ""}`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md border border-edge/10 text-xs">{icon}</span>
              {label}
            </button>
          ))}
        </Popover>
      )}
      {/* barra de formatação */}
      <div
        role="toolbar"
        aria-label="Formatação"
        onMouseDown={(e) => {
          // não tira o foco do texto ao clicar nos botões
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        }}
        className="no-scrollbar sticky top-16 z-20 -mx-1 mb-6 flex items-center gap-0.5 overflow-x-auto rounded-2xl border border-edge/10 bg-ink-850/95 p-1 shadow-[0_8px_24px_-16px_rgb(0_0_0/0.35)] backdrop-blur"
      >
        <BlockPicker value={fmt.block} onPick={(id) => apply(id)} />
        <Sep />
        <Tool label="Negrito (Ctrl+B)" on={fmt.b} onClick={() => run("bold")}><b className="font-serif text-[15px]">B</b></Tool>
        <Tool label="Itálico (Ctrl+I)" on={fmt.i} onClick={() => run("italic")}><i className="font-serif text-[15px]">I</i></Tool>
        <Tool label="Sublinhado (Ctrl+U)" on={fmt.u} onClick={() => run("underline")}><u className="font-serif text-[15px]">U</u></Tool>
        <Tool label="Marca-texto (Ctrl+Shift+H)" on={fmt.mark} onClick={toggleMark}>
          <span className="rounded px-1 text-[13px] font-bold" style={{ background: (MARKERS.find((m) => m.id === markColor) ?? MARKERS[0]).hex }}>A</span>
        </Tool>
        <button
          ref={markBtn}
          type="button"
          title="Cores do marca-texto"
          aria-label="Cores do marca-texto"
          aria-expanded={markMenu}
          onClick={() => setMarkMenu((v) => !v)}
          className="-ml-1 grid h-9 w-4 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {markMenu && (
          <Popover anchor={markBtn.current} onClose={() => setMarkMenu(false)} width={232}>
            <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Marca-texto</p>
            <div className="grid grid-cols-7 gap-1.5 px-1.5">
              {MARKERS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.label}
                  aria-label={m.label}
                  onClick={() => (setMarkMenu(false), paintMark(m.id))}
                  className={`size-7 rounded-full ring-2 ring-offset-1 transition-transform hover:scale-110 ${markColor === m.id ? "ring-ink-100" : "ring-transparent"}`}
                  style={{ background: m.hex }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => (setMarkMenu(false), removeMark())}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-ink-800"
            >
              <span className="grid size-6 place-items-center rounded-full border border-edge/10 text-xs">⌫</span> Remover destaque
            </button>
          </Popover>
        )}
        <Sep />
        <Tool label="Lista com marcadores" on={fmt.ul} onClick={() => toggleList("ul")}><Glyph d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></Tool>
        <Tool label="Lista numerada" on={fmt.ol} onClick={() => toggleList("ol")}><Glyph d="M10 6h10M10 12h10M10 18h10M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></Tool>
        <Tool label="Lista de tarefas" on={fmt.check} onClick={toggleCheck}><Glyph d="M4 5h4v4H4zM4 15h4v4H4zM11 7h9M11 17h9" /></Tool>
        <Tool label="Citação" on={fmt.block === "quote"} onClick={toggleQuote}><Glyph d="M7 7h4v4c0 3-2 5-4 5M14 7h4v4c0 3-2 5-4 5" /></Tool>
        <Sep />
        <button
          type="button"
          onClick={() => apply("verse")}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold text-lume hover:bg-lume/12"
          title="Inserir versículo bíblico"
        >
          <span aria-hidden>📖</span> <span className="hidden sm:inline">Versículo</span>
        </button>
        <div className="relative shrink-0">
          <button
            type="button"
            ref={insertBtn}
            onClick={() => {
              const sel = window.getSelection();
              if (sel?.rangeCount && root.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
              setInsertMenu((v) => !v);
            }}
            aria-expanded={insertMenu}
            className="flex h-9 items-center gap-1 rounded-xl px-2.5 text-[13px] font-semibold text-ink-100 hover:bg-ink-800"
          >
            <Glyph d="M12 5v14M5 12h14" /> <span className="hidden sm:inline">Inserir</span>
          </button>
          {insertMenu && (
            <Popover anchor={insertBtn.current} onClose={() => setInsertMenu(false)} width={256}>
                {COMMANDS.filter((c) => ["callout", "hr", "check", "verse", "h3"].includes(c.id)).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => (setInsertMenu(false), apply(c.id))}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-ink-800"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-edge/10 bg-ink-850">{c.icon}</span>
                    <span>
                      <span className="block text-sm font-semibold">{c.label}</span>
                      <span className="block text-xs text-ink-400">{c.hint}</span>
                    </span>
                  </button>
                ))}
                <div className="my-1 border-t border-edge/10" />
                <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-ink-800">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-edge/10 bg-ink-850 text-base">⬆️</span>
                  <span>
                    <span className="block text-sm font-semibold">Importar do Word</span>
                    <span className="block text-xs text-ink-400">Traz o texto de um .docx (ou PDF) para cá</span>
                  </span>
                  <input
                    type="file"
                    accept=".docx,.pdf,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      setInsertMenu(false);
                      if (!f) return;
                      setImporting(`Convertendo “${f.name}”…`);
                      try {
                        const { title, html } = await importFile(f);
                        if (savedRange.current) {
                          const sel = window.getSelection();
                          sel?.removeAllRanges();
                          sel?.addRange(savedRange.current);
                        }
                        insertBlock(`<h2>${escapeHtml(title)}</h2>${html}`);
                        setImporting("");
                      } catch (err) {
                        setImporting(`Não foi possível converter: ${(err as Error).message}`);
                        setTimeout(() => setImporting(""), 4000);
                      }
                    }}
                  />
                </label>
            </Popover>
          )}
        </div>
        <span className="ml-auto" />
        <Sep />
        <Tool label="Desfazer (Ctrl+Z)" onClick={() => run("undo")}><Glyph d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></Tool>
        <Tool label="Refazer (Ctrl+Y)" onClick={() => run("redo")}><Glyph d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></Tool>
      </div>

      <div
        ref={root}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        lang="pt-BR"
        role="textbox"
        aria-multiline="true"
        aria-label="Texto da nota"
        onKeyDown={onKeyDown}
        onInput={onInput}
        onClick={onClick}
        onPaste={onPaste}
        onBlur={() => {
          emit();
          setTimeout(() => {
            if (document.activeElement !== root.current) closeSlash();
          }, 150);
        }}
        className="roteiro min-h-[50dvh] pb-[30dvh]"
      />

      {slash && (
        <div
          role="listbox"
          aria-label="Inserir bloco"
          style={{ left: Math.max(8, slash.x), ...(slash.up ? { bottom: window.innerHeight - slash.y } : { top: slash.y }) }}
          className="fixed z-50 max-h-80 w-72 overflow-y-auto rounded-2xl border border-edge/10 bg-ink-850 p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.35)]"
          onMouseDown={(e) => e.preventDefault()}
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{slash.query ? `Blocos com “${slash.query}”` : "Blocos"}</p>
          {filtered.length ? (
            filtered.map((c, i) => (
              <button
                key={c.id}
                role="option"
                aria-selected={i === slash.sel}
                type="button"
                onMouseEnter={() => setSlash((s) => (s ? { ...s, sel: i } : s))}
                onClick={() => chooseSlash(c)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left ${i === slash.sel ? "bg-ink-800" : ""}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-edge/10 bg-ink-850">{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{c.label}</span>
                  <span className="block truncate text-xs text-ink-400">{c.hint}</span>
                </span>
                {c.shortcut && <kbd className="shrink-0 rounded bg-ink-800 px-1.5 font-sans text-[11px] text-ink-400">{c.shortcut}</kbd>}
              </button>
            ))
          ) : (
            <p className="px-2.5 py-3 text-sm text-ink-400">Nenhum bloco. Continue escrevendo ou apague a “/”.</p>
          )}
        </div>
      )}

      {importing && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-2xl bg-ink-100 px-5 py-3 text-sm text-ink-950 shadow-2xl">{importing}</div>
      )}
      {verseOpen && <VerseDialog onInsert={insertVerse} onClose={() => (setVerseOpen(false), focus())} />}
    </div>
  );
});

// ------------------------------------------------ escolher o tipo da linha
function BlockPicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const opts = COMMANDS.filter((c) => ["p", "h1", "h2", "h3", "quote"].includes(c.id));
  const cur = opts.find((o) => o.id === value) ?? opts[0];
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={btn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-9 min-w-[7.5rem] items-center justify-between gap-2 rounded-xl px-2.5 text-[13px] font-semibold hover:bg-ink-800"
      >
        {cur.label}
        <svg viewBox="0 0 24 24" className="size-3.5 text-ink-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} width={224}>
          <div role="listbox">
            {opts.map((o) => (
              <button
                key={o.id}
                role="option"
                aria-selected={o.id === cur.id}
                type="button"
                onClick={() => (setOpen(false), onPick(o.id))}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-ink-800 ${o.id === cur.id ? "text-lume" : ""}`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md border border-edge/10">{o.icon}</span>
                <span
                  className={
                    o.id === "h1" ? "font-serif text-lg font-semibold" : o.id === "h2" ? "font-serif text-base font-semibold" : o.id === "h3" ? "text-sm font-bold" : o.id === "quote" ? "border-l-2 border-ink-100 pl-2 text-sm" : "text-sm"
                  }
                >
                  {o.label}
                </span>
                {o.shortcut && <kbd className="ml-auto rounded bg-ink-800 px-1.5 font-sans text-[11px] text-ink-400">{o.shortcut}</kbd>}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** menu flutuante fora da barra (a barra rola de lado e cortava os menus) */
function Popover({ anchor, onClose, children, width = 256 }: { anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; width?: number }) {
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const up = r.bottom + 340 > window.innerHeight && r.top > 340;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 8 : r.bottom + 8, up });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, width]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[70]"
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-[71] max-h-[70vh] overflow-y-auto rounded-2xl border border-edge/10 bg-ink-850 p-1.5 text-ink-100 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.3)]"
        style={{ left: pos.left, width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
        // o texto não perde o cursor ao escolher (menos no "Importar", que abre o seletor de arquivo)
        onMouseDown={(e) => !(e.target as HTMLElement).closest("label, input") && e.preventDefault()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

// ------------------------------------------------ versículo da Bíblia da plataforma
const VKEY = "bethel:roteiro-versao";
export function VerseDialog({ onInsert, onClose, action = "Inserir na nota" }: { onInsert: (html: string) => void; onClose: () => void; action?: string }) {
  const [cat, setCat] = useState<Catalog>();
  const [q, setQ] = useState("");
  const [version, setVersion] = useState("NAA");
  const [res, setRes] = useState<{ verses: { n: number; text: string }[]; label: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [numbers, setNumbers] = useState(true);

  useEffect(() => {
    try {
      setVersion(localStorage.getItem(VKEY) || "NAA");
    } catch {}
    loadCatalog().then(setCat, () => setErr("Não foi possível abrir a Bíblia."));
  }, []);

  const ref = useMemo(() => (cat && q.trim() ? parseRef(q, cat) : null), [cat, q]);
  useEffect(() => {
    setRes(null);
    setErr("");
    if (!ref) return;
    const tooLong = (ref.to ?? 0) - (ref.from ?? 0) > 40;
    if (tooLong) return setErr("Escolha até 40 versículos por vez.");
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      passage(ref, version)
        .then((r) => live && (r.verses.length ? setRes(r) : setErr("Não encontrei esse trecho nesta versão.")))
        .catch(() => live && setErr("Não foi possível carregar o texto."))
        .finally(() => live && setBusy(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ref, version]);

  const insert = () => {
    if (!res) return;
    try {
      localStorage.setItem(VKEY, version);
    } catch {}
    const many = res.verses.length > 1;
    const body = res.verses.map((v) => `${many && numbers ? `<sup>${v.n}</sup>` : ""}${escapeHtml(v.text)}`).join(" ");
    onInsert(`<blockquote class="verse"><p>${body}</p><cite>${escapeHtml(res.label)} (${escapeHtml(version)})</cite></blockquote>`);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label="Fechar" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Inserir versículo" className="relative w-full max-w-lg rounded-t-3xl bg-ink-850 p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-lume/12 text-lg">📖</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-lg font-semibold">Inserir versículo</h2>
            <p className="text-xs text-ink-400">Digite a referência: Jo 3:16, Rm 8:28-30, Salmos 23</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            insert();
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex.: Jo 3:16"
            className="min-w-0 flex-1 rounded-xl border border-edge/10 bg-ink-800 px-4 py-2.5 text-sm outline-none focus:border-lume focus:bg-ink-850"
          />
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            aria-label="Versão"
            className="rounded-xl border border-edge/10 bg-ink-850 px-3 text-sm font-semibold outline-none focus:border-lume"
          >
            {(cat?.versions ?? [{ id: "NAA", name: "Nova Almeida Atualizada" }]).map((v) => (
              <option key={v.id} value={v.id}>{v.id === "LOGOS" ? "Logos" : v.id}</option>
            ))}
          </select>
        </form>
        <div className="mt-4 min-h-24 rounded-2xl border border-edge/10 bg-lume/6 p-4">
          {res ? (
            <>
              <p className="max-h-48 overflow-y-auto font-serif text-[15px] leading-relaxed">
                {res.verses.map((v) => (
                  <span key={v.n}>
                    {res.verses.length > 1 && numbers && <sup className="mr-0.5 font-sans text-[10px] font-bold text-lume">{v.n}</sup>}
                    {v.text}{" "}
                  </span>
                ))}
              </p>
              <p className="mt-2 text-xs font-bold text-lume">— {res.label} ({version})</p>
            </>
          ) : (
            <p className="text-sm text-ink-400">{err || (busy ? "Buscando…" : q.trim() && cat && !ref ? "Não reconheci a referência. Tente “Jo 3:16”." : "O texto aparece aqui.")}</p>
          )}
        </div>
        {res && res.verses.length > 1 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
            Mostrar o número de cada versículo
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-ink-800">Cancelar</button>
          <button type="button" onClick={insert} disabled={!res} className="rounded-xl bg-marca px-5 py-2.5 text-sm font-semibold text-white hover:bg-marca-forte disabled:opacity-40">
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------ peças
function Tool({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${on ? "bg-lume/12 text-lume" : "text-ink-100 hover:bg-ink-800"}`}
    >
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-edge/10" aria-hidden />;
function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
