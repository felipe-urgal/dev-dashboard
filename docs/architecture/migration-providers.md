# Migration Providers

Migration Providers separam o estado de migrations do framework que produz a evidência. O objetivo é permitir que consumidores como Release Readiness consultem um `MigrationOverview` sem conhecer Rails, Prisma ou scripts específicos.

## Contrato interno

O primeiro recorte define em `apps/api/src/services/migration-provider.ts`:

- `MigrationProvider`;
- `MigrationInspectionContext`;
- `MigrationOverview`;
- estados `up-to-date`, `pending`, `unavailable` e `unknown`.

Inspeção é separada de mutação. Este contrato inicial não expõe `reset`, `drop`, `prepare` ou qualquer ação destrutiva.

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

## Próximos providers

Prisma e providers custom entram incrementalmente atrás do mesmo contrato. O provider Prisma deverá usar inspeção estruturada do próprio CLI e distinguir indisponibilidade de schema atualizado; nenhum `migrate reset` pertence ao caminho padrão.

Providers custom só podem usar ações conhecidas/declaradas. Texto livre de script nunca deve ser interpretado por heurística como prova de que o schema está atualizado.

## Limites deste recorte

Ainda não há rota HTTP nova, UI ou mutação comum de migrations. O fluxo Rails existente continua intacto enquanto o contrato comum é introduzido de forma compatível.
