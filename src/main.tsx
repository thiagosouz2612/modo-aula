import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { setImgBase } from "./components/Palco";
import { Icon, Logo } from "./components/ui";
import { cast, startCast, useCast } from "./lib/cast";
import { isNative } from "./lib/native";
import { loadStore, useLoaded } from "./lib/store";
import { Ajustes } from "./screens/Ajustes";
import { Apresentar } from "./screens/Apresentar";
import { AulaEditor } from "./screens/AulaEditor";
import { Aulas } from "./screens/Aulas";
import { Biblia } from "./screens/Biblia";

export type Rota = { r: "aulas" } | { r: "aula"; id: string } | { r: "apresentar"; id: string } | { r: "biblia" } | { r: "ajustes"; aba?: string };
export type Go = (r: Rota) => void;

void loadStore();
startCast();

function App() {
  const loaded = useLoaded();
  const [rota, go] = useState<Rota>({ r: "aulas" });
  const { porta } = useCast();
  useEffect(() => {
    if (isNative && porta) setImgBase(`http://127.0.0.1:${porta}`);
  }, [porta]);

  if (!loaded) return <div className="grid h-full place-items-center"><Logo className="pulso size-14" /></div>;
  if (rota.r === "apresentar") return <Apresentar id={rota.id} go={go} />;

  return (
    <div className="flex h-full">
      <Rail rota={rota} go={go} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {rota.r === "aulas" && <Aulas go={go} />}
        {rota.r === "aula" && <AulaEditor id={rota.id} go={go} />}
        {rota.r === "biblia" && <Biblia />}
        {rota.r === "ajustes" && <Ajustes go={go} aba={rota.aba} />}
      </main>
    </div>
  );
}

function Rail({ rota, go }: { rota: Rota; go: Go }) {
  const { telas, projetor } = useCast();
  const item = (r: Rota["r"], icon: string, label: string, active: boolean) => (
    <button
      type="button"
      onClick={() => go(r === "aulas" ? { r } : r === "biblia" ? { r } : { r: "ajustes" })}
      className={`group flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold transition-colors ${
        active ? "bg-white/[.06] text-ink-100" : "text-ink-400 hover:text-ink-200"
      }`}
    >
      <span className={`grid size-9 place-items-center rounded-xl transition-colors ${active ? "bg-lume text-ink-950" : "group-hover:bg-white/5"}`}>
        <Icon name={icon} />
      </span>
      {label}
    </button>
  );
  return (
    <nav className="flex w-[88px] shrink-0 flex-col items-center gap-1 border-r border-white/5 bg-ink-900 px-2.5 py-4">
      <div className="mb-5 flex flex-col items-center" title="Modo Aula">
        <Logo className="size-10" />
      </div>
      {item("aulas", "aulas", "Aulas", rota.r === "aulas" || rota.r === "aula")}
      {item("biblia", "biblia", "Bíblia", rota.r === "biblia")}
      {item("ajustes", "ajustes", "Ajustes", rota.r === "ajustes")}
      <div className="mt-auto flex w-full flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => (projetor ? void cast.closeProjector() : void cast.openProjector())}
          title={projetor ? "Fechar a janela do projetor" : "Abrir a projeção no segundo monitor"}
          className={`flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold ${projetor ? "text-sage" : "text-ink-400 hover:text-ink-200"}`}
        >
          <span className={`grid size-9 place-items-center rounded-xl ${projetor ? "bg-sage/15" : "hover:bg-white/5"}`}>
            <Icon name="projetor" />
          </span>
          {projetor ? "No ar" : "Projetor"}
        </button>
        <button
          type="button"
          onClick={() => go({ r: "ajustes", aba: "rede" })}
          className="flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-ink-300 ring-1 ring-white/5 hover:text-ink-100"
          title="Telas conectadas pela rede"
        >
          <span className={`size-1.5 rounded-full ${telas ? "bg-sage" : "bg-ink-500"}`} />
          {telas} {telas === 1 ? "tela" : "telas"}
        </button>
      </div>
    </nav>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
