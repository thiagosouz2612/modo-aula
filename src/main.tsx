import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { setImgBase } from "./components/Palco";
import { Icon, Logo } from "./components/ui";
import { cast, startCast, useCast } from "./lib/cast";
import { isNative, native } from "./lib/native";
import { loadRoteiros, setConectado, syncRoteiros } from "./lib/roteiros";
import { RoteiroScreen, Roteiros } from "./screens/Roteiros";
import { loadStore, store, useLoaded, useStore } from "./lib/store";
import { Ajustes } from "./screens/Ajustes";
import { Apresentar } from "./screens/Apresentar";
import { AulaEditor } from "./screens/AulaEditor";
import { Aulas } from "./screens/Aulas";
import { Biblia } from "./screens/Biblia";
import { Falha } from "./components/Falha";

export type Rota =
  | { r: "aulas" }
  | { r: "aula"; id: string }
  | { r: "apresentar"; id: string }
  | { r: "biblia" }
  | { r: "roteiros" }
  | { r: "roteiro"; id: string }
  | { r: "ajustes"; aba?: string };
export type Go = (r: Rota) => void;

void loadStore();
startCast();
// roteiros: abre os do computador e, com o login da plataforma, sincroniza
void loadRoteiros().then(() =>
  native.config().then((c) => {
    setConectado(c.conectado);
    if (c.conectado) void syncRoteiros();
  }),
);

function App() {
  const loaded = useLoaded();
  const [rota, go] = useState<Rota>({ r: "aulas" });
  const { porta } = useCast();
  const aparencia = useStore((s) => s.prefs.aparencia);
  useEffect(() => {
    document.documentElement.className = aparencia === "claro" ? "claro" : "escuro";
  }, [aparencia]);
  useEffect(() => {
    if (isNative && porta) setImgBase(`http://127.0.0.1:${porta}`);
  }, [porta]);

  if (!loaded) return <div className="grid h-full place-items-center"><Logo className="pulso size-14 text-lume" /></div>;
  if (rota.r === "apresentar")
    return (
      <Falha key="apresentar" onVoltar={() => go({ r: "aulas" })}>
        <Apresentar id={rota.id} go={go} />
      </Falha>
    );

  return (
    <div className="flex h-full">
      <Rail rota={rota} go={go} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* cada tela tem a sua proteção: trocar de tela já volta ao normal */}
        <Falha key={rota.r + ("id" in rota ? rota.id : "")} onVoltar={() => go({ r: "aulas" })}>
        {rota.r === "aulas" && <Aulas go={go} />}
        {rota.r === "aula" && <AulaEditor id={rota.id} go={go} />}
        {rota.r === "biblia" && <Biblia />}
        {rota.r === "roteiros" && <Roteiros go={go} />}
        {rota.r === "roteiro" && <RoteiroScreen key={rota.id} id={rota.id} go={go} />}
        {rota.r === "ajustes" && <Ajustes go={go} aba={rota.aba} />}
        </Falha>
      </main>
    </div>
  );
}

function Rail({ rota, go }: { rota: Rota; go: Go }) {
  const { telas, projetor } = useCast();
  const item = (r: Rota["r"], icon: string, label: string, active: boolean) => (
    <button
      type="button"
      onClick={() => go(r === "aulas" || r === "biblia" || r === "roteiros" ? { r } : { r: "ajustes" })}
      className={`group flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold transition-colors ${
        active ? "bg-edge/[.06] text-ink-100" : "text-ink-400 hover:text-ink-200"
      }`}
    >
      <span className={`grid size-9 place-items-center rounded-xl transition-colors ${active ? "bg-marca text-white" : "group-hover:bg-edge/5"}`}>
        <Icon name={icon} />
      </span>
      {label}
    </button>
  );
  return (
    <nav className="flex w-[88px] shrink-0 flex-col items-center gap-1 border-r border-edge/5 bg-ink-900 px-2.5 py-4">
      <div className="mb-5 flex flex-col items-center gap-1.5" title="Modo Aula · Curso de Teologia Bethel">
        <Logo className="size-11 text-lume" />
        <span className="text-[9.5px] font-bold tracking-[0.14em] whitespace-nowrap text-ink-400 uppercase">Modo Aula</span>
      </div>
      {item("aulas", "aulas", "Aulas", rota.r === "aulas" || rota.r === "aula")}
      {item("roteiros", "nota", "Roteiros", rota.r === "roteiros" || rota.r === "roteiro")}
      {item("biblia", "biblia", "Bíblia", rota.r === "biblia")}
      {item("ajustes", "ajustes", "Ajustes", rota.r === "ajustes")}
      <div className="mt-auto flex w-full flex-col items-center gap-2">
        <ThemeButton />
        <button
          type="button"
          onClick={() => (projetor ? void cast.closeProjector() : void cast.openProjector())}
          title={projetor ? "Fechar a janela do projetor" : "Abrir a projeção no segundo monitor"}
          className={`flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold ${projetor ? "text-sage" : "text-ink-400 hover:text-ink-200"}`}
        >
          <span className={`grid size-9 place-items-center rounded-xl ${projetor ? "bg-sage/15" : "hover:bg-edge/5"}`}>
            <Icon name="projetor" />
          </span>
          {projetor ? "No ar" : "Projetor"}
        </button>
        <button
          type="button"
          onClick={() => go({ r: "ajustes", aba: "rede" })}
          className="flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-ink-300 ring-1 ring-edge/5 hover:text-ink-100"
          title="Telas conectadas pela rede"
        >
          <span className={`size-1.5 rounded-full ${telas ? "bg-sage" : "bg-ink-500"}`} />
          {telas} {telas === 1 ? "tela" : "telas"}
        </button>
      </div>
    </nav>
  );
}

function ThemeButton() {
  const claro = useStore((s) => s.prefs.aparencia === "claro");
  return (
    <button
      type="button"
      onClick={() => store.setPrefs({ aparencia: claro ? "escuro" : "claro" })}
      title={claro ? "Usar o tema escuro" : "Usar o tema claro"}
      className="grid size-9 place-items-center rounded-xl text-ink-400 hover:bg-edge/5 hover:text-ink-100"
    >
      <Icon name={claro ? "lua" : "sol"} />
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Falha>
      <App />
    </Falha>
  </StrictMode>,
);
