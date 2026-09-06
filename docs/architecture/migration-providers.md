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

## Provider custom explícito

`CustomMigrationProvider` permite integrar um status de migrations específico sem transformar stdout/stderr em protocolo implícito. Cada instância nasce de configuração confiável no backend e precisa declarar:

- `id` estável do provider;
- programa e argv estruturado de status;
- pelo menos um seletor de projeto (`projectIds` e/ou `projectTypes`);
- códigos de saída que significam `up-to-date`;
- opcionalmente códigos de saída que significam `pending` e `unavailable`.

Os grupos de exit codes precisam ser disjuntos. Código sem semântica declarada vira `unknown`, nunca `pending` ou `up-to-date` por texto de terminal.

O runner padrão usa `execFile` sem shell, sempre com `cwd=Project.path`, timeout de 10 segundos e limite de output. O programa precisa ser um nome de executável simples resolvido pelo PATH; paths e shells conhecidos (`sh`, `bash`, `zsh`, `fish`, PowerShell e `cmd`) são rejeitados. O adapter também limita quantidade/tamanho dos argumentos e rejeita NUL/quebras de linha.

A saída do processo não faz parte de `MigrationOverview`. Mesmo quando o comando imprime detalhes, credenciais ou paths, o provider conserva apenas o exit code. A evidência pública é lógica (`custom:<id>:status`).

Quando o exit code prova `pending`, o overview pode informar o estado sem fabricar nomes individuais de migrations; nesse caso a lista permanece vazia e um warning explica a limitação.

Configuração custom não vem de request HTTP neste recorte. Expor configuração dinâmica no futuro exige validação/allowlist própria e não pode abrir caminho para shell livre.

## Próximos providers e execução

Novos providers devem continuar atrás do mesmo contrato e só podem usar ações conhecidas/declaradas. Texto livre de script nunca deve ser interpretado por heurística como prova de que o schema está atualizado.

Uma etapa posterior pode adicionar plano/execução local estruturada por provider, com confirmação, environment guard e preflight próprios. Produção continua pertencendo ao domínio Production. O contrato de mutação deve ser comum aos providers; não deve surgir primeiro como endpoint especial de Rails, Prisma ou custom.

## Limites atuais

Ainda não há rota HTTP nova ou UI comum de migrations. O fluxo Rails existente continua intacto enquanto o contrato comum e os providers de inspeção são introduzidos de forma compatível.
