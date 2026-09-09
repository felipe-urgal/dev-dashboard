# Migration Providers

Migration Providers separam o estado de migrations do framework que produz a evidência. O objetivo é permitir que consumidores como a UI comum e Release Readiness consultem um `MigrationOverview` sem conhecer Rails, Prisma ou scripts específicos.

## Contrato interno

O contrato em `apps/api/src/services/migration-provider.ts` define:

- `MigrationProvider`;
- `MigrationInspectionContext`;
- `MigrationOverview`;
- estados `up-to-date`, `pending`, `unavailable` e `unknown`.

Inspeção é separada de mutação. O contrato atual não expõe `reset`, `drop`, `prepare`, `migrate` ou qualquer ação destrutiva.

`MigrationOverviewService` é o agregador da superfície comum. Ele percorre providers em ordem determinística e usa o primeiro que declara suporte ao projeto. Providers configurados explicitamente são avaliados antes dos built-ins; Rails e Prisma permanecem como fallbacks conhecidos.

Falha em `supports()` não derruba a inspeção dos providers seguintes. Falha inesperada em `inspect()` vira `unavailable` sanitizado: exception message, stack, stdout, stderr, connection strings e environment values nunca são transportados para o contrato público.

Se nenhum provider for compatível, o resultado também é `unavailable`. Ausência de provider ou falha de inspeção **nunca** significam `up-to-date`.

## Rota HTTP comum

A API expõe somente leitura em:

```text
GET /api/projects/:projectId/migrations
GET /api/projects/:projectId/migrations?database=<identidade-lógica>
```

A resposta possui formato estável:

```json
{
  "migration": {
    "provider": "rails",
    "status": "pending",
    "database": "primary",
    "applied": [{ "id": "20260901010101", "name": "Create users" }],
    "pending": [{ "id": "20260902020202", "name": "Add index" }],
    "observedAt": "2026-09-07T16:00:00.000Z",
    "evidence": "Rails db:migrate:status",
    "warnings": []
  }
}
```

`database` é opcional e representa somente uma identidade lógica. A rota aceita no máximo 128 caracteres e apenas `A-Z`, `a-z`, números, `_` e `-`, começando por caractere alfanumérico. Entrada inválida é rejeitada com `400` antes de chegar ao provider. Projeto inexistente retorna `PROJECT_NOT_FOUND` com `404`.

O schema HTTP é fechado (`additionalProperties: false`) e a rota não expõe nenhuma mutation.

## UI comum

A ferramenta `Migrations`, em `/projects/:projectId/migrations`, consome exclusivamente a rota comum. Ela não conhece comandos Rails, Prisma ou custom.

A UI apresenta:

- estado normalizado (`Atualizado`, `Pendente`, `Indisponível` ou `Inconclusivo`);
- provider e identidade lógica do banco;
- contagem de migrations aplicadas e pendentes;
- evidência e warnings sanitizados;
- migrations pendentes retornadas pelo provider;
- no máximo as 20 migrations aplicadas mais recentes, preservando a contagem total para evitar renderização excessiva em históricos grandes.

A tela é deliberadamente read-only. Não existe botão de `migrate`, `reset`, `deploy` ou equivalente. Erro de transporte permanece explícito e oferece retry; `unavailable`/`unknown` vindos do backend continuam visíveis como estado de domínio e não são convertidos em sucesso.

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

Os seletores reduzem autoridade. Quando apenas um grupo é informado, ele precisa corresponder; quando `projectIds` e `projectTypes` são informados juntos, **ambos** precisam corresponder ao projeto. Assim adicionar um filtro mais específico nunca amplia silenciosamente o conjunto de projetos em que o comando pode executar.

Os grupos de exit codes precisam ser disjuntos. Código sem semântica declarada vira `unknown`, nunca `pending` ou `up-to-date` por texto de terminal.

O runner padrão usa `execFile` sem shell, sempre com `cwd=Project.path`, timeout de 10 segundos e limite de output. O programa precisa ser um nome de executável simples resolvido pelo PATH; paths e shells conhecidos (`sh`, `bash`, `zsh`, `fish`, PowerShell e `cmd`) são rejeitados. O adapter também limita quantidade/tamanho dos argumentos e rejeita NUL/quebras de linha.

A saída do processo não faz parte de `MigrationOverview`. Mesmo quando o comando imprime detalhes, credenciais ou paths, o provider conserva apenas o exit code. A evidência pública é lógica (`custom:<id>:status`).

Quando o exit code prova `pending`, o overview pode informar o estado sem fabricar nomes individuais de migrations; nesse caso a lista permanece vazia e um warning explica a limitação.

Configuração custom não vem de request HTTP. Expor configuração dinâmica no futuro exige validação/allowlist própria e não pode abrir caminho para shell livre.

## Consumo pelo Release Readiness

Release Readiness consome `MigrationOverview` diretamente e permanece independente do provider/framework. O mapeamento é deliberadamente conservador:

- `up-to-date` -> `pass`;
- `pending` -> `block`;
- `unavailable` -> `unknown`;
- `unknown` -> `unknown`.

A evidência e o timestamp normalizados são reutilizados no check. O Readiness não parseia Rails/Prisma/custom, não executa migrations e não transforma ausência de evidência em sucesso.

## Próximos providers e execução

Novos providers devem continuar atrás do mesmo contrato e só podem usar ações conhecidas/declaradas. Texto livre de script nunca deve ser interpretado por heurística como prova de que o schema está atualizado.

Uma etapa posterior pode adicionar plano/execução local estruturada por provider, com confirmação, environment guard e preflight próprios. Produção continua pertencendo ao domínio Production. O contrato de mutação deve ser comum aos providers; não deve surgir primeiro como endpoint especial de Rails, Prisma ou custom.

## Limites atuais

A rota, a UI comum e o consumo pelo Release Readiness são somente leitura. O fluxo Rails/PTY existente continua intacto e é a superfície responsável por execução Rails até existir um contrato de mutation comum e explicitamente aprovado.
