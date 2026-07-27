# Smoke E2E

Base reproduzível de testes ponta a ponta cobrindo as rotas principais do
dashboard web em navegador real, independente de projetos ou estado pessoal do
desenvolvedor.

## Como rodar

```bash
npm run build            # compila packages, api e web
npm run test:e2e --workspace=@dev-dashboard/web
```

Ou, a partir da raiz do repo, `npm run test:e2e` já executa o build antes.

Na primeira vez, garanta que o Chromium do Playwright está instalado
(`npx playwright install chromium` dentro de `apps/web`); o ambiente de CI faz
isso automaticamente.

## Como funciona

`global-setup.ts` sobe a API compilada (`apps/api/dist/server.js`) no modo de
distribuição local em origem única (o mesmo usado por `npm run dev-web`), com:

- `DEV_DASHBOARD_CONFIG_DIR` apontando para um diretório temporário exclusivo
  do teste (nunca `~/.config/dev-dashboard`);
- um workspace de fixture, também temporário, contendo um único projeto Node
  determinístico (`sample-node-app`);
- um token de bootstrap de navegador gerado por execução.

Os testes navegam usando `#bootstrap=<token>` na primeira carga de cada
página, replicando o fluxo real de sessão segura do navegador. Ao final da
suíte, o servidor é encerrado e os diretórios temporários são removidos.

## Baselines visuais

`tests/visual-baseline.spec.ts` protege a aparência da sidebar com
`toHaveScreenshot`. Os arquivos em `tests/*-snapshots/` são versionados.

Para atualizar um baseline depois de uma mudança visual intencional, rode a
suíte localmente com `--update-snapshots` e revise o diff da imagem antes de
commitar:

```bash
npx playwright test --config=e2e/playwright.config.ts --update-snapshots
```

Baselines são gerados neste ambiente Linux/Chromium; a CI roda no mesmo par
SO/motor (`ubuntu-latest` + Chromium), então não é necessário gerar variantes
por plataforma.

## Fora do escopo desta base

- Cobertura E2E de mutações (Git, scripts, banco) ou de processos do sistema
  operacional.
- Testes contra projetos reais do diretório pessoal do desenvolvedor.
- Navegação por drawer móvel — abaixo de 760px a navegação lateral hoje
  recolhe sem substituto, comportamento existente e não alterado aqui.
- Outros motores além do Chromium.
