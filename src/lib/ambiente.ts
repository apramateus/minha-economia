// Onde o app está rodando: na nuvem a função /api/ambiente responde `{nuvem: true, copiloto: false}`. Em casa essa
// rota não existe, e qualquer resposta que não seja esse JSON quer dizer "em casa".
import { useEffect, useState } from 'react';

export interface Ambiente {
  nuvem: boolean;
  /** o copiloto roda o Claude Code do Mac: na nuvem ele não existe */
  copiloto: boolean;
}

const EM_CASA: Ambiente = { nuvem: false, copiloto: true };
const NA_NUVEM: Ambiente = { nuvem: true, copiloto: false };
const CHAVE = 'ambiente';

async function perguntar(): Promise<Ambiente> {
  // `npm run dev` só roda no Mac: nem pergunta (e a rota, no Vite, nem existe)
  if (import.meta.env.DEV) return EM_CASA;
  try {
    const r = await fetch('/api/ambiente', { headers: { Accept: 'application/json' } });
    // a tranca da nuvem respondeu que a sessão acabou: é nuvem, mesmo sem o JSON
    if (r.status === 401) return NA_NUVEM;
    const corpo = r.ok ? await r.json() : null;
    return corpo && typeof corpo.copiloto === 'boolean' ? { nuvem: !!corpo.nuvem, copiloto: corpo.copiloto } : EM_CASA;
  } catch {
    return EM_CASA;
  }
}

/**
 * O palpite até a resposta chegar: nuvem (assim o copiloto não aparece para depois sumir). Como cada endereço tem o
 * seu localStorage, a resposta de antes evita piscar nas próximas vezes.
 */
function suposicao(): Ambiente {
  if (import.meta.env.DEV) return EM_CASA;
  try {
    const valor = localStorage.getItem(CHAVE);
    if (valor === 'casa') return EM_CASA;
  } catch {
    /* sem armazenamento local */
  }
  return NA_NUVEM;
}

export function useAmbiente(): Ambiente {
  const [ambiente, setAmbiente] = useState<Ambiente>(suposicao);
  useEffect(() => {
    let vivo = true;
    perguntar().then((novo) => {
      if (!vivo) return;
      setAmbiente(novo);
      try {
        localStorage.setItem(CHAVE, novo.copiloto ? 'casa' : 'nuvem');
      } catch {
        /* sem armazenamento local */
      }
    });
    return () => {
      vivo = false;
    };
  }, []);
  return ambiente;
}
