# Próxima atividade — 058: gerar model e migration pela interface

## Contexto

Depois de consertar a detecção e a leitura de migrations/schema para
projetos com múltiplos bancos (057), o pedido seguinte foi: uma aba própria
para as "Operações Rails" (hoje um bloco fixo dentro de Migrations, com
Rodar migrate / Rollback / Rodar seed / db:prepare) e, dentro dela,
`rails generate model` e `rails generate migration` — gerar as migrations
(e o model, no primeiro caso) que criam ou alteram uma tabela, a partir de
uma lista de campos `nome:tipo`.

Isso é uma categoria de mudança diferente de tudo que a aba Banco de dados
fez até aqui: `db:migrate`/`snapshot`/`start`/`stop` operam sobre um estado
já existente (banco, snapshot, serviço). Um generator **cria arquivos novos**
no projeto (`app/models/*.rb`, `db/migrate/*.rb`) — mais próximo, em risco,
das mutações Git do painel do que das operações de banco.

## Objetivo

Uma aba (ex.: "Operações") com:
1. o bloco de operações Rails que já existe (migrate/rollback/seed/prepare),
   deslocado de dentro de Migrations;
2. gerar model: nome + lista de campos (`nome:tipo`), roda
   `rails generate model <Nome> <campo:tipo> ...`;
3. gerar migration: nome + lista de campos, roda
   `rails generate migration <Nome> <campo:tipo> ...`.

## Plano sugerido

1. **Catálogo fechado de tipos de coluna** — só os tipos que o Rails aceita
   nativamente em `t.<tipo>` (string, text, integer, bigint, float, decimal,
   boolean, date, datetime, time, timestamp, binary, references, uuid); a
   API rejeita qualquer tipo fora da lista antes de montar o comando.
2. **Validação de nome** — nome do model/migration e nome de cada campo por
   um padrão fechado (`^[A-Za-z][A-Za-z0-9_]*$`, sem `/`, espaço, `-` ou `.`)
   para não colidir com flags do gerador nem permitir path traversal; os
   argumentos vão para `execFile` como array, nunca concatenados numa string
   de shell — mesmo padrão já usado em `db:migrate`/systemctl.
3. **Confirmação em duas etapas** — como as demais mutações do painel: uma
   rota `POST .../generate/confirmations` monta o comando a partir da
   entrada já validada e devolve um token com TTL curto; `POST
   .../generate/mutations` só aceita o token (sem reenviar nome/campos —
   evita qualquer divergência entre o que foi confirmado e o que roda de
   fato). Preview do comando exato (`rails generate model Produto
   nome:string preco:decimal`) antes de confirmar.
4. **Resposta** — parsear a saída do gerador (linhas `create <caminho>`) para
   listar os arquivos criados, além da saída bruta mascarada (mesmo
   `maskSensitiveLogContent` das outras mutações).
5. **Banco secundário**: `rails generate migration` aceita
   `--database=<nome>`; expor isso só se `databases.length > 1` (057), com o
   mesmo seletor de banco já construído para Migrations/Modelos.
6. Revisão de segurança dedicada antes de mesclar — é a primeira vez que a
   aba Banco de dados cria arquivos no projeto, não só lê ou troca estado.

## Fora do escopo

- editar ou apagar um model/migration já existente pela interface;
- outros geradores do Rails (`scaffold`, `controller`, etc.) — só model e
  migration, conforme pedido.
