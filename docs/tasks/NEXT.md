# Próxima atividade — 017: Revisão de design do produto (etapa 1 da reforma)

## Contexto

O usuário pediu no roadmap para revisitar o design antes de continuar
adicionando telas. A subseção "Revisão de design e reforma de layout"
do Horizonte 2 divide o trabalho em duas etapas para não misturar
decisão com implementação; esta task cobre a etapa 1 (auditoria e
decisões), sem mexer em código.

## Objetivo

Auditar o produto web atual (`/`, `/activity`, `/processes`, detalhe
do projeto com suas abas) do ponto de vista de arquitetura de
informação, hierarquia, densidade, vocabulário visual e consistência
entre telas. Registrar decisões em documento próprio para orientar a
reforma de layout que vem em seguida.

## Plano detalhado

1. Percorrer cada tela do frontend e o `docs/design/information-architecture.md`,
   listando o que está implementado hoje, o que está inconsistente e o
   que ficou aspiracional.
2. Auditar `apps/web/src/styles.css` catalogando tokens implícitos:
   paleta de cores, tipografia, espaços, raios, sombras, badges.
   Anotar duplicações e nomes ad hoc.
3. Definir vocabulário visual proposto: paleta neutra + accents (o
   projeto é uma ferramenta profissional local), tipografia, escala de
   espaço (4/8px), densidade padrão vs. compacta, tema claro/escuro.
4. Definir padrões de layout: app shell, densidade dos cards de
   projeto, listas e tabelas, formulários, breadcrumbs, empty states,
   toasts/mensagens de sucesso/erro.
5. Marcar quais decisões afetam contratos de componentes (props/slots)
   para que a etapa 2 já saiba onde tocar.
6. Escrever `docs/design/redesign-2026.md` com: contexto, princípios,
   diretrizes de tokens, padrões de componente, roteiro de migração
   tela-por-tela, e o que fica **fora** do escopo desta reforma.
7. Atualizar `docs/design/information-architecture.md` apontando para
   o novo documento e anotando itens que serão substituídos.

## Fora do escopo

- Escrever CSS ou tocar em componentes — vem na task 018.
- Redesign de identidade visual (logo, marca) — não é o problema atual.
- Trocar frameworks (Tailwind, UnoCSS etc.) sem justificativa
  concreta; a decisão sobre framework fica documentada como parte da
  etapa 1 se ficar clara.

## Critérios de aceite

- documento `docs/design/redesign-2026.md` publicado com princípios,
  tokens, padrões e roteiro;
- `docs/design/information-architecture.md` atualizado apontando o que
  o novo documento substitui;
- roadmap atualizado marcando "revisão de design" como concluída e a
  reforma como próxima entrega.
