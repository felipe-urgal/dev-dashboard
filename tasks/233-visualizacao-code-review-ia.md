# Task 233 — Visualização da Code review IA por arquivo

**Status:** concluída em 2026-08-10.

## Objetivo

Tornar o retorno da Code review IA acionável, permitindo analisar os
comentários no contexto do arquivo e do diff que a IA recebeu.

## Resultado

- a lista longa de comentários foi substituída por uma área de revisão por
  arquivo;
- a tela mostra a quantidade de apontamentos pendentes, os arquivos com
  comentários e a contagem pendente de cada arquivo;
- ao selecionar um arquivo, os comentários aparecem junto do diff lado a
  lado da mesma comparação entre a branch e a base;
- foi adicionada uma rota de leitura específica para obter o diff de um
  arquivo da comparação da revisão, com caminho validado pelo Git antes da
  execução;
- apontamentos podem ser selecionados, resolvidos ou ignorados durante a
  sessão atual, sem alterar o repositório;
- a referência de API e o guia de Git foram atualizados.

## Limitações

O estado de seleção, resolução e ignorado vive apenas na tela enquanto a
sessão está aberta. Ele não registra comentários nem modifica arquivos.

## Validação

- `npm run typecheck`;
- `npm run lint`;
- `npm run format:check`;
- `npm run build`;
- `npm run docs:api` e `npm run docs:api:check`;
- `node --import=tsx --test apps/api/test/git-pull-request-service.test.ts`;
- `npx vitest run --coverage.enabled=false test/project-git-panel.test.ts`.
