# Migration Providers

Migration Providers separam o estado de migrations do framework que produz a evidência. O objetivo é permitir que consumidores como Release Readiness consultem um `MigrationOverview` sem conhecer Rails, Prisma ou scripts específicos.

## Contrato interno

O primeiro recorte define em `apps/api/src/services/migration-provider.ts`:

- `MigrationProvider`;
- `MigrationInspectionContext`;
- `MigrationOverview`;
- estados `up-to-date`, `pending`, `unavailable` e `unknown`.

Inspeção é separada de mutação. O contrato atual não expõe `reset`, `drop`, `prepare` ou qualquer ação destrutiva.

## Provider Rails

`RailsMigrationProvider` adapta a fonte existente `RailsInspectionService.getMigrationsOverview()`; ele não executa nem parseia Rails por uma segunda implementação.

Mapeamento:

- migration Rails `up` -> `applied`;
- migration Rails `down` -> `pending`;
- ao menos uma `down` -> estado `pending`;
- inspeção suportada sem `down` -> `up-to-date`;
- inspeção indisponível -> `unavailable`.

A regra mais importante é conservadora: falha de `db:migrate:status` **não** equivale a ausência de migrations pendentes.

O overview contém somente identidade lógica do banco, IDs/nomes das migrations, timestamp, evidência e warnings. Connection strings, credenciais e environment values não fazem parte do contrato.

A identidade de banco aceita somente um token lógico curto (`A-Z`, `a-z`, números, `_` e `-`). Entrada vazia ou malformada cai para `primary` antes de chegar ao inspector e não é ecoada no resultado.

## Provider Prisma

`PrismaMigrationProvider` detecta somente schemas em convenções conhecidas dentro da raiz real do projeto:

- `prisma/schema.prisma`;
- `schema.prisma`.

Symlink de schema não é aceito. A inspeção executa apenas argv fixo equivalente a:

```text
npx --no-install prisma migrate status --schema <schema-conhecido>
```

O provider é deliberadamente conservador:

- exit code `0` produz `up-to-date`;
- erro estável `P1001` produz `unavailable` sem transportar host, URL, credencial ou stderr para o contrato;
- falha de execução do CLI produz `unavailable`;
- outros non-zero produzem `unknown`.

Texto livre do `prisma migrate status` **não** é parseado para inventar a lista de migrations pendentes. Até existir uma fonte estável/estruturada para esse detalhe, `pending` permanece vazio em respostas Prisma inconclusivas. Isso evita transformar mensagens versionáveis do CLI em contrato de domínio.

Este recorte continua somente leitura: não existe `migrate deploy`, `migrate reset` ou `generate` neste provider.

## Próximos providers

Providers custom entram incrementalmente atrás do mesmo contrato e só podem usar ações conhecidas/declaradas. Texto livre de script nunca deve ser interpretado por heurística como prova de que o schema está atualizado.

Uma etapa posterior pode adicionar plano/execução local estruturada por provider, com confirmação e preflight próprios. Produção continua pertencendo ao domínio Production.

## Limites atuais

Ainda não há rota HTTP nova ou UI comum de migrations. O fluxo Rails existente continua intacto enquanto o contrato comum e os providers de inspeção são introduzidos de forma compatível.
