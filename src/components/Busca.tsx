// ------------------------------------------------------------------
// Caixa de busca da Bíblia: aceita referência ("Hb 11:1") ou um pedaço
// do versículo ("o justo viverá pela fé") e acha no texto.
// ------------------------------------------------------------------
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { parseRef, refLabel } from "../lib/bible";
import { buscarTexto, norm, prepararBusca, type Achado } from "../lib/busca";
import { useCatalog, useDebounced } from "../lib/hooks";
import { Icon } from "./ui";

const ACENTOS: Record<string, string> = { a: "aàáâãä", e: "eèéêë", i: "iìíîï", o: "oòóôõö", u: "uùúûü", c: "cç", n: "nñ" };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** destaca as palavras buscadas (sem ligar para acentos) e mostra o pedaço onde elas estão */
function destacar(text: string, q: string): ReactNode {
  const termos = norm(q).split(" ").filter((t) => t.length >= 2);
  if (!termos.length) return text;
  const re = new RegExp(
    `(?<![\\p{L}])(${termos.map((t) => [...t].map((ch) => (ACENTOS[ch] ? `[${ACENTOS[ch]}]` : esc(ch))).join("")).join("|")})`,
    "giu",
  );
  // versículo longo: começa um pouco antes da primeira palavra achada
  const first = text.search(re);
  let t = text;
  if (text.length > 150 && first > 50) {
    const cut = text.lastIndexOf(" ", first - 25);
    t = `…${text.slice(cut > 0 ? cut : first - 25)}`;
  }
  return t.split(re).map((p, i) => (i % 2 ? <b key={i} className="font-semibold text-lume">{p}</b> : p));
}

export function BuscaBiblia({
  versao, onPick, inputRef, placeholder = "Referência ou parte do versículo", compact = false,
}: {
  versao: string;
  onPick: (ref: string) => void;
  inputRef?: RefObject<HTMLInputElement>;
  placeholder?: string;
  compact?: boolean;
}) {
  const { cat } = useCatalog();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Achado[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const own = useRef<HTMLInputElement>(null);
  const input = inputRef ?? own;
  const dq = useDebounced(q.trim(), 250);
  const ref = cat && q.trim() ? parseRef(q.trim(), cat) : null;

  useEffect(() => {
    setRes(null);
    setSel(0);
    if (!dq || dq.length < 3 || (cat && parseRef(dq, cat))) return;
    let dead = false;
    setBusy(true);
    buscarTexto(dq, versao)
      .then((r) => !dead && setRes(r))
      .catch(() => !dead && setRes([]))
      .finally(() => !dead && setBusy(false));
    return () => {
      dead = true;
    };
  }, [dq, versao, cat]);

  const pick = (r: string) => {
    onPick(r);
    setQ("");
    setOpen(false);
    input.current?.blur();
  };
  const items: { ref: string; node: ReactNode }[] = ref
    ? [{ ref: refLabel(ref), node: <span className="font-semibold">{refLabel(ref)}</span> }]
    : (res ?? []).map((a) => ({
        ref: a.ref,
        node: (
          <>
            <span className="block text-xs font-bold text-lume">{a.label}</span>
            <span className="line-clamp-3 font-serif text-[13px] leading-snug text-ink-200">{destacar(a.text, dq)}</span>
          </>
        ),
      }));

  return (
    <div className="relative">
      <Icon name="busca" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
      <input
        ref={input}
        value={q}
        onFocus={() => (setOpen(true), prepararBusca(versao))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
          else if (e.key === "Enter" && items[sel]) (e.preventDefault(), pick(items[sel].ref));
          else if (e.key === "Escape") (setQ(""), input.current?.blur());
        }}
        placeholder={placeholder}
        className={`w-full rounded-xl bg-ink-850 pr-3 pl-9 text-sm ring-1 ring-edge/8 outline-none ring-inset placeholder:text-ink-500 focus:ring-lume/60 ${compact ? "h-9" : "h-10"}`}
      />
      {open && q.trim() && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 max-h-[60vh] min-w-72 overflow-y-auto rounded-2xl bg-ink-800 p-1.5 shadow-2xl ring-1 ring-edge/10">
          {items.map((it, i) => (
            <button
              key={it.ref + i}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(it.ref)}
              onMouseEnter={() => setSel(i)}
              className={`block w-full rounded-xl px-3 py-2 text-left ${i === sel ? "bg-edge/[.07]" : ""}`}
            >
              {it.node}
            </button>
          ))}
          {!ref && (
            <p className="px-3 py-2 text-xs text-ink-400">
              {q.trim().length < 3
                ? "Digite uma referência ou pelo menos 3 letras do versículo."
                : busy || res === null
                  ? `Procurando na ${versao}…`
                  : res.length
                    ? `${res.length >= 40 ? "Primeiros 40 versículos" : `${res.length} versículo${res.length === 1 ? "" : "s"}`} na ${versao} · Enter abre o selecionado`
                    : `Nada encontrado na ${versao}. Tente menos palavras.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
