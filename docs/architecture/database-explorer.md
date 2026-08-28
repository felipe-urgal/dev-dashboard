# Arquitetura do Database Explorer

## Visão atual

O Database Explorer separa a adaptação HTTP da execução de consultas locais por uma fronteira de aplicação explícita:

```text
Rotas Fastify
    ↓
DatabaseExplorerService
    ↓
DatabaseReadonlyService
    ↓
psql / mysql
```

As rotas em `apps/api/src/routes/database.ts` são responsáveis apenas por aspectos de transporte:

- validar `params`, `querystring` e `body` pelos JSON Schemas da API;
- criar e descartar o `AbortSignal` ligado ao ciclo de vida da requisição;
- traduzir `DatabaseExplorerError` para os códigos HTTP estáveis `DATABASE_EXPLORER_*`;
- serializar a resposta pelo schema público correspondente.

`DatabaseExplorerService`, em `apps/api/src/services/database-explorer-service.ts`, é a fronteira de aplicação do explorador. Ele recebe as operações de catálogo, tabelas, preview e consulta livre, delega a execução à infraestrutura read-only e normaliza falhas dessa infraestrutura em `DatabaseExplorerError`. Assim, a camada HTTP não depende diretamente do executor baseado em cliente de banco.

`DatabaseReadonlyService`, em `apps/api/src/services/database-readonly-service.ts`, continua responsável pela infraestrutura atual:

- validar conexão local e driver suportado;
- aplicar as proteções read-only específicas do banco;
- montar a invocação segura de `psql`/`mysql` sem shell;
- aplicar timeout, cancelamento e limites de consulta/resultado;
- interpretar a saída tabular dos clientes;
- classificar falhas de cliente, conexão, credencial e banco.

## Composição

`createAppContext()` instancia `DatabaseReadonlyService`, injeta essa dependência em `DatabaseExplorerService` e expõe somente `databaseExplorerService` para o registro das rotas. O executor read-only fica, portanto, como detalhe de composição do contexto em vez de dependência direta do adaptador HTTP.

Essa composição também facilita testes isolados: o serviço pode ser exercitado com uma implementação controlada da dependência read-only, enquanto os testes de contrato HTTP substituem diretamente `DatabaseExplorerService`.

## Credenciais e ciclo de vida

Nesta arquitetura atual não existe sessão persistida do Database Explorer. Cada operação recebe uma conexão completa no corpo validado da requisição e as credenciais permanecem apenas durante a execução daquela operação; `DatabaseExplorerService` não persiste nem registra esses valores.

O cancelamento nasce na requisição HTTP e é propagado como `AbortSignal` pelas camadas até o processo do cliente de banco. A política de read-only e os limites de segurança continuam descritos em [`security.md`](security.md) e no [guia da aba Banco de dados](../guia/banco-de-dados.md).
