// ------------------------------------------------------------------
// Cronômetro da aula: conta o tempo, pausa e continua de onde parou.
// Com um tempo programado, avisa quando está acabando (pisca) e mostra
// quanto passou do tempo. Continua contando mesmo saindo da apresentação.
// ------------------------------------------------------------------
import { useEffect, useState, useSyncExternalStore } from "react";

export type TimerState = {
  running: boolean;
  startedAt: number | null; // quando foi ligado da última vez
  acumulado: number; // ms contados antes da última pausa
  alvo: number | null; // tempo programado (ms)
  aviso: number; // avisar quando faltar (ms)
};

const KEY = "modo-aula:cronometro";
let st: TimerState = { running: false, startedAt: null, acumulado: 0, alvo: 60 * 60 * 1000, aviso: 5 * 60 * 1000 };
try {
  const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
  if (raw && typeof raw === "object") st = { ...st, ...raw };
} catch {
  /* sem dados */
}
const subs = new Set<() => void>();
const set = (p: Partial<TimerState>) => {
  st = { ...st, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch {
    /* tudo bem */
  }
  subs.forEach((f) => f());
};

export const elapsed = (s: TimerState = st) => s.acumulado + (s.running && s.startedAt ? Date.now() - s.startedAt : 0);

export const timer = {
  start: () => !st.running && set({ running: true, startedAt: Date.now() }),
  pause: () => st.running && set({ running: false, startedAt: null, acumulado: elapsed() }),
  toggle: () => (st.running ? timer.pause() : timer.start()),
  reset: () => set({ running: false, startedAt: null, acumulado: 0 }),
  setAlvo: (min: number | null) => set({ alvo: min && min > 0 ? Math.round(min * 60000) : null }),
  setAviso: (min: number) => set({ aviso: Math.max(0, Math.round(min * 60000)) }),
};

export function useTimer() {
  const s = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => st,
  );
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [s.running]);
  const ms = elapsed(s);
  const resta = s.alvo ? s.alvo - ms : null;
  const fase: "normal" | "aviso" | "passou" = resta === null ? "normal" : resta < 0 ? "passou" : resta <= s.aviso ? "aviso" : "normal";
  return { ...s, ms, resta, fase };
}

export function fmt(ms: number) {
  const t = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
