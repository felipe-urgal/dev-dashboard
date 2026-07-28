# Task 037 — Reforma do painel de atividade

## Status

Concluída.

## Objetivo

Melhorar a leitura do painel global `/activity`, reunindo resumo,
filtros, busca, duração e acesso aos detalhes em uma superfície
operacional compacta e coerente com a página de processos.

## Escopo entregue

- Cabeçalho compacto com atualização manual e horário da última leitura.
- Resumo de atividades em execução, concluídas, com falha e total.
- Busca por nome da atividade, identificador ou nome do projeto.
- Barra única de filtros por workspace, projeto, origem e estado.
- Histórico tabular agrupado por data, com projeto, workspace, origem,
  início, duração, estado e acesso aos detalhes.
- Paginação compacta com intervalo visível e total de resultados.
- Layout responsivo que transforma as linhas em cartões legíveis em
  telas estreitas.
- Contadores calculados pela API antes do filtro de estado e da
  paginação, evitando resumos limitados à página atual.

## Decisões

- A busca é processada no `ActivityService`, sem executar comandos nem
  aceitar caminhos do navegador.
- O resumo respeita workspace, projeto, origem e busca, mas permanece
  estável ao alternar o filtro de estado.
- Estados cancelados ou desconhecidos continuam incluídos no total,
  mesmo sem ocupar uma métrica própria no resumo compacto.
- Atividades em execução atualizam sua duração localmente a cada
  segundo; atividades terminais usam o horário de conclusão.

## Testes

- `apps/api/test/activity-service.test.ts` cobre o resumo global e a
  busca sem diferenciar maiúsculas e minúsculas.
- `apps/web/test/activity.test.ts` cobre a serialização do novo filtro e
  o contrato do resumo.
- `apps/web/test/activity-view.test.ts` cobre tabela, origens, estados,
  contadores, projeto, workspace e ações de detalhe.
- `apps/web/test/css-architecture.test.ts` preserva os limites da
  arquitetura visual.

## Verificação

```text
npm run typecheck
npm run build
npm test
```

- `npm run typecheck`: concluído.
- `npm run build`: concluído com diretórios temporários de configuração
  e estado.
- `apps/api`: 206 testes concluídos.
- `apps/web`: 80 testes concluídos.
- `packages/core`: 8 testes concluídos.
- `packages/project-discovery`: 1 teste concluído.
- `packages/process-manager`: 26 de 38 testes concluídos no sandbox; os
  12 casos que iniciam ou inspecionam processos reais continuam
  bloqueados por `uv_interface_addresses` e pela restrição de `/proc`,
  sem relação com o painel de atividade.
- A prévia em navegador foi comparada com o mock escolhido; busca,
  limpeza de filtros, filtro de falhas, atualização e console foram
  verificados.

## Limitações

- O histórico de catálogo continua sujeito à retenção persistida e
  testes e servidores continuam refletindo apenas o estado gerenciado
  atual.
- A paginação visual aparece somente quando o resultado possui mais de
  uma página; a fixture de QA contém seis atividades.
