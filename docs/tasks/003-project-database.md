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

## Testes automatizados

- múltiplos ambientes em `database.yml`;
- `DATABASE_URL` em `.env`;
- ausência de configuração reconhecida;
- senha ausente da visão padrão e disponível somente na revelação explícita.

## Limitações conhecidas

- o parser YAML cobre o formato convencional do Rails e herança por
  `default`, mas não é um interpretador YAML/ERB completo;
- `knexfile` não é executado por segurança; os dados são associados apenas
  quando também existem variáveis `DB_*` reconhecidas;
- o handler do protocolo `dev-dashboard://` ainda precisa ser implementado;
- a acessibilidade TCP não comprova autenticação nem existência do banco.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
