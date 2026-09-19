# Instalar o Minha Economia (guia para o Claude)

Quem vai instalar cola para o Claude: "Instale o Minha Economia seguindo INSTALAR.md, um passo de cada vez".
Endereço deste guia: https://github.com/apramateus/minha-economia/blob/main/INSTALAR.md

## Para o Claude que está ajudando

- A pessoa não é da área técnica. Fale simples, **um passo por vez**: o que fazer, o que vai aparecer na tela, e espere ela contar
  o que viu (ou mandar um print) antes de seguir.
- Se você roda comandos neste Mac (Claude Code), rode você. Se não, mande um comando por vez para ela colar no **Terminal**
  (⌘ + Espaço → "Terminal" → Enter) e peça o que apareceu. Depois do passo 2, o mais fácil é continuar dentro do Claude Code:
  ela abre o Terminal, cola `cd "$HOME/Documents/Minha Economia" && claude` e escreve "Continue a instalação pelo INSTALAR.md, passo 3".
- **Nunca digite senha, CPF ou código do banco.** Ela digita. Nas telas de login e de autorização, pare e espere ela dizer que terminou.
- **Segredo nunca aparece no chat.** Client ID, Client Secret e Item ID: ela clica em "Copiar" na Pluggy e você grava direto da área
  de transferência com o bloco abaixo. Nada de `echo`, `cat` ou `grep` que mostre o valor, e não peça para ela colar no chat.
- **Dados dela** (renda, gastos, metas): mostre o que vai gravar e espere o OK.
- **Não mexa no código do app.** Você só grava em `data/`, `.env.local` e `CLAUDE.local.md`, que ficam fora do git.
- Pasta do app: `~/Documents/Minha Economia`.

### Gravar um segredo (sem mostrar)

Troque `PLUGGY_CLIENT_ID` pela chave da vez (`PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`, `PLUGGY_ITEM_ID_NOVO`) e rode logo depois
que ela clicar em "Copiar":

```bash
cd "$HOME/Documents/Minha Economia" && umask 077 && k=PLUGGY_CLIENT_ID && v="$(pbpaste | tr -d '[:space:]')" && [ -n "$v" ] \
  && { [ -f .env.local ] || cp .env.exemplo .env.local; } \
  && { grep -v "^$k=" .env.local; printf '%s=%s\n' "$k" "$v"; } > .env.novo && mv .env.novo .env.local && chmod 600 .env.local \
  && pbcopy < /dev/null && echo "$k gravado: ${#v} caracteres$([[ $v =~ ^[0-9a-f-]{36}$ ]] && echo ', formato ok')"
```

Sem "formato ok" (os três costumam ter 36 caracteres), peça para ela copiar de novo e repita.

## 1. Claude Code no Terminal

O Copiloto do app usa o Claude Code da pessoa (a assinatura dela, sem custo extra).

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Não pede senha de administrador; instala em `~/.local/bin/claude`. Depois ela fecha o Terminal, abre de novo, digita `claude`
e entra no navegador com a conta dela. Confira com `claude --version`. Se aparecer "command not found":

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

e abrir o Terminal de novo.

## 2. Baixar o app

```bash
git clone https://github.com/apramateus/minha-economia "$HOME/Documents/Minha Economia"
```

Se o Mac pedir para instalar as "ferramentas de linha de comando", ela clica em **Instalar**, espera terminar (alguns minutos)
e roda o comando de novo.

## 3. Instalar

```bash
cd "$HOME/Documents/Minha Economia" && bash scripts/instalar-mac.sh
```

O script instala o Node (se faltar, sem senha), as dependências e cria o atalho **Minha Economia** na Mesa. Pode rodar de novo
sem problema. Ela dá dois cliques no atalho: abre uma janela do Terminal com um QR code (deixar aberta enquanto usa) e o app
no navegador, com **números de exemplo** (etiqueta "Exemplo" no Início). Se o Mac perguntar se o Terminal pode acessar
Documentos: **Permitir**.

## 4. Conhecer ela

Conversa curta: nome, trabalho (CLT, PJ, autônoma…), banco(s) e cartão, quanto entra por mês, 3 a 5 gastos grandes
(aluguel, escola, carro…) e metas (reserva, viagem, quitar uma dívida…). Com o OK dela, grave:

- `data/config.json`: `rendaFixa` = `[{ "id": "salario", "nome": "Salário", "valor": <por mês> }]`. Gastos grandes: o `valor`
  (plano por mês) da categoria de exemplo que corresponde, ou uma nova em `orcamento` (`id`, `nome`, `valor`, `pai`, `natureza`
  `fixo` | `flexivel` | `pontual`; pontual = média por mês). As outras categorias de exemplo ficam como ponto de partida:
  ela ajusta no app (Gastos) ou pedindo ao Copiloto.
- `data/metas.json`: `metas` na ordem de prioridade (a primeira enche primeiro), cada uma `{ "id", "nome", "alvo": <R$> }`
  ou `"alvoMesesCusto": 6` (reserva = 6 meses do custo de vida).
- `CLAUDE.local.md` na raiz da pasta (fora do git; o Copiloto lê), neste modelo:

```markdown
# Quem usa este app
- <Nome>, <trabalho>. Renda: R$ <valor>/mês, cai por volta do dia <dia> no <banco>.
- Banco: <banco> (conta `conta`, cartão `cartao`), conectado pelo Meu Pluggy em <AAAA-MM-DD>.
- Metas, na ordem: <…>.
- Fale simples, sem termos técnicos.

## Decisões dela
- <ex.: "Pix para a mãe todo mês = categoria Família">
```

O app relê os arquivos quando a janela dele volta ao foco.

## 5. Conectar o banco (Meu Pluggy, só leitura), com o Claude no Chrome

Ela instala a extensão **Claude** no Chrome
(https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn), entra com a mesma conta, e digita `/chrome`
no Claude Code para ligar. Você clica; nos logins, no CPF e na autorização no app do banco, você para e ela faz.

a. **meu.pluggy.ai** → entrar (com Google é o mais fácil) → **Conectar Minha Conta** → o banco dela → ela autoriza no app do banco
   (marcar conta e cartão).
b. **dashboard.pluggy.ai** → criar conta (começa um teste de 15 dias: faça b, c e d no mesmo dia) → **Aplicações** → nova aplicação
   "Minha Economia" (de desenvolvimento) → **Client ID** e **Client Secret**: ela clica "Copiar", você grava (um de cada vez).
c. **Customização → Conectores → Conectores Diretos**: conferir que "(200) MeuPluggy Direto" está ligado (costuma já estar).
d. Na linha da aplicação **dela** → **Iniciar Demo** → Conectar Conta → Continuar → buscar **MeuPluggy** → Continuar → Conectar →
   login do Meu Pluggy (ela) → autorizar e escolher o banco → quando aparecer "Atualizado", abrir o item → **Copiar Item ID** →
   gravar em `PLUGGY_ITEM_IDS`.

Armadilhas:
- Não use o "Pluggy Demo App": item de outra aplicação dá 404.
- Não escolha o banco direto na demo (erro "contas de teste só podem conectar conectores sandbox"): é sempre pelo MeuPluggy.
- Ignore "Liberar dados reais" e "due diligence": não precisa.
- O Meu Pluggy atualiza uma vez por dia e não aceita atualização manual.
- Outro banco depois = repetir o d: o Item ID novo vai em `PLUGGY_ITEM_ID_NOVO`, conferir com `npm run sincronizar -- --novo`
  (contas e finais, sem repetir as que já vêm) e só então juntar em `PLUGGY_ITEM_IDS` (separados por vírgula).

Sem o Chrome: os mesmos passos em texto, ela manda print de cada tela. O `.env.local` segue o formato do `.env.exemplo`.

## 6. Primeira sincronização

```bash
npm run sincronizar -- --simular
```

Confira com ela as contas (nomes e finais) e o valor do cartão contra a fatura atual no app do banco. Se o cartão mostrar
o limite comprometido inteiro (fatura + parcelas futuras) em vez da fatura, avise: é um ajuste de código, para quem mantém o app.
Tudo certo:

```bash
npm run sincronizar
```

Os lançamentos e as contas de exemplo somem (categorias e metas ficam). Depois, com os maiores gastos "sem categoria" da saída,
proponha regras e grave com o OK dela **no topo** de `data/regras.json`: `{ "padrao": "NOME DA LOJA", "linha": "<id da categoria>" }`
(casa no começo de palavra, sem acento nem maiúsculas; a primeira que casar vence; pagamento de fatura e aplicação =
`"tipo": "transferencia"`). Então `npm run recategorizar -- --simular` e `npm run recategorizar`. Se ela guarda a reserva numa
conta ou investimento, com o OK dela ponha `"reserva": true` nessa conta em `data/patrimonio.json` (é o que enche as metas).

Se ela não quiser conectar banco: `npm run limpar-exemplo` e importar o extrato ou a fatura (CSV/OFX) no app, em **Extrato → Importar**.

## 7. iPhone (opcional)

Com o app aberto pelo atalho, o Terminal mostra um QR. iPhone na mesma Wi-Fi → câmera no QR → abre no Safari → **Compartilhar →
Adicionar à Tela de Início**. Funciona enquanto o Mac está ligado com a janela do app aberta. No app, Início → **Celular** mostra
o QR de novo.

## 8. Atualizar (quando ela disser "atualize o app")

Ela fecha a janela do Terminal do app. Então:

```bash
cd "$HOME/Documents/Minha Economia" && antes="$(git rev-parse HEAD)" && git pull --ff-only \
  && { git diff --quiet "$antes" HEAD -- package-lock.json || npm ci; }
```

e dois cliques no atalho. Nunca mexa em `data/`, `.env.local` nem `CLAUDE.local.md` (o `git pull` não toca neles). Se o `git pull`
recusar, não force: mostre o `git status` e avise quem mantém o app. Algo quebrou depois de atualizar? `bash scripts/instalar-mac.sh`.

## 9. Problemas comuns

- **Porta 5180 ocupada**: já tem uma janela do app aberta. Feche as janelas do Terminal e abra o atalho de novo.
- **"O Claude Code precisa de login"** (no Copiloto): no Terminal, `claude` e entrar. "Não encontrei o Claude Code": passo 1.
- **"node não encontrado"** ou **"npm: command not found"**: `bash scripts/instalar-mac.sh` de novo.
- **O Mac pede permissão para o Terminal acessar Documentos**: Permitir.
- **Sincronizar**: "Falta preencher no .env.local" = gravar de novo a chave que falta; 401/403 = Client ID ou Secret errado
  (copiar de novo); 404 = Item ID de outra aplicação (refazer o 5d na aplicação dela).
