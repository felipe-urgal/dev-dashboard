# Task 057 — Múltiplos bancos por ambiente, aba condicional e modal de migration

## Status

Implementação concluída. `typecheck`, `build` e `test` (API e web) aprovados.

## Objetivo

Três ajustes pontuais na aba Banco de dados, a partir de uso real:

1. `config/database.yml` no formato Rails 6+ de múltiplos bancos por ambiente
   (`development: { primary: {...}, data: {...} }`) era mal interpretado: o
   parser tratava toda linha indentada como campo do ambiente de nível
   superior, então o último bloco (`data`) sobrescrevia os campos do primeiro
   (`primary`) — o projeto aparecia com um único ambiente por `development`/
   `test`/`production`, com os dados do banco secundário.
2. A aba **Banco de dados** aparecia para todo projeto, mesmo quando nenhuma
   configuração de banco é reconhecida (ex.: um projeto Node sem
   `.env`/Prisma/knexfile).
3. Em **Migrations**, o painel de detalhes ficava sempre visível ao lado da
   tabela (com uma migration pré-selecionada), e o código-fonte era exibido
   sem nenhum destaque de sintaxe.

## Resultado

### Múltiplos bancos por ambiente (API)

- `parseRails` em `database-detection-service.ts` passou a reconhecer o
  formato de dois níveis: uma linha de 2 espaços terminada em `:` sem valor
  (`primary:`, `data:`) é o nome do banco; seus campos ficam a 4+ espaços,
  delimitados pelo próximo nome de banco ou o fim do ambiente;
- cada banco secundário vira um ambiente próprio: `environment` fica
  `"<ambiente>/<banco>"` (ex.: `development/data`) e `id` fica
  `rails-<ambiente>-<banco>` — exceto `primary`, que mantém o `environment`/
  `id` de sempre (`development`, `rails-development`), para não quebrar
  URLs/ids já em uso;
- o formato plano de um banco por ambiente continua funcionando sem
  alteração de comportamento.

### Aba condicional (Interface)

- `ProjectDetailsView` consulta `fetchProjectDatabase` (mesma detecção que o
  próprio painel usa) ao carregar o projeto e guarda `database.supported`;
  a aba **Banco de dados** só aparece quando `true`;
- o valor inicial é otimista (`true`) para não fazer a aba piscar no caso
  comum (projeto com banco); ela some depois que a detecção confirma que não
  há nada — e só nesse caso, incomum, há uma piscada;
- a rota continua acessível diretamente por URL mesmo com a aba oculta; o
  próprio painel mostra o estado vazio de sempre.

### Modal de migration + syntax highlight (Interface)

- clicar em uma migration (na tabela ou na prévia da Visão geral) abre um
  modal (`Teleport` para `body`, `role="dialog"`, fecha com Escape, clique
  fora ou o X) em vez de atualizar um painel lateral sempre visível — a
  tabela de migrations agora ocupa a largura toda;
- o código da migration é destacado com o mesmo realce de sintaxe Ruby já
  usado no diff do Git (`highlightGitDiffCode`, `git-syntax-*`), sem nova
  dependência.

## Arquivos principais

- `apps/api/src/services/database-detection-service.ts`
- `apps/api/test/database-detection-service.test.ts`
- `apps/web/src/views/ProjectDetailsView.vue`
- `apps/web/src/components/ProjectDatabasePanel.vue`
- `apps/web/src/database/migration-modal.css` (novo)
- `apps/web/src/database/{detail-panel,inspector-mutation,metrics,overview,responsive,tables}.css`

## Testes

- `apps/api/test/database-detection-service.test.ts` — novo caso para bancos
  `primary`/`data` por ambiente;
- `apps/web/test/project-database-panel.test.ts` — novo caso: abrir o modal
  pela tabela, conferir o destaque de sintaxe (`code.git-syntax-code`) e
  fechar pelo X;
- `apps/web/test/database-layout-polish.test.ts` — ajustado para a classe
  CSS do modal no lugar do layout lateral removido.

## Limitações conhecidas

- o parser de `database.yml` continua não sendo um interpretador YAML/ERB
  completo: reconhece só um nível de aninhamento (ambiente → banco), então
  um terceiro nível (improvável na convenção do Rails) não é capturado;
- a consulta de "tem banco?" em `ProjectDetailsView` é uma segunda chamada à
  mesma detecção que o painel já faz ao abrir a aba — barato (é só leitura
  de arquivos locais), mas é uma requisição HTTP a mais por carregamento de
  projeto.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
