# Próxima atividade

Nenhuma atividade específica planejada no momento. A aba Banco de dados
recebeu uma sequência de entregas (056–060: limpeza de Rotas/Dependências,
pausar/reiniciar o banco local, múltiplos bancos por ambiente em
`database.yml`/Migrations/Modelos, modal de migration com syntax highlight,
remoção do enhancer legado da aba Diff, e geração de model/migration) — vale
revisitar a aba como um todo antes de propor a próxima fatia, em vez de
assumir de antemão qual é a lacuna mais importante.

Candidatos observados ao longo dessas entregas, nenhum dimensionado ainda:

- os arquivos criados por `rails generate` (060) aparecem só como texto; não
  há ação de abrir no editor — a aba Banco de dados não tem hoje esse tipo
  de integração;
- `runMigrationMutation` (migrate/rollback/seed/db:prepare) sempre opera em
  todos os bancos configurados de uma vez; não há como escolher rodar só
  num banco secundário pela interface (059);
- a correlação entre bloco de `db:migrate:status` e banco configurado (059)
  é heurística (nome do arquivo contém o nome da configuração); não há um
  jeito formal de confirmar a correspondência.
