# Task 055 — Central de comandos ágil

## Status

Implementação concluída. A antiga navegação rápida virou uma central de
comandos com busca fuzzy, modos por prefixo, histórico local de recentes e
execução das operações já autorizadas pelo backend.

## Objetivo

Permitir que navegação e operações frequentes sejam iniciadas pelo teclado,
sem transformar a paleta em um terminal arbitrário nem contornar as
confirmações dos fluxos sensíveis.

## Resultado

- layout ampliado, com hierarquia por grupos, ícones, descrição, estado de
  risco e ajuda de teclado;
- busca fuzzy tolerante a abreviações e acentos;
- prefixos `>` para ações, `/` para páginas e `@` para projetos e workspaces;
- composição contextual `@projeto > ação`, sem precisar navegar primeiro até o
  projeto;
- autocomplete com `Tab` para aceitar o projeto ou completar a ação destacada;
- digitar `>` com um projeto destacado também aceita o projeto e abre seu
  catálogo de comandos;
- até seis comandos recentes persistidos localmente;
- execução direta, em duas etapas, de iniciar/parar servidor, suítes de teste
  detectadas e scripts habilitados do catálogo fechado;
- scripts mutáveis e destrutivos continuam exigindo o token de confirmação da
  API antes da execução;
- atalhos para sincronização, branches, commit e snapshots abrem a ferramenta
  correta já na aba correspondente;
- atalhos contextuais para Servidor, Logs, Git, Testes, Banco e Scripts aparecem
  apenas quando a capacidade existe no projeto selecionado;
- navegação completa para Servidor e Logs adicionada ao catálogo do projeto;
- seleção ativa acompanha o scroll e o foco continua preso ao diálogo.

## Segurança

A central não aceita shell livre. Todas as ações são derivadas de capacidades,
estado do processo e catálogos retornados pela API. Operações com parâmetros
ou contexto adicional abrem o painel especializado em vez de tentar preencher
dados implicitamente.

## Arquivos principais

- `apps/web/src/components/CommandPalette.vue`
- `apps/web/src/utils/command-palette.ts`
- `apps/web/src/styles/components/navigation.css`
- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/components/ProjectDatabasePanel.vue`
- `apps/web/test/command-palette.test.ts`

## Validação

- `npm run typecheck` aprovado;
- `npm run build` aprovado;
- suíte web completa aprovada: 58 arquivos e 240 testes;
- testes direcionados da paleta e dos painéis Git/banco aprovados: 39 testes;
- suíte da API aprovada: 310 testes.

## Limitações

Branch, commit, sincronização e snapshot dependem de formulários ou escolhas
adicionais; por isso a central abre diretamente a área correspondente, sem
executar essas mutações às cegas. A verificação visual em navegador real pode
ficar limitada neste ambiente caso o navegador em nuvem continue bloqueando a
origem local e o Playwright siga sem binário Chromium instalado.

A suíte global também depende da enumeração de interfaces de rede. Neste
ambiente, 12 testes preexistentes do `process-manager` que abrem processos ou
portas falharam com `uv_interface_addresses`; os pacotes e testes relacionados
à entrega passaram normalmente.
