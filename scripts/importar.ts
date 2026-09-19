// Importa um extrato/fatura para data/transacoes.json.
// Uso: npm run importar -- <arquivo> [--conta <id da conta>] [--positivo-gasto] [--simular]
import fs from 'node:fs/promises';
import { gravar, ler } from '../server/armazenamento.ts';
import { linhaPorId, r2 } from '../src/lib/calculos.ts';
import { decodificar, lerArquivo, montarPrevia } from '../src/lib/importar/index.ts';
import { linhasDoCSV, type Mapeamento } from '../src/lib/importar/formatos.ts';

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--'));
const opcao = (nome: string) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? (args[i + 1] ?? '') : undefined;
};
const simular = args.includes('--simular');

if (!arquivo) {
  console.error('Uso: npm run importar -- <arquivo> [--conta <id da conta>] [--positivo-gasto] [--simular]');
  process.exit(1);
}

const texto = decodificar(new Uint8Array(await fs.readFile(arquivo)));
const [transacoesAntes, patrimonioAntes] = await Promise.all([ler('transacoes'), ler('patrimonio')]);
const lido = lerArquivo(texto, [...new Set([...transacoesAntes.map((t) => t.conta), ...patrimonioAntes.contas.map((c) => c.id)])]);
const conta = opcao('conta') ?? lido.contaSugerida;
if (!conta) {
  console.error(`Formato ${lido.formato}: informe a conta com --conta (ex.: --conta conta).`);
  process.exit(1);
}

let linhas = lido.linhas;
if (lido.formato === 'csv' && lido.tabela && linhas) {
  // CSV genérico: por padrão positivo = entrada; em fatura de cartão use --positivo-gasto
  linhas = linhasDoCSV(lido.tabela, { ...(lido.mapeamento as Mapeamento), positivoEhGasto: args.includes('--positivo-gasto') });
}
if (!linhas) {
  console.error('Não reconheci as colunas do CSV. Cabeçalho:', lido.tabela?.[0]);
  process.exit(1);
}

const [config, regras, transacoes] = await Promise.all([ler('config'), ler('regras'), ler('transacoes')]);
const previa = montarPrevia(linhas, conta, regras, config, transacoes);
const novas = previa.filter((p) => !p.duplicada && !p.jaLancada).map((p) => p.transacao);
const duplicadas = previa.filter((p) => p.duplicada).length;
const manuais = previa.filter((p) => p.jaLancada);

console.log(`Formato: ${lido.formato} · conta: ${conta}`);
console.log(`${previa.length} linhas · ${novas.length} novas · ${duplicadas} já importadas · ${manuais.length} já lançadas à mão`);
for (const p of manuais) console.log(`  = ${p.transacao.data} R$ ${p.transacao.valor.toFixed(2)} ${p.transacao.descricao} ↔ lançado em ${p.jaLancada!.data}`);

const porLinha = new Map<string, number>();
for (const t of novas.filter((t) => t.tipo === 'despesa')) {
  const nome = linhaPorId(config, t.linha)?.nome ?? '⚠ NÃO PLANEJADO';
  porLinha.set(nome, r2((porLinha.get(nome) ?? 0) + t.valor));
}
console.log('\nDespesas novas por linha:');
for (const [nome, v] of [...porLinha].sort((a, b) => b[1] - a[1])) console.log(`  ${nome.padEnd(40)} R$ ${v.toFixed(2)}`);

const semLinha = novas.filter((t) => t.tipo === 'despesa' && !t.linha);
if (semLinha.length) {
  console.log('\nSem categoria (entram como não planejado):');
  for (const t of semLinha) console.log(`  ${t.data}  R$ ${t.valor.toFixed(2).padStart(9)}  ${t.descricao}`);
}
const transf = novas.filter((t) => t.tipo === 'transferencia');
if (transf.length) console.log(`\n${transf.length} transferência(s) ignoradas nos gastos (pagamento de fatura, aplicação...).`);

if (simular) {
  console.log('\n--simular: nada foi gravado.');
} else if (novas.length) {
  await gravar('transacoes', [...transacoes, ...novas].sort((a, b) => a.data.localeCompare(b.data)));
  console.log(`\n✓ ${novas.length} transações gravadas em data/transacoes.json`);
}
