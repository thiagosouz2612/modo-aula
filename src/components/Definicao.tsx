// O que diz o léxico, um sentido por linha e as referências separadas
import type { LexLinha } from "../lib/lexfmt";

export function Definicao({ linhas, onRef, grande = false, tema = "app" }: { linhas: LexLinha[]; onRef?: (r: string) => void; grande?: boolean; tema?: "app" | "noite" | "papel" }) {
  const chip =
    tema === "papel" ? "bg-[#a91d1e]/10 text-[#a91d1e]" : tema === "noite" ? "bg-white/8 text-[#f08a8b]" : "bg-lume/10 text-lume";
  const muted = tema === "papel" ? "text-[#6f675e]" : tema === "noite" ? "text-ink-400" : "text-ink-400";
  return (
    <div className={grande ? "space-y-[1.3cqh]" : "space-y-2.5"}>
      {linhas.map((l, i) => (
        <div key={i} className="flex gap-[0.6em]" style={{ paddingLeft: l.nivel === 2 ? "1.6em" : 0 }}>
          {l.marca && (
            <span
              className={`mt-[0.1em] grid shrink-0 place-items-center rounded-full font-bold ${
                l.nivel === 1 ? "size-[1.45em] bg-marca text-[0.82em] text-white" : `size-[1.45em] text-[0.82em] ring-1 ring-current ${muted}`
              }`}
            >
              {l.marca}
            </span>
          )}
          <div className="min-w-0">
            {l.texto && <p className={`leading-snug ${l.nivel === 0 && i === 0 ? "font-semibold" : ""}`}>{l.texto}</p>}
            {l.refs.length > 0 && (
              <div className="mt-[0.35em] flex flex-wrap gap-[0.3em]">
                {l.refs.map((r, k) =>
                  onRef ? (
                    <button key={k} type="button" onClick={() => onRef(r)} title={`Mostrar ${r}`} className={`rounded-md px-[0.45em] py-[0.1em] text-[0.82em] font-semibold hover:brightness-125 ${chip}`}>
                      {r}
                    </button>
                  ) : (
                    <span key={k} className={`rounded-md px-[0.45em] py-[0.1em] text-[0.82em] font-semibold ${chip}`}>
                      {r}
                    </span>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
