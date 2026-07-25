# Próxima atividade — 003: Visão de banco de dados do projeto

## Objetivo

Criar a aba `/projects/:projectId/database` para inspecionar as
configurações de banco de dados detectadas em cada projeto (Rails e
Node) e permitir ações somente leitura sobre elas.

## Escopo funcional proposto

- detectar arquivos de configuração conhecidos:
  `config/database.yml` (Rails), `.env`/`.env.local` com variáveis
  `DATABASE_URL` ou `DB_*`, `prisma/schema.prisma`, `knexfile.*`;
- listar os ambientes disponíveis (development, test, production) com
  driver, host, porta e nome do banco;
- indicar se cada ambiente é acessível a partir da máquina local (ping
  TCP na porta configurada);
- oferecer ações somente leitura: copiar `DATABASE_URL`, abrir o cliente
  configurado (`psql`/`mysql`) via link `dev-dashboard://`;
- mascarar senhas por padrão, com botão explícito para revelar;
- estado dedicado para projetos sem configuração reconhecida.

## Segurança

- nenhum comando arbitrário de banco pode ser executado pelo backend;
- valores sensíveis (senhas, tokens) só saem do backend quando o
  frontend pede explicitamente e nunca via schema de resposta padrão;
- leitura de arquivos limitada à raiz do projeto;
- resposta paginada quando houver muitos ambientes.

## Fora do escopo inicial

- execução de queries;
- criação/reset de bancos;
- gestão de migrações;
- edição das configurações a partir do dashboard.

## Testes automatizados esperados

- detecção de `config/database.yml` com múltiplos ambientes;
- detecção de `.env` com `DATABASE_URL`;
- projeto sem configuração;
- resposta sem vazamento de senha por padrão.

## Observação

O plano detalhado deve ser refinado antes do início da implementação;
esta é a próxima entrega priorizada após a Visão de testes (task 002).
