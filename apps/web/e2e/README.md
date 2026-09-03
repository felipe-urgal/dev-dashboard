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
  determinísticos: um Node (`sample-node-app`, que também é um repositório
  Git real — `git init` com um commit inicial em `main`, autor fixo via
  variáveis de ambiente, sem depender de `git config` global no runner) e
  um Rails com Sidekiq (`sample-rails-app`, com um `bin/sidekiq`
  controlável que dorme até receber `TERM`, sem depender de Ruby/Redis
  instalados no runner);
- um token de bootstrap de navegador gerado por execução.

Os testes navegam usando `#bootstrap=<token>` na primeira carga de cada
página, replicando o fluxo real de sessão segura do navegador. Ao final da
suíte, o servidor é encerrado e os diretórios temporários são removidos.

## Jornadas críticas protegidas

A suíte permanece intencionalmente pequena por fluxo, priorizando estados que
podem quebrar uma tarefa real do usuário:

- **Git:** `project-git-branches.spec.ts` cobre criação/troca de branch e erro
  de nome duplicado; `project-git-commit.spec.ts` cobre estado vazio e commit
  real sobre a fixture Git.
- **Banco:** `project-database.spec.ts` cobre conexão, catálogo/tabelas,
  leitura e garantia de que a credencial não é reenviada nas operações de
  sessão. O mesmo arquivo protege foco preso no diálogo, `Escape` e retorno de
  foco ao gatilho.
- **Start/stop:** `rails-runtime.spec.ts` exercita start/stop real do Sidekiq;
  `critical-journeys.spec.ts` protege também o fluxo da UI de servidor do
  projeto, do estado parado até execução e parada.
- **Erro/retry + teclado:** `critical-journeys.spec.ts` força falhas GET até
  esgotar os retries automáticos, verifica o estado de erro e recupera a carga
  acionando `Tentar novamente` com `Enter`.

Mocks de rede são usados apenas quando o objetivo é isolar um contrato de UI
ou tornar uma falha determinística. Mutações Git e o lifecycle do Sidekiq usam
recursos reais da fixture.

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

## Mutações de branch Git

`tests/project-git-branches.spec.ts` cobre criar branch (com confirmação),
trocar de branch (com confirmação) e a recusa ao tentar recriar um nome já
existente, sobre o repositório Git real do `sample-node-app`. O estado vazio
("Este projeto não é um repositório Git.") vem do `sample-rails-app`, que não
tem `.git`, e também prova a troca de projeto: nenhuma branch ou mensagem do
`sample-node-app` sobrevive à navegação.

## Commit

`tests/project-git-commit.spec.ts` cobre o estado vazio ("0 alterações
rastreadas", botão desabilitado), sucesso (modifica um arquivo já
rastreado direto no disco da fixture via Node, fora do navegador — não há
editor de arquivo neste fluxo — e cria o commit com confirmação) e a troca
de projeto.

## Fora do escopo desta base

- Validação de snapshot/restore contra um serviço de banco real externo à
  fixture E2E.
- Testes contra projetos reais do diretório pessoal do desenvolvedor.
- Outros motores além do Chromium.
