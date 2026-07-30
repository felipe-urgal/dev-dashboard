# Próxima atividade — 049: snapshot/restore de banco no painel

## Contexto

A paridade CLI→Web seletiva já trouxe commit rápido, manutenção de processos,
URL de pull request, CRUD simples de branches e sincronização da `main`. O
próximo item pendente é snapshot/restore de banco reconhecido, hoje disponível
apenas no CLI bash.

## Objetivo

Levar ao painel de banco uma ação segura para gerar dump comprimido do banco do
ambiente selecionado, listar snapshots anteriores e restaurar um snapshot,
reaproveitando a detecção de adaptador e conexão já existente.

## Plano sugerido

1. Estudar `lib/rails/database/snapshot.sh` e `restore.sh`, incluindo os
   adaptadores MySQL e PostgreSQL.
2. Definir armazenamento e retenção próprios para os snapshots da API.
3. Criar um serviço que execute `mysqldump`/`pg_dump` e `mysql`/`psql` sem
   shell, sempre a partir dos dados detectados para o projeto.
4. Adicionar rotas para criar, listar, preparar confirmação e restaurar.
5. Criar a seção "Snapshots" no painel de banco.
6. Cobrir serviço, rotas e componente com testes.

## Segurança

- nunca aceitar host, usuário, banco, comando ou caminho arbitrário do
  navegador;
- armazenar snapshots fora de diretórios servidos estaticamente;
- retornar apenas metadados, nunca o dump bruto;
- exigir confirmação em duas etapas para restore;
- executar subprocessos sem `shell: true`.

## Fora do escopo

- snapshots agendados;
- upload ou download pelo navegador;
- adaptadores além de MySQL e PostgreSQL.

## Critérios de aceite

- criação, listagem e restauração disponíveis no painel de banco;
- restore protegido por confirmação em duas etapas;
- retenção limitada e caminhos derivados internamente;
- `npm run typecheck`, `npm run build` e `npm test` passam.
