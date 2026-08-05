# Roadmap

## Objetivo e regras

O Dev Dashboard evolui sem interromper o CLI Bash. Toda entrega web deve manter
a API em `127.0.0.1`, usar catálogo fechado de ações, receber apenas IDs e
valores validados do navegador e preservar schemas explícitos de resposta.

Antes de concluir uma entrega:

```bash
npm run typecheck
npm run build
npm test
```

### IDE embutida, LSP e IA local — entregues (tasks 076–084)

- [ ] contexto via embeddings locais e restauração de abas/estado —
  candidatos grandes e independentes, mantidos em `docs/PENDENCIAS.md`.

### Git — leitura entregue, mutações pendentes

- [ ] confirmação por risco e histórico das mutações.

### Testes e catálogo — parcialmente concluídos

- [ ] modelo global de atividade sem duplicar fontes de verdade.

### CLI Bash — mantido e funcional

- [ ] cache da detecção inicial;
- [ ] estratégia deliberada para compartilhar regras com o web;

## Horizonte 1 — coerência operacional

### 1. Painel de atividade unificado

Projeção somente leitura de catálogo, testes e servidores, com origem,
durabilidade e navegação explícitas. Não cria um segundo histórico. Plano:
`docs/tasks/NEXT.md`.

Critério de saída: consultar atividades sem ampliar acesso a logs ou caminhos e
sem esconder diferenças de retenção entre os domínios.

### 2. Base de testes da interface

- testes montados dos componentes críticos;
- smoke E2E de workspace → projeto → execução → log;
- matriz de estados vazio, loading, erro, sucesso e troca de projeto;
- auditoria inicial de teclado e foco.

Critério de saída: os fluxos privilegiados principais deixam de depender apenas
de QA manual.

### 3. Página global de processos

- servidores e testes ativos;
- filtros fechados por workspace, projeto e tipo;
- links para o contexto do projeto;
- limpeza segura de estados e logs elegíveis;
- nenhuma execução arbitrária ou caminho exposto.

Critério de saída: identificar e encerrar um processo gerenciado sem percorrer
todos os projetos.

## Horizonte 2 — produtividade diária

1. **Git em etapas:** diff somente leitura; depois branch; pull/push; commit e
   stash, cada mutação com confirmação e histórico.
2. **Testes focados:** arquivo/caso reconhecido, cobertura e histórico
   persistente antes de migrar seus eventos para SSE.
3. **Rails de baixo risco:** migrations status, routes e diagnóstico Bundler;
   depois operações mutáveis com confirmação proporcional.
4. **Command palette:** busca e navegação por teclado, restrita a ações já
   autorizadas em suas telas — concluída (tasks 033 e 034).
5. **Configurações e notificações:** preferências de UI, retenção dentro de
   limites seguros e avisos locais de conclusão — concluído (tasks 022, 035 e
   040).
6. **Paridade CLI→Web seletiva:** trazer, uma por vez e com política de risco
   proporcional, capacidades hoje exclusivas do Bash — `git-save`
   (add+commit rápido com confirmação — concluído, task 041), `dev-clean`
   (lacuna real de logs órfãos sem estado correspondente — concluído,
   task 042), `dev-kill-port` (avaliado e adiado, task 042: mata qualquer
   PID dono da porta sem validar identidade de processo, o que conflita com
   `docs/architecture/security.md`), `git-pr` (compor e abrir a URL de
   criação de PR/MR a partir do remote `origin` já configurado, sem chamar
   API de provedor nem exigir token de terceiros — concluído, task 043),
   snapshot/restore de banco reconhecido (concluído, task 051), e **abrir o
   editor local do usuário** (`code <projeto>`/`cursor`/etc., catálogo
   fechado de editores conhecidos, sem shell — concluído, task 064).
   Integrações IA (`dev-claude`, `dev-ai-*`) permanecem opcionais e
   isoladas em um painel próprio, sem virar dependência do fluxo principal.

Critério de saída: executar o fluxo cotidiano principal no navegador sem criar
um terminal genérico disfarçado.

## Horizonte 3 — projetos maiores e integrações

- detecção de monorepos e scan recursivo opt-in, limitado por profundidade,
  quantidade, timeout e diretórios ignorados;
- [ ] perfis de ambiente sem valores secretos no frontend;
- [ ] GitHub CLI somente após revisão do modelo de autorização.

Critério de saída: atender repositórios complexos mantendo descoberta previsível
e integrações revogáveis.

## Horizonte 4 — extensibilidade e portabilidade

- manifesto declarativo de extensões e capacidades;
- adaptadores versionados e revisados;
- temas e painéis adicionais sem execução remota;
- compatibilidade macOS;
- estratégia separada para Windows, onde processos, sinais e filesystem têm
  semânticas diferentes;
- migração e backup versionados do estado local.

## Backlog de engenharia

### Qualidade

- [ ] Playwright/smoke E2E;
- [ ] lint e formatação automatizados (ESLint + Prettier padronizados
  entre `apps/` e `packages/`);
- [ ] medição de cobertura com metas por camada;
- [ ] doc da API gerada a partir dos JSON Schemas do Fastify e verificada
  contra as rotas registradas;
- [ ] changelog e release automatizados (ex.: changesets ou
  release-please), inclusive tag de versão da API;
- [ ] cache de detecção inicial no CLI Bash para reduzir custo de
  `detect_projects` em workspaces grandes;
- [ ] revisão dirigida do `npm audit` (a instalação atual sinaliza
  vulnerabilidades altas em dependências transitivas — devDeps novas
  como `vitest`/`jsdom`): abrir uma task específica para inventariar,
  decidir upgrades seguros e evitar `npm audit fix --force`, que pode
  subir major de dependências nossas com breaking changes;
- [ ] segunda passada nas duas classes de serviço que continuam acima de 400
  linhas (nenhuma API pública muda); todos os componentes Vue já foram
  concluídos na task 063. Inventário e decisões em
  `docs/architecture/refactoring-arquivos-grandes.md`.

### Operação e governança

- [ ] release automatizado e changelog;
- [ ] licença;
- [ ] documentação da API gerada ou verificada contra as rotas;
- [ ] política geral de migração/backup do estado;
- [ ] matriz de suporte de sistemas e runtimes;

### Descoberta e compatibilidade

- [ ] monorepos e scans recursivos opcionais;
- [ ] política explícita para symlinks;
- [ ] macOS;
- [ ] Windows.
