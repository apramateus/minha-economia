// Conexão com o banco (Meu Pluggy): status, botão de atualizar e sincronização automática. O Meu Pluggy busca cada
// conexão no banco 1× por dia: o app busca sozinho logo depois disso (ao abrir, ao voltar para ele ou com ele aberto;
// a regra fica em sincronizacao.ts).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDados } from './estado';
import { precisaSincronizar, proximaVerificacao, quando } from './sincronizacao';
import type { ConexaoBanco } from './tipos';

interface Relatorio {
  novas: number;
  semCategoria: unknown[];
  avisos: string[];
  itens: { proximaAtualizacaoBanco?: string | null }[];
}

interface Banco {
  configurado: boolean;
  sincronizando: boolean;
  sincronizadoEm: string | null;
  conexoes: ConexaoBanco[];
  sincronizar: (silencioso?: boolean) => Promise<void>;
}

const Ctx = createContext<Banco>({ configurado: false, sincronizando: false, sincronizadoEm: null, conexoes: [], sincronizar: async () => {} });
export const useBanco = () => useContext(Ctx);

/** o app aberto olha de novo no máximo a cada tanto (o navegador segura timers longos) */
const MAX_ESPERA_MS = 30 * 60_000;

export function ProvedorBanco({ children }: { children: ReactNode }) {
  const { dados, recarregar, aviso } = useDados();
  const [configurado, setConfigurado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  /** cada vez que o timer vence, a conta é refeita e o próximo é marcado */
  const [tique, setTique] = useState(0);
  const rodando = useRef(false);
  const sincronizadoEm = dados.patrimonio.sincronizadoEm ?? null;
  const conexoes = dados.patrimonio.conexoes;

  const sincronizar = useCallback(
    async (silencioso = false) => {
      if (rodando.current) return;
      rodando.current = true;
      setSincronizando(true);
      try {
        const r = await fetch('/api/banco/sincronizar', { method: 'POST' });
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro ?? `Erro ${r.status}`);
        const rel = corpo as Relatorio;
        await recarregar();
        if (!silencioso || rel.novas > 0) {
          const sem = rel.semCategoria.length;
          // nada novo: diz quando o banco manda o próximo lote (buscar antes disso não adianta)
          const agora = Date.now();
          const proxima = rel.itens
            .map((i) => i.proximaAtualizacaoBanco)
            .filter((p): p is string => !!p && Date.parse(p) > agora)
            .sort()[0];
          aviso(
            rel.novas
              ? `Banco: ${rel.novas} novos${sem ? ` · ${sem} sem categoria` : ''}`
              : `Banco: tudo em dia${proxima ? ` · próximos dados ${quando(proxima, agora)}` : ''}`,
          );
        }
        if (rel.avisos.length) setTimeout(() => aviso(rel.avisos[0], 'erro'), 3400);
      } catch (e) {
        aviso(`Não consegui falar com o banco: ${(e as Error).message}`, 'erro');
      } finally {
        rodando.current = false;
        setSincronizando(false);
      }
    },
    [recarregar, aviso],
  );

  useEffect(() => {
    let cancelado = false;
    fetch('/api/banco')
      .then((r) => r.json())
      .then((s: { configurado: boolean }) => !cancelado && setConfigurado(s.configurado))
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  // busca quando o banco tem coisa nova: ao abrir, ao voltar para o app (celular) e, com ele aberto, na hora marcada
  useEffect(() => {
    if (!configurado) return;
    const olhar = () => {
      if (document.visibilityState === 'visible' && precisaSincronizar(sincronizadoEm, conexoes, Date.now())) sincronizar(true);
    };
    olhar();
    const espera = proximaVerificacao(sincronizadoEm, conexoes, Date.now());
    const timer =
      espera === null
        ? undefined
        : setTimeout(() => {
            olhar();
            setTique((t) => t + 1);
          }, Math.min(Math.max(espera, 30_000), MAX_ESPERA_MS));
    document.addEventListener('visibilitychange', olhar);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', olhar);
    };
  }, [configurado, sincronizadoEm, conexoes, sincronizar, tique]);

  return <Ctx.Provider value={{ configurado, sincronizando, sincronizadoEm, conexoes: conexoes ?? [], sincronizar }}>{children}</Ctx.Provider>;
}

export function tempoDesde(iso: string | null): string {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}
