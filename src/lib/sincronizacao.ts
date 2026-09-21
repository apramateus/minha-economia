// Quando buscar no banco. O Meu Pluggy atualiza cada conexão 1× por dia, no horário dele, e não aceita atualização
// manual: buscar antes disso não traz nada. Então o app busca logo depois da próxima atualização de cada conexão
// (e tenta de novo de tempos em tempos se a Pluggy atrasar). Sem essa informação (antes da 1ª sincronização), vale a
// regra antiga: mais de 3h desde a última.
import type { ConexaoBanco } from './tipos';

/** a Pluggy leva uns minutos para buscar no banco depois do horário marcado */
export const MARGEM_MS = 5 * 60_000;
/** conexão atrasada: tenta de novo a cada tanto */
export const INTERVALO_ATRASADA_MS = 15 * 60_000;
/** sem saber os horários da Pluggy */
export const VELHO_MS = 3 * 3_600_000;

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** Já devia ter dados novos nesta conexão e ainda não vimos. */
export function atrasada(c: ConexaoBanco, agora: number): boolean {
  const proxima = ms(c.proximaEm);
  if (Number.isNaN(proxima) || agora < proxima + MARGEM_MS) return false;
  const atualizado = ms(c.atualizadoEm);
  return Number.isNaN(atualizado) || atualizado < proxima;
}

export function precisaSincronizar(sincronizadoEm: string | null | undefined, conexoes: ConexaoBanco[] | undefined, agora: number): boolean {
  const ultima = ms(sincronizadoEm);
  if (Number.isNaN(ultima)) return true;
  if (!conexoes?.length) return agora - ultima > VELHO_MS;
  return conexoes.some((c) => atrasada(c, agora)) && agora - ultima > INTERVALO_ATRASADA_MS;
}

/** Daqui a quantos ms vale olhar de novo (para o app aberto buscar sozinho na hora certa); null = não há o que esperar. */
export function proximaVerificacao(sincronizadoEm: string | null | undefined, conexoes: ConexaoBanco[] | undefined, agora: number): number | null {
  if (!conexoes?.length) {
    const ultima = ms(sincronizadoEm);
    return Number.isNaN(ultima) ? 0 : Math.max(0, ultima + VELHO_MS - agora);
  }
  const quando = conexoes.map((c) => {
    if (atrasada(c, agora)) return Math.max(agora, ms(sincronizadoEm) + INTERVALO_ATRASADA_MS);
    const proxima = ms(c.proximaEm);
    return Number.isNaN(proxima) ? Infinity : proxima + MARGEM_MS;
  });
  const menor = Math.min(...quando);
  return Number.isFinite(menor) ? Math.max(0, menor - agora) : null;
}

/** A próxima atualização marcada que ainda vai acontecer (para o aviso "próximos dados às …"). */
export function proximaAtualizacao(conexoes: ConexaoBanco[] | undefined, agora: number): ConexaoBanco | null {
  const futuras = (conexoes ?? []).filter((c) => ms(c.proximaEm) > agora).sort((a, b) => ms(a.proximaEm) - ms(b.proximaEm));
  return futuras[0] ?? null;
}

const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "hoje 14:19", "ontem 00:04", "amanhã 14:19" ou "18/09 14:19". */
export function quando(iso: string | null | undefined, agora: number): string {
  const t = ms(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  const dias = Math.round((dia(d) - dia(new Date(agora))) / 86_400_000);
  const nome = dias === 0 ? 'hoje' : dias === -1 ? 'ontem' : dias === 1 ? 'amanhã' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${nome} ${hora(d)}`;
}
