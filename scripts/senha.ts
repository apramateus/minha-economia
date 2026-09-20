// Senha do app na nuvem. A senha em si nunca sai deste Terminal: só o hash (SHA-256) vai para a Vercel,
// em APP_SENHA_HASH. Rode de novo quando quiser trocar (os aparelhos já entrados continuam entrados;
// para derrubá-los, troque também o APP_SEGREDO no painel da Vercel).
import { createHash, randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const AMBIENTES = ['production', 'preview'];
/** palavras curtas e fáceis de digitar no celular */
const PALAVRAS = `agua areia barco bolo bravo cacau calma campo canoa carta ceu chave chuva cinza dedo doce duna faca farol festa fogo folha forte fruta gato gelo grao horta ilha jarro janela lago leite lento livro lua luz maca mala manga mapa mar mel mesa milho monte nuvem onda ouro pao pedra peixe pena pilha pinha ponte porta praia prata prato quadro quente raiz rede rio roda rosa sal selo serra sino sol sopa terra tigre torre trigo trilho vale vela vento verde vidro vinho`.split(
  /\s+/,
);

const senhaSorteada = () => Array.from({ length: 4 }, () => PALAVRAS[randomInt(PALAVRAS.length)]).join('-');

function perguntar(texto: string, escondido: boolean): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (escondido) {
      // esconde o que for digitado (sem eco na tela)
      const saida = rl as unknown as { output: NodeJS.WriteStream; _writeToOutput: (s: string) => void };
      saida._writeToOutput = (s: string) => saida.output.write(s.includes(texto) ? s : '');
    }
    rl.question(texto, (r) => {
      rl.close();
      if (escondido) process.stdout.write('\n');
      resolve(r.trim());
    });
  });
}

const rodar = (args: string[], entrada: string) =>
  new Promise<number>((resolve) => {
    const p = spawn('npx', ['vercel', ...args], { stdio: ['pipe', 'ignore', 'ignore'] });
    p.stdin.end(entrada);
    p.on('close', (c) => resolve(c ?? 1));
  });

const escolhida = process.argv.includes('--minha');
const senha = escolhida ? await perguntar('Senha nova (não aparece na tela): ', true) : senhaSorteada();

if (senha.length < 8) {
  console.error('Senha curta demais (mínimo 8). Nada foi mudado.');
  process.exit(1);
}

const hash = createHash('sha256').update(senha, 'utf8').digest('hex');
for (const ambiente of AMBIENTES) {
  await rodar(['env', 'rm', 'APP_SENHA_HASH', ambiente, '--yes'], '');
  const codigo = await rodar(['env', 'add', 'APP_SENHA_HASH', ambiente], hash);
  if (codigo !== 0) {
    console.error(`Não consegui gravar no ambiente ${ambiente}. Rode "npx vercel login" e tente de novo.`);
    process.exit(1);
  }
}

console.log('\nPronto. A senha do app no ar é:\n');
console.log(`    ${senha}\n`);
console.log('Guarde no seu gerenciador de senhas. Ela não fica salva em lugar nenhum aqui.');
console.log('Agora publique para valer: npx vercel --prod\n');
