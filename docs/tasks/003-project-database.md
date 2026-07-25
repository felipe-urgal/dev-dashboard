# 003 — Visão de banco de dados do projeto

## Status

Implementada, aguardando code review e QA.

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
- ação para iniciar um serviço de banco indisponível quando houver um serviço
  compatível em um arquivo Docker Compose conhecido do projeto;
- estado dedicado quando nenhuma configuração é reconhecida;
- invalidação das respostas assíncronas ao trocar de projeto.

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
8. A inicialização usa exclusivamente `docker compose up -d` sem shell, com
   arquivo de uma lista fechada e nome de serviço validado e detectado pela API.

## Testes automatizados

- múltiplos ambientes em `database.yml`;
- `DATABASE_URL` em `.env`;
- ausência de configuração reconhecida;
- senha ausente da visão padrão e disponível somente na revelação explícita.
- interpolação de `ENV.fetch` sem leitura do ambiente da API;
- host remoto não sondado pela verificação de conectividade.
- detecção e inicialização do serviço Compose compatível;
- ausência da ação quando não existe serviço compatível.

## Limitações conhecidas

- o parser YAML cobre o formato convencional do Rails e herança por
  `default`, mas não é um interpretador YAML/ERB completo;
- `knexfile` não é executado por segurança; os dados são associados apenas
  quando também existem variáveis `DB_*` reconhecidas;
- a inicialização automática requer Docker Compose e um serviço cuja imagem ou
  nome identifique PostgreSQL, MySQL/MariaDB, MongoDB ou Redis;
- o handler do protocolo `dev-dashboard://` ainda precisa ser implementado;
- a acessibilidade TCP não comprova autenticação nem existência do banco.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
