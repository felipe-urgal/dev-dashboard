# Task 044 — simplificação do cabeçalho de detalhes

## Status

Concluída.

## Objetivo

Reduzir o cabeçalho da página de detalhes do projeto, removendo as ações
redundantes "Copiar caminho", "Abrir Git" e "Executar script".

## Resultado

- removido o grupo de três ações do cabeçalho;
- removidos o estado, o temporizador e a função de cópia que ficaram sem uso;
- removidos os estilos exclusivos do grupo de ações;
- preservadas as abas de Git e Scripts e os acessos rápidos existentes no
  conteúdo da página.

## Arquivos alterados

- `apps/web/src/views/ProjectDetailsView.vue`
- `apps/web/src/views/ProjectDetailsView.css`

## Validação

- typecheck do workspace web;
- build do workspace web;
- testes do workspace web.

## Limitações

Nenhuma alteração foi feita nas ações equivalentes disponíveis nas demais
áreas da página.
