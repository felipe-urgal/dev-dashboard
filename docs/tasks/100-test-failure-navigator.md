# Task 100 — Navegador estruturado de falhas de teste

## Status

Implementada no PR #191, em validação final com o navegador de falhas, os
ajustes do Project Doctor e os fluxos seguros de atualização remota no Git.

## Contexto

A área de testes já executa suíte, arquivo específico e testes relacionados,
acompanha o processo em tempo real e mantém o log bruto. O painel também
classifica linhas como erro, aviso ou detalhe, mas ainda exige leitura manual
do texto para localizar cada falha.

A Task 098 foi concluída e esta entrega reutiliza sua política compartilhada
de confirmação, risco e histórico para as novas mutações remotas.

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
- nenhum comando automático e nenhuma rota adicional para os testes.

## Guardas

- caminhos absolutos só são aceitos quando pertencem ao diretório conhecido
  do projeto e são convertidos para caminho relativo;
- caminhos absolutos externos, segmentos `..` e extensões desconhecidas são
  descartados;
- o log bruto permanece disponível e nunca é substituído pelo parsing;
- falha no reconhecimento de um bloco não interfere na execução dos testes;
- ausência de contexto de rota não interrompe a montagem isolada do editor.

## Ajustes incorporados

- tipografia do título da topbar explicitamente alinhada ao token global;
- Project Doctor reconhece `.env.example` e `.env.sample` como arquivos de
  referência, priorizando `.env.example` quando ambos existem;
- saída resumida do pytest preserva a mensagem de asserção e usa o alvo apenas
  para identificar teste e arquivo;
- após um amend em branch publicada no origin, o painel oferece reenvio manual
  com `--force-with-lease` explícito, confirmação vinculada ao SHA remoto,
  recusa de branch protegida e registro no histórico de mutações;
- a aba Sincronização mostra a branch atual quando ela não é `main` e permite
  trazer commits do upstream configurado por `pull --ff-only`, sem merge ou
  rebase automático; branches divergentes e árvores sujas permanecem bloqueadas.

## Validação

- testes unitários dos parsers por família de runner;
- teste do fallback `.env.sample` no Project Doctor;
- testes de sucesso e rejeição por lease desatualizado;
- teste do fluxo amend → reenvio com lease na interface;
- testes independentes para o card da branch atual e para a sincronização da
  `main`, incluindo atualização por fast-forward e bloqueio por divergência;
- `npm run typecheck`;
- `npm run build`;
- `npm run docs:api:check`;
- `npm test`;
- Smoke E2E.

## Roteiro de QA

1. Executar um teste com falha reconhecida e confirmar que o navegador aparece
   acima do log sem esconder a saída original.
2. Abrir uma falha com arquivo e linha e confirmar que o editor embutido
   posiciona o cursor no local indicado.
3. Usar “Executar arquivo” e confirmar que somente o arquivo associado é
   iniciado após a ação explícita.
4. Em um projeto que use apenas `.env.sample`, verificar que o Doctor compara
   os nomes com `.env` e não exibe valores.
5. Confirmar que o título “Diagnóstico do projeto” usa a mesma família
   tipográfica das demais páginas.
6. Alterar o último commit de uma branch publicada e confirmar que “Reenviar
   com lease” aparece; a ação deve falhar caso o origin tenha mudado desde a
   confirmação.
7. Em uma branch rastreada que esteja atrás do origin, abrir Sincronização e
   usar “Atualizar local”; confirmar fast-forward sem commit de merge. Em uma
   branch divergente, confirmar que a ação permanece bloqueada.
