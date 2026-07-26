# Próxima atividade — 011: Painel de atividade unificado

## Objetivo

Consolidar em uma visão somente leitura as atividades recentes e ativas já reconhecidas pelo dashboard, sem criar execução arbitrária nem duplicar a persistência de cada domínio.

## Plano detalhado

1. Definir um contrato fechado de item de atividade com origem, projeto, estado, instante e referência interna.
2. Agregar execuções do catálogo, testes e processos gerenciados por identificadores existentes.
3. Expor listagem paginada com filtros limitados por projeto, origem e estado.
4. Não persistir caminhos, comandos livres ou cópias de logs no agregador.
5. Criar uma página global de atividade com estados vazios, erro e paginação.
6. Direcionar cada item para o detalhe seguro já existente em seu domínio.
7. Invalidar respostas ao trocar filtros e impedir sobreposição de consultas.
8. Cobrir isolamento entre workspaces, paginação, serialização e navegação.
9. Atualizar arquitetura, segurança, README, roadmap e registro da task.

## Fora do escopo

- reexecução automática;
- fila distribuída;
- auditoria multiusuário;
- comandos ou caminhos fornecidos pelo navegador;
- unificação física dos arquivos de estado.

## Critérios de aceite

- atividades recentes podem ser consultadas em uma única visão;
- agregação não amplia acesso a logs, processos ou projetos;
- paginação e filtros possuem limites explícitos;
- links preservam a autorização e o contexto do projeto;
- typecheck, build e testes passam.
