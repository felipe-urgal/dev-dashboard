# Toolchain Doctor

O Toolchain Doctor é o diagnóstico **read-only** de compatibilidade entre os requisitos versionados do projeto e as ferramentas disponíveis no ambiente que executa o Dev Dashboard.

O primeiro slice reutiliza o `ProjectDoctorService` e a rota existente `GET /api/projects/:projectId/doctor`. Não existe uma segunda experiência de Doctor e não há instalação automática de ferramentas.

## Fontes Node

O diagnóstico de runtime considera, quando presentes:

- `.node-version`;
- `.nvmrc`;
- `package.json#engines.node`.

Cada fonte é preservada na mensagem do check. O runtime local usado pela API é comparado com **todas** as constraints declaradas. Uma declaração incompatível produz `failed`; uma sintaxe que o avaliador não consegue interpretar com segurança produz `warning`, nunca um falso `passed`.

O avaliador cobre as formas numéricas usadas pelo projeto e pelo ecossistema Node neste recorte: versões exatas/parciais, wildcards `x`/`*`, comparadores (`>`, `>=`, `<`, `<=`), ranges compostos por espaço, alternativas `||`, caret (`^`) e tilde (`~`). Aliases não numéricos como `lts/*` permanecem `unknown`/warning em vez de serem adivinhados.

## Gerenciador Node

`package.json#packageManager` é a declaração explícita quando existe. Os lockfiles continuam sendo evidência complementar/fallback para `npm`, `pnpm`, `yarn` e `bun`.

Regras do primeiro slice:

- `packageManager` declarado define qual binário deve ser consultado;
- quando a declaração inclui versão, o `--version` local é comparado com ela;
- lockfile de outro gerenciador ou múltiplos lockfiles produzem `warning` mesmo que o binário declarado esteja disponível;
- ausência do binário produz `warning` e uma recomendação read-only;
- gerenciador ainda não suportado produz `warning`, sem executar shell arbitrário.

A recomendação pode orientar o usuário a disponibilizar a ferramenta, mas o Doctor **não instala** npm/pnpm/yarn/bun, não chama `mise` e não altera PATH/configuração do sistema.

## Fonte Ruby

Neste slice, `.ruby-version` é a fonte explícita para o runtime Ruby. O Doctor executa somente `ruby --version` pelo command runner estruturado já usado pelo Project Doctor e compara a versão detectada com a declaração.

- compatível → `passed`;
- incompatível → `failed`;
- declaração não avaliável com segurança → `warning`;
- Ruby ausente → `warning`, sem bloquear os outros checks.

A verificação de dependências Bundler continua separada (`bundle check`). A leitura da versão `BUNDLED WITH` e outras fontes de Gemfile/lock podem evoluir em slice posterior sem reescrever o detector de runtime.

## Isolamento e operação offline

O `ProjectDoctorService` executa cada check independentemente. Falha ao consultar um gerenciador não impede runtime, dependências ou configuração de serem diagnosticados.

O fluxo funciona offline: lê somente arquivos locais do projeto e consulta versões de binários locais com argumentos fixos. Nenhuma consulta de registry ou download é necessária.

## Limite entre diagnóstico e instalação

Este domínio responde **o que o projeto declara, o que existe localmente e se é compatível**. Instalação/correção automática é uma capacidade separada e futura. Ela poderá consumir as mesmas evidências sem alterar as regras de detecção.

Fora deste recorte:

- instalação automática ou shell arbitrário;
- `mise` obrigatório;
- bootstrap completo de ambiente;
- registry amplo de stacks;
- novo endpoint toolchain dedicado ou novo schema HTTP.

A issue #590 permanece aberta para as próximas fontes/contrato estruturado que forem necessárias depois deste slice.