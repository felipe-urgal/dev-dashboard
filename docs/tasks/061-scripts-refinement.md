# 061 — refinamento do catálogo de Scripts

## Objetivo

Reduzir a aba Scripts ao que ela resolve melhor: descobrir, filtrar, executar e
acompanhar tarefas explícitas do projeto, sem repetir ações já atendidas pelas
áreas de Servidor, Testes e Banco de dados.

## Decisões

- remover a visão geral intermediária e abrir a página diretamente no Catálogo;
- manter somente as seções Catálogo e Execuções;
- usar uma única busca e manter origem, risco e categoria como filtros;
- ocultar hooks automáticos `pre*` e `post*`;
- direcionar scripts de servidor, testes e migrations para suas áreas próprias
  quando o projeto possui essas capacidades;
- preservar `build`, `lint`, `format`, `seed`, `codegen`, manutenção e demais
  tarefas explicitamente executáveis;
- aplicar a mesma curadoria às ações oferecidas pela central de comandos.

## Arquivos principais

- `apps/web/src/components/ProjectScriptsPanel.vue`
- `apps/web/src/components/CommandPalette.vue`
- `apps/web/src/utils/project-script-visibility.ts`
- `apps/web/src/scripts-explorer/`

## Critérios de aceite

- Scripts abre no Catálogo;
- a navegação local contém somente Catálogo e Execuções;
- scripts delegados e hooks não aparecem como cartões nem ações da paleta;
- scripts explícitos continuam selecionáveis e executáveis com a política de
  risco existente;
- histórico, logs, cancelamento e reconexão continuam disponíveis.

## Testes

- teste unitário da classificação por destino;
- teste montado do catálogo curado;
- teste estrutural das duas seções;
- typecheck, testes do workspace web e build de produção.

## Resultado

O catálogo ficou mais curto e direto, com leitura em lista compacta. A tela
explica quando comandos foram delegados ou ocultados, e a central de comandos
usa a mesma regra para não oferecer caminhos redundantes.
