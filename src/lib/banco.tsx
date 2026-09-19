// Conexão com o banco (Meu Pluggy): status, botão de atualizar e sincronização automática ao abrir o app.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDados } from './estado';

interface Relatorio {
  novas: number;
  semCategoria: unknown[];
  avisos: string[];
}

interface Banco {
  configurado: boolean;
  sincronizando: boolean;
  sincronizadoEm: string | null;
  sincronizar: (silencioso?: boolean) => Promise<void>;
}

const Ctx = createContext<Banco>({ configurado: false, sincronizando: false, sincronizadoEm: null, sincronizar: async () => {} });
export const useBanco = () => useContext(Ctx);

const VELHO_MS = 3 * 3_600_000; // sincroniza sozinho se a última foi há mais de 3h

export function ProvedorBanco({ children }: { children: ReactNode }) {
  const { dados, recarregar, aviso } = useDados();
  const [configurado, setConfigurado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const rodando = useRef(false);
  const sincronizadoEm = dados.patrimonio.sincronizadoEm ?? null;

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
          aviso(rel.novas ? `Banco: ${rel.novas} novos${sem ? ` · ${sem} sem categoria` : ''}` : 'Banco: tudo em dia');
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
      .then((s: { configurado: boolean; sincronizadoEm: string | null }) => {
        if (cancelado) return;
        setConfigurado(s.configurado);
        const velho = !s.sincronizadoEm || Date.now() - Date.parse(s.sincronizadoEm) > VELHO_MS;
        if (s.configurado && velho) sincronizar(true);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [sincronizar]);

  return <Ctx.Provider value={{ configurado, sincronizando, sincronizadoEm, sincronizar }}>{children}</Ctx.Provider>;
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
