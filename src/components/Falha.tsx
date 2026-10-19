// ------------------------------------------------------------------
// Proteção contra erro: se uma tela falhar, mostra o aviso (e o
// detalhe do erro) em vez de deixar o aplicativo em branco. Trocar de
// tela ou clicar em "Tentar de novo" volta ao normal.
// ------------------------------------------------------------------
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; onVoltar?: () => void };
type State = { erro: Error | null; onde: string };

export class Falha extends Component<Props, State> {
  state: State = { erro: null, onde: "" };
  static getDerivedStateFromError(erro: Error): Partial<State> {
    return { erro };
  }
  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error("Modo Aula:", erro, info.componentStack);
    this.setState({ onde: (info.componentStack ?? "").trim().split("\n").slice(0, 6).join("\n") });
  }
  render() {
    const { erro, onde } = this.state;
    if (!erro) return this.props.children;
    const detalhe = `${erro.name}: ${erro.message}\n${(erro.stack ?? "").split("\n").slice(1, 6).join("\n")}\n${onde}`;
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="w-full max-w-lg rounded-2xl bg-ink-850 p-6 text-center ring-1 ring-edge/8 ring-inset">
          <p className="font-display text-xl font-semibold">Esta tela teve um problema</p>
          <p className="mt-2 text-sm text-ink-400">Nada foi perdido. Tente abrir de novo ou volte para as aulas.</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={() => this.setState({ erro: null, onde: "" })} className="h-10 rounded-xl bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-forte">
              Tentar de novo
            </button>
            {this.props.onVoltar && (
              <button type="button" onClick={() => (this.setState({ erro: null, onde: "" }), this.props.onVoltar?.())} className="h-10 rounded-xl bg-ink-750 px-4 text-sm font-semibold text-ink-100 hover:bg-ink-700">
                Voltar para as aulas
              </button>
            )}
          </div>
          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-xs font-semibold text-ink-400">Detalhes do erro (para enviar ao suporte)</summary>
            <pre data-select className="mt-2 max-h-56 overflow-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-300">{detalhe}</pre>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(detalhe)} className="mt-2 text-xs font-semibold text-lume hover:underline">
              Copiar detalhes
            </button>
          </details>
        </div>
      </div>
    );
  }
}
