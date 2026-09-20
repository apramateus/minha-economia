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

type Versoes = Partial<Record<NomeArquivo, string>>;

async function buscarTudo(): Promise<{ dados: Dados; versoes: Versoes }> {
  const r = await fetch('/api/dados/');
  if (!r.ok) throw new Error(`Erro ${r.status} ao carregar os dados`);
  const corpo = await r.json();
  // servidor ainda rodando o código antigo (sem reiniciar): funciona igual, só sem a conferência de versão
  return 'dados' in corpo ? corpo : { dados: corpo as Dados, versoes: {} };
}

export function ProvedorDados({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<{ texto: string; tom: 'ok' | 'erro'; id: number; acao?: AcaoDoAviso } | null>(null);
  const ref = useRef<Dados | null>(null);
  const filas = useRef<Partial<Record<NomeArquivo, Promise<void>>>>({});
  const gravando = useRef(0);
  /** como cada arquivo está no disco, e em que versão: é sobre isso que cada mudança é gravada */
  const disco = useRef<Dados | null>(null);
  const versoes = useRef<Versoes>({});
  /** mudanças suas que ainda não foram gravadas, por arquivo (refeitas se o arquivo tiver mudado no disco) */
  const pendentes = useRef<Partial<Record<NomeArquivo, unknown[]>>>({});
  const mudancas = useRef(0);
  const relerDepois = useRef(false);

  const aplicar = (d: Dados) => {
    ref.current = d;
    setDados(d);
  };

  const recarregar = useCallback(async () => {
    // uma leitura que saiu antes de uma mudança sua traria os dados velhos de volta: espera a gravação e lê de novo
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (gravando.current > 0) {
        relerDepois.current = true;
        return;
      }
      const marca = mudancas.current;
      let lido;
      try {
        lido = await buscarTudo();
      } catch (e) {
        if (!ref.current) setErro((e as Error).message);
        return;
      }
      if (gravando.current > 0) {
        relerDepois.current = true;
        return;
      }
      if (mudancas.current !== marca) continue;
      disco.current = lido.dados;
      versoes.current = lido.versoes;
      aplicar(lido.dados);
      setErro(null);
      return;
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

  /**
   * Grava uma mudança por cima do que está no disco. Se o arquivo mudou desde a última leitura (outro aparelho,
   * a sincronização, o copiloto), refaz a mudança por cima do que chegou em vez de gravar por cima dele.
   */
  const gravar = useCallback(async <N extends NomeArquivo>(nome: N, fn: (atual: Dados[N]) => Dados[N]) => {
    for (let tentativa = 0; ; tentativa++) {
      const novo = fn(disco.current![nome]);
      const r = await fetch(`/api/dados/${nome}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': versoes.current[nome] ?? '' },
        body: JSON.stringify(novo),
      });
      const corpo = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (r.ok) {
        disco.current = { ...disco.current!, [nome]: novo };
        versoes.current[nome] = corpo.versao as string;
        return;
      }
      if (r.status !== 409 || tentativa >= 2) throw new Error((corpo.erro as string) ?? `Erro ${r.status}`);
      disco.current = { ...disco.current!, [nome]: corpo.dados as Dados[N] };
      versoes.current[nome] = corpo.versao as string;
      // na tela: o que chegou, com as suas mudanças que ainda não foram gravadas por cima
      const fila = (pendentes.current[nome] ?? []) as unknown as ((atual: Dados[N]) => Dados[N])[];
      aplicar({ ...ref.current!, [nome]: fila.reduce((v, f) => f(v), corpo.dados as Dados[N]) });
    }
  }, []);

  const atualizar = useCallback(
    async <N extends NomeArquivo>(nome: N, fn: (atual: Dados[N]) => Dados[N]) => {
      const atual = ref.current;
      if (!atual) return;
      aplicar({ ...atual, [nome]: fn(atual[nome]) });
      mudancas.current++;
      gravando.current++;
      const fila = (pendentes.current[nome] ??= []) as unknown as ((a: Dados[N]) => Dados[N])[];
      fila.push(fn);
      const anterior = filas.current[nome] ?? Promise.resolve();
      const envio = anterior.then(() => gravar(nome, fn));
      filas.current[nome] = envio.catch(() => undefined);
      try {
        await envio;
        fila.shift();
      } catch (e) {
        fila.shift();
        // não foi para o disco: a tela volta para o que está gravado, com o que ainda está na fila por cima
        aplicar({ ...ref.current!, [nome]: fila.reduce((v, f) => f(v), disco.current![nome]) });
        aviso(`Não consegui salvar (${(e as Error).message}). O servidor está rodando?`, 'erro');
      } finally {
        gravando.current--;
        if (gravando.current === 0 && relerDepois.current) {
          relerDepois.current = false;
          void recarregar();
        }
      }
    },
    [aviso, gravar, recarregar],
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
