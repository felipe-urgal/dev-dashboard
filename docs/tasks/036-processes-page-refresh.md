# Task 036 — Reforma da página de processos

## Status

Concluída.

## Objetivo

Melhorar a leitura e a operação da página global `/processes`, deixando
estados, filtros e detalhes mais fáceis de percorrer e permitindo que a
limpeza manual remova imediatamente todos os processos finalizados sem
interromper processos ativos.

## Escopo entregue

- Cabeçalho compacto com ação contextual `Limpar finalizados` e texto
  explícito de segurança.
- Resumo de processos em execução, parados, com falha e total.
- Barra única de filtros por workspace, projeto, tipo e estado, além de
  atualização manual.
- Lista tabular responsiva com projeto, workspace, tipo, porta ou PID,
  duração, estado e acesso aos detalhes.
- Ordenação visual que mantém processos ativos antes dos estados
  terminais.
- Feedback acessível para sucesso e falha da limpeza.
- Modo explícito `removeAllTerminal` no `sweepStaleProcesses`, usado
  somente pelo `POST /api/processes/cleanup`.
- A retenção automática continua usando a janela configurada; apenas a
  limpeza solicitada pelo usuário ignora a idade dos estados terminais.
- Dependência `@heroicons/vue` para ícones de interface consistentes e
  acessíveis.

## Segurança

- A limpeza continua limitada aos arquivos de estado e log gerenciados
  pelo dashboard.
- Estados `stopped` e `failed` podem ser removidos imediatamente.
- Estados ativos só são preservados após a mesma validação existente de
  PID e diretório do processo; registros marcados como ativos cujo
  processo já morreu são tratados como terminais.
- Nenhum caminho, comando ou PID arbitrário é aceito pelo navegador.

## Testes

- `packages/process-manager/test/log-retention.test.ts` cobre a remoção de
  estado terminal recente e a preservação de processo realmente ativo.
- `apps/api/test/process-cleanup.test.ts` cobre a remoção imediata pela
  rota autenticada.
- `apps/web/test/processes-view.test.ts` cobre a nova tabela, contadores e
  limpeza de todos os finalizados com preservação do ativo.

## Verificação

```text
npm run typecheck
npm run build
npm test
```

- `npm run typecheck`: concluído.
- `npm run build`: concluído com diretórios temporários de configuração
  e estado.
- `apps/api`: 205 testes concluídos.
- `apps/web`: 80 testes concluídos.
- `packages/core`: 8 testes concluídos.
- `packages/project-discovery`: 1 teste concluído.
- `packages/process-manager`: 26 de 38 testes concluídos no sandbox; os
  12 casos que criam ou inspecionam processos foram bloqueados por
  `uv_interface_addresses` e pela restrição de leitura de `/proc`, sem
  falha de asserção na lógica terminal nova fora dessa limitação.

A comparação visual em navegador ficou bloqueada pelo isolamento das
dependências de workspace no ambiente de prévia.

## Limitações

- A lista continua refletindo o estado gerenciado atual; esta entrega não
  adiciona histórico novo.
- A atualização dos registros ainda ocorre por carregamento explícito,
  troca de filtro ou limpeza.
