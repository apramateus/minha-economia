import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ProvedorDados } from './lib/estado';
import { ProvedorBanco } from './lib/banco';

/** Se alguma tela quebrar, mostra um aviso com botão de recarregar em vez de tela branca. */
class ProtecaoErros extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold">Algo deu errado nesta tela.</p>
        <p className="mt-2 text-sm text-muted">{this.state.erro.message}</p>
        <button className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={() => location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProtecaoErros>
    <ProvedorDados>
      <ProvedorBanco>
        <App />
      </ProvedorBanco>
    </ProvedorDados>
    </ProtecaoErros>
  </StrictMode>,
);
