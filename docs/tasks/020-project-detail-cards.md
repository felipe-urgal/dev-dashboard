# Task 020 — Painéis de detalhe sobre `<Card>`

## Status

Concluída.

## Objetivo

Executar o passo 4 da reforma definida em
`docs/design/redesign-2026.md`: fazer os cinco painéis internos de
projeto compartilharem superfície, contorno, raio, padding e estrutura
de cabeçalho por meio do componente `<Card>`.

## Escopo entregue

- `ProjectServerPanel`, `ProjectGitPanel`, `ProjectTestsPanel`,
  `ProjectDatabasePanel` e `ProjectScriptsPanel` agora têm `<Card
  padded>` como raiz.
- Títulos e descrições foram movidos para o slot `header`; botões e o
  estado do servidor foram movidos para o slot `actions`.
- As classes de superfície `.project-*-panel` e os quatro cabeçalhos
  ad hoc foram removidos. As regras compartilhadas restantes usam
  `.project-detail-card` e `.project-panel-heading`.
- O modo detalhado do servidor preserva a altura específica do log por
  meio de `.project-server-card-details`, sem recriar uma superfície.
- Um teste montado parametrizado cobre os cinco painéis, confirmando a
  raiz `.dd-card`, o layout compartilhado e o cabeçalho de `<Card>`.

## Resultado visual

Os painéis passam do padding legado de 22 px para o token
`--space-5` (20 px), do raio legado de 14 px para `--radius-md` (10
px) e usam integralmente `--surface-1` e `--border`. Essas diferenças
são esperadas: eliminam variações locais e aplicam o contrato único de
card. A captura automatizada não pôde ser produzida neste ambiente,
que não disponibiliza navegador Chromium; a estrutura renderizada foi
verificada pelos testes montados.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

A suíte web passou a 42 casos, incluindo cinco casos parametrizados
novos para os painéis.

## Fora do escopo

- Migração do hero, workspace e lista do dashboard.
- Padronização de formulários, mensagens e estados vazios.
- Tema e densidade.
