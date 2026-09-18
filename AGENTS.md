# AGENTS.md

## Objetivo

Trabalhe de forma autônoma, incremental e verificável. Prefira a menor solução completa e de menor manutenção.

## Workflow central

- O workflow, os papéis globais e as tasks operacionais canônicas ficam em `felipe-urgal/agent-workflow-browser`.
- Este repositório não mantém cópias locais dos papéis; regras específicas do Dev Dashboard vivem neste `AGENTS.md`.
- A task central registra estado/handoff da execução; backlog permanece em issues e documentação viva do projeto.
- CLI Bash e Dashboard Vue são interfaces independentes; não force paridade sem requisito explícito.
- Preserve os owners entre `apps/api`, `apps/web`, `packages/contracts`, `packages/core`, `packages/project-discovery`, `packages/process-manager` e `lib/`.
- O browser envia intenção estruturada: não aceite shell livre, path de autoridade ou credenciais vindos da UI.
- Capacidade local não concede push, PR, merge, deploy, release ou self-update.

## Fluxo

1. Inspecione estado e comportamento atuais.
2. Localize o owner da responsabilidade.
3. Identifique regressões e casos de borda.
4. Preserve comportamento fora do escopo.
5. Implemente com KISS/YAGNI.
6. Execute validações proporcionais ao risco.
7. Revise o diff final.

## Engenharia

- SOLID orienta decisões; não justifica camadas sem necessidade.
- Evite helpers, services, composables ou componentes genéricos prematuros.
- Mantenha contratos compartilhados pequenos e explícitos.
- Não transforme falhas de comandos externos em sucesso silencioso.
- Mudanças de Git, processos, banco e deployment exigem atenção a concorrência, confirmação e recuperação.

## Invariantes

- A API local é a fronteira de segurança.
- O navegador não envia linha de shell livre para execução.
- Mutações destrutivas exigem validação/confirmacão compatível com o risco.
- Providers externos ficam atrás de contratos explícitos.
- Fluxos locais devem permanecer úteis mesmo sem providers opcionais.

## Validação

    npm run check

Quando aplicável:

    npm run typecheck
    npm run test:e2e
    npm run test:cli

## Documentação

- docs/DEVELOPMENT.md
- docs/TASK_TEMPLATE.md
- docs/CODE_REVIEW.md

Histórico pertence a Git, issues e PRs; documentação nova deve representar contratos ou procedimentos vivos.
