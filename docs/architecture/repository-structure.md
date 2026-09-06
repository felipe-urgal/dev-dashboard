# Estrutura do repositório e responsabilidades

O Dev Dashboard é um monorepo npm com aplicação web/API, packages compartilhados, tooling do próprio projeto, documentação e o CLI Bash original.

## Árvore de alto nível

```text
dev-dashboard/
├── .dev-dashboard/        # Production Contract do próprio Dashboard
├── .github/               # CI, segurança, release e automações
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── process-manager/
│   └── project-discovery/
├── scripts/
├── docs/
├── tests/
│   └── cli/
├── config/
├── lib/
├── AGENTS.md
├── CONTRIBUTING.md
├── README.md
├── init.sh
├── package.json
├── package-lock.json
└── tsconfig.base.json
```

Não existe diretório `tasks/` nem roadmap versionado. Planejamento, débitos e trabalho multi-PR vivem nas issues/PRs do GitHub.

## Direção de dependências

```text
apps/web ───────────────┐
                       ├──> packages/contracts
apps/api ───────────────┤
   │                   ├──> packages/core
   │                   ├──> packages/project-discovery
   └───────────────────┴──> packages/process-manager
```

Packages compartilhados não dependem de Vue ou Fastify. A web não acessa filesystem/processos diretamente; a API é a fronteira entre navegador, máquina local e providers externos.

## Comandos principais

Na raiz:

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run check
```

`predev`, `pretypecheck`, `pretest`, `predev:api` e `predev:web` compilam `packages/*` antes do consumidor correspondente. `npm run build` também inclui `build:packages` antes de `build:apps`.

O gate canônico é:

```text
format:check -> lint -> test -> build:apps
```

Comandos direcionados por workspace continuam disponíveis quando uma investigação precisa isolar API, web ou package específico.

## `apps/api`

Aplicação Fastify/TypeScript e principal fronteira de segurança.

Responsabilidades:

- listener local e configuração do servidor;
- autenticação/origem;
- schemas HTTP;
- workspaces/projetos;
- Git, processos, testes, scripts, banco, arquivos e Rails;
- Production Contract/deployment/self-update;
- integrações externas;
- persistência de estado/histórico;
- shutdown coordenado de recursos.

### Composição

A API mantém a interface `AppContext` usada pelas rotas, mas a construção real é dividida por domínios e composição para evitar um root monolítico.

Pontos centrais:

```text
server.ts
  ↓
app.ts                    # Fastify, segurança e registro de rotas
  ↓
app-context.ts            # interface/fachada de contexto
app-context-domains.ts    # construção por domínio
app-composition.ts        # recursos por instância e lifecycle/onClose
```

Serviços com processos, PTYs, streams, timers, sessions, locks ou outros recursos duradouros precisam participar do lifecycle adequado.

### Organização

```text
apps/api/src/
├── deployment/    # planner, adapters, confirmação, timeline/recovery
├── http/          # schemas/erros/infra HTTP
├── routes/        # transporte HTTP por domínio
├── security/      # autenticação/origem
├── services/      # casos de uso e integrações locais
├── store/         # stores específicos
├── app-context.ts
├── app-context-domains.ts
├── app-composition.ts
├── app.ts
└── server.ts
```

A lista exata de endpoints é gerada em [`api-reference.md`](api-reference.md).

## `apps/web`

Aplicação Vue 3 + TypeScript + Vite.

Responsabilidades:

- navegação/apresentação;
- estado visual;
- consumo de contratos HTTP/SSE/WS;
- descarte de respostas stale;
- confirmação/feedback de mutações;
- acessibilidade e responsividade.

A web não escolhe `cwd`, paths de autoridade, programa/argv, token de provider ou credencial local.

### Rotas globais atuais

```text
/             Visão geral
/processes    Processos
/production   Produção global
/database     Banco de dados global
```

O detalhe de projeto possui rotas para README, Diagnóstico, Servidor, Git, Testes, Produção, Dependências, Sidekiq/Webpack, Terminal, Console e Ambiente conforme capability. A antiga rota de Logs redireciona para Servidor; banco por projeto redireciona para a superfície global.

O servidor Vite padrão usa `127.0.0.1:5174`; a API usa `127.0.0.1:4343`.

## `packages/contracts`

Tipos e contratos serializáveis compartilhados entre camadas.

Não deve conter:

- Fastify/Vue;
- filesystem;
- processos;
- credenciais;
- infraestrutura específica de app.

## `packages/core`

Configuração/IDs/token local e regras compartilháveis sem dependência das aplicações.

## `packages/project-discovery`

Detecta Projects/capabilities e valida contratos de descoberta de forma read-only/fail-closed. Project Profile/providers também pertencem a essa fronteira quando a responsabilidade é descoberta estática/estruturada.

Discovery não deve iniciar runtime ou executar mutações.

## `packages/process-manager`

Lifecycle de processos de desenvolvimento conhecidos. Preserva:

- comando reconhecido;
- `cwd` validado;
- `shell: false`;
- identidade/ownership;
- porta e logs limitados;
- persistência coerente;
- TERM antes de KILL;
- cleanup.

`Deployment`, `Script Execution` e `Self Update` não são kinds genéricos do Process Manager; possuem domínios próprios.

## `scripts`

Tooling do próprio repositório. Entre os scripts atuais:

| Script | Responsabilidade |
| --- | --- |
| `dev.mjs` | orquestra API + Vite |
| `dev-web.mjs` | inicia distribuição compilada e participa do restart de self-update |
| `doctor.mjs` | diagnóstico local |
| `local-install.mjs` | instalação permanente via `systemd --user` |
| `production-gate.mjs` | `prod:status` / `prod:check` do próprio Dashboard |
| `self-update-agent.mjs` | instalação/lifecycle/tooling do agent |
| `self-update-helper.mjs` | operações de handoff para engenharia |
| `generate-api-docs.mjs` | gera referência HTTP |
| `*.test.mjs` | regressões da automação raiz |

Scripts com regra relevante devem possuir teste; nenhum deles deve virar caminho oculto para shell arbitrário vindo da UI.

## `docs`

Documentação viva de produto, arquitetura, operação e desenvolvimento.

```text
docs/
├── index.md
├── DEVELOPMENT.md
├── PRODUCTION.md
├── getting-started.md
├── local-installation.md
├── development-guide.md
├── operations-and-troubleshooting.md
├── deployment-operations.md
├── testing-and-quality.md
├── architecture/
├── guia/
├── design/
├── product/
└── prototypes/
```

Documentos explicitamente marcados como históricos podem registrar decisões removidas; eles não devem ser confundidos com comportamento atual. Backlog não vive em `docs/`.

## `lib`, `config` e `init.sh`

Representam o CLI Bash original e sua configuração. O CLI continua uma interface válida e independente da web. Compartilhamento entre CLI e web só deve acontecer quando houver benefício e fronteira clara; não existe obrigação de reescrever tudo em TypeScript.

## Onde colocar código novo

| Necessidade | Local esperado |
| --- | --- |
| tipo compartilhado | `packages/contracts` |
| configuração/ID genérico | `packages/core` |
| discovery/profile | `packages/project-discovery` |
| processo de desenvolvimento conhecido | `packages/process-manager` |
| caso de uso backend | `apps/api/src/services` ou domínio específico |
| endpoint HTTP | `apps/api/src/routes` |
| deployment | `apps/api/src/deployment` |
| UI/estado visual | `apps/web/src` |
| tooling do repo | `scripts` / `.github` |
| comportamento implementado | `docs` |
| backlog/roadmap | issue/PR GitHub |

## Critérios para uma nova camada

Uma nova camada/módulo precisa de responsabilidade real: domínio próprio, fronteira de segurança, lifecycle independente, reutilização concreta ou isolamento necessário para teste. Evite abstrações preventivas.
