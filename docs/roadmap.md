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

Este documento registra capacidades e prioridade. O plano executável da próxima
entrega fica em `docs/tasks/NEXT.md`; ideias nos horizontes posteriores não são
compromissos de versão.

## Estado consolidado em 26/07/2026

### Fundação e distribuição local — concluídas

- [x] monorepo, workspaces npm e contratos TypeScript;
- [x] descoberta de projetos Rails e Node em workspaces persistentes;
- [x] gerenciamento seguro de servidores, portas, estado e logs;
- [x] autenticação local, origem/CORS, erros e schemas de resposta;
- [x] frontend estático servido pela API em origem única;
- [x] sessão segura de navegador e comando `npm run dev-web`;
- [x] diagnóstico não destrutivo, CI, typecheck, build e testes;
- [x] retenção, limite de leitura e mascaramento de logs.

### App shell e detalhe do projeto — parcialmente concluídos

- [x] Vue Router, layout, dashboard, workspaces e projetos;
- [x] detalhe com abas de visão geral, Git, testes, banco e scripts;
- [x] servidor, configuração de porta, URLs, logs e limpeza;
- [x] estados vazios e componentes reutilizáveis iniciais;
- [x] painel global de atividade (task 012);
- [x] página global de processos (task 014);
- [ ] configurações globais;
- [ ] loading skeletons, notificações e acessibilidade auditada;
- [ ] navegação otimizada para tablet validada por E2E.

### Git — leitura entregue, mutações pendentes

- [x] status, branch, arquivos alterados e commits recentes;
- [x] diff por arquivo e diff resumido (task 015, com truncamento em 262 KiB e mascaramento de segredos);
- [x] criação/troca de branch, pull e push (task 016 e task 025, com confirmação e validação de árvore limpa);
- [x] commit e stash (task 026, sem seleção parcial de hunks e sem stashes nomeados);
- [ ] confirmação por risco e histórico das mutações.

### Testes e catálogo — parcialmente concluídos

- [x] detecção e execução de suítes Rails e Node;
- [x] processo, cancelamento e logs de testes;
- [x] catálogo de scripts Node, tarefas Rails e executáveis conhecidos;
- [x] execução segura, confirmação, cancelamento e logs;
- [x] histórico persistente e paginado do catálogo;
- [x] SSE autenticado das execuções do catálogo;
- [x] arquivo específico (task 027; sem caso/describe nomeado e sem relatório de cobertura, ambos pendentes);
- [x] histórico persistente e eventos SSE para testes (tasks 028 e 029);
- [ ] modelo global de atividade sem duplicar fontes de verdade.

### Banco e ferramentas Rails — inspeção inicial entregue

- [x] detecção de configurações, disponibilidade e segredo sob demanda;
- [x] inicialização segura de serviço local reconhecido;
- [x] migrations status e routes no web (task 030, somente leitura);
- [x] migrate, rollback, seed e prepare com política de risco (task 031);
- [x] diagnóstico Bundler — check e outdated, somente leitura (task 032);
- [ ] Sidekiq, Webpack, generators e credenciais;
- [ ] suporte validado a múltiplos bancos.

### CLI Bash — mantido e funcional

- [x] menus com `gum` e fallback puro;
- [x] operações Git, Rails, Node, processos, banco e testes;
- [ ] cache da detecção inicial;
- [ ] estratégia deliberada para compartilhar regras com o web;
- [ ] suíte própria de testes para helpers não interativos.

## Horizonte 1 — coerência operacional

### 1. Painel de atividade unificado

Projeção somente leitura de catálogo, testes e servidores, com origem,
durabilidade e navegação explícitas. Não cria um segundo histórico. Plano:
`docs/tasks/NEXT.md`.

Critério de saída: consultar atividades sem ampliar acesso a logs ou caminhos e
sem esconder diferenças de retenção entre os domínios.

### 2. Base de testes da interface

- testes montados dos componentes críticos;
- smoke E2E de workspace → projeto → execução → log;
- matriz de estados vazio, loading, erro, sucesso e troca de projeto;
- auditoria inicial de teclado e foco.

Critério de saída: os fluxos privilegiados principais deixam de depender apenas
de QA manual.

### 3. Página global de processos

- servidores e testes ativos;
- filtros fechados por workspace, projeto e tipo;
- links para o contexto do projeto;
- limpeza segura de estados e logs elegíveis;
- nenhuma execução arbitrária ou caminho exposto.

Critério de saída: identificar e encerrar um processo gerenciado sem percorrer
todos os projetos.

## Horizonte 2 — produtividade diária

1. **Git em etapas:** diff somente leitura; depois branch; pull/push; commit e
   stash, cada mutação com confirmação e histórico.
2. **Testes focados:** arquivo/caso reconhecido, cobertura e histórico
   persistente antes de migrar seus eventos para SSE.
3. **Rails de baixo risco:** migrations status, routes e diagnóstico Bundler;
   depois operações mutáveis com confirmação proporcional.
4. **Command palette:** busca e navegação por teclado, restrita a ações já
   autorizadas em suas telas.
5. **Configurações e notificações:** preferências de UI e retenção dentro de
   limites seguros concluídas; avisos locais de conclusão são a próxima fatia.
6. **Paridade CLI→Web seletiva:** trazer, uma por vez e com política de risco
   proporcional, capacidades hoje exclusivas do Bash — `git-save`
   (add+commit rápido com confirmação), `git-pr` (rascunho via GitHub CLI,
   apenas depois de revisar o modelo de autorização), snapshot/restore de
   banco reconhecido, `dev-kill-port` e `dev-clean` como ações de manutenção
   no painel de processos, e abrir editor/terminal via adaptadores locais
   conhecidos. Integrações IA (`dev-claude`, `dev-ai-*`) permanecem
   opcionais e isoladas em um painel próprio, sem virar dependência do
   fluxo principal.

Critério de saída: executar o fluxo cotidiano principal no navegador sem criar
um terminal genérico disfarçado.

### Revisão de design e reforma de layout

Antes de mais telas novas, revisitar o design como um todo antes de tocar em
CSS. Duas etapas separadas para não misturar decisão com implementação:

1. **Revisão de design** — entregue na task 017. Decisões
   registradas em [`design/redesign-2026.md`](./design/redesign-2026.md)
   (princípios, tokens de cor/tipografia/espaço, padrões de
   card/badge/formulário/empty, densidade, tema, framework de estilo,
   roteiro da etapa 2). Nenhum código alterado nesta etapa.
2. **Reforma de layout** — implementar as decisões da revisão: substituir
   `styles.css` por camadas coerentes (tokens, componentes, layouts),
   revisar app shell (sidebar/topbar), padronizar cards e listas,
   introduzir tema claro/escuro e densidade ajustável. Migrar tela por
   tela para não quebrar o produto.

Critério de saída de cada etapa: (1) documento aprovado com decisões
concretas; (2) telas atualizadas passando pelos testes montados
existentes sem regressão funcional.

## Horizonte 3 — projetos maiores e integrações

- detecção de monorepos e scan recursivo opt-in, limitado por profundidade,
  quantidade, timeout e diretórios ignorados;
- Docker Compose por serviços declarados e allowlist;
- health checks configuráveis por tipos fechados;
- abertura no editor por adaptadores locais conhecidos;
- favoritos, recentes e perfis de ambiente sem valores secretos no frontend;
- GitHub CLI somente após revisão do modelo de autorização.

Critério de saída: atender repositórios complexos mantendo descoberta previsível
e integrações revogáveis.

## Horizonte 4 — extensibilidade e portabilidade

- manifesto declarativo de extensões e capacidades;
- adaptadores versionados e revisados;
- temas e painéis adicionais sem execução remota;
- compatibilidade macOS;
- estratégia separada para Windows, onde processos, sinais e filesystem têm
  semânticas diferentes;
- migração e backup versionados do estado local.

### Produtividade no navegador

- favoritos e recentes por workspace, sem sincronização remota;
- perfis de ambiente reutilizáveis, sem armazenar valores secretos no
  frontend;
- notificações locais opt-in (Notification API) ao terminar execuções
  longas de catálogo, testes ou build;
- exportação de log com o mesmo mascaramento aplicado na tela, respeitando
  o limite de leitura já existente;
- health checks declarativos por projeto, restritos a tipos fechados
  (HTTP GET em `127.0.0.1`, comando reconhecido do catálogo).

Plugins remotos arbitrários, shell livre e exposição da API na rede não fazem
parte deste horizonte.

## Backlog de engenharia

### Qualidade

- [x] testes de componentes Vue (base entregue na task 013 com vitest + jsdom + @vue/test-utils; expansão para outras views é incremental);
- [ ] Playwright/smoke E2E;
- [ ] lint e formatação automatizados (ESLint + Prettier padronizados
  entre `apps/` e `packages/`);
- [ ] medição de cobertura com metas por camada;
- [ ] doc da API gerada a partir dos JSON Schemas do Fastify e verificada
  contra as rotas registradas;
- [ ] changelog e release automatizados (ex.: changesets ou
  release-please), inclusive tag de versão da API;
- [ ] cache de detecção inicial no CLI Bash para reduzir custo de
  `detect_projects` em workspaces grandes;
- [ ] suíte própria de smoke para helpers Bash não interativos
  (ex.: `bats-core` para `git-*`/`_dev_*` puros);
- [ ] revisão dirigida do `npm audit` (a instalação atual sinaliza
  vulnerabilidades altas em dependências transitivas — devDeps novas
  como `vitest`/`jsdom`): abrir uma task específica para inventariar,
  decidir upgrades seguros e evitar `npm audit fix --force`, que pode
  subir major de dependências nossas com breaking changes;
- [x] testes de API e Process Manager;
- [x] CI em push e pull request.

### Operação e governança

- [ ] release automatizado e changelog;
- [ ] licença;
- [ ] documentação da API gerada ou verificada contra as rotas;
- [ ] política geral de migração/backup do estado;
- [ ] matriz de suporte de sistemas e runtimes;
- [x] diagnóstico local;
- [x] logs com retenção e proteção de conteúdo.

### Descoberta e compatibilidade

- [ ] monorepos e scans recursivos opcionais;
- [ ] política explícita para symlinks;
- [ ] macOS;
- [ ] Windows.

## Critérios de priorização

1. segurança e isolamento local;
2. confiabilidade e observabilidade;
3. valor diário;
4. cobertura automatizada do risco introduzido;
5. redução de tarefas repetitivas;
6. consistência entre interfaces sem acoplamento prematuro;
7. acessibilidade e qualidade da experiência;
8. extensibilidade.

## Estratégia de entrega

Cada branch deve partir da base atual, ter um escopo coerente, documentar sua
task numerada, adicionar testes proporcionais e atualizar `NEXT.md`. A próxima
branch recomendada é:

```text
feat/unified-activity-panel
```

Operações mutáveis devem ser pequenas e revisáveis: não agrupar várias ações
Git/Rails privilegiadas em uma única entrega.
