# Roadmap

## Objetivo e regras

O Dev Dashboard evolui sem interromper o CLI Bash. Toda entrega web deve manter
a API em `127.0.0.1`, usar catálogo fechado de ações, receber apenas IDs e
valores validados do navegador e preservar schemas explícitos de resposta.

Antes de concluir uma entrega:

```bash
npm run typecheck
npm run build
npm test
```

## Horizonte 1 — coerência operacional (concluído)

Painel de atividade unificado, base de testes da interface (componentes
montados, smoke E2E, matriz de estados, auditoria inicial de teclado/foco) e
página global de processos — todos entregues.

## Horizonte 2 — produtividade diária (concluído)

Git em etapas (diff, branch, pull/push, commit, sincronização, mutações
com confirmação e histórico unificado — stash foi entregue na task 026,
mas ficou sem UI depois do redesenho do painel Git nas tasks 047–050 e o
código órfão foi removido na task 109), testes focados com
histórico e eventos SSE, Rails de baixo risco (migrations, routes,
Bundler, geradores), command palette, configurações e notificações, e
paridade seletiva CLI→Web (`git-save`, `dev-clean`, `git-pr`,
snapshot/restore de banco, editor local) — todos entregues. Integrações de
IA (`dev-claude`, assistente embutido) permanecem opcionais e isoladas em
painel próprio, sem virar dependência do fluxo principal.

## Horizonte 3 — projetos maiores e integrações (em aberto)

- detecção de monorepos e scan recursivo opt-in, limitado por profundidade,
  quantidade, timeout e diretórios ignorados;
- GitHub CLI somente após revisão do modelo de autorização.

Critério de saída: atender repositórios complexos mantendo descoberta
previsível e integrações revogáveis.

## Horizonte 4 — extensibilidade e portabilidade (em aberto)

- manifesto declarativo de extensões e capacidades;
- adaptadores versionados e revisados;
- temas e painéis adicionais sem execução remota;
- compatibilidade macOS;
- estratégia separada para Windows, onde processos, sinais e filesystem têm
  semânticas diferentes;
- migração e backup versionados do estado local.

## Backlog e detalhamento

A lista completa e atualizada de itens em aberto (qualidade, governança,
descoberta, extensibilidade) vive em `tasks/PENDENCIAS.md`, para não manter
duas listas divergentes. Este roadmap descreve os horizontes; `PENDENCIAS.md`
descreve cada item pendente com contexto e decisão.
