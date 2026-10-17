// ------------------------------------------------------------------
// Página da projeção (projetor, TV, outro computador na mesma rede).
// Recebe a tela pelo WebSocket do aplicativo do professor e desenha.
// Se a conexão cair, tenta de novo sozinha e mantém a última tela.
// ------------------------------------------------------------------
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Palco, setImgBase } from "./components/Palco";
import type { Tela } from "./lib/scene";

const params = new URLSearchParams(location.search);
const demo = params.has("demo");
const porta = params.get("porta");
const janela = params.has("janela"); // janela do projetor dentro do aplicativo
// dentro do aplicativo a página vem do próprio app; na rede, do servidor do professor
const base = porta ? `http://127.0.0.1:${porta}` : location.origin;
if (!demo) setImgBase(base);
const wsUrl = base.replace(/^http/, "ws") + "/ws";

type Status = "conectando" | "ok" | "caiu";

function App() {
  const [tela, setTela] = useState<Tela>({ s: { k: "logo" }, tema: "noite", escala: 1 });
  const [status, setStatus] = useState<Status>("conectando");
  const [mouse, setMouse] = useState(false);

  // recebe as telas
  useEffect(() => {
    if (demo) {
      const ch = new BroadcastChannel("modo-aula-demo");
      ch.onmessage = (e) => setTela(JSON.parse(e.data as string));
      setStatus("ok");
      return () => ch.close();
    }
    let ws: WebSocket | null = null;
    let dead = false;
    let wait = 500;
    let retry: ReturnType<typeof setTimeout>;
    const open = () => {
      if (dead) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        wait = 500;
        setStatus("ok");
      };
      ws.onmessage = (e) => {
        try {
          const t = JSON.parse(e.data as string) as Tela;
          if (t && t.s && typeof t.s.k === "string") setTela(t);
        } catch {
          /* mensagem estranha: ignora */
        }
      };
      ws.onclose = () => {
        if (dead) return;
        setStatus("caiu");
        retry = setTimeout(open, wait);
        wait = Math.min(wait * 2, 5000);
      };
    };
    open();
    return () => {
      dead = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  // tela sempre acesa e cursor escondido
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const ask = () => {
      const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
      nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    ask();
    const vis = () => document.visibilityState === "visible" && ask();
    document.addEventListener("visibilitychange", vis);
    let t: ReturnType<typeof setTimeout>;
    const move = () => {
      setMouse(true);
      clearTimeout(t);
      t = setTimeout(() => setMouse(false), 2000);
    };
    window.addEventListener("mousemove", move);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("mousemove", move);
      void lock?.release();
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("mouse", mouse);
  }, [mouse]);

  const full = () => {
    if (janela) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <div className="fixed inset-0" onDoubleClick={full}>
      <Palco tela={tela} />
      {status !== "ok" && (
        <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-ink-300">
          <span className="pulso size-2 rounded-full bg-lume" />
          {status === "conectando" ? "Conectando ao Modo Aula…" : "Conexão perdida · tentando de novo"}
        </div>
      )}
      {mouse && !janela && (
        <button
          type="button"
          onClick={full}
          className="absolute right-4 bottom-4 rounded-full bg-black/70 px-3.5 py-2 text-xs font-semibold text-ink-200 ring-1 ring-edge/10 hover:bg-black/90"
        >
          {document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia (ou dois cliques)"}
        </button>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
