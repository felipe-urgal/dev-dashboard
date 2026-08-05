# Task 100 — Navegador estruturado de falhas de teste

## Status

Em implementação na branch `agent/task-100-test-failure-navigator`.

## Contexto

A área de testes já executa suíte, arquivo específico e testes relacionados,
acompanha o processo em tempo real e mantém o log bruto. O painel também
classifica linhas como erro, aviso ou detalhe, mas ainda exige leitura manual
do texto para localizar cada falha.

A Task 098 continua em paralelo na área Git. Esta entrega evita serviços e
componentes Git e não cria rota nova na API.

## Objetivo

Transformar a saída já disponível dos runners em uma lista navegável de
falhas, mantendo o log original como fonte de verdade.

## Escopo

- contrato compartilhado `TestFailure`;
- parsers pequenos para Vitest/Jest, Node Test Runner, RSpec,
  Rails Test/Minitest e pytest;
- nome do teste, mensagem, arquivo, linha, coluna, comparação esperado/obtido
  e stack resumido quando reconhecidos;
- lista de falhas acima do log;
- deep link para abrir arquivo e posição no editor embutido;
- repetição manual do arquivo relacionado;
- no máximo 20 falhas apresentadas e 50 estruturadas por parsing;
- nenhum comando automático e nenhuma rota adicional.

## Guardas

- caminhos absolutos só são aceitos quando pertencem ao diretório conhecido
  do projeto e são convertidos para caminho relativo;
- caminhos absolutos externos, segmentos `..` e extensões desconhecidas são
  descartados;
- o log bruto permanece disponível e nunca é substituído pelo parsing;
- falha no reconhecimento de um bloco não interfere na execução dos testes.

## Ajustes incorporados

- tipografia do título da topbar explicitamente alinhada ao token global;
- Project Doctor reconhece `.env.example` e `.env.sample` como arquivos de
  referência, priorizando `.env.example` quando ambos existem.

## Validação

- testes unitários dos parsers por família de runner;
- teste do fallback `.env.sample` no Project Doctor;
- `npm run typecheck`;
- `npm run build`;
- `npm run docs:api:check`;
- `npm test`;
- Smoke E2E.
