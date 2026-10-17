// ------------------------------------------------------------------
// Pastas (aulas e roteiros): lista ao lado, arrastar para mover,
// alternar entre quadradinhos e lista, e o menu "⋯" de cada item.
// ------------------------------------------------------------------
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./ui";

export type Pasta = { id: string; name: string; parentId?: string; color?: string };
export const DRAG = "text/x-modo-aula-item";

/** a pasta e todas as que estão dentro dela */
export function abaixo(pastas: Pasta[], id: string) {
  const out = new Set([id]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const f of pastas) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) (out.add(f.id), (cresceu = true));
  }
  return out;
}

/** pastas na ordem da árvore, com o nível de cada uma */
function arvore(pastas: Pasta[]) {
  const out: { f: Pasta; nivel: number }[] = [];
  const ids = new Set(pastas.map((f) => f.id));
  const filhos = (pai?: string) =>
    pastas.filter((f) => (pai ? f.parentId === pai : !f.parentId || !ids.has(f.parentId))).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const visita = (pai: string | undefined, nivel: number) => {
    for (const f of filhos(pai)) {
      out.push({ f, nivel });
      if (nivel < 6) visita(f.id, nivel + 1);
    }
  };
  visita(undefined, 0);
  return out;
}

export function FolderIcon({ color, className = "size-4" }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" fill={color ?? "currentColor"} opacity={color ? 0.9 : 0.55} />
    </svg>
  );
}

export function PastasLado({
  pastas, contar, atual, setAtual, criar, renomear, apagar, soltar, titulo = "Pastas",
}: {
  pastas: Pasta[];
  contar: (id: string | "todas" | "sem") => number;
  atual: string;
  setAtual: (id: string) => void;
  criar: (nome: string, pai?: string) => string;
  renomear: (id: string, nome: string) => void;
  apagar: (id: string) => void;
  /** item arrastado para uma pasta (undefined = sem pasta) */
  soltar: (itemId: string, pasta?: string) => void;
  titulo?: string;
}) {
  const [nova, setNova] = useState<{ pai?: string } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const linha = (id: string, rotulo: ReactNode, n: number, opts: { nivel?: number; pasta?: Pasta } = {}) => {
    const ativo = atual === id;
    const destino = id === "todas" ? null : id === "sem" ? undefined : id;
    return (
      <div
        key={id}
        onDragOver={(e) => {
          if (destino === null || !e.dataTransfer.types.includes(DRAG)) return;
          e.preventDefault();
          setSobre(id);
        }}
        onDragLeave={() => setSobre((s) => (s === id ? null : s))}
        onDrop={(e) => {
          const item = e.dataTransfer.getData(DRAG);
          setSobre(null);
          if (item && destino !== null) soltar(item, destino);
        }}
        className={`group flex items-center rounded-xl transition-colors ${ativo ? "bg-edge/[.07] text-ink-100" : "text-ink-300 hover:bg-edge/[.04] hover:text-ink-100"} ${
          sobre === id ? "bg-lume/15 ring-1 ring-lume/50" : ""
        }`}
        style={{ paddingLeft: `${(opts.nivel ?? 0) * 14}px` }}
      >
        {editando === id && opts.pasta ? (
          <input
            autoFocus
            defaultValue={opts.pasta.name}
            onKeyDown={(e) => {
              if (e.key === "Enter") (renomear(id, (e.target as HTMLInputElement).value), setEditando(null));
              if (e.key === "Escape") setEditando(null);
            }}
            onBlur={(e) => (renomear(id, e.target.value), setEditando(null))}
            className="m-1 h-8 min-w-0 flex-1 rounded-lg bg-ink-850 px-2 text-sm ring-1 ring-lume/50 outline-none"
          />
        ) : (
          <button type="button" onClick={() => setAtual(id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm font-semibold">
            {rotulo}
            <span className="ml-auto pl-2 text-[11px] font-semibold text-ink-500 tabular-nums">{n || ""}</span>
          </button>
        )}
        {opts.pasta && editando !== id && (
          <div className="hidden shrink-0 items-center pr-1 group-hover:flex">
            <button type="button" title="Nova pasta dentro desta" onClick={() => setNova({ pai: id })} className="grid size-6 place-items-center rounded-md text-ink-400 hover:bg-edge/10 hover:text-ink-100">
              <Icon name="mais" className="size-3.5" />
            </button>
            <button type="button" title="Renomear" onClick={() => setEditando(id)} className="grid size-6 place-items-center rounded-md text-ink-400 hover:bg-edge/10 hover:text-ink-100">
              <Icon name="caneta" className="size-3.5" />
            </button>
            <button
              type="button"
              title="Apagar a pasta (o que está nela não é apagado)"
              onClick={() => {
                if (!confirm(`Apagar a pasta “${opts.pasta!.name}”? O que está dentro dela não é apagado: vai para a pasta de cima.`)) return;
                apagar(id);
                if (atual === id) setAtual("todas");
              }}
              className="grid size-6 place-items-center rounded-md text-ink-400 hover:bg-coral/10 hover:text-coral"
            >
              <Icon name="lixo" className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="w-56 shrink-0">
      <p className="mb-2 px-3 text-[11px] font-bold tracking-[0.18em] text-ink-400 uppercase">{titulo}</p>
      <div className="space-y-0.5">
        {linha("todas", <><Icon name="aulas" className="size-4 opacity-70" /> Tudo</>, contar("todas"))}
        {arvore(pastas).map(({ f, nivel }) => (
          <div key={f.id}>
            {linha(f.id, <><FolderIcon color={f.color} /> <span className="truncate">{f.name}</span></>, contar(f.id), { nivel, pasta: f })}
            {nova?.pai === f.id && <NovaPasta nivel={nivel + 1} onOk={(nome) => (setAtual(criar(nome, f.id)), setNova(null))} onCancel={() => setNova(null)} />}
          </div>
        ))}
        {linha("sem", <><FolderIcon className="size-4 opacity-40" /> Sem pasta</>, contar("sem"))}
      </div>
      {nova && !nova.pai ? (
        <NovaPasta nivel={0} onOk={(nome) => (setAtual(criar(nome)), setNova(null))} onCancel={() => setNova(null)} />
      ) : (
        <button type="button" onClick={() => setNova({})} className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-lume hover:bg-lume/10">
          <Icon name="mais" className="size-4" /> Nova pasta
        </button>
      )}
      <p className="mt-3 px-3 text-[11px] leading-snug text-ink-500">Arraste um item até a pasta para guardar nela.</p>
    </nav>
  );
}

function NovaPasta({ nivel, onOk, onCancel }: { nivel: number; onOk: (nome: string) => void; onCancel: () => void }) {
  return (
    <div style={{ paddingLeft: `${nivel * 14}px` }} className="mt-1">
      <input
        autoFocus
        placeholder="Nome da pasta"
        onKeyDown={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          if (e.key === "Enter" && v) onOk(v);
          if (e.key === "Escape") onCancel();
        }}
        onBlur={(e) => (e.target.value.trim() ? onOk(e.target.value.trim()) : onCancel())}
        className="h-9 w-full rounded-xl bg-ink-850 px-3 text-sm ring-1 ring-lume/50 outline-none"
      />
    </div>
  );
}

/** quadradinhos ou lista */
export function Vista({ value, onChange }: { value: "grade" | "lista"; onChange: (v: "grade" | "lista") => void }) {
  const b = (v: "grade" | "lista", icon: ReactNode, t: string) => (
    <button
      type="button"
      title={t}
      onClick={() => onChange(v)}
      className={`grid size-8 place-items-center rounded-lg ${value === v ? "bg-ink-700 text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex rounded-xl bg-ink-850 p-1 ring-1 ring-edge/5 ring-inset">
      {b(
        "grade",
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>,
        "Quadradinhos",
      )}
      {b(
        "lista",
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
        </svg>,
        "Lista",
      )}
    </div>
  );
}

/** menu "⋯" de um item: mover para pasta e outras ações */
export function ItemMenu({ pastas, atual, mover, acoes = [] }: { pastas: Pasta[]; atual?: string; mover: (pasta?: string) => void; acoes?: { label: string; danger?: boolean; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={box} className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" title="Mais opções" onClick={() => setOpen((o) => !o)} className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-edge/10 hover:text-ink-100">
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-9 right-0 z-40 max-h-80 w-60 overflow-y-auto rounded-2xl bg-ink-800 p-1.5 text-sm shadow-2xl ring-1 ring-edge/10">
          <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold tracking-[0.16em] text-ink-400 uppercase">Mover para</p>
          {[{ id: "", name: "Sem pasta" } as Pasta, ...arvore(pastas).map((x) => x.f)].map((f) => (
            <button
              key={f.id || "sem"}
              type="button"
              onClick={() => (mover(f.id || undefined), setOpen(false))}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-edge/[.06] ${(atual ?? "") === f.id ? "text-lume" : ""}`}
            >
              <FolderIcon color={f.color} className={`size-4 ${f.id ? "" : "opacity-40"}`} /> <span className="truncate">{f.name}</span>
              {(atual ?? "") === f.id && <Icon name="check" className="ml-auto size-4" />}
            </button>
          ))}
          {acoes.length > 0 && <div className="my-1 border-t border-edge/10" />}
          {acoes.map((a) => (
            <button key={a.label} type="button" onClick={() => (setOpen(false), a.onClick())} className={`block w-full rounded-xl px-3 py-2 text-left hover:bg-edge/[.06] ${a.danger ? "text-coral" : ""}`}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
