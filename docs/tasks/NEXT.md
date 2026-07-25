# Próxima atividade — 006: Distribuição local do dashboard web

## Objetivo

Concluir a fundação operacional com um único comando `dev-web` que valide,
construa e inicie o dashboard local, servindo o frontend compilado pela API sem
depender do Vite.

## Plano detalhado

1. Definir como a API localizará `apps/web/dist` em instalação e desenvolvimento.
2. Servir assets imutáveis e o fallback da SPA somente fora do namespace `/api`.
3. Preservar a autenticação local sem gravar o token no bundle nem confiar
   apenas em CORS; documentar o fluxo e cobri-lo com testes de origem/CSRF.
4. Criar `dev-web` com validação prévia, build, inicialização em
   `127.0.0.1` e encerramento previsível por sinal.
5. Adicionar configuração explícita para porta, diretório do frontend e modo de
   desenvolvimento/produção, sempre com defaults locais seguros.
6. Cobrir assets, fallback de rotas do Vue, ausência do build, namespace da API
   e autenticação com testes da aplicação Fastify.
7. Atualizar instalação, operação e troubleshooting na documentação.

## Fora do escopo

- instalação como serviço do sistema;
- acesso remoto ou bind em `0.0.0.0`;
- TLS, múltiplos usuários ou login;
- empacotadores nativos para desktop;
- execução do catálogo de scripts, que volta à sequência após esta fundação.

## Critérios de aceite

- uma instalação limpa pode rodar diagnóstico, build e dashboard por um comando;
- o navegador usa somente a origem da API no modo local de produção;
- recarregar uma sub-rota do Vue retorna a aplicação;
- rotas privadas continuam inacessíveis a origens externas e clientes sem autorização;
- o token não aparece nos arquivos de `apps/web/dist`;
- `npm run typecheck`, `npm run build` e `npm test` passam.

## Atividade seguinte preservada

Depois desta entrega, a execução segura do catálogo será retomada como task 007,
mantendo o escopo já planejado: catálogo fechado, seleção de gerenciador por
lockfile, processos canceláveis, logs e confirmação por risco.
