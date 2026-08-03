# Task 075 — Auditoria inicial de acessibilidade

## Status

Implementada em branch para revisão. A entrega cobre Visão geral, Atividade,
Processos e Configurações sem redesenhar os fluxos ou alterar contratos da API.

## Objetivo

Revisar as quatro páginas globais mais usadas com critérios objetivos de
landmarks, títulos, nomes e descrições acessíveis, comunicação de estado,
teclado, foco e contraste, corrigindo somente problemas confirmados.

## Auditoria realizada

### Landmarks e títulos

As quatro páginas usavam elementos `section`, porém o landmark principal não
possuía nome explícito. Cada página passou a usar `aria-labelledby` apontando
para o próprio título visível:

- `overview-title`;
- `activity-title`;
- `processes-title`;
- `settings-title`.

### Comunicação de estado

- o aviso de scan com diretórios ignorados passou a usar uma região de status
  educada;
- a Visão geral anuncia a quantidade de projetos resultante de busca e filtro;
- estados vazios causados por filtros passaram a ser regiões de status;
- Atividade e Processos anunciam refresh sem remover os dados válidos já
  exibidos;
- o horário de atualização de Atividade é comunicado por uma região atômica;
- a tabela de Processos recebeu caption acessível;
- `role="alert"` continua reservado às falhas que exigem atenção imediata.

### Controles e descrições

- o grupo de tecnologia da Visão geral agora possui `role="group"` e nome
  acessível;
- o formulário de Configurações recebeu nome acessível;
- switch e campos numéricos passaram a ter nomes curtos por `aria-labelledby`;
- descrições, limites e estado do navegador foram associados por
  `aria-describedby`;
- textos visuais de unidade foram marcados como decorativos porque o nome e os
  limites já são comunicados explicitamente.

### Teclado e foco

A inspeção das quatro páginas confirmou que os elementos interativos no escopo
são controles HTML nativos ou links do Vue Router. A ordem de foco permanece na
ordem do documento e não há lógica local que capture `Tab` ou crie armadilha de
foco. Os estilos existentes de `focus-within`, `focus-visible` específicos e o
outline padrão do navegador não foram removidos.

O modal global foi entregue separadamente no PR #160, com captura e restauração
de foco próprias. Esta branch não altera esse fluxo e será validada sobre a
`main` que já contém o modal.

### Contraste

O token `--text-dim` do tema claro usava `#8b95a6`. Ele tinha aproximadamente
3,02:1 sobre `--surface-1` (`#ffffff`), abaixo de 4,5:1 para texto pequeno.

O valor foi alterado para `#5f697d`, atingindo aproximadamente:

- 5,52:1 sobre `--surface-1`;
- 5,10:1 sobre `--surface-0`;
- 4,88:1 sobre `--surface-2`.

Os tokens `--text`, `--text-muted` e `--text-dim` do tema claro agora possuem
uma guarda automatizada exigindo ao menos 4,5:1 nas três superfícies básicas.

## Verificação automatizada

Foi adicionado `apps/web/test/global-accessibility-guard.test.ts`, sem nova
dependência. A suíte verifica:

- landmark nomeado e título referenciado nas quatro páginas;
- grupo de filtros, regiões de status e captions esperados;
- nomes e descrições explícitas dos controles de Configurações;
- contraste WCAG AA dos tokens de texto do tema claro nas superfícies 0, 1 e 2.

A guarda complementa os testes montados existentes de loading, estados vazios,
erros, filtros e preservação de dados durante refresh.

## Arquivos alterados

- `apps/web/src/views/DashboardView.vue`;
- `apps/web/src/views/ActivityView.template.html`;
- `apps/web/src/views/ProcessesView.vue`;
- `apps/web/src/views/SettingsView.vue`;
- `apps/web/src/styles/tokens.css`;
- `apps/web/test/global-accessibility-guard.test.ts`;
- `docs/tasks/075-initial-accessibility-audit.md`;
- `docs/tasks/NEXT.md`;
- `docs/tasks/README.md`.

## Critérios de aceite

- landmarks principais possuem nome derivado de título visível;
- controles no escopo possuem nome acessível e descrições pertinentes;
- erros, sucessos, refresh e resultados filtrados usam regiões proporcionais;
- tabelas de dados possuem nome ou caption;
- contraste dos tokens de texto básicos atende 4,5:1 no tema claro;
- nenhuma alteração de layout ou arquitetura da informação é introduzida;
- typecheck, build e suíte web passam no CI.

## Limitações

- esta não é uma certificação formal WCAG;
- a execução renderizada com leitor de tela real continua recomendada;
- contraste de componentes fora das quatro páginas deverá ser tratado em tasks
  próprias quando houver achado objetivo;
- tablet e mobile continuam fora desta auditoria transversal;
- a IDE embutida começa na task 076.

## Próxima atividade

Task 076 — Fundação da IDE embutida, conforme
`docs/tasks/076-embedded-ide-foundation-plan.md`.
