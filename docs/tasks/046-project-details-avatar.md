# Task 046 — remoção do avatar nos detalhes do projeto

## Status

Concluída.

## Objetivo

Remover o bloco de iniciais do cabeçalho de detalhes para deixar a
identificação do projeto ainda mais direta.

## Resultado

- removido o componente `ProjectAvatar` do cabeçalho;
- removidos os estilos exclusivos do avatar e do agrupamento anterior;
- eliminado o recuo da branch que compensava a largura do avatar;
- preservados nome, tipo, caminho e destaque da branch atual.

## Arquivos alterados

- `apps/web/src/views/ProjectDetailsView.vue`
- `apps/web/src/views/ProjectDetailsView.css`

## Validação

- typecheck do workspace web;
- build do workspace web;
- testes do workspace web.
