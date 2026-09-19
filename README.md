# Minha Economia

Painel de finanças pessoais que roda no seu Mac: gastos por categoria, plano do mês, metas, patrimônio e o **não planejado**
em destaque. Os dados ficam só no seu Mac, em `data/` (fora do git, com backup diário em `data/backups/`).

## Instalar

No app **Claude** → aba **Code** → **Project folder**: Documentos → cole: "Instale o Minha Economia seguindo
https://github.com/apramateus/minha-economia/blob/main/INSTALAR.md". O Claude faz o resto ([INSTALAR.md](INSTALAR.md)).
Já tem o app baixado? `bash scripts/instalar-mac.sh` instala o Node (se faltar, sem senha), as dependências e o atalho na Mesa.
O app começa com números de exemplo, que somem quando o banco é conectado (ou com `npm run limpar-exemplo`).

## Usar

Dois cliques em **Minha Economia** na Mesa: abre o app no navegador e uma janela do Terminal com um QR code
(deixe aberta enquanto usa; fechar a janela desliga o app).

**No iPhone** (mesma Wi-Fi): câmera no QR, ou abra `http://<nome-do-mac>.local:5180` → Safari → Compartilhar →
**Adicionar à Tela de Início**. No app, Início → **Celular** mostra o QR de novo.

```bash
npm run abrir      # o mesmo que o atalho
npm run dev        # só no Mac (http://localhost:5180)
npm run resumo     # resumo do mês no terminal (ou: npm run resumo -- 2026-09)
```

## Conectar o banco (Meu Pluggy, só leitura)

1. [meu.pluggy.ai](https://meu.pluggy.ai): **Conectar Minha Conta** → seu banco → autorize no app do banco (conta e cartão).
2. [dashboard.pluggy.ai](https://dashboard.pluggy.ai): crie a conta (teste de 15 dias: faça os passos 2 e 3 no mesmo dia) e uma
   aplicação. Copie o **Client ID** e o **Client Secret**.
3. Na sua aplicação, **Iniciar Demo** → conecte o **MeuPluggy** (com a conta do passo 1) → abra o item → **Copiar Item ID**.
4. Grave os três no `.env.local` desta pasta (formato do `.env.exemplo`; nunca vai para o git) e rode:

```bash
npm run sincronizar -- --simular   # mostra o que viria, sem gravar
npm run sincronizar                # grava
```

Depois disso o app sincroniza sozinho ao abrir (se a última foi há mais de 3h) e tem o botão **Atualizar**. O Meu Pluggy
atualiza uma vez por dia. Detalhes e armadilhas: [INSTALAR.md](INSTALAR.md), passo 5.

## Importar extrato ou fatura (sem conectar o banco)

- No app: **Extrato → Importar** e escolha o arquivo (CSV ou OFX). Se o CSV não for reconhecido, o app pergunta as colunas.
- Pelo terminal: `npm run importar -- importar/<arquivo> --simular`, e depois sem `--simular`.
- Só tem PDF ou print? Ponha em `importar/` e peça ao Claude: "importa o arquivo que coloquei em importar/".

## Copiloto

Um chat com o Claude dentro do app (menu lateral ou ⌘J; no celular, a última aba). Ele usa o Claude Code instalado no Mac,
com a sua assinatura. Lê seus dados, responde e **propõe** mudanças em categorias, regras, orçamento e metas: nada muda
até você tocar em **OK** (ou **Descartar**), e o que for aplicado tem **Desfazer**. Ele não mexe no código.

## Atualizar

```bash
git pull
npm ci   # só se o package-lock.json mudou
```

Depois feche e abra o atalho. Seus dados (`data/`, `.env.local`, `CLAUDE.local.md`) ficam fora do git e não são tocados.
