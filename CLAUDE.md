# CLAUDE.md

Este arquivo fornece orientações ao Claude Code ao trabalhar com código neste
repositório. Leia também `AGENTS.md`, `CONTRIBUTING.md` e a documentação viva em
`docs/` antes de editar arquivos.

## O que é isto

O projeto possui **duas interfaces compartilhando um mesmo repositório**:

1. **CLI bash original** — dashboard interativo em `lib/`, carregado no shell
   do usuário via `init.sh`. Continua suportado e não é substituído pelo web.
2. **Dashboard web** — monorepo TypeScript com npm workspaces: `apps/api`
   (Fastify), `apps/web` (Vue 3 + Vite) e `packages/*` compartilhados.

A migração é incremental e deliberada. Não assuma que mudanças em uma interface
precisam alterar a outra.

Textos de UI, comentários, mensagens de commit e documentação são escritos em
**português brasileiro**.

Toda mudança que altera comportamento, rota, capacidade ou fluxo precisa
atualizar a documentação viva correspondente em `docs/` na mesma entrega.

## Planejamento e histórico

A pasta `tasks/` foi removida deliberadamente do repositório. **Não recrie
`tasks/`, `NEXT.md` ou `PENDENCIAS.md`.** O backlog não é versionado aqui.

Antes de iniciar um trabalho:

- use o contexto fornecido pelo usuário;
- consulte issues e PRs relacionados quando existirem;
- leia a documentação viva do domínio;
- confirme no código se débitos ou planos antigos ainda se aplicam.

O PR é o registro versionado do resultado da entrega: objetivo, decisões,
riscos, testes, impacto visual e limitações.

## Fluxo de desenvolvimento

### CLI bash

```bash
source ~/.dev-dashboard/init.sh
dev-doctor
dev-help
dev-tools
```

Como a maior parte das funções é interativa, valide a função alterada em um
shell com o dashboard carregado. Helpers não interativos possuem suíte própria:

```bash
npm run test:cli
```

Execute essa suíte quando a mudança tocar `lib/`, `init.sh` ou contratos Bash
relacionados. `lib/*/tests/` contém menus para rodar testes do projeto alvo; não
é a suíte do Dev Dashboard.

### Dashboard web (`apps/`, `packages/`)

```bash
npm install

npm run dev
npm run dev:api
npm run dev:web
npm run dev-web
npm run doctor

npm run lint
npm test
npm run build
npm run test:coverage
npm run typecheck
npm run format:check
npm run test:e2e

npm run docs:api
npm run docs:api:check
npm run release -- <patch|minor|major>
```

Os scripts `build`, `typecheck`, `dev`, `dev:api`, `dev:web`, `test` e
`test:coverage` recompilam packages quando necessário por meio dos hooks `pre*`.
Os apps importam a saída compilada em `dist/`, não diretamente os fontes
TypeScript dos packages.

O `package.json` raiz exige Node `^20.19.0 || >=22.12.0`.

### CI

`.github/workflows/ci.yml` mantém um único job `Validate` em Node 24:

```text
npm ci --ignore-scripts
npm rebuild esbuild node-pty
npm run lint
npm test
npm run build:apps
```

O CI de PR não roda coverage, E2E, CLI Bash, format check, typecheck isolado nem
job de Node mínimo. Essas verificações continuam disponíveis e devem ser usadas
de forma direcionada quando o risco da mudança justificar.

Security/CodeQL fica fora do caminho crítico dos PRs e roda de forma periódica
ou manual.

### Política de testes

`npm test` executa testes funcionais sem coverage. Coverage é um diagnóstico
explícito via:

```bash
npm run test:coverage
```

Não há threshold percentual obrigatório. Não adicione teste apenas para elevar
coverage.

Mantenha testes que protegem regras de negócio, contratos, segurança, mutações,
concorrência/cleanup, regressões reais e comportamento importante da UI.

Evite testes que apenas congelem CSS, markup, ordem de imports ou detalhes
internos sem contrato. Guards estáticos continuam aceitáveis quando impedem uma
arquitetura explicitamente proibida, como `MutationObserver`/enhancers globais,
shell arbitrário ou diálogos nativos.

### Rodando um teste específico

Cada workspace usa `node --test` com `tsx`, exceto `apps/web` (Vitest +
Playwright):

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
- **`apps/web`** — Vue 3 SFCs. Toda chamada HTTP passa pela camada de API;
  o frontend não executa comandos locais nem acessa o filesystem. Ao trocar de
  projeto, painéis invalidam estado assíncrono pelo padrão `generation`.
- **`packages/contracts`** — apenas tipos compartilhados; sem Fastify, Vue ou
  dependências novas de infraestrutura.
- **`packages/core`** — configuração de workspaces e armazenamento do token
  local da API.
- **`packages/project-discovery`** — descoberta de projetos Rails/Node.
- **`packages/process-manager`** — ciclo de vida de processos conhecidos,
  iniciado sem `shell: true`, com validação de PID/cwd e TERM antes de KILL.

Os kinds gerenciados atuais são `'server'`, `'test'`, `'worker'` e `'webpack'`.
Execuções de scripts têm ciclo de vida próprio e não fazem parte desse store.

Não existe adaptador compartilhado entre o CLI bash e o monorepo. Uma extração
comum exige decisão arquitetural e modelo de ameaça próprios.

Narrativa completa: `docs/architecture/overview.md`.

## Modelo de segurança da API

A API é um processo local privilegiado. Leia `docs/architecture/security.md`
antes de criar ou alterar endpoints.

- Escuta somente em `127.0.0.1`, nunca em `0.0.0.0`.
- Catálogo fechado de ações; nenhuma linha de shell arbitrária vem do browser.
- Token local aleatório é exigido em rotas privadas; `GET /api/health` é pública.
- CORS usa lista fechada de origens locais.
- Caminhos recebidos da interface não podem escapar do projeto/workspace
  autorizado.
- Leituras de log e arquivo possuem limites.
- Schemas de resposta descartam campos não declarados antes da serialização.
- Operações sensíveis exigem confirmação explícita quando aplicável.

## Padrões do frontend

- Estados de loading precisam refletir trabalho real.
- Ações concorrentes devem ser bloqueadas apenas quando existe risco real de corrida.
- Respostas obsoletas precisam ser descartadas após troca de projeto/contexto.
- Mantenha estados de vazio, erro, sucesso e progresso explícitos.
- Revise foco, teclado, responsividade e movimento reduzido.
- Prefira UI simples, ágil e funcional; remova redundância antes de adicionar elementos.
- Não adicione pós-processamento global de DOM/`MutationObserver` quando o
  comportamento puder pertencer declarativamente ao Vue.

## Internals do CLI bash

`init.sh` é o ponto de entrada e carrega módulos em ordem de dependência. Pastas
de funcionalidade seguem a convenção existente (`init.sh`, `helpers.sh` e
arquivo de ação). Não invente nova convenção sem necessidade arquitetural.

- Comandos públicos: kebab-case, normalmente `dev-*`, `git-*` e `project-*`.
- Helpers privados: prefixo `_`, snake_case.
- `DEV_BASE` define raiz de descoberta.
- `DEV_RUN_DIR` guarda estado temporário de processos.
- `PROJECT_META` e `PROJECT_CONFIG` guardam metadados/configuração detectados.
- UI interativa precisa manter `gum` e fallback puro.
- Processos encerram com TERM antes de KILL quando aplicável.

## Fechamento de uma entrega

1. Confirme a camada correta e o escopo real no código atual.
2. Implemente com testes de regressão/regra quando houver risco relevante.
3. Para uma mudança normal, rode:

```bash
npm run lint
npm test
npm run build
```

4. Acrescente `typecheck`, `format:check`, `test:cli`, `test:e2e`,
   `test:coverage`, Node mínimo e outros gates apenas quando o escopo justificar.
5. Atualize a documentação viva correspondente.
6. Faça auto code review do diff e aplique os ajustes encontrados.
7. Abra PR com objetivo, riscos, validação e impacto visual.
8. Não faça merge sem instrução explícita e sem os checks exigidos verdes.
