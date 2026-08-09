# Task 229 — Health check sem sondagem automática

**Status:** concluída em 2026-08-09.

## Objetivo

Evitar requisições de health check para rotas que não existem em aplicações
gerenciadas pelo dashboard.

## Resultado

- o campo de health check vazio desativa a verificação;
- o dashboard não tenta mais `/up`, `/health`, `/healthz` ou `/` automaticamente;
- quando configurado, somente o caminho informado é consultado;
- a API retorna um estado indisponível explicando que o caminho precisa ser
  configurado, sem abrir uma conexão com a aplicação;
- a tela, os testes e a documentação foram atualizados.
