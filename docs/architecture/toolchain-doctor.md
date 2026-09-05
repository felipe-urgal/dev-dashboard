# Toolchain Doctor

O Toolchain Doctor é o diagnóstico **read-only** de compatibilidade entre os requisitos versionados do projeto e as ferramentas disponíveis no ambiente que executa o Dev Dashboard.

Ele reutiliza o `ProjectDoctorService` e a rota existente `GET /api/projects/:projectId/doctor`. Não existe uma segunda experiência de Doctor e não há instalação automática de ferramentas.

## Fontes Node

O diagnóstico de runtime considera, quando presentes:

- `.node-version`;
- `.nvmrc`;
- `.tool-versions` (`node`/`nodejs`);
- `package.json#engines.node`.

Cada fonte é preservada na mensagem do check. O runtime local usado pela API é comparado com **todas** as constraints declaradas. Uma declaração incompatível produz `failed`; uma sintaxe que o avaliador não consegue interpretar com segurança produz `warning`, nunca um falso `passed`.

O avaliador cobre versões exatas/parciais, wildcards `x`/`*`, comparadores (`>`, `>=`, `<`, `<=`), ranges compostos por espaço, alternativas `||`, caret (`^`) e tilde (`~`). Aliases não numéricos como `lts/*` permanecem `unknown`/warning em vez de serem adivinhados.

Linhas ambíguas de `.tool-versions` também preservam evidência. Uma ferramenta sem versão ou com múltiplas versões na mesma linha não é descartada silenciosamente: a declaração se torna não avaliável e o check degrada para `warning`.

## Gerenciador Node

`package.json#packageManager` é a declaração explícita de maior precedência. `.tool-versions` pode declarar `npm`, `pnpm`, `yarn` ou `bun` quando `packageManager` não existe; lockfiles continuam sendo evidência complementar/fallback.

Regras:

- `packageManager` declarado define qual binário deve ser consultado;
- uma declaração compatível em `.tool-versions` pode fornecer o gerenciador/versão quando `packageManager` está ausente;
- conflito entre `packageManager` e `.tool-versions` produz `warning`, sem escolha silenciosa;
- quando a declaração inclui versão, o `--version` local é comparado com ela;
- lockfile de outro gerenciador ou múltiplos lockfiles produzem `warning` mesmo que o binário declarado esteja disponível;
- ausência do binário produz `warning` e recomendação read-only;
- gerenciador ainda não suportado produz `warning`, sem executar shell arbitrário.

O Doctor **não instala** npm/pnpm/yarn/bun, não chama `mise` e não altera PATH/configuração do sistema.

## Fontes Ruby e Bundler

O runtime Ruby cruza as fontes estáticas disponíveis:

- `.ruby-version`;
- `.tool-versions#ruby`;
- declaração literal `ruby '...'`/`ruby "..."` no `Gemfile`.

O `Gemfile` é somente lido; ele nunca é executado pelo Doctor. `ruby --version` é consultado pelo command runner estruturado e comparado com todas as declarações reconhecidas.

Bundler é diagnosticado separadamente:

- `Gemfile.lock#BUNDLED WITH`;
- `.tool-versions#bundler`;
- `bundle --version` para a versão disponível;
- `bundle check` somente depois de a compatibilidade de versão não ter falhado/ficado desconhecida.

Versão incompatível produz `failed`; ferramenta ausente ou declaração não avaliável produz `warning`; dependências ausentes continuam sendo `warning`. Nenhum `bundle install` é disparado pelo diagnóstico.

## Docker e Compose

Docker/Compose só entram no relatório quando o `Project Profile` já detectou uma capability explícita de container (`container/docker`, `container/compose` ou `container/devcontainer`). O Doctor não deduz essa necessidade a partir de scripts ou texto livre.

Para `container/compose`, o check consulta com argumentos fixos:

1. `docker --version`;
2. `docker compose version`;
3. `docker info --format {{.ServerVersion}}` para confirmar que o daemon responde.

A verificação não cria, inicia, para ou remove containers. Docker ausente, plugin Compose ausente ou daemon indisponível produzem `warning` localizado com recomendação; o restante do Project Doctor continua sendo executado.

## Semântica de resultado

O contrato existente do Project Doctor permanece a superfície pública. A distinção do Toolchain Doctor é conservadora:

- requisito atendido → `passed`;
- incompatibilidade comprovada de versão → `failed`;
- ferramenta ausente, fonte ambígua ou compatibilidade não comprovável → `warning`;
- capability não aplicável não cria um check adicional.

Assim, `unknown` nunca é convertido em sucesso e uma ferramenta ausente não impede diagnósticos independentes.

## Isolamento e operação offline

O `ProjectDoctorService` executa cada check independentemente. Falha ao consultar um gerenciador, Docker ou runtime não impede os demais checks de serem diagnosticados.

O fluxo funciona offline: lê somente arquivos locais do projeto e consulta versões/estado de binários locais com argumentos fixos. Nenhuma consulta de registry ou download é necessária.

## Limite entre diagnóstico e instalação

Este domínio responde **o que o projeto declara, o que existe localmente e se é compatível**. Instalação/correção automática não faz parte do Doctor e exigiria um fluxo separado com confirmação explícita do usuário.

Ficam deliberadamente fora:

- instalação automática ou shell arbitrário;
- `mise` obrigatório;
- bootstrap completo de ambiente;
- registry amplo de stacks;
- novo endpoint toolchain dedicado ou novo schema HTTP.

As regras são consumíveis pelo Project Doctor/Readiness sem introduzir uma UI paralela ou um caminho de mutação global.
