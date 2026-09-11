# Dev Dashboard — documentação do projeto

O Dev Dashboard é uma aplicação local para organizar, inspecionar e operar projetos Rails/Node, mantendo o CLI Bash como interface complementar.

`docs/` descreve **somente o estado atual do produto, arquitetura estável e operação permanente**. Histórico de funcionalidades removidas pertence a commits/PRs. Planejamento futuro, débitos e acompanhamento multi-PR vivem em issues.

## Entradas canônicas

- [`../README.md`](../README.md) — visão geral e quickstart;
- [`DEVELOPMENT.md`](DEVELOPMENT.md) — setup, desenvolvimento e gate de PR;
- [`local-installation.md`](local-installation.md) — instalação permanente via `systemd --user`;
- [`PRODUCTION.md`](PRODUCTION.md) — produção/self-update do próprio Dashboard;
- [`guia/README.md`](guia/README.md) — uso cotidiano por funcionalidade;
- [`product/vision.md`](product/vision.md) — direção e princípios do produto.

## Mapa da documentação

### Arquitetura base

- [Visão geral](architecture/overview.md)
- [Estrutura do repositório](architecture/repository-structure.md)
- [Fluxos runtime](architecture/runtime-flows.md)
- [Segurança](architecture/security.md)
- [Frontend live state](architecture/frontend-live-state.md)
- [Development Environment Instances](architecture/development-environment-instances.md)
- [Project Profile](architecture/project-profile.md)
- [Project Profile providers](architecture/project-profile-providers.md)
- [Toolchain Doctor](architecture/toolchain-doctor.md)
- [Port Registry](architecture/port-registry.md)

### Git, runtime e entrega

- [Git Worktrees](architecture/git-worktrees.md)
- [Docker Compose](architecture/docker-compose.md)
- [GitHub Cockpit](architecture/github-cockpit.md)
- [Release Readiness](architecture/release-readiness.md)
- [Dependency Health](architecture/dependency-health.md)
- [Migration Providers](architecture/migration-providers.md)
- [Security Center](architecture/security-center.md)
- [Local CI com act](architecture/local-ci.md)
- [Test Intelligence](architecture/test-intelligence.md)

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

### Produto e experiência

- [Visão do produto](product/vision.md)
- [Arquitetura da informação](design/information-architecture.md)
- [Experiência compartilhada de logs](design/log-experience.md)
- [Command Palette](product/command-palette.md)

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
- [Migrations](guia/migrations.md)
- [Readiness](guia/readiness.md)
- [Segurança](guia/seguranca.md)
- [Diagnóstico](guia/diagnostico.md)
- [README do projeto](guia/readme.md)
- [Workspaces](guia/workspaces.md)
- [Central de Atenção](guia/central-de-atencao.md)

### Engenharia e operação

- [Guia de engenharia](development-guide.md)
- [Testes e qualidade](testing-and-quality.md)
- [Playbook de CI](ci-fix-playbook.md)
- [Operação e troubleshooting](operations-and-troubleshooting.md)
- [Referência gerada da API](architecture/api-reference.md)
- [Contribuindo](../CONTRIBUTING.md)
- [AGENTS](../AGENTS.md)

## Regra de planejamento

O roadmap vivo é a issue **#596**. Trabalho parcial, futuro ou que atravessa vários PRs deve ficar na issue correspondente, não em um documento versionado de plano.

Não recrie `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou roadmap paralelo em `docs/`.

## Regra de manutenção

1. documentação permanente descreve comportamento implementado ou uma decisão arquitetural ainda válida;
2. funcionalidade removida perde sua documentação específica; o histórico continua disponível no Git/PR;
3. detalhes de backlog permanecem nas issues, evitando snapshots duplicados que ficam desatualizados;
4. protótipos são descartáveis e não permanecem em `docs/` depois da decisão/implementação;
5. documentos de visão geral devem apontar para fontes de verdade por domínio, não repetir status de cada issue;
6. quando comportamento e documentação divergirem, a mudança só está completa depois de corrigir a documentação.

## Critério de documentação completa

Uma funcionalidade está documentada quando outra pessoa consegue descobrir:

- o que existe hoje;
- onde está a fonte de verdade;
- quais entradas, saídas e lifecycles existem;
- quais riscos e limites são relevantes;
- como validar e diagnosticar;
- qual trabalho ainda está aberto sem confundir proposta com implementação.
