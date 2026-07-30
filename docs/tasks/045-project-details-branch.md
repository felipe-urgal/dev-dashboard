# Task 045 — destaque da branch no cabeçalho de detalhes

## Status

Concluída.

## Objetivo

Simplificar novamente o cabeçalho de detalhes do projeto para exibir somente
a branch atual como metadado de destaque.

## Resultado

- removidos workspace, origem e quantidade de capacidades do cabeçalho;
- branch atual apresentada em um destaque visual próprio;
- removido o indicador global de servidor injetado no título do projeto;
- removido o indicador duplicado e a consulta periódica de servidor do painel
  Git;
- preservados os dados de workspace no cartão de resumo e a área dedicada de
  servidor.

## Arquivos principais

- `apps/web/src/views/ProjectDetailsView.vue`
- `apps/web/src/views/ProjectDetailsView.css`
- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/components/ProjectGitPanel.css`
- `apps/web/src/main.ts`

## Validação

- typecheck do workspace web;
- build do workspace web;
- testes do workspace web.
