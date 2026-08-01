# Task 058 — Gerar model e migration pela interface

## Status

Implementação concluída. `typecheck`, `build` e `test` (API e web) aprovados.

## Objetivo

Uma aba própria ("Operações") reunindo o bloco de operações Rails que já
existia (migrate/rollback/seed/db:prepare, antes fixo dentro de Migrations)
e dois formulários novos: gerar um `model` e gerar uma `migration`, a partir
de um nome e uma lista de campos `nome:tipo` — equivalente a
`rails generate model`/`rails generate migration` pela interface.

Essa é a primeira ação da aba Banco de dados que **cria arquivos** no
projeto, diferente de tudo que veio antes (ler estado, trocar estado de
serviço, ler/rodar migrations já existentes). Tratada com o mesmo cuidado de
segurança das mutações já existentes, mais um catálogo fechado adicional
para o que pode ir no comando.

## Resultado

### API

- `RailsInspectionService.prepareGeneratorConfirmation` /
  `.runGenerator` (mesmo padrão de confirmação em duas etapas das mutações
  de migration): a primeira etapa valida tudo e monta o comando; a segunda só
  aceita o token — nome, campos e banco não são reenviados, então não há
  como o que roda de fato divergir do que foi confirmado;
- catálogo fechado de tipo de coluna (os que o Rails aceita em `t.<tipo>`:
  string, text, integer, bigint, float, decimal, boolean, date, datetime,
  time, timestamp, binary, references, uuid) — qualquer tipo fora da lista é
  rejeitado antes de montar o comando;
- nome do model/migration e nome de cada campo validados por um padrão
  fechado (`^[A-Za-z][A-Za-z0-9_]*$` / `^[a-z][a-z0-9_]*$`) — sem `/`,
  espaço, `-` ou `.`, então não há como um campo virar uma flag do gerador
  nem escapar do diretório do projeto; no máximo 25 campos;
- os argumentos vão para `execFile` como array, nunca concatenados numa
  string de shell — mesmo padrão de `db:migrate`/systemctl já usado no
  painel;
- banco secundário (057): `--database=<nome>` é anexado só quando o banco
  informado já consta em `listDatabases`, senão a confirmação é recusada;
- a resposta lista os arquivos criados (linhas `create <caminho>` da saída
  do gerador), além da saída bruta mascarada (`maskSensitiveLogContent`,
  igual às demais mutações);
- rotas novas: `POST /rails/generate/confirmations`,
  `POST /rails/generate/mutations`; contratos novos: `RailsGeneratorKind`,
  `RailsGeneratorFieldType`, `RailsGeneratorField`,
  `RailsGeneratorConfirmation`, `RailsGeneratorResult`.

### Interface

- nova aba **Operações**, ao lado de Migrations e Modelos (só para projetos
  Rails): o bloco "Operações Rails" (migrate/rollback/seed/db:prepare) saiu
  de dentro de Migrations e mora aqui agora;
- dois cartões, **Gerar model** e **Gerar migration**: nome, lista de campos
  (nome + select de tipo, adicionar/remover linha) e, quando o projeto tem
  mais de um banco (057), um seletor do banco alvo;
- "Pré-visualizar e gerar" mostra o comando exato antes de qualquer coisa
  rodar; só then aparecem Confirmar/Cancelar;
- depois de confirmar: sucesso/falha, lista dos arquivos criados e a saída
  bruta do gerador.

## Arquivos principais

- `apps/api/src/services/rails-inspection-service.ts`
- `apps/api/src/routes/rails.ts`
- `apps/api/src/http/api-error.ts`
- `apps/web/src/composables/useRailsGenerator.ts` (novo)
- `apps/web/src/components/RailsGeneratorForm.vue` (novo)
- `apps/web/src/components/ProjectDatabasePanel.vue`
- `apps/web/src/database/generator-form.css` (novo)
- `apps/web/src/api/rails.ts`
- `packages/contracts/src/rails.ts`

## Testes

- `apps/api/test/rails-inspection-service.test.ts` — gera model com o
  comando fechado montado a partir da entrada; gera migration para o banco
  secundário com `--database`; rejeita nome/campo/tipo fora do catálogo
  fechado antes de montar o comando; exige confirmação válida e consome o
  token uma única vez;
- `apps/api/test/rails-routes.test.ts` — prepara confirmação e gera um
  model pela rota HTTP; rejeita nome fora do padrão; rejeita execução sem
  confirmação prévia;
- `apps/web/test/project-database-panel.test.ts` — preenche o formulário de
  model na aba Operações, pré-visualiza o comando, confirma e verifica a
  lista de arquivos criados; "Rodar migrate" (que mudou de aba) segue
  coberto no mesmo arquivo.

## Limitações conhecidas

- só `model` e `migration` — outros geradores do Rails (`scaffold`,
  `controller` etc.) ficam fora, conforme o pedido original;
- não há como editar ou apagar um model/migration já gerado pela interface;
- os arquivos criados aparecem como texto (caminho), não há link para abrir
  o arquivo — a aba Banco de dados não tem, hoje, uma ação de "abrir no
  editor".
