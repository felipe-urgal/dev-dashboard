# Task 085 — Navegação responsiva em tablet

## Status

Implementada e aguardando revisão.

## Contexto

A base E2E da task 024 cobria desktop em 1280 px e tela estreita em 375 px,
mas não exercitava a faixa intermediária. O app shell mantinha a sidebar fixa
até 760 px; por isso tablets em modo retrato, como 768–834 px, recebiam ao
mesmo tempo uma sidebar de 210 px e uma topbar com vários controles. A área
principal ficava comprimida justamente na largura que ainda não era coberta
pelo Playwright.

A sidebar recolhível adicionada depois da task 024 introduziu uma segunda
condição relevante: a preferência persistida de sidebar recolhida era aplicada
em qualquer largura acima de 760 px. Apenas aumentar visualmente o breakpoint
do drawer sem neutralizar essa regra faria o drawer de tablet abrir no estado
compacto, escondendo workspace, rótulos e textos de navegação.

## Objetivo

Tornar a navegação principal simples e utilizável em tablets em modo retrato,
proteger o comportamento com E2E responsivo e não alterar o layout desktop ou
o drawer móvel já existente.

## Escopo entregue

- o breakpoint existente do drawer em `apps/web/src/styles/layout.css` passa
  de 760 px para 900 px;
- a sidebar recolhível em `apps/web/src/sidebar-collapse.css` fica restrita a
  larguras a partir de 901 px, evitando que a preferência desktop compacte o
  drawer;
- entre 761 px e 900 px, a sidebar fixa vira drawer, liberando toda a largura
  para o conteúdo e exibindo o botão **Abrir navegação** na topbar;
- comando de busca e status textual da API deixam de competir por espaço na
  topbar de tablet, mantendo notificações e seletor de tema acessíveis;
- o drawer mostra sempre workspace, rótulos e textos completos, mesmo quando
  `dev-dashboard:primary-sidebar-collapsed` está salvo como `true`;
- movimento reduzido continua removendo a transição do drawer;
- o smoke responsivo ganha uma viewport de tablet em 820 × 1180.

## Cobertura E2E

`apps/web/e2e/tests/responsive.spec.ts` passa a verificar três larguras:

- desktop: 1280 × 800, com sidebar persistente;
- tablet: 820 × 1180, com drawer e preferência desktop de sidebar recolhida
  previamente salva;
- estreita: 375 × 700, preservando o drawer móvel existente.

Em cada cenário o teste valida ausência de overflow horizontal e acesso ao
controle de tema. Em tablet e mobile também abre o drawer, confere workspace e
links completos, garante que o botão de recolher está oculto, navega para
**Processos** e confirma que o drawer fecha após a troca de rota.

## Critérios de aceite

- tablets em modo retrato não mantêm uma sidebar fixa consumindo a área do
  conteúdo — atendido;
- o drawer de tablet mostra a navegação completa mesmo com a preferência de
  sidebar recolhida salva — atendido;
- desktop acima de 900 px mantém a sidebar persistente e recolhível —
  preservado;
- mobile até 760 px mantém o comportamento existente — preservado;
- Playwright cobre explicitamente desktop, tablet e tela estreita — atendido;
- nenhuma rota, contrato ou operação privilegiada é alterada — atendido.

## Arquivos alterados

- `apps/web/src/styles/layout.css`;
- `apps/web/src/sidebar-collapse.css`;
- `apps/web/e2e/tests/responsive.spec.ts`;
- `apps/web/e2e/README.md`;
- `docs/PENDENCIAS.md`;
- `docs/roadmap.md`;
- `docs/tasks/085-tablet-navigation-e2e.md`;
- `docs/tasks/README.md`;
- `docs/tasks/NEXT.md`.

## Validação

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e
```

O ambiente desta implementação não possui checkout executável nem GitHub CLI;
a validação completa fica registrada para o CI do pull request.

## Fora do escopo

- redesenhar a navegação desktop;
- criar uma experiência específica para tablet em modo paisagem;
- alterar conteúdo, rotas ou comportamento da command palette;
- adicionar novos baselines visuais dependentes de screenshot.
