# Task 136 — Documentação e tema na barra lateral

## Status

Em revisão.

## Objetivo

Reduzir a quantidade de controles no cabeçalho global e concentrar atalhos de apoio na barra lateral, mantendo a navegação principal mais limpa.

## Implementação

- remove o botão **Documentação** do cabeçalho superior;
- remove o seletor **Escuro / Claro** do cabeçalho superior;
- adiciona uma seção **Preferências** no rodapé da barra lateral, acima do status da API;
- mantém **Documentação** como link externo para a central local em `127.0.0.1:4545`;
- mantém a troca de tema com as mesmas preferências persistidas já existentes;
- adapta os controles para a sidebar recolhida: documentação permanece como ícone e os temas passam a dois botões de ícone empilhados;
- preserva os textos dos temas na sidebar expandida, inclusive no layout móvel.

## Arquivos alterados

- `apps/web/src/App.vue`
- `apps/web/src/components/VisualPreferences.vue`
- `apps/web/src/styles/layout.css`
- `apps/web/src/sidebar-collapse.css`
- `docs/getting-started.md`

## Decisões

- **Documentação** e **Tema** ficam próximos ao status da API porque são utilidades globais, não destinos da navegação principal.
- O topo continua reservado para contexto da página, notificações, navegação rápida e estado online/offline.
- Nenhuma preferência nova é criada; a implementação reaproveita o armazenamento de tema e de sidebar existentes.

## Validação

A validação automatizada fica a cargo do CI do pull request. A mudança é somente de frontend e documentação, sem alteração de API, contratos ou persistência.
