# Dev Dashboard

Dashboard local para descobrir projetos e centralizar Git, processos, testes, banco, dependências, Docker Compose, logs e operações controladas de produção.

## Stack

- Vue 3 + TypeScript
- Fastify
- npm workspaces
- Node.js 20.19+ / 22.12+

## Desenvolvimento

    npm ci
    npm run doctor
    npm run dev

Gate principal:

    npm run check

E2E quando necessário:

    npm run test:e2e

## Instalação local no Linux

Depois de instalar as dependências, o próprio repositório pode registrar o Dev Dashboard como serviço e aplicativo do usuário:

    npm run local:install

O instalador cria o serviço `systemd --user`, registra **Dev Dashboard** no launcher via XDG e instala o ícone local. No Ubuntu/GNOME, o app pode ser pesquisado pelo nome e fixado no Dock pelos favoritos.

Comandos úteis:

    npm run local:status
    npm run local:open
    npm run local:uninstall

`local:uninstall` remove apenas os artefatos gerenciados da instalação e preserva configuração, estado e checkout.
## Terminal `dev-tools`

O modo Terminal mantém apenas ações suportadas pelo Dashboard atual. No menu de projeto ficam Git, navegador, editor, terminal, status de servidores e os submenus Rails/Node enquanto eles são migrados para os contratos modernos.

Abertura de editor usa `DEV_EDITOR` quando configurado e, como fallback local, tenta `subl`, `code` e `gedit`. O comando histórico `dev-sublime` permanece apenas como alias de compatibilidade para `dev-editor`.

Integrações diretas antigas com Claude Code/ações de IA foram removidas do `dev-tools`; automação assistida pertence ao Agent Runtime do Dashboard.

## Segurança

A API local é a fronteira de segurança. Ações estruturadas não devem aceitar shell arbitrário vindo do navegador. Operações Git, banco e produção devem manter validação e confirmação adequadas ao risco. A remoção de Worktrees também respeita ownership por Environment Instance: processos, terminais e Docker Compose owned bloqueiam a remoção até que o recurso seja encerrado explicitamente; desaparecimentos externos ficam como `cleanup-required` quando o Compose ainda não pode ser reconciliado com segurança.

## Documentação

- [Desenvolvimento](docs/DEVELOPMENT.md)
- [Template de tarefa](docs/TASK_TEMPLATE.md)
- [Guia de code review](docs/CODE_REVIEW.md)
- [Dependency Health](docs/architecture/dependency-health.md)

Regras para agentes estão em [AGENTS.md](AGENTS.md).
