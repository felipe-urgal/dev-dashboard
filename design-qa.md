# Design QA — Sincronização simples da main

## Evidências

- Fonte visual: `/workspace/scratch/560252e246ed/generated_images/call_XqTEG62WAsQMbdByaXAzirKm.png`
- Dimensões da fonte: 2025 × 775 px
- Viewport-alvo: 1580 × 606 CSS px, densidade 1
- Estado-alvo: aba Sincronização ativa, `main → origin/main`, estado
  sincronizado e ação disponível
- Screenshot da implementação: indisponível

## Bloqueio

A implementação foi compilada e os testes de componente renderizaram os
estados esperados, mas a prévia não pôde ser exposta ao navegador da nuvem.
O Vite não consegue escutar em `0.0.0.0` neste container porque
`uv_interface_addresses` falha, e o serviço `sites-preview` não conseguiu
resolver o diretório do projeto no ambiente do daemon. A tentativa direta em
`http://terminal.local:4173/` resultou em `ERR_CONNECTION_REFUSED`.

Sem uma captura renderizada pelo navegador não é possível produzir a
comparação conjunta obrigatória entre fonte e implementação.

## Superfícies avaliadas

- Tipografia: tokens e família existentes foram preservados; comparação visual
  final bloqueada.
- Espaçamento e ritmo: estrutura implementada conforme o painel único do
  protótipo; comparação visual final bloqueada.
- Cores e tokens: apenas tokens existentes de superfície, borda, accent e
  sucesso foram usados; comparação visual final bloqueada.
- Imagens e assets: não existem imagens raster no painel; ícones usam a
  biblioteca Heroicons já adotada pelo produto.
- Copy: `main → origin/main`, `Sincronizado`, `Sincronizar` e o texto de apoio
  correspondem ao protótipo selecionado.

## Interações

- Testes de componente cobrem a aba padrão, a ordem do menu, a única ação e a
  sequência confirmação → sincronização.
- Testes do serviço cobrem fetch de `upstream`, checkout da `main`, merge de
  `upstream/main` e push para `origin/main`.
- Console do navegador: não verificado, pois a página não pôde ser aberta.

## Histórico de comparação

- Não houve iteração visual válida: a captura inicial da implementação ficou
  bloqueada pela indisponibilidade da prévia.

## Findings

- [P1] Comparação visual e verificação de navegador indisponíveis.
  - Local: tela Sincronização.
  - Evidência: fonte disponível, implementação sem screenshot renderizado.
  - Impacto: tipografia, proporções e comportamento real não podem receber o
    aceite visual final.
  - Correção: abrir a aplicação em um ambiente onde a prévia local seja
    acessível e repetir a captura no mesmo viewport.

## Checklist

- [x] Fonte visual resolvida.
- [x] Implementação compilada.
- [x] Testes de serviço e componente.
- [ ] Captura da implementação no navegador.
- [ ] Comparação visual conjunta.
- [ ] Console e interação primária no navegador.

final result: blocked
