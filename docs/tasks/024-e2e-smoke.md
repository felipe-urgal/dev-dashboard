# Task 024 — Smoke E2E visual e responsivo

## Status

Concluída.

## Objetivo

Criar uma base pequena e reproduzível de smoke E2E para verificar que as rotas
principais renderizam e que tema, densidade e breakpoints continuam operáveis
em navegador real, cobrindo a lacuna deixada pela task 023.

## Escopo entregue

- Playwright configurado em `apps/web/e2e/`, com `playwright.config.ts` e
  `tsconfig.json` próprios, fora da árvore incluída pelo `typecheck`/`build`
  padrão do workspace web.
- `global-setup.ts` sobe a API compilada no modo de distribuição local em
  origem única (o mesmo de `npm run dev-web`), apontando
  `DEV_DASHBOARD_CONFIG_DIR` para um diretório temporário exclusivo do teste e
  seguindo o fluxo real de bootstrap de sessão de navegador (`#bootstrap=`).
  Nenhum estado em `~/.config/dev-dashboard` ou projeto pessoal é tocado.
- Fixture determinística: um workspace temporário com um único projeto Node
  (`sample-node-app`), suficiente para o dashboard detectar e exibir um
  projeto real sem depender do ambiente do desenvolvedor.
- Cobertura de navegação: `/`, `/activity`, `/processes`, o detalhe de projeto
  (navegado a partir do card, não por URL adivinhada) e a rota 404.
- Cobertura de tema e densidade: estado padrão, troca de cada opção e
  persistência após `page.reload()`.
- Cobertura responsiva: um cenário desktop (1280px) e um estreito (375px),
  validando ausência de overflow horizontal do documento e acesso aos
  controles globais de tema/densidade em qualquer largura; o link de
  navegação lateral só é exigido acima de 760px, breakpoint em que a sidebar
  já recolhe hoje sem substituto por drawer (fora do escopo).
- Um baseline visual determinístico (`tests/visual-baseline.spec.ts`) da
  sidebar, versionado em `tests/*-snapshots/`.
- Scripts `test:e2e` no workspace web e na raiz, e um job dedicado `Smoke E2E`
  no CI, separado da suíte unitária existente.

## Decisões e limitações

Duas falhas de overflow horizontal apareceram ao rodar a suíte pela primeira
vez e foram corrigidas por serem bugs reais e pontuais, não redesenho: o
`<code>` do caminho do workspace escaneado não quebrava linha
(`.scan-result code`), e a coluna única dos grids de métricas/projetos em
telas estreitas usava `1fr` em vez de `minmax(0, 1fr)`, impedindo que o
conteúdo interno encolhesse. Ambas as correções são CSS mínimo, sem mudança de
layout ou componente.

O baseline visual foi gerado neste ambiente Linux/Chromium; a CI usa o mesmo
par SO/motor, então nenhuma variante por plataforma é necessária por ora. A
política de atualização de baseline está documentada em `apps/web/e2e/README.md`.

## Verificação

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e
```

## Fora do escopo

- Cobertura E2E exaustiva de mutações ou processos do sistema operacional.
- Testes contra projetos reais do diretório pessoal.
- Redesign adicional ou drawer móvel completo — a navegação lateral continua
  recolhendo sem substituto abaixo de 760px.
- Suporte simultâneo a todos os motores de navegador na primeira entrega.
