// Reaplica data/regras.json às transações importadas (não mexe no que é manual ou foi editado).
// Uso: npm run recategorizar [-- --simular]
import { gravar, ler } from '../server/armazenamento.ts';
import { linhaPorId } from '../src/lib/calculos.ts';
import { reclassificar } from '../src/lib/importar/index.ts';

const simular = process.argv.includes('--simular');
const [config, regras, transacoes] = await Promise.all([ler('config'), ler('regras'), ler('transacoes')]);

const rotulo = (t: (typeof transacoes)[number]) =>
  t.tipo === 'transferencia' ? 'transferência' : t.tipo === 'receita' ? `entrada/${t.fonte ?? 'outros'}` : (linhaPorId(config, t.linha)?.nome ?? 'NÃO PLANEJADO');

const mudancas = new Map<string, { de: string; para: string; n: number; total: number }>();
const novas = transacoes.map((t) => {
  const r = reclassificar(t, regras, config);
  if (r !== t) {
    const k = `${rotulo(t)} → ${rotulo(r)}`;
    const m = mudancas.get(k) ?? { de: rotulo(t), para: rotulo(r), n: 0, total: 0 };
    m.n++;
    m.total += t.valor;
    mudancas.set(k, m);
  }
  return r;
});

const total = [...mudancas.values()].reduce((s, m) => s + m.n, 0);
console.log(`${total} transações mudariam de categoria:`);
for (const m of [...mudancas.values()].sort((a, b) => b.total - a.total)) {
  console.log(`  ${String(m.n).padStart(3)}×  R$ ${m.total.toFixed(2).padStart(9)}  ${m.de} → ${m.para}`);
}
if (simular) console.log('\n--simular: nada foi gravado.');
else if (total) {
  await gravar('transacoes', novas);
  console.log('\n✓ gravado');
}
