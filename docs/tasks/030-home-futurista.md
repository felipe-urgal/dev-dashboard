# Task 030 — Nova home no modelo Aurora

## Status

Concluída e refinada em 27 de julho de 2026.

## Objetivo

Reimaginar a página inicial do dashboard com uma direção futurista coerente e estender a linguagem escolhida para todo o shell da aplicação, sem remover as ações reais de workspace e projetos.

## Resultado

Após a exploração inicial entre Órbita, Terminal e Aurora, a direção **Aurora** foi adotada como experiência integral. A linguagem agora cobre:

- sidebar flutuante e translúcida, navegação, marca, workspace e preferências;
- topbar, busca, status da API e identificação do fluxo visual;
- plano de fundo atmosférico do `main-content` e luzes ambientais;
- hero da home com mensagem principal, privacidade local e resumo vivo do ambiente;
- `content`, `home-control-grid`, painel de workspace, card conceitual e repositórios;
- comportamento responsivo do shell, hero e controles para desktop, tablet e celular.

A comparação entre protótipos foi removida da interface final para que a home pareça um produto coeso, e não uma galeria. Métricas, workspaces, alertas, cadastro, scan, remoção e listagem de projetos continuam conectados à store existente.

## Arquivos alterados

- `apps/web/src/App.vue` — marca Aurora, luzes ambientais e contexto visual na topbar;
- `apps/web/src/styles/layout.css` — aplicação Aurora à sidebar, navegação, topbar, main-content e responsividade global;
- `apps/web/src/views/DashboardView.vue` — hero definitivo e resumo ambiental Aurora;
- `apps/web/src/styles/components.css` — composição da home, controles, cards e grids na linguagem escolhida;
- `apps/web/test/dashboard-view.test.ts` — cobertura da home Aurora e regressão das funções existentes;
- `docs/tasks/README.md` e `docs/tasks/NEXT.md` — índice e planejamento subsequente.

## Decisões

- Aurora passa a ser a direção definitiva desta etapa; Órbita e Terminal deixam de integrar o bundle da interface.
- O shell mantém os componentes e tokens existentes, recebendo uma camada visual de transparência, gradientes e profundidade sem dependências novas.
- Todos os grafismos são CSS e elementos decorativos possuem `aria-hidden`.
- O resumo do hero usa exclusivamente contagens reais da store; as barras são uma representação ambiental, não uma série histórica falsa.
- Tema e densidade continuam disponíveis, embora a assinatura Aurora priorize a experiência escura translúcida.

## Limitações

- Esta entrega aplica o shell Aurora a todas as rotas, mas não redesenha individualmente o conteúdo interno de Processos, Atividade e Detalhes do projeto.
- As barras do resumo são decorativas e não representam telemetria temporal.
- Não foram criados novos indicadores de processo ou atividade na API.

## Validação

- teste montado do dashboard cobrindo hero, resumo Aurora e funções do workspace;
- teste de arquitetura CSS, incluindo a ausência de cores hexadecimais fora dos tokens;
- typecheck de todos os workspaces;
- build de packages e aplicações;
- suíte automatizada completa.
