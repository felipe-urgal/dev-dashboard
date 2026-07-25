# 003 — Visão de banco de dados do projeto

## Status

Implementada, revisada e validada por QA automatizado.

## Objetivo

Disponibilizar a aba `/projects/:projectId/database` para inspecionar, sem
executar consultas ou alterações, configurações de banco reconhecidas em
projetos Rails e Node.

## Escopo entregue

- detecção de `config/database.yml`, `.env*`, `prisma/schema.prisma` e
  `knexfile.*`;
- ambientes paginados com driver, host, porta, banco, usuário e origem;
- verificação TCP limitada a 500 ms para indicar acessibilidade local;
- senha e URL completas removidas da resposta padrão;
- endpoint `POST .../:environmentId/reveal` para revelação explícita;
- ações para ocultar/revelar, copiar a URL e abrir o protocolo
  `dev-dashboard://` com identificadores estruturados;
- ação para iniciar o serviço local do banco indisponível por meio de
  `sudo -n systemctl start`, conforme o driver detectado;
- estado dedicado quando nenhuma configuração é reconhecida;
- invalidação das respostas assíncronas ao trocar de projeto;
- limpeza do estado de inicialização antes de atualizar a detecção, evitando
  que o botão permaneça desabilitado enquanto o serviço ainda fica disponível.
- catálogo fechado de unidades systemd para PostgreSQL, MySQL/MariaDB, MongoDB
  e Redis;
- mensagens acionáveis para `systemctl` ausente, autorização prévia do `sudo`
  e falta de permissão.

## Decisões de segurança

1. O navegador envia apenas `projectId` e `environmentId`; o caminho vem do
   `ProjectStore`.
2. A leitura usa uma lista fechada de arquivos e valida que o caminho resolvido
   permanece sob a raiz do projeto.
3. A resposta normal usa schema explícito e nunca inclui `databaseUrl` sem
   máscara.
4. A URL completa possui endpoint separado, `POST` explícito e schema próprio.
5. Nenhum cliente ou comando de banco é iniciado pela API. O link de protocolo
   contém somente IDs e driver, sem credenciais.
6. Variáveis do processo da API não são usadas na detecção, evitando que um
   projeto referencie e revele segredos externos aos seus próprios arquivos.
7. A verificação TCP aceita apenas endereços de loopback; hosts remotos ficam
   com estado não verificado para impedir que projetos provoquem varreduras de rede.
8. A inicialização usa exclusivamente `sudo -n systemctl start <unidade>` sem
   shell, com a unidade escolhida em um catálogo fechado pelo driver. O modo
   não interativo impede que a API fique bloqueada esperando senha; quando
   necessário, o usuário autoriza o sudo antes com `sudo -v` no terminal.
9. Bancos configurados em hosts remotos nunca disponibilizam a ação de iniciar
   um serviço da máquina local.

## Testes automatizados

- múltiplos ambientes em `database.yml`;
- `DATABASE_URL` em `.env`;
- ausência de configuração reconhecida;
- senha ausente da visão padrão e disponível somente na revelação explícita;
- interpolação de `ENV.fetch` sem leitura do ambiente da API;
- host remoto não sondado pela verificação de conectividade;
- seleção e inicialização dos serviços locais de PostgreSQL e MySQL;
- ausência da ação para banco remoto;
- classificação da falha quando o `sudo` exige autorização.

## QA e code review

- revisão confirmou que unidade, argumentos e diretório de execução continuam
  resolvidos exclusivamente no backend, sem entrada livre do navegador;
- Docker foi removido desta entrega: suporte a containers permanece reservado
  para uma atividade futura do roadmap;
- typecheck, build e testes da API foram executados após a correção; a suíte
  completa também foi executada, mas dois testes de encerramento real do
  `process-manager`, fora deste escopo, encontraram processos persistentes no
  ambiente de QA (`PROCESS_STOP_TIMEOUT`).

## Limitações conhecidas

- o parser YAML cobre o formato convencional do Rails e herança por
  `default`, mas não é um interpretador YAML/ERB completo;
- `knexfile` não é executado por segurança; os dados são associados apenas
  quando também existem variáveis `DB_*` reconhecidas;
- a inicialização automática atual é específica de distribuições Linux com
  systemd e requer autorização de `sudo` válida ou regra local equivalente;
- nomes de unidades podem variar entre distribuições; o catálogo inicial usa
  `postgresql.service`, `mysql.service`, `mariadb.service`, `mongod.service` e
  `redis-server.service`;
- o handler do protocolo `dev-dashboard://` ainda precisa ser implementado;
- a acessibilidade TCP não comprova autenticação nem existência do banco.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
