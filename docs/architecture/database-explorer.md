# Arquitetura do Database Explorer

## Visão atual

O Database Explorer separa a adaptação HTTP da execução de consultas locais por fronteiras explícitas:

```text
DatabaseView
    ↓
Composables de sessão / orquestração / estado local
    ↓
Typed API client (sessionId)
    ↓
Rotas Fastify
    ↓
DatabaseExplorerSessionStore
    ↓
DatabaseExplorerService
    ↓
DatabaseReadonlyService
    ↓
PostgresExplorerAdapter / MysqlExplorerAdapter
    ↓
pg / mysql2 (protocolo nativo)
```

O frontend usa as rotas de sessão em `apps/api/src/routes/database-explorer-sessions.ts`. As rotas legadas em `apps/api/src/routes/database.ts`, que ainda aceitam uma conexão completa por operação, permanecem para compatibilidade e não são mais o caminho usado pela interface web do Explorer.

As rotas são responsáveis apenas por aspectos de transporte:

- validar `params`, `querystring` e `body` pelos JSON Schemas da API;
- criar e descartar o `AbortSignal` ligado ao ciclo de vida da requisição;
- traduzir `DatabaseExplorerError` para os códigos HTTP estáveis `DATABASE_EXPLORER_*`;
- resolver a conexão da sessão antes de chamar o serviço de aplicação;
- serializar a resposta pelo schema público correspondente.

`DatabaseExplorerService`, em `apps/api/src/services/database-explorer-service.ts`, é a fronteira de aplicação do explorador. Ele recebe as operações de catálogo, tabelas, preview e consulta livre, delega a execução à infraestrutura read-only e normaliza falhas dessa infraestrutura em `DatabaseExplorerError`. Assim, a camada HTTP não depende diretamente do executor baseado em cliente de banco.

`DatabaseReadonlyService`, em `apps/api/src/services/database-readonly-service.ts`, concentra somente as regras comuns antes do dispatch:

- validar driver, host local e porta;
- aplicar o filtro de consulta read-only e bloquear construções perigosas conhecidas;
- selecionar `PostgresExplorerAdapter` para PostgreSQL;
- selecionar `MysqlExplorerAdapter` para MySQL e MariaDB.

Os adapters encapsulam os detalhes específicos de cada banco:

- SQL de catálogo e tabelas;
- quoting e preview de tabela;
- defaults de porta/database;
- configuração read-only específica do driver;
- conexão e execução pelo protocolo nativo via `pg`/`mysql2`;
- normalização JSON-safe dos valores retornados;
- timeout, cancelamento, limite de linhas/tamanho e classificação de falhas.

## Resultados estruturados

Os adapters usam `pg` e `mysql2` diretamente, com rows em modo array e metadados de campos fornecidos pelo protocolo do banco. Não existe mais parser TSV no caminho do Explorer, portanto valores com tab, newline e `NULL` permanecem células reais em vez de delimitadores ambíguos.

A normalização antes da resposta HTTP preserva strings, números, booleanos e `null`; `bigint` vira string, datas viram ISO e binários viram hexadecimal. A query livre recebe um limite superior de 101 linhas antes de chegar ao driver, a resposta expõe no máximo 100 linhas e o payload estruturado mantém teto de 2 MiB. PostgreSQL e MySQL/MariaDB executam cada operação dentro de uma transação explicitamente read-only e sempre fazem rollback/cleanup ao final.

## Sessão server-side

`DatabaseExplorerSessionStore`, em `apps/api/src/services/database-explorer-session-store.ts`, mantém a conexão somente na memória do processo por um TTL curto de 15 minutos. A sessão usa um identificador opaco gerado por `crypto.randomUUID()` e retorna ao cliente apenas `sessionId` e `expiresAt`.

Fluxo usado pela interface web:

```text
POST   /api/database/explorer/sessions
POST   /api/database/explorer/sessions/catalog
POST   /api/database/explorer/sessions/tables
POST   /api/database/explorer/sessions/preview
POST   /api/database/explorer/sessions/query
DELETE /api/database/explorer/sessions/:sessionId
```

A criação da sessão valida primeiro a conexão pelo `DatabaseExplorerService`. Driver, host local, cliente disponível, credenciais e acesso ao banco são verificados antes de `DatabaseExplorerSessionStore.create()`. Uma conexão rejeitada, remota ou indisponível não chega a ser retida no store.

Depois da criação da sessão, catálogo, tabelas, preview e query recebem `sessionId` no corpo validado junto dos dados específicos da operação, como `database`, `schema`, `table` ou `query`. O identificador não vai na URL dessas operações para reduzir sua exposição em access logs. Usuário e senha não são reenviados. O `database` pode sobrescrever temporariamente o valor armazenado sem alterar as credenciais da sessão.

No frontend, `apps/web/src/composables/useDatabaseExplorerSession.ts` concentra o lifecycle da conexão:

- cria a sessão e guarda no estado reativo apenas `sessionId`, `expiresAt` e metadados sem senha;
- usa o `expiresAt` retornado pelo servidor como prazo absoluto, sem renovar o TTL local a cada consulta;
- ao testar uma conexão, usa uma sessão temporária e faz cleanup sem ativá-la na interface;
- ao trocar de conexão, ativa a nova sessão somente depois de validar catálogo e remove a anterior em best-effort;
- ao desconectar explicitamente, espera o `DELETE` antes de limpar o estado local, permitindo retry se o encerramento falhar;
- ao receber `SESSION_EXPIRED`, limpa imediatamente a sessão e o contexto visual do Explorer;
- ao desmontar a view, tenta remover a sessão ativa em best-effort; o TTL absoluto do servidor permanece como garantia final de cleanup;
- respostas de tabelas/preview/query só são aplicadas se o `sessionId` capturado no início ainda for o atual, evitando que uma operação antiga ressuscite dados depois de troca ou expiração de sessão.

O store:

- copia a conexão recebida para evitar mutação externa;
- nunca persiste a credencial em arquivo, banco, `localStorage` ou logs;
- remove a sessão automaticamente ao atingir o TTL;
- remove a sessão explicitamente no `DELETE`, de forma idempotente;
- limpa timers e credenciais restantes no shutdown da API por `close()`.

Uma sessão ausente ou expirada retorna HTTP `410` com `SESSION_EXPIRED` apenas nas operações que dependem de uma sessão já criada. A criação expõe somente falhas de conexão/execução do Explorer. O identificador da sessão deve ser tratado como credencial efêmera: ele não é persistido pelo cliente nem incluído em logs adicionais. O `DELETE` mantém o identificador no path por ser o endpoint explícito de encerramento definido para o ciclo de vida da sessão.

## Estado local do frontend

A `DatabaseView` não implementa mais diretamente as regras de conexões salvas e histórico de consultas.

`apps/web/src/composables/useDatabaseSavedConnections.ts` concentra:

- leitura e persistência da chave existente `dev-dashboard.database-connections`;
- remoção da senha antes de qualquer gravação;
- identificação e rótulo estáveis da conexão;
- deduplicação, seleção e remoção de conexões salvas.

`apps/web/src/composables/useDatabaseQueryHistory.ts` concentra:

- leitura e persistência da chave existente `dev-dashboard.database-query-history`;
- deduplicação por consulta, driver e banco;
- preservação do favorito ao repetir uma consulta;
- favoritos, remoção e limpeza;
- limite persistido de 50 entradas e recorte das 8 consultas recentes.

`apps/web/src/composables/useDatabaseResultView.ts` concentra o estado e as transformações da visualização de resultados:

- resultado estruturado e duração da última leitura;
- busca local nas células;
- ordenação ascendente/descendente sem mutar as rows originais;
- mensagem de cópia, serialização TSV para clipboard e exportação CSV/JSON da visualização atual;
- resets explícitos que distinguem limpar o resultado de apenas preparar uma nova apresentação.

`apps/web/src/composables/useDatabaseTableListView.ts` concentra a busca e paginação da lista de tabelas do sidebar, mantendo o page size atual de 40 itens e reiniciando a página ao alterar a busca.

`apps/web/src/composables/useMachineDatabaseServices.ts` concentra o estado e a orquestração dos serviços da máquina:

- carrega lista e detalhes por meio da camada `api/`;
- mantém loading, erro, sucesso, expansão, detalhes e ação pendente;
- preserva as confirmações explícitas de start/stop/restart/install/uninstall sensíveis;
- usa `generation/latest-wins` para impedir que refreshes ou detalhes obsoletos sobrescrevam estado mais novo;
- recebe dependências substituíveis para testes de comportamento sem acoplar a view ao transporte.

`apps/web/src/composables/useDatabaseQueryExecution.ts` concentra seleção de banco/tabela, preview e query livre da sessão ativa:

- recebe refs e operações de apresentação já pertencentes aos composables de sessão, lista e resultado;
- usa somente o `sessionId` efêmero nas chamadas da camada `api/`;
- aplica resultado, duração e histórico apenas quando a geração e a sessão capturadas ainda são atuais;
- invalida operações em andamento quando o contexto do Explorer é limpo ou substituído;
- recebe dependências HTTP substituíveis para testes determinísticos.

A composição visual do workspace é dividida em componentes menores sem mover regras assíncronas para os filhos:

- `DatabaseExplorerSidebar.vue` recebe bancos, tabelas e estado de paginação e emite seleção/busca/navegação;
- `DatabaseResultTable.vue` renderiza resultado, busca e ações de cópia/exportação, delegando transformações ao `useDatabaseResultView`;
- `DatabaseQueryEditor.vue` preserva editor, histórico e o atalho `Ctrl/Cmd + Enter`, emitindo apenas intenções para a view;
- `DatabaseServicesPanel.vue` renderiza resumo, cards, detalhes e ações dos serviços da máquina, emitindo as intenções de refresh/start/stop/restart/install/uninstall para a view;
- `DatabaseConnectionDialog.vue` renderiza o formulário de conexão e conexões salvas, mantendo teste, conexão, persistência e seleção efetiva sob responsabilidade da view/composables.

Para manter exatamente a hierarquia visual após a extração, as regras antes `scoped` da `DatabaseView` foram movidas sem alteração para `DatabaseView.css`. Os seletores são específicos da feature (`database-*`) e agora alcançam o DOM interno dos componentes extraídos.

A view atua majoritariamente como composição da feature: conecta os componentes visuais aos composables, mantém o draft/modal de conexão, adapta conexões salvas e restauração do histórico e coordena o lifecycle da sessão. Requests de serviços, listagem de tabelas, preview e execução de queries não ficam mais implementados diretamente na `DatabaseView`. A leitura do `localStorage` continua no `onMounted`, preservando o lifecycle anterior.

O formato das chaves locais permanece legado. Os composables atuais preservam esse contrato e não implementam versionamento, migração, fallback nem tratamento uniforme de quota/security errors.

## Composição

`createAppContext()` instancia `DatabaseReadonlyService`, que compõe os adapters PostgreSQL e MySQL/MariaDB e é injetado em `DatabaseExplorerService`. O executor específico de cada banco fica, portanto, como detalhe de infraestrutura em vez de dependência da rota ou da camada de aplicação.

`buildApp()` cria o `DatabaseExplorerSessionStore`, registra as rotas de sessão com o mesmo `DatabaseExplorerService` e chama `close()` no encerramento da aplicação. Essa composição preserva o store como estado efêmero do processo e evita que credenciais entrem no `AppContext` persistente.

Essa separação também facilita testes isolados: o serviço pode ser exercitado com uma implementação controlada da dependência read-only, cada adapter pode ser testado com uma factory de client nativo injetada, o store pode ter TTL e cleanup testados sem banco real, as rotas de sessão podem substituir diretamente `DatabaseExplorerService`, e os composables web validam sessão, histórico, conexões salvas, serviços da máquina, execução de queries, result view e paginação de tabelas sem montar a view inteira.

## Compatibilidade

As rotas legadas permanecem para consumidores compatíveis, enquanto a interface web cria uma única sessão e usa `sessionId` nas operações.

A decomposição da `DatabaseView` inclui componentes visuais menores e composables próprios para sessão, conexões salvas, histórico, visualização de resultado, paginação de tabelas, serviços da máquina e execução de queries. Os componentes filhos continuam emitindo intenções de UI; requests e regras assíncronas ficam nos composables e na camada `api/`, sem state manager global para estado local da feature.

O protocolo TSV foi removido sem alterar o contrato HTTP nem as camadas superiores.

O cancelamento nasce na requisição HTTP e é propagado como `AbortSignal` pelas camadas até o client nativo do banco. A política de read-only e os limites de segurança continuam descritos em [`security.md`](security.md) e no [guia da aba Banco de dados](../guia/banco-de-dados.md).
