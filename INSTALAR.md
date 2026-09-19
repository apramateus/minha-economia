# Instalar o Minha Economia (guia para o Claude)

Quem vai instalar só faz isto: abre o app **Claude** → aba **Code** → em **Project folder** escolhe **Documentos** → cola
"Instale o Minha Economia seguindo https://github.com/apramateus/minha-economia/blob/main/INSTALAR.md".
**Daqui em diante é com você, Claude.** Ela só faz o que ninguém pode fazer por ela: clicar em **Instalar** se o macOS oferecer,
entrar nas contas (Claude, Meu Pluggy, Pluggy), autorizar no app do banco e responder umas perguntas sobre dinheiro e metas.

## Para o Claude que está ajudando

- **Você faz tudo o que dá:** comandos, abrir o app, abrir páginas no Chrome e clicar nelas, gravar arquivos, conferir. Não peça
  para ela colar comando, abrir Terminal ou achar arquivo. Antes de algo demorado ou de uma ação dela, avise numa frase simples
  o que vai aparecer na tela e o que ela deve clicar.
- **Está no chat comum e não consegue rodar comandos?** Peça para ela abrir a aba **Code** do app Claude, escolher a pasta
  **Documentos** em **Project folder** e colar a mesma mensagem lá. (Só se não existir a aba Code: comandos um por vez no Terminal.)
- **Nunca digite senha, CPF ou código do banco.** Nas telas de login e de autorização, pare e espere ela dizer que terminou.
- **Segredo nunca aparece no chat.** Client ID, Client Secret e Item ID: você mesmo clica em **Copiar** na Pluggy pelo Chrome
  (sem ler o valor na tela) e grava direto da área de transferência com o bloco abaixo. Nada de `echo`, `cat` ou `grep` que
  mostre o valor, e não peça para ela colar no chat.
- **Dados dela** (renda, gastos, metas): mostre o que vai gravar e espere o OK.
- **Não mexa no código do app.** Você só grava em `data/`, `.env.local` e `CLAUDE.local.md`, que ficam fora do git.
- Pasta do app: `~/Documents/Minha Economia`.

### Gravar um segredo (sem mostrar)

Troque `PLUGGY_CLIENT_ID` pela chave da vez (`PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`, `PLUGGY_ITEM_ID_NOVO`) e rode logo depois
de clicar em "Copiar":

```bash
cd "$HOME/Documents/Minha Economia" && umask 077 && k=PLUGGY_CLIENT_ID && v="$(pbpaste | tr -d '[:space:]')" && [ -n "$v" ] \
  && { [ -f .env.local ] || cp .env.exemplo .env.local; } \
  && { grep -v "^$k=" .env.local; printf '%s=%s\n' "$k" "$v"; } > .env.novo && mv .env.novo .env.local && chmod 600 .env.local \
  && pbcopy < /dev/null && echo "$k gravado: ${#v} caracteres$([[ $v =~ ^[0-9a-f-]{36}$ ]] && echo ', formato ok')"
```

Sem "formato ok" (os três costumam ter 36 caracteres), copie de novo e repita.

## 1. Instalar (você roda tudo)

```bash
xcode-select -p >/dev/null 2>&1 || xcode-select --install
```

Se abrir uma janela do macOS pedindo as "ferramentas de linha de comando", ela clica em **Instalar** (alguns minutos). Espere
terminar (`until xcode-select -p >/dev/null 2>&1; do sleep 10; done`) e siga:

```bash
[ -x "$HOME/.local/bin/claude" ] || command -v claude >/dev/null || curl -fsSL https://claude.ai/install.sh | bash
[ -d "$HOME/Documents/Minha Economia/.git" ] || git clone https://github.com/apramateus/minha-economia "$HOME/Documents/Minha Economia"
cd "$HOME/Documents/Minha Economia" && bash scripts/instalar-mac.sh
```

O primeiro instala o Claude Code de terminal, que o Copiloto do app usa (a assinatura dela, sem custo extra). O último instala o
Node (se faltar, sem senha), as dependências e o atalho **Minha Economia** na Mesa. Tudo pode rodar de novo sem problema.

## 2. Login do Copiloto

```bash
"$HOME/.local/bin/claude" -p "responda só: ok"
```

Respondeu "ok": pronto, pule para o 3. Pediu login: abra uma janela de login para ela com
`open -a Terminal "$HOME/.local/bin/claude"`. Abre o Terminal e o navegador: ela entra com a **mesma conta do Claude** (se o
Terminal fizer alguma pergunta antes, como tema ou confiar na pasta, é só apertar Enter). Quando aparecer "Login successful",
ela fecha aquela janela. Rode o teste de novo.

## 3. Abrir o app

```bash
open "$HOME/Desktop/Minha Economia.command"
```

Abre uma janela do Terminal com um QR code (é o app rodando: fica aberta enquanto usa) e o app no navegador, com **números de
exemplo** (etiqueta "Exemplo" no Início). Se o Mac perguntar se o Terminal pode acessar Documentos: ela clica em **Permitir**.
Mostre a ela: dali em diante, para abrir o app é dar dois cliques em **Minha Economia** na Mesa.

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

Você navega e clica; ela só entra nas contas e autoriza no app do banco.

- **Chrome:** se não houver `/Applications/Google Chrome.app`, abra `https://www.google.com/chrome/` e guie ela a instalar.
- **Extensão:** `open -a "Google Chrome" "https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn"`
  → ela clica em **Usar no Chrome** e entra com a mesma conta do Claude. Na aba Code a extensão é detectada sozinha
  (`/chrome` mostra o estado).

a. **meu.pluggy.ai** → ela entra (com Google é o mais fácil) → você: **Conectar Minha Conta** → o banco dela → ela autoriza no
   app do banco (marcar conta e cartão).
b. **dashboard.pluggy.ai** → ela cria a conta (começa um teste de 15 dias: faça b, c e d no mesmo dia) → você: **Aplicações** →
   nova aplicação "Minha Economia" (de desenvolvimento) → **Client ID** e **Client Secret**: você clica em "Copiar" e grava
   (um de cada vez).
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

Sem a extensão: os mesmos passos em texto, um por vez, e ela manda print de cada tela. O `.env.local` segue o formato do `.env.exemplo`.

## 6. Primeira sincronização

```bash
cd "$HOME/Documents/Minha Economia" && npm run sincronizar -- --simular
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

Com o app aberto, o Terminal do app mostra um QR. iPhone na mesma Wi-Fi → câmera no QR → abre no Safari → **Compartilhar →
Adicionar à Tela de Início**. Funciona enquanto o Mac está ligado com o app aberto. No app, Início → **Celular** mostra o QR de novo.

## 8. Atualizar (quando ela disser "atualize o app")

Você mesmo fecha o app, atualiza e abre de novo:

```bash
cd "$HOME/Documents/Minha Economia" && { lsof -tiTCP:5180 -sTCP:LISTEN | xargs kill 2>/dev/null; true; } \
  && antes="$(git rev-parse HEAD)" && git pull --ff-only \
  && { git diff --quiet "$antes" HEAD -- package-lock.json || npm ci; } \
  && open "$HOME/Desktop/Minha Economia.command"
```

Nunca mexa em `data/`, `.env.local` nem `CLAUDE.local.md` (o `git pull` não toca neles). Se o `git pull` recusar, não force:
mostre o `git status` e avise quem mantém o app. Algo quebrou depois de atualizar? `bash scripts/instalar-mac.sh`.

## 9. Problemas comuns

- **Porta 5180 ocupada**: o app já está aberto. `lsof -tiTCP:5180 -sTCP:LISTEN | xargs kill` e abra o atalho de novo.
- **"O Claude Code precisa de login"** (no Copiloto): repita o passo 2. "Não encontrei o Claude Code": repita o passo 1.
- **"node não encontrado"** ou **"npm: command not found"**: `bash scripts/instalar-mac.sh` de novo.
- **O Mac pede permissão para o Terminal acessar Documentos**: ela clica em Permitir.
- **Sincronizar**: "Falta preencher no .env.local" = gravar de novo a chave que falta; 401/403 = Client ID ou Secret errado
  (copiar de novo); 404 = Item ID de outra aplicação (refazer o 5d na aplicação dela).
