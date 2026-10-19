// ------------------------------------------------------------------
// Peças da interface: logo, botões, ícones, campos.
// ------------------------------------------------------------------
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { CURSO, EMBLEMA, TEOLOGIA } from "./marca";

/** emblema do curso (círculo com a cruz), na cor do texto */
export function Logo({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 285 287" className={className} style={style} aria-hidden="true">
      <path d={EMBLEMA} fill="currentColor" />
    </svg>
  );
}

/** logo completo: "branco" para fundo escuro, "cor" para fundo claro */
export function LogoCompleto({ tom = "cor", className = "", style }: { tom?: "cor" | "branco"; className?: string; style?: CSSProperties }) {
  const red = tom === "branco" ? "#ffffff" : "#a91d1e";
  const ink = tom === "branco" ? "#ffffff" : "#1d1d1b";
  return (
    <svg viewBox="0 0 928 287" className={className} style={style} role="img" aria-label="Curso de Teologia Bethel">
      <path d={EMBLEMA} fill={red} />
      <path d={CURSO} fill={ink} />
      <path d={TEOLOGIA} fill={red} />
    </svg>
  );
}

type Variant = "primary" | "ghost" | "soft" | "danger" | "live";
const VARIANT: Record<Variant, string> = {
  primary: "bg-marca text-white hover:bg-marca-forte shadow-[0_6px_24px_-10px_rgba(169,29,30,.7)]",
  soft: "bg-ink-750 text-ink-100 hover:bg-ink-700 ring-1 ring-inset ring-edge/5",
  ghost: "text-ink-300 hover:text-ink-100 hover:bg-edge/5",
  danger: "text-coral hover:bg-coral/10",
  live: "bg-sage/15 text-sage ring-1 ring-inset ring-sage/30 hover:bg-sage/20",
};

export function Btn({
  variant = "soft",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-8 px-3 text-[13px] gap-1.5 rounded-lg" : size === "lg" ? "h-12 px-6 text-[15px] gap-2.5 rounded-xl" : "h-10 px-4 text-sm gap-2 rounded-xl";
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-45 ${sz} ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-md bg-ink-700 px-1.5 font-sans text-[11px] font-semibold text-ink-300 ring-1 ring-edge/10 ring-inset">
      {children}
    </kbd>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="group inline-flex items-center gap-2.5 text-sm text-ink-200">
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-marca" : "bg-ink-600"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

export function Seg<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-xl bg-ink-850 p-1 ring-1 ring-edge/5 ring-inset">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg font-semibold transition-colors ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-[13px]"} ${
            v === value ? "bg-ink-700 text-ink-100 shadow-sm" : "text-ink-400 hover:text-ink-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export const selCls =
  "h-10 rounded-xl bg-ink-850 px-3 text-sm text-ink-100 ring-1 ring-edge/8 ring-inset focus:ring-lume/60 focus:outline-none";
export const inputCls =
  "h-10 w-full rounded-xl bg-ink-850 px-3.5 text-sm text-ink-100 ring-1 ring-edge/8 ring-inset placeholder:text-ink-500 focus:ring-lume/60 focus:outline-none";

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-300 uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl bg-ink-850 ring-1 ring-edge/6 ring-inset ${className}`}>{children}</div>;
}

// ---------------- ícones (traço 1.8) ----------------
const P: Record<string, ReactNode> = {
  aulas: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5zM9 20h6M12 17v3" />,
  biblia: <path d="M12 6.5C10 5 7.5 4.5 4 5v13c3.5-.5 6 0 8 1.5m0-13c2-1.5 4.5-2 8-1.5v13c-3.5-.5-6 0-8 1.5m0-13v13" />,
  ajustes: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </>
  ),
  rede: (
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0" />
      <circle cx="12" cy="19.2" r="1.1" fill="currentColor" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  play: <path d="M7 5.5v13l11-6.5z" />,
  voltar: <path d="M15 5l-7 7 7 7" />,
  seta: <path d="M9 5l7 7-7 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  lixo: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  pdf: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  projetor: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="15.5" cy="12" r="2.5" />
      <path d="M6 10.5h4M7 17l-1 3M17 17l1 3" />
    </>
  ),
  tela: <path d="M3 5h18v11H3zM8 20h8M12 16v4" />,
  baixar: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  nuvem: <path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18zM12 11v6M9.5 14.5 12 17l2.5-2.5" />,
  caneta: <path d="M15 4.5l4.5 4.5L9 19.5H4.5V15zM13 6.5l4.5 4.5" />,
  borracha: <path d="M9 20h11M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.5z" />,
  sobe: <path d="M12 19V5M6 11l6-6 6 6" />,
  desce: <path d="M12 5v14M6 13l6 6 6-6" />,
  olho: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  pasta: <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  sair: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  versos: <path d="M5 6h14M5 10h9M5 14h14M5 18h7" />,
  preto: <rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" />,
  qr: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />,
  copiar: <path d="M9 9h10v11H9zM5 15V4h10" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  subir: <path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18zM12 17v-6M9.5 13.5 12 11l2.5 2.5" />,
  nota: <path d="M6 3.5h9l3.5 3.5v13.5H6zM15 3.5V7h3.5M9 11h6M9 14.5h6M9 18h4" />,
  relogio: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.5 2M9.5 2.5h5" />
    </>
  ),
  pausa: <path d="M8 5v14M16 5v14" />,
  zerar: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />,
  lua: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
};

export function Icon({ name, className = "size-[18px]" }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
