# Ambiente de execução da aba Testes

A aba **Testes do projeto** executa o comando detectado pelo backend em um PTY destacável. O comando continua pertencendo ao projeto (`bin/rspec`, `bundle exec rspec`, `npm test`, `pnpm test` etc.), mas o ambiente do processo filho precisa ser separado do ambiente usado para iniciar o Dev Dashboard.

## Regra geral

O Dashboard preserva variáveis operacionais necessárias ao processo filho, como `PATH`, `HOME` e `SSH_AUTH_SOCK`, e aplica as variáveis locais do projeto carregadas de `.dev-dashboard/.env.check.local`.

Credenciais do próprio Dashboard, como `VERCEL_TOKEN` e `VERCEL_TEAM_ID`, não são repassadas para os testes.

## Projetos Rails

Para Rails, a aba Testes aplica um contexto determinístico:

- `RAILS_ENV=test`;
- `RACK_ENV=test`;
- `BUNDLE_GEMFILE=<Project.path>/Gemfile`;
- contexto Ruby/Bundler herdado da API (`BUNDLE_*`, `GEM_*`, `RUBYOPT`, `RBENV_VERSION` e equivalentes) é removido, salvo quando o projeto o declara explicitamente;
- `CI` herdado do processo da API é removido; se o projeto declarar `CI` em `.env.check.local`, o valor explícito é preservado;
- `DATABASE_URL` herdada da API é removida quando o projeto não declara banco para checks;
- `CHECK_DATABASE_URL`, quando presente e não vazio, é promovida para `DATABASE_URL` somente no processo de testes.

Essas regras evitam que a forma usada para iniciar o Dev Dashboard altere o boot de uma aplicação Rails. Em especial, uma variável `CI` externa não deve ativar `eager_load` ou outras configurações condicionais do projeto sem que o próprio projeto tenha solicitado esse comportamento.

## Projetos Node

Projetos Node mantêm a política anterior. O ajuste de Rails não muda a escolha do package manager nem o comando detectado para npm, yarn ou pnpm.

A compatibilidade de Node deve continuar sendo validada em projetos com estruturas diferentes, incluindo aplicações simples e monorepos.

## Banco de dados para checks

Projetos que precisam de um banco dedicado para testes/checks podem declarar:

```dotenv
CHECK_DATABASE_URL=postgres://usuario:senha@localhost:5432/projeto_test
```

O valor não é persistido pelo Dashboard e não deve aparecer em respostas da API ou logs. Para Rails, a ausência dessa variável significa explicitamente **não herdar** a `DATABASE_URL` do processo do Dev Dashboard.

## Motivação da separação

O processo da API pode ter sido iniciado dentro de outro ambiente Ruby, com CI habilitado ou com credenciais e URLs necessárias ao próprio Dashboard. Esses valores são válidos para a API, mas não são configuração implícita do projeto selecionado.

A fronteira correta é:

```text
processo do Dev Dashboard
        │
        ├── ambiente operacional compartilhável
        │
        └── aba Testes
              ├── ambiente local do projeto
              ├── política específica Rails/Node
              └── comando detectado do projeto
```

Assim, trocar de projeto no Dashboard não reutiliza contexto Ruby/Bundler ou configuração de banco de outro projeto.
