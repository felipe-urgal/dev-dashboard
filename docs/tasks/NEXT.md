# Próxima atividade — 046: snapshot/restore de banco no painel

## Contexto

A "paridade CLI→Web seletiva" do Horizonte 2 já trouxe `git-save` (task
041), a lacuna real de `dev-clean` (task 042) e `git-pr` (task 043, URL de
PR/MR composta sem chamar API de provedor). Após os ajustes pontuais do
cabeçalho de detalhes (tasks 044 e 045), o próximo item do mesmo ponto do
roadmap ainda pendente é snapshot/restore de banco reconhecido: hoje
exclusivo do CLI bash (`lib/rails/database/snapshot.sh` e `restore.sh`),
faz backup rápido do banco do projeto Rails atual e permite restaurá-lo —
útil para trocar de branch sem perder o estado local nem precisar rodar
`db:reset`.

## Objetivo

Levar ao painel de banco do dashboard web (`apps/api/src/routes/database.ts`,
componente ainda a localizar em `apps/web/src/components/`) uma ação
equivalente: gerar um dump comprimido do banco do ambiente selecionado e
listar/restaurar snapshots anteriores, reaproveitando a detecção de
adaptador e dados de conexão já existentes em
`apps/api/src/services/database-detection-service.ts` em vez de duplicá-la.

## Plano sugerido

1. Estudar `lib/rails/database/snapshot.sh` e `restore.sh`: adaptador
   suportado (`mysql2`/`mysql` via `mysqldump`, `postgresql` via `pg_dump`),
   dados de conexão obtidos via `rails runner`, arquivo
   `<branch>_<timestamp>.sql.gz` em `$DEV_RUN_DIR/db-snapshots/<project-id>`,
   restauração via `mysql`/`psql` com confirmação explícita ("SOBRESCREVE o
   banco atual").
2. Decidir onde os snapshots vivem no lado web — provavelmente um diretório
   próprio sob o run dir da API (paralelo ao padrão de logs/PIDs de
   processos gerenciados), não o mesmo caminho do CLI (evitar dois donos do
   mesmo arquivo). Definir limite de retenção/quantidade (o CLI não impõe
   nenhum) para não deixar a pasta crescer sem controle.
3. Serviço novo (`DatabaseSnapshotService` ou extensão do serviço de banco
   existente): criar snapshot (spawn de `mysqldump`/`pg_dump` sem shell,
   como já é feito em `ProcessManager`/`GitService`), listar snapshots do
   projeto, restaurar um snapshot escolhido. Restaurar é uma mutação
   destrutiva — precisa da mesma política de confirmação em duas etapas
   (`GitMutationConfirmation`-like) já usada por push/commit/save/stash, não
   um mero `window.confirm` client-side.
4. Rotas em `apps/api/src/routes/database.ts` (ou arquivo próprio, seguindo
   o padrão de `git-workspace.ts`/`git-sync.ts`): criar snapshot, listar
   snapshots, preparar confirmação de restore, executar restore.
5. UI: seção "Snapshots" no painel de banco do projeto, com lista ordenada
   por data, botão para criar novo e para restaurar um existente (com aviso
   claro de sobrescrita).
6. Testes de serviço (criação e restauração real contra um banco de teste
   ou stub do adaptador, listagem, adaptador não suportado, ausência de
   `mysqldump`/`pg_dump` no PATH, confirmação obrigatória para restore), de
   rota e de componente.

## Segurança

- Snapshot/restore só deve rodar para o adaptador e a string de conexão já
  detectados pelo projeto — nunca aceitar host/usuário/banco arbitrário vindo
  do navegador.
- Comandos externos (`mysqldump`, `pg_dump`, `mysql`, `psql`) via
  `execFile`/`spawn` sem `shell: true`, como em todo o restante da API.
- Arquivos de snapshot ficam fora de qualquer diretório servido
  estaticamente; a API nunca expõe o conteúdo bruto do dump, apenas metadados
  (nome, data, tamanho) e a ação de restaurar.
- Restore é destrutivo por definição — exige confirmação em duas etapas
  (mesmo padrão de `GIT_MUTATION_CONFIRMATION_REQUIRED`), nunca uma execução
  direta a partir de um único clique.

## Fora do escopo

- Agendamento automático de snapshots.
- Upload/download do arquivo de dump pelo navegador.
- Suporte a adaptadores além de MySQL/PostgreSQL (SQLite fica fora, como no
  CLI).
- `dev-kill-port` (decisão registrada na task 042) e abrir editor/terminal
  via adaptadores locais — fatias próprias do mesmo item do roadmap.

## Critérios de aceite

- criação e restauração de snapshot disponíveis no painel de banco, restrito
  ao adaptador/projeto já detectados;
- restore exige confirmação em duas etapas, igual às demais mutações;
- nenhum comando de shell arbitrário chega a `spawn`/`exec`;
- `npm run typecheck`, `npm run build` e `npm test` passam.
