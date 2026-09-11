# Dev Dashboard — documentação do projeto

O Dev Dashboard é uma aplicação local para organizar, inspecionar e operar projetos Rails/Node, mantendo o CLI Bash como interface complementar.

`docs/` descreve **comportamento implementado, arquitetura e operação permanente**. Planejamento futuro, débitos e acompanhamento multi-PR vivem em issues/PRs.

## Entradas canônicas

- [`DEVELOPMENT.md`](DEVELOPMENT.md) — setup, desenvolvimento e gate de PR;
- [`local-installation.md`](local-installation.md) — instalação permanente via `systemd --user`;
- [`PRODUCTION.md`](PRODUCTION.md) — produção/self-update do próprio Dashboard;
- [`../README.md`](../README.md) — visão geral/quickstart;
- [`guia/README.md`](guia/README.md) — uso cotidiano por funcionalidade.

## Estado geral

A arquitetura atual combina:

```text
CLI Bash                        Dashboard Vue 3
   │                                 │
   │                                 ▼
   │                           API Fastify local
   │                                 │
   └──────────────┬──────────────────┘
                  ▼
 contracts │ core │ project-discovery │ process-manager
 Git │ testes │ banco │ scripts │ deployment │ self-update
                  │
          ┌───────┴────────┐
          ▼                ▼
 sistema/repositórios   providers explícitos
 locais                (ex.: Vercel)
```

A API é a fronteira de segurança. Ações estruturadas usam IDs/contratos, não shell/path/credencial livres enviados pelo browser.

## Serviços locais

| Serviço | Endereço padrão |
| --- | --- |
| API | `http://127.0.0.1:4343` |
| Web/Vite | `http://127.0.0.1:5174` |
| Preview | `http://127.0.0.1:4173` |
| Instalação permanente | `http://dev-dashboard.localhost:4343` |

## Gate de engenharia

```bash
npm run check
```

Hoje significa:

```text
format:check -> lint -> test -> build:apps
```

O CI usa essa interface depois de preparar dependências nativas.

## Produção

### `strategy=command`

```text
prepare? -> check -> backup? -> migrate? -> deploy -> verify
```

### `strategy=git-managed` + Vercel

```text
prepare? -> check -> migrate? -> provider-deploy -> verify
```

### `strategy=self-update`

O próprio Dashboard usa:

```text
check -> self-update
```

Self-update passa por confirmação, handoff/agent, fast-forward, restart e proof-of-revision. Na instalação permanente, o handoff validado pode delegar o runtime à unit fixa `dev-dashboard.service` em `systemd --user` quando checkout, metadados e ownership convergem.

## Mapa da documentação

### Comece aqui

- [Desenvolvimento](DEVELOPMENT.md)
- [Primeiros passos](getting-started.md)
- [Instalação local automática](local-installation.md)
- [Produção do próprio Dashboard](PRODUCTION.md)
- [Visão geral da arquitetura](architecture/overview.md)
- [Estrutura do repositório](architecture/repository-structure.md)
- [Segurança](architecture/security.md)
- [Fluxos runtime](architecture/runtime-flows.md)

### Produção/deployment

- [Production Contract v1](architecture/production-contract.md)
- [Domínio de deployment](architecture/deployment-domain.md)
- [Retry de verify](architecture/deployment-verify-retry.md)
- [Self-production](architecture/self-production.md)
- [Security review de self-production](architecture/self-production-security-review.md)
- [Operação de deployments](deployment-operations.md)
- [Interface de Produção](production-ui.md)
- [Guia de Produção](guia/producao.md)
- [Ambientes locais por projeto](project-local-environments.md)

### Fundações arquiteturais atuais

- [Frontend live state](architecture/frontend-live-state.md)
- [Project Profile](architecture/project-profile.md)
- [Project Profile providers](architecture/project-profile-providers.md)
- [Toolchain Doctor](architecture/toolchain-doctor.md)
- [Development Environment Instances](architecture/development-environment-instances.md)
- [Port Registry](architecture/port-registry.md)
- [Git Worktrees](architecture/git-worktrees.md)
- [Docker Compose](architecture/docker-compose.md)
- [GitHub Cockpit](architecture/github-cockpit.md)
- [Release Readiness](architecture/release-readiness.md)
- [Dependency Health](architecture/dependency-health.md)
- [Migration Providers](architecture/migration-providers.md)
- [Security Center](architecture/security-center.md)
- [Local CI com act](architecture/local-ci.md)
- [Test Intelligence](architecture/test-intelligence.md)

Esses domínios possuem maturidade diferente: alguns já têm lifecycle e superfície de produto, enquanto outros ainda possuem recortes incompletos. O escopo restante fica na issue correspondente; o documento arquitetural descreve somente o que já existe.

### Guia de uso

- [Guia geral](guia/README.md)
- [Servidor](guia/servidor.md)
- [Logs integrados](guia/logs.md)
- [Git](guia/git.md)
- [Testes](guia/testes.md)
- [Banco](guia/banco-de-dados.md)
- [Dependências](guia/dependencias.md)
- [Produção](guia/producao.md)
- [Terminal/Console](guia/terminal.md)
- [Variáveis de ambiente](guia/variaveis-de-ambiente.md)
- [Diagnóstico](guia/diagnostico.md)
- [README do projeto](guia/readme.md)
- [Workspaces](guia/workspaces.md)
- [Central de Atenção](guia/central-de-atencao.md)
- [Command Palette](product/command-palette.md)

### Engenharia e operação

- [Guia de engenharia](development-guide.md)
- [Testes e qualidade](testing-and-quality.md)
- [Contribuindo](../CONTRIBUTING.md)
- [AGENTS](../AGENTS.md)
- [Playbook de CI](ci-fix-playbook.md)
- [Operação e troubleshooting](operations-and-troubleshooting.md)
- [Referência gerada da API](architecture/api-reference.md)

## Documentos históricos

Algumas decisões removidas ainda possuem documento para contexto histórico, como IDE/IA/editor local. Esses arquivos precisam estar explicitamente marcados como **removidos/históricos** e não podem ser usados como prova de capability atual.

O antigo plano de refatoração de arquivos grandes também foi reduzido a um registro histórico concluído.

## Regra de planejamento

Não recrie `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou roadmap versionado. O roadmap vivo é a issue #596 e o trabalho específico pertence à sua issue/PR.

## Critério de documentação completa

Uma funcionalidade está documentada quando outra pessoa consegue descobrir:

- o que existe hoje;
- onde está a fonte de verdade;
- quais entradas/saídas/lifecycles existem;
- quais riscos e limites são relevantes;
- como validar/diagnosticar;
- qual trabalho ainda está aberto sem confundir proposta com implementação.
