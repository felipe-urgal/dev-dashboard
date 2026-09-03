# Guia de desenvolvimento

Este guia define o fluxo recomendado para alterar o Dev Dashboard com segurança, consistência e documentação suficiente.

## Preparação

```bash
npm install
npm run doctor
npm run dev
```

Abra:

```text
Dashboard:  http://127.0.0.1:5174
API health: http://127.0.0.1:4343/api/health
```

`npm run dev` carrega `.env.local` quando existir. Quando precisar customizar o ambiente ou configurar integração externa, comece pelo template versionado:

```bash
cp .env.example .env.local
```

Credenciais locais, como `VERCEL_TOKEN`, ficam somente em `.env.local`/ambiente do processo e nunca no repositório. Variáveis internas/efêmeras do runtime e do self-update não devem ser transformadas em configuração manual só porque existem em `process.env`; veja `docs/operations-and-troubleshooting.md`.

## Scripts principais

| Script | Uso |
| --- | --- |
| `npm run dev` | API + web com watch |
| `npm run dev:api` | somente API |
| `npm run dev:web` | somente Vite |
| `npm run dev-web` | distribuição local compilada |
| `npm run doctor` | diagnóstico local |
| `npm run docs:api` | regenera referência HTTP |
| `npm run docs:api:check` | verifica referência gerada |
| `npm run prod:status` | mostra o gate/estado do contrato do próprio Dashboard |
| `npm run prod:check` | valida o gate de self-production |
| `npm run self-update:helper -- ...` | tooling de engenharia do handoff persistente |
| `npm run self-update:agent -- ...` | tooling de instalação/lifecycle/inspeção do agent |
| `npm run typecheck` | valida tipos |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint com correções automáticas |
| `npm run format` | reescreve arquivos com Prettier |
| `npm run format:check` | verifica Prettier sem regravar arquivos |
| `npm run build` | compila packages/apps |
| `npm test` | testes dos workspaces |
| `npm run test:cli` | suíte Bash |
| `npm run test:e2e` | smoke E2E da web |

Os scripts `self-update:*` continuam sendo tooling de engenharia do handoff/agent. O fluxo suportado de self-production usa o Production Contract `strategy=self-update`, o planner e a confirmação do domínio de deployment; executar tooling interno manualmente não substitui essa fronteira.

## Runtime Node suportado

O `package.json` raiz exige Node `^20.19.0 || >=22.12.0`.

O CI valida explicitamente Node 20.19.0 como runtime mínimo, incluindo instalação, rebuild de `node-pty`, build, typecheck e testes, e mantém Node 24 como runtime principal do job `Validate` e do smoke E2E. Alterar essa política exige manter `engines`, CI e documentação sincronizados.

`.github/workflows/ci.yml` valida typecheck, lint, formatação, build, documentação gerada da API, testes e smoke E2E. As automações de release ficam em `.github/workflows/release-prepare.yml` e `release-tag.yml`; o projeto é `private: true` e não publica pacote em registro npm.

### Rodando um teste específico

Cada workspace usa `node --test` com `tsx`, exceto `apps/web` (Vitest + Playwright):

```bash
# API / packages
npm run build --workspace=@dev-dashboard/contracts
node --import=tsx --test apps/api/test/processes.test.ts

# Web unitário/componente
npm run test --workspace=@dev-dashboard/web -- run caminho/do/arquivo.test.ts

# Web E2E, a partir de apps/web/
npx playwright test --config=e2e/playwright.config.ts caminho/do/arquivo.spec.ts
```

## Monorepo do dashboard web

- **`apps/api`** — Fastify + JSON Schema, escuta somente em `127.0.0.1`.
  Rotas ficam em `apps/api/src/routes/*.ts`; cada rota declara `params`,
  `querystring`, `body` e `response`. Erros públicos passam por
  `ApiError`/`ApiErrorCode`. Schemas de resposta compartilhados ficam em
  `apps/api/src/http/response-schemas.ts`.
- **`apps/web`** — Vue 3 SFCs. Toda chamada HTTP passa por
  `apps/web/src/api.ts`; o frontend não executa comandos locais nem acessa o
  filesystem. Ao trocar de projeto, painéis invalidam estado assíncrono pelo
  padrão `generation`.
- **`packages/contracts`** — apenas tipos compartilhados; sem Fastify, Vue ou
  dependências novas de infraestrutura.
- **`packages/core`** — configuração de workspaces e armazenamento do token
  local da API.
- **`packages/project-discovery`** — descoberta de projetos Rails/Node.
- **`packages/process-manager`** — ciclo de vida de processos conhecidos,
  iniciado sem `shell: true`, com validação de PID/cwd e TERM antes de KILL.

Os kinds gerenciados atuais são `'server'`, `'test'`, `'worker'` e
`'webpack'`. `MANAGED_KINDS` em `process-store.ts` é a fonte de verdade para o
store e retenção de logs. Execuções de scripts têm ciclo de vida próprio em
`apps/api/src/services/script-execution/` e não fazem parte desse store.

Não existe adaptador compartilhado entre o CLI bash e o monorepo. Uma extração
comum exige decisão arquitetural e modelo de ameaça próprios.

Narrativa completa: `docs/architecture/overview.md`.

## Modelo de segurança da API

A API é um processo local privilegiado. Leia `docs/architecture/security.md`
antes de criar ou alterar endpoints.

- Escuta somente em `127.0.0.1`, nunca em `0.0.0.0`.
- Catálogo fechado de ações; nenhuma linha de shell arbitrária vem do browser.
- Token local aleatório é exigido em rotas privadas via
  `X-Dev-Dashboard-Token`; `GET /api/health` é pública.
- CORS usa lista fechada de origens locais.
- Caminhos recebidos da interface não podem escapar do projeto/workspace
  autorizado.
- Leituras de log e arquivo possuem limites.
- Schemas de resposta descartam campos não declarados antes da serialização.
- Operações sensíveis exigem confirmação explícita quando aplicável.

## Padrões do frontend

- Estados de loading precisam refletir trabalho real.
- Ações concorrentes devem ser bloqueadas apenas quando existe risco real de
  corrida.
- Respostas obsoletas precisam ser descartadas após troca de projeto/contexto.
- Mantenha estados de vazio, erro, sucesso e progresso explícitos.
- Revise foco, teclado, responsividade e movimento reduzido.
- Prefira UI simples, ágil e funcional; remova redundância antes de adicionar
  novos elementos.

## Internals do CLI bash

As seções abaixo descrevem especificamente `lib/` + `init.sh`.

### Ordem de carregamento

`init.sh` é o ponto de entrada e carrega módulos em ordem de dependência:

1. `lib/core/init.sh`;
2. `lib/projects/init.sh`;
3. `lib/server/init.sh`;
4. `lib/ui/init.sh`, `lib/actions/init.sh`, `lib/dashboard/init.sh`;
5. `lib/doctor/init.sh`;
6. `lib/git/init.sh`, `lib/rails/init.sh`, `lib/node/init.sh` como módulos
   opcionais;
7. `load_project_config` + `detect_projects`;
8. exportação das funções públicas necessárias em subshells.

Pastas de funcionalidade seguem a convenção existente:

- `init.sh` carrega os arquivos do módulo;
- `helpers.sh` contém lógica privada;
- `run.sh` ou arquivos por verbo (`start.sh`, `stop.sh`, `logs.sh`, `menu.sh`)
  contêm ações públicas.

Não invente uma nova convenção de carregamento sem necessidade arquitetural.

### Convenção de nomes

- Comandos públicos: kebab-case, normalmente `dev-*`, `git-*` e `project-*`.
- Helpers privados: prefixo `_`, snake_case, não exportados salvo dependência
  explícita entre módulos.

### Estado global

- `DEV_BASE` — raiz escaneada em busca de projetos.
- `DEV_DASHBOARD_DIR` — localização resolvida desta instalação.
- `DEV_RUN_DIR` — estado temporário de processos por UID.
- `PROJECT_META` — metadados dos projetos detectados.
- `PROJECT_CONFIG` — overrides de configuração de projetos.
- `~/.dev-dashboard.secrets` — configuração opcional com permissões restritas.

### UI com `gum` e fallback

Funções interativas precisam manter os dois caminhos suportados:

- UI com `gum`, quando disponível;
- fallback puro com `read -r -p`, menus numerados e `echo`.

A ausência de `gum` é um aviso, não erro. Mudanças de UI do CLI devem validar
ambos os ramos.

### Gerenciamento de processos

O CLI inicia servidores por `_dev_start_server`, registra PID/log em
`DEV_RUN_DIR` e encerra com TERM antes de KILL. Rails e Node compartilham esse
núcleo. Ao alterar esse fluxo, preserve cleanup, checagem de porta e identidade
do processo.

### Fluxo de router/menu

`dev-tools` → `dev-dashboard` → `project-menu` → `dev-project-actions` →
`dev-run-command`.

Uma nova ação de topo normalmente exige atualizar o menu, o `case` do router e,
para sessões interativas longas, a regra que evita `_dev_pause` duplicado.

## Fechamento de uma entrega

1. Confirme a camada correta e o escopo real no código atual.
2. Implemente com testes de regressão/regra quando suportado.
3. Rode os gates relevantes e o conjunto completo antes do PR sempre que o
   ambiente permitir.
4. Atualize a documentação viva correspondente.
5. Faça auto code review do diff e aplique os ajustes encontrados.
6. Abra o PR com objetivo, riscos, validação e impacto visual.
7. Não faça merge sem instrução explícita e sem os gates exigidos verdes.
