# Arquitetura do Database Explorer

## Visão atual

O Database Explorer separa a adaptação HTTP da execução de consultas locais por fronteiras explícitas:

```text
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
psql / mysql
```

As rotas legadas em `apps/api/src/routes/database.ts` continuam disponíveis durante a migração e recebem uma conexão completa por operação. As novas rotas em `apps/api/src/routes/database-explorer-sessions.ts` oferecem o fluxo server-side por sessão sem quebrar o cliente atual.

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
- variáveis de ambiente e argumentos do cliente;
- configuração read-only específica do driver;
- execução e classificação das falhas do cliente.

A execução CLI compartilhada fica em `database-explorer-cli.ts`, incluindo timeout, cancelamento, limite de resultado e o parser tabular atual. O parser TSV é mantido deliberadamente neste recorte para que a separação de adapters não seja misturada com a troca de protocolo de resultado.

## Decisão sobre `pg` e `mysql2`

O PR de adapters preserva `psql`/`mysql` como transporte para manter o comportamento atual enquanto cria a fronteira correta por driver. A adoção de `pg`/`mysql2` foi separada para o próximo recorte, que também removerá a fragilidade do TSV e passará a trabalhar com resultados estruturados. Fazer as duas mudanças ao mesmo tempo dificultaria distinguir regressões de arquitetura de regressões de protocolo/driver.

Os adapters foram desenhados para permitir essa substituição sem alterar `DatabaseExplorerService`, rotas ou política read-only comum.

## Sessão server-side

`DatabaseExplorerSessionStore`, em `apps/api/src/services/database-explorer-session-store.ts`, mantém a conexão somente na memória do processo por um TTL curto de 15 minutos. A sessão usa um identificador opaco gerado por `crypto.randomUUID()` e retorna ao cliente apenas `sessionId` e `expiresAt`.

Fluxo disponível:

```text
POST   /api/database/explorer/sessions
POST   /api/database/explorer/sessions/catalog
POST   /api/database/explorer/sessions/tables
POST   /api/database/explorer/sessions/preview
POST   /api/database/explorer/sessions/query
DELETE /api/database/explorer/sessions/:sessionId
```

A criação da sessão valida primeiro a conexão pelo `DatabaseExplorerService`. Driver, host local, cliente disponível, credenciais e acesso ao banco são verificados antes de `DatabaseExplorerSessionStore.create()`. Uma conexão rejeitada, remota ou indisponível não chega a ser retida no store.

Depois da criação da sessão, catálogo, tabelas, preview e query recebem `sessionId` no corpo validado junto dos dados específicos da operação, como `database`, `schema`, `table` ou `query`. O identificador não vai na URL dessas operações para reduzir sua exposição em access logs. Usuário e senha não precisam ser reenviados. O `database` pode sobrescrever temporariamente o valor armazenado sem alterar as credenciais da sessão.

O store:

- copia a conexão recebida para evitar mutação externa;
- nunca persiste a credencial em arquivo, banco, `localStorage` ou logs;
- remove a sessão automaticamente ao atingir o TTL;
- remove a sessão explicitamente no `DELETE`, de forma idempotente;
- limpa timers e credenciais restantes no shutdown da API por `close()`.

Uma sessão ausente ou expirada retorna HTTP `410` com `SESSION_EXPIRED` apenas nas operações que dependem de uma sessão já criada. A criação expõe somente falhas de conexão/execução do Explorer. O identificador da sessão deve ser tratado como credencial efêmera: ele não deve ser persistido pelo cliente nem incluído em logs adicionais. O `DELETE` mantém o identificador no path por ser o endpoint explícito de encerramento definido para o ciclo de vida da sessão.

## Composição

`createAppContext()` instancia `DatabaseReadonlyService`, que compõe os adapters PostgreSQL e MySQL/MariaDB e é injetado em `DatabaseExplorerService`. O executor específico de cada banco fica, portanto, como detalhe de infraestrutura em vez de dependência da rota ou da camada de aplicação.

`buildApp()` cria o `DatabaseExplorerSessionStore`, registra as rotas de sessão com o mesmo `DatabaseExplorerService` e chama `close()` no encerramento da aplicação. Essa composição preserva o store como estado efêmero do processo e evita que credenciais entrem no `AppContext` persistente.

Essa separação também facilita testes isolados: o serviço pode ser exercitado com uma implementação controlada da dependência read-only, cada adapter pode ser testado com um `DatabaseCommandRunner` injetado, o store pode ter TTL e cleanup testados sem banco real, e as rotas de sessão podem substituir diretamente `DatabaseExplorerService`.

## Compatibilidade e próxima etapa

As rotas legadas permanecem temporariamente para evitar uma mudança incompatível no mesmo PR. O frontend será migrado para criar uma única sessão e usar `sessionId` nas operações; depois dessa migração, as rotas que aceitam credenciais por operação poderão ser removidas em um recorte separado e revisável.

O próximo recorte de infraestrutura substitui o protocolo TSV por resultados estruturados e reavalia `pg`/`mysql2` dentro dos adapters recém-criados, sem alterar as camadas superiores.

O cancelamento nasce na requisição HTTP e é propagado como `AbortSignal` pelas camadas até o processo do cliente de banco. A política de read-only e os limites de segurança continuam descritos em [`security.md`](security.md) e no [guia da aba Banco de dados](../guia/banco-de-dados.md).
