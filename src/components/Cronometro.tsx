// Cronômetro na barra da apresentação
import { useEffect, useRef, useState } from "react";
import { fmt, timer, useTimer } from "../lib/timer";
import { Icon } from "./ui";

export function Cronometro() {
  const t = useTimer();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const cor =
    t.fase === "passou"
      ? "bg-marca text-white ring-marca pulso-forte"
      : t.fase === "aviso"
        ? "bg-[#f59e0b]/20 text-[#f5b041] ring-[#f59e0b]/50 pulso"
        : t.running
          ? "bg-ink-800 text-ink-100 ring-edge/10"
          : "bg-ink-800 text-ink-300 ring-edge/10";

  return (
    <div ref={box} className="relative flex items-center">
      <div className={`flex h-9 items-center gap-1 rounded-xl pr-1 pl-2.5 ring-1 ring-inset ${cor}`}>
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-baseline gap-1.5 font-mono text-[15px] font-bold tabular-nums" title="Programar o tempo da aula">
          <Icon name="relogio" className="size-4 self-center" />
          {t.fase === "passou" ? `+${fmt(-(t.resta ?? 0))}` : fmt(t.ms)}
          {t.alvo && t.fase !== "passou" && <span className="text-[11px] font-semibold opacity-70">/ {fmt(t.alvo)}</span>}
        </button>
        <button
          type="button"
          onClick={timer.toggle}
          title={t.running ? "Pausar" : t.ms ? "Continuar" : "Começar"}
          className="grid size-7 place-items-center rounded-lg hover:bg-edge/10"
        >
          <Icon name={t.running ? "pausa" : "play"} className="size-3.5" />
        </button>
      </div>
      {open && (
        <div className="absolute top-11 right-0 z-40 w-72 rounded-2xl bg-ink-800 p-4 shadow-2xl ring-1 ring-edge/10">
          <p className="text-[11px] font-bold tracking-[0.18em] text-ink-400 uppercase">Cronômetro da aula</p>
          <p className={`mt-2 font-mono text-4xl font-bold tabular-nums ${t.fase === "passou" ? "text-lume" : ""}`}>{fmt(t.ms)}</p>
          {t.alvo && (
            <p className={`mt-1 text-sm ${t.fase === "passou" ? "font-semibold text-lume" : t.fase === "aviso" ? "text-[#f5b041]" : "text-ink-400"}`}>
              {t.fase === "passou" ? `Passou ${fmt(-(t.resta ?? 0))} do tempo` : `Faltam ${fmt(t.resta ?? 0)}`}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={timer.toggle} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-marca text-sm font-semibold text-white hover:bg-marca-forte">
              <Icon name={t.running ? "pausa" : "play"} className="size-4" /> {t.running ? "Pausar" : t.ms ? "Continuar" : "Começar"}
            </button>
            <button type="button" onClick={() => confirm("Zerar o cronômetro?") && timer.reset()} className="flex h-9 items-center gap-1.5 rounded-xl bg-ink-700 px-3 text-sm font-semibold hover:bg-ink-600">
              <Icon name="zerar" className="size-4" /> Zerar
            </button>
          </div>
          <div className="mt-4 border-t border-edge/8 pt-3">
            <p className="text-xs font-semibold text-ink-300">Tempo da aula</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([[30, "30 min"], [45, "45 min"], [60, "1h"], [90, "1h30"], [120, "2h"]] as const).map(([m, rotulo]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => timer.setAlvo(m)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${t.alvo === m * 60000 ? "bg-lume/15 text-lume ring-lume/40" : "text-ink-300 ring-edge/10 hover:text-ink-100"}`}
                >
                  {rotulo}
                </button>
              ))}
              <button
                type="button"
                onClick={() => timer.setAlvo(null)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${!t.alvo ? "bg-lume/15 text-lume ring-lume/40" : "text-ink-300 ring-edge/10"}`}
              >
                Livre
              </button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-300">
              Outro:
              <input
                type="number"
                min={1}
                max={600}
                defaultValue={t.alvo ? Math.round(t.alvo / 60000) : ""}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => Number(e.target.value) > 0 && timer.setAlvo(Number(e.target.value))}
                className="h-8 w-20 rounded-lg bg-ink-850 px-2 text-sm ring-1 ring-edge/10 outline-none"
              />
              minutos
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-300">
              Avisar quando faltar
              <select
                value={Math.round(t.aviso / 60000)}
                onChange={(e) => timer.setAviso(Number(e.target.value))}
                className="h-8 rounded-lg bg-ink-850 px-2 text-sm ring-1 ring-edge/10"
              >
                {[1, 2, 5, 10, 15].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
