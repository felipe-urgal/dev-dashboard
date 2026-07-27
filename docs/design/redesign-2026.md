# Redesign 2026 — Etapa 1: revisão e decisões

## Contexto

O dashboard web cresceu por vertical (workspaces → projetos → servidor
→ testes → banco → scripts → atividade → processos → Git). Cada
entrega trouxe seu próprio bloco de CSS ao final de `apps/web/src/styles.css`,
com paletas ligeiramente diferentes e tamanhos de fonte definidos por
componente. O arquivo passou de 1700 linhas com **>40 tons de cinza
distintos** e **113 declarações `font-size`**. Antes de continuar
adicionando telas (task 018+), este documento fixa princípios, tokens
e padrões para a **etapa 2** (reforma incremental do CSS).

Escopo desta etapa: **decisão registrada**. Não escrever CSS aqui.

## Princípios

1. **Ferramenta profissional, não app de consumo.** Densidade acima
   de estilo, informação acima de decoração, atalhos acima de gestos.
2. **Local-first, sem branding forte.** Cores discretas, sem
   gradientes, sem imagens; a aplicação vive junto de outros
   terminais e IDEs.
3. **Consistência entre telas > pico de acabamento em uma tela.**
   Padrão de card, botão, badge e formulário é o mesmo em toda parte;
   nenhuma tela "especial".
4. **Nenhum estado só por cor.** Cor sempre acompanha rótulo, ícone
   textual ou posição.
5. **Reforma incremental.** Tela por tela, sob o teste montado
   correspondente. Nenhuma migração big-bang.

## Tokens

Base 4 px para espaço; escala tipográfica pequena porque a densidade
é alta. Não incluir tokens que ninguém vá usar — os listados abaixo
cobrem 100% das necessidades atuais.

### Cores (paleta neutra + accents)

```
--surface-0   fundo da página
--surface-1   fundo de card / sidebar
--surface-2   fundo de input / cabeçalho de card
--surface-3   overlay (menu, popover)

--border      contorno padrão
--border-strong contorno destacado (input em foco, card selecionado)

--text        texto principal (~#e1e5ed hoje)
--text-muted  texto secundário (~#778195)
--text-dim    metadados (~#495265)

--accent          azul principal (links, foco)
--accent-strong   variante mais escura para hover
--accent-soft     fundo suave (botão selecionado, badge de origem)

--success / --warning / --danger / --info
  em duas variantes: --*-text e --*-surface (para pares fundo/texto de badge)
```

Substitui os >40 cinzas hoje presentes em `styles.css`. Cada token
recebe valor claro e escuro (via `[data-theme='dark' | 'light']`);
default = escuro (o produto sempre foi assim).

### Tipografia

Uma família de fontes só, sans-serif do sistema. Escala fechada:

```
--font-xs   10 px  (metadados, chips)
--font-sm   11 px  (corpo padrão de cards, tabelas densas)
--font-md   13 px  (títulos de card e formulário)
--font-lg   16 px  (h2 de tela)
--font-xl   20 px  (hero da dashboard)
```

Weight: `500` no corpo, `600` em títulos e badges. Nada de `800`
espalhado como hoje.

### Espaço, raio, sombra

```
--space-1 4px  --space-2 8px  --space-3 12px  --space-4 16px
--space-5 20px --space-6 24px --space-8 32px
--radius-sm 6px  --radius-md 10px  --radius-lg 14px
--shadow-1  overlay leve
--shadow-2  popover / modal
```

Nenhuma sombra em card comum — a hierarquia vem do fundo (`--surface-1`
vs `--surface-2`) e do contorno.

## Padrões de componente

Padrões descritos como contrato. A etapa 2 vai transformar cada um em
classe utilitária ou componente Vue reutilizável.

### App shell

- **Sidebar fixa** em desktop, colapsa a ícones em ≤1024 px, vira
  drawer em ≤720 px.
- **Topbar** contém: eyebrow + título da tela; status da API; slot
  para ação primária local da tela (ex.: "Novo workspace", "Atualizar").
- **Content** rola verticalmente; largura máxima 1200 px, sem
  centralizar em telas maiores (perde referência visual).

### Cards de conteúdo

Um único padrão: `surface-1` + `--border`, radius `--radius-md`,
padding `--space-5`. Cabeçalho com `eyebrow` opcional + `h3` + ação
secundária alinhada à direita. Substitui todos os
`.project-*-panel`, `.script-card`, `.database-card`, `.activity-item`.

### Listas de item

Uma linha por item: chip de status (badge), título/link, metadados
menores. Já é o formato de `activity-list`, `git-file-list`,
`git-commit-list`; passam a compartilhar a mesma classe base.

### Badges

Contrato único: fundo `--*-surface`, texto `--*-text`, radius `999`,
padding `2px 8px`, `font-xs`, letter-spacing pequeno. Um único
componente `<StatusBadge tone="running|succeeded|failed|cancelled|unknown|neutral" />`.
Substitui todos os `.activity-status-*`, `.git-status-*`,
`.script-risk-*`, `.database-status-*` de hoje.

### Formulários

Grid 1 coluna por padrão, quebra em 2 acima de 900 px se houver mais
de 3 campos. `label` sempre acima do controle, `font-xs` + uppercase,
`--text-muted`. Botão primário: `--accent-soft` como fundo e
`--accent-strong` no texto; botão secundário: `--surface-2` + `--text`.

### Mensagens

- **Sucesso**: `--success-surface` + `--success-text`, `role="status"`.
- **Erro**: `--danger-surface` + `--danger-text`, `role="alert"`.
- **Aviso de mascaramento/retenção**: `--warning-surface` +
  `--warning-text`.
- **Empty state**: contorno tracejado `--border`, texto `--text-muted`,
  sempre com uma ação sugerida.

### Empty / loading / erro

Padrão único: mesmo container centralizado, altura mínima 140 px,
texto `--text-muted`. Loading pisca sutil em `--accent-soft`. Erro
mostra a mensagem exata do backend (o mascaramento já acontece lá).

## Densidade e tema

Duas densidades (**cômoda** = padrão, **compacta** para tabelas)
controladas por atributo `data-density` no `<html>`. Salvas em
`localStorage`.

Dois temas (**escuro** = padrão, **claro**), controlados por atributo
`data-theme`. O tema claro **precisa** ser validado — se ficar
inconsistente com a natureza local-first, é aceitável deixar para o
Horizonte 3.

## Arquivo `styles.css`

A reforma vai dividir o CSS em camadas:

```
apps/web/src/styles/
├── tokens.css        # variáveis (cores, tipografia, espaço)
├── reset.css         # normalização mínima
├── base.css          # elementos HTML nus (body, headings, links)
├── layout.css        # app shell, grids, breakpoints
├── components.css    # classes reutilizáveis (card, badge, empty)
└── utilities.css     # helpers raros (visually-hidden, etc.)
```

`styles.css` vira uma entrada que importa cada camada. Migração feita
componente a componente na etapa 2; o CSS antigo é removido apenas
depois que **todas** as instâncias antigas migraram e o teste montado
correspondente segue verde.

## Impacto nos contratos dos componentes

- `ProjectCard`, `ProjectGitPanel`, `ProjectServerPanel`,
  `ProjectTestsPanel`, `ProjectDatabasePanel`, `ProjectScriptsPanel`
  passam a compor sobre `<Card>` compartilhado.
- Todos os componentes que emitem badge passam a usar `<StatusBadge>`.
- Ícones de navegação continuam sendo caracteres unicode; nenhum
  novo asset externo.

Contratos de props/slots das views atuais **não mudam** — a reforma
é interna aos componentes.

## Framework de estilo

Continua **CSS puro com variáveis**. Justificativa: 100% do CSS atual
já é assim, os tokens fazem o trabalho de um design system compacto,
e Tailwind/UnoCSS trariam decisão sobre configurações, plugins e
purging sem benefício claro em um app com ~10 componentes visuais.
Se um dia isso mudar, fica registrado como decisão explícita — não
como derrapada.

## Roteiro da etapa 2 (reforma)

Ordem sugerida (uma PR por passo, cada uma verde nos testes montados
existentes):

1. **Entregue na task 018.** Introduzir `styles/tokens.css` e o
   esqueleto de camadas, com `styles.css` ainda contendo o CSS
   legado.
2. **Entregue na task 018.** Extrair `<Card>` compartilhado e migrar
   `ProjectCard`. A leve mudança visual (perda do gradiente
   decorativo do card) está alinhada ao princípio "informação acima
   de decoração" documentado acima; padding e conteúdo internos
   seguem iguais.
3. **Entregue na task 019.** Extrair `<StatusBadge>` e migrar
   `ActivityView`, `ProcessesView`, `ProjectGitPanel`,
   `ProjectDatabasePanel`, `ProjectScriptsPanel`. Cinco famílias de
   classes ad hoc (`activity-status-*`, `git-status-*`,
   `script-risk-*`, `database-status-*`) removidas do CSS legado.
4. Migrar painéis de detalhe do projeto para `<Card>` (Git, Server,
   Tests, Database, Scripts).
5. Migrar `DashboardView` (hero, workspace panel, lista de projetos).
6. Introduzir `data-density` e `data-theme` na sidebar.
7. Remover CSS legado desabilitado do `styles.css` original.

## Fora do escopo (documentado para não voltar)

- Rebranding, logo, ilustrações.
- Adotar biblioteca de UI externa (Radix, Reka, Naive UI, etc.).
- Redesenhar navegação principal — a `information-architecture` atual
  segue válida, só o vocabulário visual muda.
- Componentes de gráfico / dashboards analíticos (não fazem parte do
  produto).

## Critério de saída da etapa 2

- `apps/web/src/styles.css` reduzido a `@import` das camadas + no
  máximo 100 linhas de exceções documentadas.
- Nenhum `#hex` novo em componentes; tudo via `var(--token)`.
- Suíte `apps/web` mantém 100% dos testes verdes durante toda a
  migração.
- Regressão visual verificada tela a tela por comparação lado a lado
  antes e depois de cada PR da etapa 2.
