// Listas compartilhadas entre telas (fora dos componentes para o hot reload funcionar).
import { useMemo } from 'react';
import { useDados } from './estado.tsx';
import { contaEhCartao } from './importar/index.ts';
import type { FonteReceita } from './tipos.ts';

export const FONTES: { valor: FonteReceita; rotulo: string }[] = [
  { valor: 'salario', rotulo: 'Salário' },
  { valor: 'bonus', rotulo: 'Bônus' },
  { valor: 'freela', rotulo: 'Freela' },
  { valor: 'negocio', rotulo: 'Meu negócio' },
  { valor: 'outros', rotulo: 'Outros' },
];

/** Nome de um cartão: o da fatura dele no patrimônio ("Fatura X" → "X"), ou "Cartão". */
function nomeDoCartao(id: string, dividas: { id: string; nome: string }[]): string {
  const fatura = dividas.find((d) => d.id === `fatura-${id}`);
  const nome = fatura?.nome.replace(/^fatura\s+(d[oa]\s+)?/i, '').trim();
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : id === 'cartao' ? 'Cartão' : id;
}

export function useContasTransacao() {
  const { dados } = useDados();
  const { transacoes, config, patrimonio } = dados;
  return useMemo(() => {
    // cartões não são contas do patrimônio (viram a dívida da fatura): saem dos lançamentos e do mapeamento do banco
    const cartoes = [...new Set([...transacoes.map((t) => t.conta), ...Object.values(config.pluggy?.contas ?? {})])].filter(
      (id) => id && contaEhCartao(id),
    );
    return [
      ...(cartoes.length ? cartoes : ['cartao']).map((id) => ({ id, nome: nomeDoCartao(id, patrimonio.dividas) })),
      ...patrimonio.contas.filter((c) => !c.reserva).map((c) => ({ id: c.id, nome: c.nome })),
      { id: 'dinheiro', nome: 'Dinheiro' },
    ];
  }, [transacoes, config.pluggy, patrimonio.contas, patrimonio.dividas]);
}
