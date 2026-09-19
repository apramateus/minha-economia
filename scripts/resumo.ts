// Resumo de um mês no terminal (para você e para o Claude analisarem).
// Uso: npm run resumo -- [AAAA-MM]
import { lerTudo } from '../server/armazenamento.ts';
import {
  aportePlanejado,
  cascataMetas,
  custoEssencial,
  custoReal,
  despesas,
  doMes,
  gastoPorLinha,
  naoPlanejada,
  resumoMes,
  resumoPatrimonio,
  ritmoAporte,
  runway,
} from '../src/lib/calculos.ts';
import { isoMes, nomeMesCurto, nomeMesLongo } from '../src/lib/datas.ts';

const mes = process.argv[2] ?? isoMes();
const d = await lerTudo();
const c = d.config;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const r = resumoMes(c, d.transacoes, mes);
console.log(`\n=== ${nomeMesLongo(mes)} ===`);
console.log(`Receita: ${brl(r.receita)} (renda fixa ${brl(r.receitaEsperada)})`);
console.log(`Gasto:   ${brl(r.gasto)} de ${brl(r.planejado)} planejados`);
console.log(`Não planejado: ${brl(r.naoPlanejado)}`);
console.log(`Plano do mês: resta ${brl(r.restante)}`);

const porLinha = gastoPorLinha(c, d.transacoes, mes);
console.log('\nPor linha (real / planejado):');
for (const l of c.orcamento) {
  const g = porLinha[l.id] ?? 0;
  // categoria de cima só para organizar (sem plano e sem gasto próprios)
  if (l.valor === 0 && g === 0 && c.orcamento.some((x) => x.pai === l.id)) continue;
  const alerta = g > l.valor ? '  ⚠ estourou' : '';
  console.log(`  ${l.nome.padEnd(40)} ${brl(g).padStart(12)} / ${brl(l.valor)}${alerta}`);
}

const np = despesas(doMes(d.transacoes, mes)).filter((t) => naoPlanejada(c, t)).sort((a, b) => b.valor - a.valor);
if (np.length) {
  console.log('\nNão planejado (maiores primeiro):');
  for (const t of np.slice(0, 25)) console.log(`  ${t.data}  ${brl(t.valor).padStart(12)}  ${t.descricao}`);
}

const p = resumoPatrimonio(d.patrimonio);
const real = custoReal(c, d.transacoes, isoMes());
const custo = real.valor;
console.log(`\nPatrimônio líquido: ${brl(p.liquido)} · bens ${brl(p.bens)} · total ${brl(p.total)}`);
console.log(
  `Meses de liberdade: ${runway(p.liquido, custo)} (custo ${real.fonte === 'real' ? `real ${brl(custo)} em ${real.meses[0]}` : `do plano ${brl(custo)}`}; plano ${brl(custoEssencial(c))})`,
);

const ritmo = ritmoAporte(d.metas, isoMes(), aportePlanejado(c));
console.log(`\nMetas (ritmo ${brl(ritmo.valor)}/mês, ${ritmo.fonte === 'real' ? 'média real' : 'pelo plano'}):`);
for (const e of cascataMetas(d.metas, p.reserva, p.emprestimos, custo, ritmo.valor, isoMes())) {
  const prev = e.completa ? '✓' : e.previsao ? `previsão ${nomeMesCurto(e.previsao)}` : 'sem previsão';
  console.log(`  ${e.atual ? '→' : ' '} ${e.nome.padEnd(28)} ${brl(e.saldo).padStart(12)} / ${brl(e.alvo)}  ${prev}`);
}
