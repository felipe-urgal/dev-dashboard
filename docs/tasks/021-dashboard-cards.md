# Task 021 — Dashboard principal sobre os padrões compartilhados

## Status

Concluída.

## Objetivo

Executar o passo 5 da reforma definida em `docs/design/redesign-2026.md`: migrar o hero, o gerenciamento de workspaces, as métricas e a lista de projetos do dashboard principal para os componentes e tokens compartilhados.

## Escopo entregue

- O hero, o painel de workspace, as quatro métricas e a seção de repositórios agora são compostos sobre `<Card>`.
- O indicador de execução exclusivamente local passou a usar `<StatusBadge tone="neutral">` e texto em português.
- Superfícies, contornos, raios, cores, tipografia e espaçamentos próprios desses blocos foram substituídos pelos tokens do design system; permaneceram locais apenas grid, dimensões e comportamento responsivo específicos da tela.
- Cadastro, seleção, novo scan e remoção de workspace continuam ligados às mesmas ações do store, sem alteração de contrato ou chamada à API.
- Os estados carregando e vazio, a ordenação que mantém favoritos e a renderização dos projetos foram preservados.
- Uma suíte montada do `DashboardView` cobre a estrutura compartilhada e os fluxos interativos principais.

## Resultado visual

O hero deixa de usar gradientes, raio de 18 px e título responsivo de até 52 px; agora adota a superfície neutra, raio de 10 px e escala tipográfica densa de 20 px definidos pelos tokens. Workspace, métricas e repositórios passam a compartilhar exatamente o mesmo contorno e superfície. Essas diferenças são esperadas e seguem o princípio de ferramenta profissional sem decoração exclusiva por tela.

Não foi possível produzir captura automatizada porque o ambiente não disponibiliza Chromium, Chrome, Playwright ou Puppeteer. A árvore renderizada e os estados responsivos foram validados pela suíte montada e pelo build do frontend.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

A suíte web passou a 45 casos, incluindo três casos novos para o dashboard principal.

## Fora do escopo

- Toggle de tema e densidade.
- Reforma da sidebar e da topbar.
- Padronização global dos estados vazios e formulários de outras telas.
- Remoção integral do CSS legado.
