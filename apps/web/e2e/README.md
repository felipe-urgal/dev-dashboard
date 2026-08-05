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
- um workspace de fixture, também temporário, contendo dois projetos
  determinísticos: um Node (`sample-node-app`) e um Rails com Sidekiq
  (`sample-rails-app`, com um `bin/sidekiq` controlável que dorme até
  receber `TERM`, sem depender de Ruby/Redis instalados no runner);
- um token de bootstrap de navegador gerado por execução.

Os testes navegam usando `#bootstrap=<token>` na primeira carga de cada
página, replicando o fluxo real de sessão segura do navegador. Ao final da
suíte, o servidor é encerrado e os diretórios temporários são removidos.

## Cobertura responsiva

`tests/responsive.spec.ts` exercita três faixas:

- desktop em 1280 × 800, com sidebar persistente;
- tablet em 820 × 1180, com drawer e uma preferência desktop de sidebar
  recolhida previamente salva;
- tela estreita em 375 × 700, com o drawer móvel.

Os cenários verificam ausência de overflow horizontal, acesso ao tema e uso da
navegação principal. Em tablet e mobile o teste abre o drawer, confirma que os
rótulos completos continuam disponíveis, navega para outra rota e verifica o
fechamento automático.

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

## Catálogo de scripts

`tests/project-scripts.spec.ts` cobre o fluxo privilegiado de execução de
scripts, com a matriz de carregamento/sucesso/erro/troca de projeto: um
script somente leitura (`lint`, sem confirmação) até "Concluída", um script
mutável (`build`, com confirmação explícita) até "Falhou", e a troca para
`sample-rails-app` para confirmar que o catálogo (ações de Bundler) muda por
projeto sem resquício do anterior. Os scripts de fixture têm ~500ms de
duração proposital para o estado "Em execução" ficar observável antes do
desfecho.

## Fora do escopo desta base

- Cobertura E2E de mutações Git ou de banco de dados.
- Testes contra projetos reais do diretório pessoal do desenvolvedor.
- Outros motores além do Chromium.
