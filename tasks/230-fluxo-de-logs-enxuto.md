# Task 230 — Fluxo de logs enxuto

**Status:** concluída em 2026-08-09.

## Objetivo

Deixar a visualização padrão dos logs do servidor mais leve, priorizando a
leitura rápida de requisições sem perder o acesso ao contexto técnico.

## Resultado

- o fluxo Rails passou de linhas cruas para uma linha compacta por evento;
- cada requisição mostra horário, método, rota, status e duração;
- controller, contagem de queries, SQL, parâmetros e log completo só aparecem
  ao selecionar a requisição;
- SQL continua recolhida por padrão;
- Atualizar, Exportar e Limpar foram agrupados no menu de mais ações, mantendo
  Pausar/Retomar como a única ação direta;
- a faixa de status agora mostra somente atividade, endereço e quantidade de
  eventos;
- o fluxo mantém paginação de eventos antigos, limitada inicialmente a 500
  eventos renderizados;
- foram atualizados os testes e os guias de logs.

## Validação

- `npm run typecheck --workspace=@dev-dashboard/web`;
- `npm run test --workspace=@dev-dashboard/web -- project-logs-panel.test.ts`
  (os 5 testes passam; o comando encerra com falha apenas pelo limiar global de
  cobertura ao executar um único arquivo);
- `npx prettier --check` nos arquivos alterados;
- `npx eslint` no componente e no teste alterados.
