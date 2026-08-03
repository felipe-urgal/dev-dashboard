# Task 069 — Favoritos persistentes por projeto

## Status

Concluída.

## Objetivo

Permitir destacar projetos usados com frequência sem alterar os repositórios
descobertos nem sincronizar a preferência externamente.

## Escopo entregue

- preferência associada ao identificador estável do projeto e persistida em
  `project-favorites.json` no diretório privado de configuração local;
- favoritos reaplicados depois de cada scan, mantendo a descoberta de projetos
  independente de preferências do usuário;
- rota privada `PUT /api/projects/:projectId/favorite`, com parâmetros, corpo e
  resposta validados por schemas fechados;
- estrela sempre visível e acessível por teclado em cada linha da visão geral;
- favoritos no topo da lista e ordenação alfabética dentro de cada grupo;
- atualização otimista no frontend, bloqueio de cliques concorrentes no mesmo
  projeto e rollback com aviso quando a API falha;
- referências a projetos temporariamente ausentes preservadas e simplesmente
  ignoradas até que eles voltem a aparecer em um scan.

## Decisões

- a preferência não é removida automaticamente quando o projeto some de um
  scan, evitando perda de estado por workspace desmontado ou indisponível;
- a estrela fica sempre visível, sem depender de hover, para funcionar também
  com teclado e dispositivos de toque;
- a primeira versão usa ordenação no topo e não adiciona um filtro "Somente
  favoritos", mantendo a interface compacta;
- o repositório limita a configuração a 1.000 identificadores e valida o
  tamanho de cada chave antes de gravar.

## Segurança

- o arquivo é criado em diretório `0700`, gravado atomicamente e mantido com
  permissão `0600`;
- somente identificadores de projetos já conhecidos pelo `ProjectStore` podem
  ser alterados pela rota;
- nenhum caminho ou arquivo do projeto é lido ou modificado para persistir a
  preferência;
- a rota permanece atrás da autenticação local já aplicada a `/api`.

## Critérios de aceite

- marcar ou desmarcar um projeto sobrevive a um novo scan e ao reinício da API;
- um favorito aparece antes dos demais projetos;
- falha de persistência restaura o estado anterior na interface;
- a ação possui nome acessível, estado `aria-pressed` e foco visível;
- corpo inválido e projeto inexistente recebem respostas controladas.

## Validação

- `npm run typecheck` passou em todos os workspaces;
- `npm run build` passou para packages, API e frontend;
- scripts (6), API (350), web (265), core (11) e project-discovery (1)
  passaram na suíte completa;
- `process-manager`: 37 passaram e 14 falharam por limitações conhecidas do
  ambiente isolado (`os.networkInterfaces()`, processos destacados e
  temporização de locks), sem relação com favoritos;
- o novo cenário E2E compilou, mas a execução renderizada ficou bloqueada: o
  navegador remoto recusou `localhost` e o Chromium do Playwright não está
  instalado neste ambiente;
- testes cobrem o repositório privado, rota e rescan, ordenação e rollback do
  store, componente da estrela e integração da visão geral.

## PR

A preencher após a abertura do pull request.
