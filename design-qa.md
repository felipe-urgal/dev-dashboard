# QA visual — Commit simples

## Evidência

- fonte visual:
  `/workspace/scratch/560252e246ed/generated_images/call_x2xGltXdy9VXgqawlbtGStCs.png`
- implementação:
  `apps/web/src/components/ProjectGitCommitPage.vue`
- screenshot da implementação: indisponível;
- viewport pretendido: `1609 × 821`;
- pixels da fonte: `1756 × 896`;
- densidade da fonte: imagem raster exibida como referência desktop;
- estado esperado: aba Commit, modo **Novo commit**, alterações rastreadas
  disponíveis;
- estado da implementação: servidor Vite iniciado em `0.0.0.0:4173`, porém
  inacessível ao cloud browser.

## Tentativas de captura

1. `sites-preview start` não iniciou porque o mailbox
   `/tmp/sites-previewd/requests` não estava disponível.
2. O Vite foi iniciado diretamente na porta 4173.
3. O cloud browser tentou abrir `http://terminal.local:4173/` e recebeu
   `ERR_CONNECTION_REFUSED`.

## Interações primárias

As interações não puderam ser exercitadas no navegador. Foram cobertas por
testes de componente:

- alternar entre novo commit e amend;
- preencher a mensagem;
- criar commit com alterações rastreadas;
- carregar a mensagem do último commit;
- alterar o último commit.

## Console

Não foi possível inspecionar erros do console porque a implementação não ficou
acessível ao cloud browser.

## Comparação completa

Bloqueada: não existe screenshot browser-rendered da implementação para compor
a comparação lado a lado exigida.

## Comparação focada

Bloqueada pelo mesmo motivo. A região crítica seria o seletor de operação,
contexto da branch, textarea e botão principal.

## Superfícies de fidelidade

- fontes e tipografia: bloqueado sem captura;
- espaçamento e ritmo: bloqueado sem captura;
- cores e tokens: a implementação usa os tokens existentes do produto, mas a
  confirmação visual está bloqueada;
- imagens e assets: o layout não possui imagens; ícones usam Heroicons, a
  biblioteca já adotada pelo projeto;
- copy e conteúdo: conferidos em teste de componente e alinhados ao protótipo.

## Findings

- [P1] Ausência de evidência browser-rendered
  - Local: tela Commit.
  - Evidência: `terminal.local:4173` recusou a conexão.
  - Impacto: impede validar fidelidade, responsividade, foco, hover e console.
  - Correção: repetir a captura em um ambiente com `sites-preview` disponível.

## Histórico

- iteração 1: implementação concluída e servidor local iniciado;
- bloqueio: daemon de preview indisponível e cloud browser sem conexão;
- correções visuais pós-captura: não aplicáveis sem evidência.

## Checklist de continuação

1. iniciar o preview em ambiente com `sites-preview`;
2. abrir a aba Commit no projeto de fixture;
3. capturar `1609 × 821` no modo Novo commit;
4. comparar lado a lado com a fonte;
5. corrigir qualquer P0/P1/P2 antes do handoff visual.

final result: blocked
