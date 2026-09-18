# Desenvolvimento

## Preparação

Requisitos:

- Linux
- Git
- Node.js ^20.19.0 ou >=22.12.0
- npm

Instalação:

    npm ci
    npm run doctor

Execução:

    npm run dev

## Relação com o agent-workflow-browser

Quando uma mudança for coordenada pelo `agent-workflow-browser`, este documento continua sendo a fonte local para preparação, desenvolvimento e validação do projeto. Ele não substitui a task canônica nem define workflow, handoff ou autorizações.

## Fluxo de alteração

1. Reproduza ou entenda o comportamento atual.
2. Identifique o módulo owner.
3. Defina critérios de aceite para mudanças não triviais.
4. Faça a menor alteração coerente.
5. Teste no nível adequado.
6. Execute o gate principal e revise o diff.

## Validação

Gate canônico:

    npm run check

Comandos úteis:

    npm run typecheck
    npm test
    npm run build
    npm run test:cli
    npm run test:e2e

## Segurança e integração

- Não aceite shell arbitrário vindo da UI.
- Preserve validações de caminho, projeto e workspace.
- Operações destrutivas devem manter confirmação e caminho de recuperação.
- Integrações externas devem falhar de forma explícita e não contaminar o core.

## Política de documentação

Mantenha somente documentação viva. Planos concluídos, relatórios e decisões pontuais ficam no histórico Git, issues e PRs.
