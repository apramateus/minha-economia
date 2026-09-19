// Puxa lançamentos e saldos do banco (Meu Pluggy) para data/.
// Uso: npm run sincronizar [-- --simular] · [-- --novo] confere o PLUGGY_ITEM_ID_NOVO (sempre simulando)
import { lerCredenciais, sincronizar } from '../server/pluggy.ts';

// --novo: confere o PLUGGY_ITEM_ID_NOVO junto (sempre simulando)
const novo = process.argv.includes('--novo');
const simular = novo || process.argv.includes('--simular');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const { faltando } = await lerCredenciais();
if (faltando.length) {
  console.error(`Falta preencher no .env.local: ${faltando.join(', ')}`);
  console.error('Passo a passo no README (seção "Conectar o banco").');
  process.exit(1);
}

try {
  const r = await sincronizar({ simular, novo });
  for (const i of r.itens) {
    console.log(
      `Conexão ${i.id.slice(0, 8)}… status ${i.status}` +
        (i.ultimaAtualizacaoBanco ? ` · banco atualizado em ${new Date(i.ultimaAtualizacaoBanco).toLocaleString('pt-BR')}` : '') +
        (i.consentimentoExpiraEm ? ` · consentimento até ${new Date(i.consentimentoExpiraEm).toLocaleDateString('pt-BR')}` : ''),
    );
  }
  console.log('');
  for (const c of r.contas) {
    console.log(
      `${c.tipo === 'CREDIT' ? 'Cartão' : 'Conta '} ${c.nome.padEnd(28)} ${c.final ? `final ${c.final} ` : ''}[item ${c.item}] → ${c.conta.padEnd(10)} saldo ${brl(c.saldo).padStart(13)} · desde ${c.desde}: ` +
        `${c.recebidas} recebidas, ${c.novas} novas, ${c.atualizadas} atualizadas, ${c.jaExistiam} já existiam`,
    );
  }
  if (r.investimentos !== null) console.log(`Investimentos ativos: ${brl(r.investimentos)}`);
  if (r.semCategoria.length) {
    console.log(`\nSem categoria (${r.semCategoria.length}) — entram como não planejado:`);
    for (const t of r.semCategoria) console.log(`  ${t.data}  ${brl(t.valor).padStart(12)}  ${t.descricao}`);
  }
  for (const a of r.avisos) console.log(`\n⚠ ${a}`);
  console.log(simular ? '\n--simular: nada foi gravado.' : `\n✓ ${r.novas} lançamentos novos gravados.`);
} catch (e) {
  const msg = (e as Error).message;
  console.error(`Erro ao sincronizar: ${msg}`);
  if (/401|403|unauthori|invalid/i.test(msg)) console.error('Confira o Client ID e o Client Secret no .env.local.');
  if (/404|not found/i.test(msg)) console.error('Confira o PLUGGY_ITEM_IDS no .env.local.');
  process.exit(1);
}
