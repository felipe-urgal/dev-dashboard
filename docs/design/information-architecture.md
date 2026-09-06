# Arquitetura da informação

## Objetivo

A interface deve permitir que a pessoa entenda rapidamente:

- qual workspace está ativo;
- quais projetos existem;
- quais serviços/processos estão ativos;
- onde há atenção necessária;
- quais ações podem ser executadas;
- quais operações falharam ou exigem recovery;
- onde encontrar logs e detalhes.

A organização prioriza **estado → contexto → ação**, sem criar páginas globais só porque um domínio possui dados internos.

## Navegação global atual

As rotas globais implementadas são:

```text
/             Visão geral
/processes    Processos
/production   Produção
/database     Banco de dados
```

No desenvolvimento web, o shell roda em:

```text
http://127.0.0.1:5174
```

Na instalação local permanente:

```text
http://dev-dashboard.localhost:4343
```

Não existe hoje uma página global separada de **Atividade**, **Configurações** ou **Jobs e logs**. Esses conceitos só devem ganhar rota própria quando o volume/fluxo justificar. A evolução de Activity Timeline + Jobs Center está rastreada em #600.

## App shell

```text
┌──────────────────────────────────────────────────────────────┐
│ Topbar / contexto                                            │
│ Workspace ativo | command palette | estado global           │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar       │ Conteúdo principal                           │
│               │                                              │
│ Visão geral   │ rota atual                                   │
│ Processos     │                                              │
│ Produção      │                                              │
│ Banco         │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

A **command palette** é uma forma de navegação/ação rápida, não uma segunda árvore de informação.

## Visão geral

A landing prioriza leitura rápida do workspace e dos projetos detectados:

- workspace ativo e caminho;
- projetos detectados/ativos;
- estado Git/servidor quando conhecido;
- atenções agregadas pela Central de Atenção;
- acesso rápido ao projeto;
- novo scan quando necessário.

A página não precisa duplicar todos os filtros/controles de domínios detalhados. Se um dado exigir agregação cara, deve vir de serviço/endpoint agregado próprio em vez de N chamadas escondidas por card.

## Processos

A rota `/processes` consolida processos gerenciados conhecidos.

Cada item deve comunicar, quando disponível:

- projeto;
- tipo de processo;
- estado;
- PID;
- porta;
- duração;
- ação segura disponível.

Estado visual nunca depende só de cor.

## Produção

A rota `/production` oferece visão agregada dos projetos com `capability=production` válida.

Ela separa:

- revision local/origin/produção;
- provider;
- drift;
- health/verify;
- execução ativa/falha/recovery.

**Atualizar pendentes** reutiliza o mesmo planner/confirmation/deployment service das telas detalhadas; não existe motor de deploy separado no frontend.

O próprio Dev Dashboard usa `strategy=self-update` e possui fluxo dedicado. Ele não deve ser tratado como um `provider-deploy` comum de lote.

## Banco de dados

A rota global `/database` é a superfície consolidada atual para operações de banco. A antiga rota por projeto `/projects/:projectId/database` redireciona para ela.

A UI deve manter ambiente/projeto explícitos e preservar as fronteiras de segredo/confirmation definidas no backend.

## Projeto

O projeto é a principal unidade operacional.

Informações resumidas relevantes:

- nome;
- tipo;
- caminho;
- workspace;
- capabilities;
- branch;
- processo/porta quando houver;
- sinais de atenção;
- produção quando habilitada.

Ações rápidas só aparecem quando podem ser representadas sem ambiguidade e com feedback real.

## Página de detalhes do projeto

Rotas atuais:

```text
/projects/:projectId
/projects/:projectId/server
/projects/:projectId/git
/projects/:projectId/tests
/projects/:projectId/production
/projects/:projectId/dependencies
/projects/:projectId/sidekiq
/projects/:projectId/webpack
/projects/:projectId/terminal
/projects/:projectId/console
/projects/:projectId/environment
/projects/:projectId/doctor
/projects/:projectId/readme
```

`/projects/:projectId/logs` redireciona para **Servidor**. O log do servidor não é uma aba global própria; ele vive junto do processo que produz aquele log.

As abas exibidas dependem das capabilities/tipo do projeto.

### Ordem funcional recomendada

Priorize superfícies operacionais antes de referência:

```text
Servidor
Git
Testes
Produção (quando válida)
Dependências
Terminal / Console
Sidekiq / webpack
Variáveis de ambiente
Diagnóstico
README
```

Banco de dados hoje possui superfície global dedicada e pode ser acessado a partir do contexto do projeto sem manter duas implementações concorrentes.

## Servidor

A aba combina estado + ação + log relacionado:

- status;
- porta;
- PID;
- duração;
- start/stop/restart;
- health;
- terminal de log quando existe processo relevante.

Loading/animação só existem enquanto há trabalho real.

## Git

A área Git concentra subfluxos do mesmo domínio, evitando espalhá-los em páginas globais:

- sincronização;
- branches;
- diff;
- commit/amend;
- desfazer;
- PR/Cockpit GitHub;
- histórico.

Worktrees possuem fundação read-only (#570), mas ainda não são um contexto operacional completo de UI até a evolução de Environment Instance (#598).

## Testes

A superfície distingue execução atual de histórico/evidência:

- suíte completa ou alvo reconhecido;
- estado/duração;
- saída;
- coverage quando solicitado;
- evidência comparável por revision/contexto quando disponível.

Release Readiness pode consumir essa evidência, mas não deve duplicar a execução de testes.

## Produção do projeto

A aba detalhada possui três famílias operacionais:

```text
strategy=command
strategy=git-managed
strategy=self-update (somente o próprio Dashboard)
```

Ela sempre segue:

```text
preview
→ confirmação
→ execução
→ timeline/log
→ terminal ou recovery
```

O frontend não envia programa, argv, checkout ou provider credential.

## Terminal / Console

São exceções deliberadas ao catálogo fechado porque oferecem interação real. Precisam ficar claramente diferenciados das ações estruturadas do Dashboard.

Nenhuma feature estruturada deve usar Terminal como implementação escondida de um botão.

## README e Diagnóstico

São superfícies de referência/inspeção e ficam mais ao final da navegação do projeto. Isso mantém ações frequentes mais próximas do início sem esconder documentação/health.

## Central de Atenção

A home agrega sinais já conhecidos por outros domínios, sem executar correção automaticamente.

Um item de atenção deve:

- explicar o problema em texto curto;
- apontar o projeto/contexto;
- levar à superfície responsável;
- preservar `unknown` quando a evidência não existe.

Não crie uma segunda regra de negócio no card de atenção; consuma o estado do domínio responsável.

## Activity / Jobs

Não existe hoje rota global implementada para isso. #600 rastreia uma possível **Activity Timeline + Jobs Center**.

Quando entrar, deve agregar eventos/lifecycles existentes em vez de criar um novo engine de execução.

## Notificações transitórias

Feedback curto de ação usa toasts flutuantes, sem empurrar o conteúdo da página.

Padrão atual:

- `vue-sonner`;
- `<Toaster>` único no app shell;
- tema sincronizado com preferência visual;
- loading pode evoluir para sucesso/erro no mesmo toast;
- mensagens desaparecem automaticamente ou por dismiss.

Erros que exigem decisão/recovery não devem ser reduzidos a toast efêmero; permanecem na superfície responsável.

## Overlays e componentes

Modais/popovers/dialogs usam Naive UI quando aplicável, com tokens do design system.

Ao alterar overlay, preserve:

- foco inicial/retorno de foco;
- Escape;
- clique-fora quando apropriado;
- teclado;
- conteúdo teleportado em testes;
- tema claro/escuro;
- largura/responsividade.

## Design system e tema

Tokens canônicos vivem em:

```text
apps/web/src/styles/tokens.css
```

Componentes antigos ainda podem usar aliases de compatibilidade, mas esses aliases precisam apontar para os tokens canônicos para acompanhar claro/escuro.

A correção #654 adicionou aliases usados por superfícies de Produção; novas telas devem preferir os tokens canônicos diretamente.

## Estados visuais

Todo estado combina texto, ícone e cor.

Exemplo de semântica:

```text
sucesso/saudável    operação concluída ou health comprovado
atenção             condição degradada ou ação necessária
falha               erro/recovery
em andamento        trabalho real ativo
neutro/desconhecido sem evidência suficiente
```

A cor nunca é o único indicador.

## Estados vazios

Estados vazios orientam a próxima ação e não simulam erro.

Exemplos:

```text
Nenhum workspace cadastrado.
Adicione uma pasta local para encontrar projetos.
```

```text
Nenhum projeto Rails ou Node foi encontrado.
Verifique o workspace ou execute um novo scan.
```

## Responsividade

A prioridade em telas menores é preservar estado e ação principal.

- grids viram coluna;
- tabelas podem ganhar overflow controlado ou cartões adequados;
- sidebar/drawers não podem esconder feedback crítico;
- modais respeitam viewport;
- logs/terminais mantêm largura utilizável;
- nenhum layout deve depender de hover para a única ação disponível.

## Acessibilidade

- controles nativos quando possível;
- foco visível;
- labels/nomes acessíveis;
- `aria-live`/status para operações assíncronas relevantes;
- reduced motion;
- contraste compatível com os tokens de tema;
- feedback de erro não apenas por cor.

## Hierarquia de entidades

```text
Workspace
└── Project
    ├── Capabilities
    ├── Managed Processes
    ├── Git / PR evidence
    ├── Tests / history
    ├── Production / deployments
    ├── Database
    ├── Environment
    └── futuras Environment Instances / Task Contexts
```

Worktree, Environment Instance, Task Context e Stack não devem virar entidades concorrentes sem relação explícita. As issues #598/#599/#592 definem a evolução dessas identidades.

## Regra de manutenção

Este documento descreve a **arquitetura de informação vigente**. Histórico de páginas removidas, tasks antigas e decisões temporárias deve ficar em PRs/issues, não acumular aqui como se ainda fosse parte da navegação atual.
