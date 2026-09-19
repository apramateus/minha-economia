// Tira os números de exemplo de quem acabou de instalar (lançamentos `origem: 'demo'` e itens do patrimônio `demo: true`),
// para começar do zero sem conectar o banco. Categorias e metas ficam. A 1ª sincronização com o banco já faz isso sozinha.
// Uso: npm run limpar-exemplo [-- --simular]
import { gravar, ler } from '../server/armazenamento.ts';
import { semExemplo, temExemplo } from '../src/lib/exemplo.ts';

const simular = process.argv.includes('--simular');
const [transacoes, patrimonio] = await Promise.all([ler('transacoes'), ler('patrimonio')]);

if (!temExemplo(transacoes, patrimonio)) {
  console.log('Não há números de exemplo.');
  process.exit(0);
}
const limpo = semExemplo(transacoes, patrimonio);
const itens = (['contas', 'dividas', 'bens', 'aReceber'] as const).reduce((s, k) => s + patrimonio[k].length - limpo.patrimonio[k].length, 0);
console.log(`${transacoes.length - limpo.transacoes.length} lançamentos e ${itens} itens do patrimônio de exemplo${simular ? ' sairiam (simulação)' : ' removidos'}.`);
if (!simular) {
  await gravar('transacoes', limpo.transacoes);
  await gravar('patrimonio', limpo.patrimonio);
}
