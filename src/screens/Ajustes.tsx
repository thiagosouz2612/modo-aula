// ------------------------------------------------------------------
// Ajustes: projeção, telas da rede, conta da plataforma e Bíblia offline.
// ------------------------------------------------------------------
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Go } from "../main";
import { Palco } from "../components/Palco";
import { Btn, Card, Field, Icon, inputCls, Seg, Toggle } from "../components/ui";
import { cast, useCast } from "../lib/cast";
import { useCatalog } from "../lib/hooks";
import { fmtBytes, native, on, type BibliaStatus, type Config, type Info, type Progresso } from "../lib/native";
import { store, useStore } from "../lib/store";
import { importFromPlatform } from "../lib/sync";

const ABAS = [
  ["projecao", "Projeção", "projetor"],
  ["rede", "Telas na rede", "rede"],
  ["conta", "Plataforma", "nuvem"],
  ["biblia", "Bíblia sem internet", "biblia"],
] as const;
type Aba = (typeof ABAS)[number][0];

export function Ajustes({ go, aba: inicial }: { go: Go; aba?: string }) {
  const [aba, setAba] = useState<Aba>((ABAS.find((a) => a[0] === inicial)?.[0] ?? "projecao") as Aba);
  useEffect(() => {
    if (inicial) setAba(inicial as Aba);
  }, [inicial]);
  return (
    <div className="mx-auto flex max-w-[1100px] gap-10 px-10 pt-10 pb-16">
      <nav className="w-52 shrink-0">
        <h1 className="mb-6 font-serif text-3xl font-semibold">Ajustes</h1>
        <div className="space-y-1">
          {ABAS.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                aba === id ? "bg-edge/[.06] text-ink-100" : "text-ink-400 hover:text-ink-200"
              }`}
            >
              <Icon name={icon} className={`size-4 ${aba === id ? "text-lume" : ""}`} /> {label}
            </button>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        {aba === "projecao" && <Projecao />}
        {aba === "rede" && <Rede />}
        {aba === "conta" && <Conta go={go} />}
        {aba === "biblia" && <BibliaOffline />}
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-ink-400">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ---------------- projeção ----------------
function Projecao() {
  const prefs = useStore((s) => s.prefs);
  const { cat } = useCatalog();
  const sample = {
    s: {
      k: "texto" as const,
      ref: "João 3:16",
      versao: prefs.versao,
      vista: "traducao" as const,
      heb: false,
      verses: [{ n: 16, text: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo o que nele crê não pereça, mas tenha a vida eterna." }],
      marks: [[16, 7, 24, 0]] as [number, number, number, number][],
    },
    tema: prefs.tema,
    escala: prefs.escala,
  };
  const set = (p: Partial<typeof prefs>) => {
    store.setPrefs(p);
    setTimeout(() => cast.refresh(), 0);
  };
  return (
    <>
      <Section title="Cores do aplicativo" desc="Só muda a tela do professor. A projeção tem a sua própria escolha logo abaixo.">
        <Seg value={prefs.aparencia} options={[["escuro", "Escuro"], ["claro", "Claro"]]} onChange={(aparencia) => store.setPrefs({ aparencia })} />
      </Section>
      <Section title="Aparência da projeção" desc="Vale para o projetor e para todas as telas da rede.">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="aspect-video overflow-hidden rounded-xl ring-1 ring-edge/10">
            <Palco tela={sample} mini />
          </div>
          <div className="space-y-5">
            <Field label="Fundo">
              <Seg value={prefs.tema} options={[["noite", "Escuro"], ["papel", "Claro"]]} onChange={(tema) => set({ tema })} />
            </Field>
            <Field label={`Tamanho da letra · ${Math.round(prefs.escala * 100)}%`} hint="O texto sempre se ajusta para caber; isto limita o tamanho máximo.">
              <input type="range" min={0.7} max={1.3} step={0.05} value={prefs.escala} onChange={(e) => set({ escala: Number(e.target.value) })} className="w-full accent-[#a91d1e]" />
            </Field>
          </div>
        </div>
      </Section>
      <Section title="Textos">
        <div className="space-y-4">
          <Toggle on={prefs.porVerso} onChange={(porVerso) => store.setPrefs({ porVerso })} label="Mostrar um versículo por vez (textos com 2 ou mais versículos)" />
          <Field label="Versão padrão dos textos novos">
            <select value={prefs.versao} onChange={(e) => store.setPrefs({ versao: e.target.value })} className={`${inputCls} max-w-sm`}>
              {(cat?.versions ?? [{ id: prefs.versao, name: prefs.versao }]).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id} — {v.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>
    </>
  );
}

// ---------------- rede ----------------
function Rede() {
  const { telas } = useCast();
  const [info, setInfo] = useState<Info | null>(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void native.infoTransmissao().then(setInfo);
  }, [telas]);
  const url = info?.enderecos[0] ? `http://${info.enderecos[0]}:${info.porta}` : "";
  useEffect(() => {
    if (url) void QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#0b0d10", light: "#f4efe6" } }).then(setQr);
  }, [url]);
  return (
    <>
      <Section
        title="Telas na rede"
        desc="Qualquer computador, TV ou celular ligado na mesma rede (Wi-Fi ou cabo) pode mostrar a projeção. Não usa internet: vai direto deste computador para a tela."
      >
        <Card className="flex flex-wrap items-center gap-6 p-6">
          {qr ? <img src={qr} alt="QR code do endereço" className="size-40 rounded-xl" /> : <div className="grid size-40 place-items-center rounded-xl bg-ink-800 text-xs text-ink-500">sem rede</div>}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-[0.18em] text-ink-400 uppercase">Abra no navegador da outra tela</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-lume" data-select>
              {url || "Sem rede conectada"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {url && (
                <Btn size="sm" onClick={() => void navigator.clipboard.writeText(url).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}>
                  <Icon name={copied ? "check" : "copiar"} className="size-4" /> {copied ? "Copiado" : "Copiar endereço"}
                </Btn>
              )}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${telas ? "bg-sage/12 text-sage" : "bg-ink-800 text-ink-400"}`}>
                <span className={`size-1.5 rounded-full ${telas ? "bg-sage" : "bg-ink-500"}`} />
                {telas} {telas === 1 ? "tela conectada" : "telas conectadas"}
              </span>
            </div>
            {info && info.enderecos.length > 1 && (
              <p className="mt-3 text-xs text-ink-400">
                Outros endereços deste computador: {info.enderecos.slice(1).map((e) => `http://${e}:${info.porta}`).join(" · ")}
              </p>
            )}
          </div>
        </Card>
      </Section>
      <Section title="Se a outra tela não abrir">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-300">
          <li>Confira se as duas estão na mesma rede (o mesmo Wi-Fi ou o mesmo roteador).</li>
          <li>
            Na primeira vez, o Windows pergunta se o Modo Aula pode usar a rede: marque <b>Redes privadas</b> e clique em <b>Permitir</b>. Se negou sem querer: Painel de Controle → Firewall do
            Windows → Permitir um aplicativo → Modo Aula.
          </li>
          <li>Redes de visitantes (Wi-Fi de igreja/escola com “isolamento”) podem bloquear a ligação entre aparelhos. Nesse caso, use o cabo HDMI e o botão Projetor.</li>
        </ol>
      </Section>
    </>
  );
}

// ---------------- conta ----------------
function Conta({ go }: { go: Go }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [site, setSite] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const reload = () =>
    native.config().then((c) => {
      setCfg(c);
      setSite(c.site);
      setUser(c.usuario ?? "");
    });
  useEffect(() => {
    void reload();
  }, []);
  if (!cfg) return null;

  const entrar = async () => {
    setMsg(null);
    setBusy("Entrando…");
    try {
      if (site.trim() !== cfg.site) await native.definirSite(site);
      const nome = await native.entrar(user, pass);
      setPass("");
      setMsg({ ok: true, t: `Conectado como ${nome}.` });
      await reload();
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : "Não foi possível entrar." });
    } finally {
      setBusy("");
    }
  };
  const trazer = async () => {
    setMsg(null);
    try {
      const r = await importFromPlatform(setBusy);
      setMsg({ ok: !r.falhas.length, t: `${r.aulas} aulas trazidas${r.pdfs ? `, ${r.pdfs} PDFs baixados` : ""}.${r.falhas.length ? ` Falhou: ${r.falhas.join("; ")}` : ""}` });
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : "Não foi possível." });
      await reload();
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <Section title="Plataforma do curso" desc="Entre com o mesmo login de professor do site para trazer as aulas que o senhor montou no modo aula de lá (textos, destaques, comentários e slides).">
        <Card className="space-y-4 p-6">
          {cfg.conectado ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-sage/15 text-sage">
                <Icon name="check" />
              </span>
              <div className="flex-1">
                <p className="font-semibold">{cfg.nome ?? cfg.usuario}</p>
                <p className="text-xs text-ink-400">{cfg.site}</p>
              </div>
              <Btn variant="primary" onClick={() => void trazer()} disabled={Boolean(busy)}>
                <Icon name="nuvem" /> Trazer as aulas
              </Btn>
              <Btn variant="ghost" onClick={() => void native.sair().then(reload)}>
                <Icon name="sair" className="size-4" /> Sair
              </Btn>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Login">
                  <input value={user} onChange={(e) => setUser(e.target.value)} className={inputCls} placeholder="prof.nome.sobrenome" autoComplete="username" />
                </Field>
                <Field label="Senha">
                  <input value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void entrar()} type="password" className={inputCls} autoComplete="current-password" />
                </Field>
              </div>
              <Btn variant="primary" onClick={() => void entrar()} disabled={!user.trim() || !pass || Boolean(busy)}>
                Entrar
              </Btn>
            </>
          )}
          {(busy || msg) && <p className={`text-sm ${busy ? "text-ink-300" : msg?.ok ? "text-sage" : "text-coral"}`}>{busy || msg?.t}</p>}
          {msg?.ok && cfg.conectado && (
            <Btn size="sm" variant="ghost" onClick={() => go({ r: "aulas" })}>
              Ver as aulas <Icon name="seta" className="size-4" />
            </Btn>
          )}
        </Card>
      </Section>
      <Section title="Endereço do site" desc="De onde vêm as aulas e a Bíblia.">
        <div className="flex max-w-xl gap-2">
          <input value={site} onChange={(e) => setSite(e.target.value)} className={inputCls} />
          <Btn onClick={() => void native.definirSite(site).then(reload)} disabled={site.trim() === cfg.site}>
            Salvar
          </Btn>
        </div>
        <p className="mt-3 text-xs text-ink-500">Dados deste computador: {cfg.pasta}</p>
      </Section>
    </>
  );
}

// ---------------- Bíblia offline ----------------
function BibliaOffline() {
  const { cat, err, retry } = useCatalog();
  const [st, setSt] = useState<BibliaStatus | null>(null);
  const [pick, setPick] = useState<string[]>(["NAA", "ARA", "ARC", "NVI", "ACF"]);
  const [orig, setOrig] = useState(true);
  const [prog, setProg] = useState<Progresso | null>(null);
  const [msg, setMsg] = useState("");
  const reload = () => void native.bibliaStatus().then(setSt);
  useEffect(() => {
    reload();
    return on<Progresso>("biblia-progresso", (p) => {
      setProg(p.fim ? null : p);
      if (p.fim) {
        reload();
        retry();
        setMsg(p.erro ? p.erro : p.falhas ? `Pronto, mas ${p.falhas} arquivos falharam. Clique de novo para tentar só os que faltam.` : "Pronto! A Bíblia escolhida já abre sem internet.");
      }
    });
  }, []);

  const start = async () => {
    setMsg("");
    setProg({ feitos: 0, total: 0, falhas: 0, fim: false });
    try {
      await native.baixarBiblia(pick, orig);
    } catch (e) {
      setProg(null);
      setMsg(e instanceof Error ? e.message : "Não foi possível.");
    }
  };

  return (
    <Section
      title="Bíblia sem internet"
      desc="A Bíblia completa (todas as versões, grego, hebraico e léxico) já vem instalada com o aplicativo e funciona sem internet. Use o botão abaixo só se o site ganhar uma versão nova."
    >
      <Card className="p-6">
        {st && (
          <p className="text-sm text-ink-300">
            Instalada: <b className="text-ink-100">{fmtBytes(st.bytes)}</b> em {st.arquivos} arquivos
            {st.versoes.length ? ` · versões completas: ${st.versoes.join(", ")}` : ""}
            {st.originais ? ` · ${st.originais} capítulos do original` : ""}.
          </p>
        )}
        <p className="mt-5 mb-2 text-xs font-bold tracking-[0.18em] text-ink-400 uppercase">Versões para baixar</p>
        {cat ? (
          <div className="flex flex-wrap gap-1.5">
            {cat.versions.map((v) => {
              const on_ = pick.includes(v.id);
              const done = st?.versoes.includes(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  title={v.name}
                  onClick={() => setPick(on_ ? pick.filter((x) => x !== v.id) : [...pick, v.id])}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ring-1 ring-inset ${
                    on_ ? "bg-lume/15 text-lume ring-lume/35" : "text-ink-300 ring-edge/8 hover:text-ink-100"
                  }`}
                >
                  {done && <Icon name="check" className="size-3.5 text-sage" />}
                  {v.id}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-coral">{err || "Carregando…"}</p>
        )}
        <div className="mt-4">
          <Toggle on={orig} onChange={setOrig} label="Também o grego e o hebraico (original, interlinear e léxico · ~13 MB)" />
        </div>
        <p className="mt-3 text-xs text-ink-500">Cada versão ocupa cerca de 1,5 MB.</p>
        <div className="mt-5 flex items-center gap-3">
          <Btn variant="primary" onClick={() => void start()} disabled={Boolean(prog) || (!pick.length && !orig)}>
            <Icon name="baixar" /> Buscar no site o que faltar
          </Btn>
        </div>
        {prog && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-ink-300">
              <span>Baixando… {prog.feitos} de {prog.total || "?"}</span>
              <span>{prog.total ? Math.round((prog.feitos / prog.total) * 100) : 0}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-marca transition-[width]" style={{ width: `${prog.total ? Math.max(3, (prog.feitos / prog.total) * 100) : 3}%` }} />
            </div>
          </div>
        )}
        {msg && <p className="mt-4 text-sm text-ink-200">{msg}</p>}
      </Card>
    </Section>
  );
}
