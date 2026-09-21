import { describe, expect, it } from 'vitest';
import { atrasada, precisaSincronizar, proximaAtualizacao, proximaVerificacao, quando, INTERVALO_ATRASADA_MS, MARGEM_MS } from './sincronizacao';
import type { ConexaoBanco } from './tipos';

// horários locais (o formato "hoje 14:19" é na hora de quem vê)
const as = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();
const iso = (t: number) => new Date(t).toISOString();

// o caso de 21/09: a conta PJ foi buscada ontem 14:19 e só é buscada de novo hoje 14:19
const pj = (atualizado = as(20, 14, 19), proxima = as(21, 14, 19)): ConexaoBanco => ({ nome: 'C6 PJ', atualizadoEm: iso(atualizado), proximaEm: iso(proxima) });
const pf: ConexaoBanco = { nome: 'C6 conta corrente', atualizadoEm: iso(as(21, 0, 4)), proximaEm: iso(as(22, 0, 4)) };
const sincronizou = iso(as(21, 11, 53));

describe('quando buscar no banco', () => {
  it('antes da próxima atualização da Pluggy, buscar não adianta', () => {
    expect(precisaSincronizar(sincronizou, [pj(), pf], as(21, 13, 0))).toBe(false);
    expect(atrasada(pj(), as(21, 14, 20))).toBe(false); // ainda na margem de uns minutos
  });

  it('passou a atualização da conexão e ainda não vimos os dados novos: busca', () => {
    expect(precisaSincronizar(sincronizou, [pj(), pf], as(21, 14, 30))).toBe(true);
  });

  it('depois de buscar os dados novos, espera a próxima', () => {
    const nova = pj(as(21, 14, 21), as(22, 14, 21));
    expect(precisaSincronizar(iso(as(21, 14, 30)), [nova, pf], as(21, 18, 0))).toBe(false);
  });

  it('se a Pluggy atrasar, tenta de novo de tempos em tempos (não a cada abertura)', () => {
    const buscou = as(21, 14, 30);
    expect(precisaSincronizar(iso(buscou), [pj(), pf], buscou + INTERVALO_ATRASADA_MS - 60_000)).toBe(false);
    expect(precisaSincronizar(iso(buscou), [pj(), pf], buscou + INTERVALO_ATRASADA_MS + 60_000)).toBe(true);
  });

  it('sem saber os horários (antes da 1ª sincronização nova), vale a regra das 3h; nunca buscou = busca', () => {
    expect(precisaSincronizar(sincronizou, undefined, as(21, 14, 0))).toBe(false);
    expect(precisaSincronizar(sincronizou, undefined, as(21, 15, 0))).toBe(true);
    expect(precisaSincronizar(null, [pj()], as(21, 9, 0))).toBe(true);
  });

  it('o app aberto sabe quando olhar de novo', () => {
    expect(proximaVerificacao(sincronizou, [pj(), pf], as(21, 12, 0))).toBe(as(21, 14, 19) + MARGEM_MS - as(21, 12, 0));
    const buscou = as(21, 14, 30);
    expect(proximaVerificacao(iso(buscou), [pj(), pf], buscou)).toBe(INTERVALO_ATRASADA_MS);
  });

  it('a próxima atualização marcada e o jeito de mostrar a hora', () => {
    expect(proximaAtualizacao([pj(), pf], as(21, 12, 0))?.nome).toBe('C6 PJ');
    expect(proximaAtualizacao([pj(), pf], as(21, 15, 0))?.nome).toBe('C6 conta corrente');
    expect(quando(pj().atualizadoEm, as(21, 12, 0))).toBe('ontem 14:19');
    expect(quando(pf.atualizadoEm, as(21, 12, 0))).toBe('hoje 00:04');
    expect(quando(pf.proximaEm, as(21, 12, 0))).toBe('amanhã 00:04');
    expect(quando(iso(as(18, 9, 5)), as(21, 12, 0))).toBe('18/09 09:05');
  });
});
