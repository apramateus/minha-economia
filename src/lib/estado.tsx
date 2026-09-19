// Estado global: carrega data/*.json pela API e grava cada arquivo quando muda.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Dados, NomeArquivo } from './tipos';

interface Contexto {
  dados: Dados;
  /** Atualiza um arquivo a partir do valor mais recente e grava no disco. */
  atualizar: <N extends NomeArquivo>(nome: N, fn: (atual: Dados[N]) => Dados[N]) => Promise<void>;
  /** Aviso rápido embaixo; com `acao`, ganha um botão (ex.: Desfazer) e fica mais tempo. */
  aviso: (texto: string, tom?: 'ok' | 'erro', acao?: AcaoDoAviso) => void;
  /** Relê data/*.json do disco (ex.: depois de sincronizar com o banco). */
  recarregar: () => Promise<void>;
}

export interface AcaoDoAviso {
  rotulo: string;
  fazer: () => void;
}

const Ctx = createContext<Contexto | null>(null);

export function useDados() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDados fora do provider');
  return c;
}

async function buscarTudo(): Promise<Dados> {
  const r = await fetch('/api/dados/');
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar os dados`);
  return r.json();
}

export function ProvedorDados({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<{ texto: string; tom: 'ok' | 'erro'; id: number; acao?: AcaoDoAviso } | null>(null);
  const ref = useRef<Dados | null>(null);
  const filas = useRef<Partial<Record<NomeArquivo, Promise<void>>>>({});
  const gravando = useRef(0);

  const aplicar = (d: Dados) => {
    ref.current = d;
    setDados(d);
  };

  const recarregar = useCallback(async () => {
    if (gravando.current > 0) return; // não sobrescreve algo que ainda está sendo salvo
    try {
      aplicar(await buscarTudo());
      setErro(null);
    } catch (e) {
      if (!ref.current) setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    recarregar();
    // sincroniza Mac e iPhone quando você volta para o app
    const aoVoltar = () => document.visibilityState === 'visible' && recarregar();
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [recarregar]);

  const aviso = useCallback((texto: string, tom: 'ok' | 'erro' = 'ok', acao?: AcaoDoAviso) => {
    const id = Date.now();
    setToast({ texto, tom, id, acao });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), acao ? 7000 : 3200);
  }, []);

  const atualizar = useCallback(
    async <N extends NomeArquivo>(nome: N, fn: (atual: Dados[N]) => Dados[N]) => {
      const atual = ref.current;
      if (!atual) return;
      const novo = fn(atual[nome]);
      aplicar({ ...atual, [nome]: novo });
      gravando.current++;
      const anterior = filas.current[nome] ?? Promise.resolve();
      const envio = anterior.then(async () => {
        const r = await fetch(`/api/dados/${nome}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(novo),
        });
        if (!r.ok) throw new Error(`Erro ${r.status}`);
      });
      filas.current[nome] = envio.catch(() => undefined);
      try {
        await envio;
      } catch (e) {
        aviso(`Não consegui salvar (${(e as Error).message}). O servidor está rodando?`, 'erro');
      } finally {
        gravando.current--;
      }
    },
    [aviso],
  );

  if (erro)
    return (
      <div className="p-6 text-center text-ink-2">
        <p className="font-semibold text-ink">Não consegui carregar seus dados.</p>
        <p className="mt-2 text-sm">{erro}</p>
        <p className="mt-2 text-sm">Confira se o app está rodando com `npm run dev` no Mac.</p>
      </div>
    );
  if (!dados) return <div className="p-6 text-center text-muted">Carregando…</div>;

  return (
    <Ctx.Provider value={{ dados, atualizar, aviso, recarregar }}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 lg:bottom-8 lg:pl-[var(--margem-app,14rem)]">
          <div
            role="status"
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-medium shadow-lg lg:rounded-full ${
              toast.tom === 'erro' ? 'bg-critical text-white' : 'bg-ink text-page'
            }`}
          >
            {toast.texto}
            {toast.acao && (
              <button
                className="-my-1 -mr-2 rounded-full px-2 py-1 font-semibold text-accent-weak underline-offset-2 hover:underline"
                onClick={() => {
                  toast.acao?.fazer();
                  setToast(null);
                }}
              >
                {toast.acao.rotulo}
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
