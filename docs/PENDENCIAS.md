# Atividades pendentes

Inventário consolidado do que ainda falta implementar no Dev Dashboard em
04/08/2026. Este documento elimina duplicações entre o roadmap, a visão de
arquitetura e os planos de task; itens concluídos continuam registrados em
`docs/tasks/`.

## Próximas entregas

- [ ] Validar e otimizar a navegação em tablet com E2E responsivo.

## Assistente de IA e IDE embutida — candidatos ainda sem plano detalhado

- [ ] Ferramentas de símbolo para o assistente (`get_symbol_definition`/
  `get_symbol_references`), adiadas da task 080 — exigem uma sessão de LSP
  iniciada pela própria API, sem depender do WebSocket do navegador.
- [ ] Contexto semântico via embeddings locais e restauração de abas/estado
  entre sessões, adiados da task 081 — exigem desenho próprio de índice,
  política de exclusão e tela de configurações.
- Teste E2E dedicado para compleção inline (ghost text): **tentado e
  descartado** na task 082 — o Monaco real cancela deterministicamente a
  requisição do provider por causa da própria máquina de debounce/versionamento
  interna do editor (`InlineCompletionsSource`), não por um bug no produto.
  Não reabrir sem uma estratégia diferente (ex. mockar o provider em vez de
  depender do ciclo real do Monaco).
- Smoke E2E dedicado para `propose_workspace_edit` (task 083 cobriu esse
  caminho com testes de unidade; estender o double do Ollama da task 082
  para emitir `tool_calls` dessa ferramenta fica como possibilidade
  futura, não bloqueante).

## Produto e fluxos operacionais

- [ ] Unificar a política de confirmação por risco e o histórico das mutações
  Git.
- [ ] Executar caso ou `describe` de teste específico e persistir relatórios de
  cobertura.
- [ ] Adicionar operações reconhecidas para Sidekiq, Webpack e credenciais
  Rails, mantendo catálogo fechado e mascaramento de segredos.
- [ ] Implementar um adaptador seguro para abrir destinos no navegador local.
- [ ] Adicionar projetos recentes por workspace, complementando os favoritos
  já entregues.
- [ ] Adicionar perfis de ambiente reutilizáveis sem armazenar segredos no
  frontend.
- [ ] Exportar logs com o mesmo mascaramento e os mesmos limites aplicados na
  tela.
- [ ] Avaliar GitHub CLI somente depois de definir seu modelo de autorização.

## Descoberta e projetos complexos

- [ ] Detectar monorepos e oferecer scans recursivos opt-in com limites de
  profundidade, quantidade, timeout e diretórios ignorados.
- [ ] Definir e implementar uma política explícita para symlinks.

## CLI Bash

- [ ] Criar cache da detecção inicial para workspaces grandes.
- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.
- [ ] Criar uma suíte própria para helpers não interativos, incluindo smoke de
  `git-*` e `_dev_*` puros.

## Qualidade e manutenção

- [ ] Expandir o Playwright para os fluxos privilegiados e para a matriz de
  vazio, carregamento, erro, sucesso e troca de projeto.
- [ ] Padronizar lint e formatação com ESLint e Prettier entre `apps/` e
  `packages/`.
- [ ] Medir cobertura e definir metas por camada.
- [ ] Gerar ou verificar a documentação da API a partir dos JSON Schemas e das
  rotas Fastify registradas.
- [ ] Fazer uma revisão dirigida do `npm audit`, inventariando dependências
  transitivas e upgrades seguros sem `npm audit fix --force`.
- [ ] Fazer a segunda etapa de refatoração de
  `git-service.ts` e `script-execution-service.ts` (574 e 628 linhas — este
  último cresceu de novo desde a Fase 7, ver
  `docs/architecture/refactoring-arquivos-grandes.md`), sem mudar a API
  pública.

## Distribuição, governança e compatibilidade

- [ ] Automatizar changelog, release e tags de versão.
- [ ] Definir e adicionar a licença do projeto.
- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Publicar a matriz de suporte de sistemas operacionais e runtimes.
- [ ] Validar e implementar compatibilidade com macOS.
- [ ] Definir uma estratégia específica para Windows, considerando diferenças
  de processos, sinais e filesystem.

## Extensibilidade futura

- [ ] Definir um manifesto declarativo de extensões e capacidades.
- [ ] Criar adaptadores versionados e revisados.
- [ ] Permitir temas e painéis adicionais sem execução remota.

## Avaliado e adiado

- `dev-kill-port`: não deve ser portado enquanto não houver validação segura da
  identidade do processo dono da porta; o comando atual pode encerrar um PID
  alheio ao dashboard.

## Fora do escopo atual

- shell livre, plugins remotos arbitrários e exposição da API na rede;
- integrações de IA como dependência do fluxo principal (o assistente
  continua opcional, local e isolado em seu próprio painel).

## Mapa da documentação Markdown

O repositório possui 103 arquivos Markdown versionados (confira com `git ls-files
'*.md' | wc -l`), sendo 85 em `docs/tasks/` (83 tasks numeradas, mais
`README.md` e `NEXT.md`). O mapa abaixo cobre os 18 arquivos restantes; as
tasks numeradas são detalhadas individualmente pelo índice de
`docs/tasks/README.md` para evitar manter duas listas históricas paralelas.

### Raiz e operação do repositório

| Arquivo | Papel | Estado de uso |
| --- | --- | --- |
| [`AGENTS.md`](../AGENTS.md) | Regras para agentes de implementação | Ativo |
| [`CLAUDE.md`](../CLAUDE.md) | Convenções equivalentes para outro agente | Ativo |
| [`README.md`](../README.md) | Entrada do projeto, instalação, uso e estado atual | Ativo |
| [`design-qa.md`](../design-qa.md) | Registro de QA visual dos painéis Git, referenciado por `docs/tasks/049-git-commit-simple.md` | Referência histórica |

### Aplicações

| Arquivo | Papel | Estado de uso |
| --- | --- | --- |
| [`apps/web/e2e/README.md`](../apps/web/e2e/README.md) | Execução e escopo do smoke E2E web | Ativo |

### Planejamento e produto

| Arquivo | Papel | Estado de uso |
| --- | --- | --- |
| [`docs/PENDENCIAS.md`](./PENDENCIAS.md) | Inventário consolidado e este mapa | Ativo, fonte de pendências |
| [`docs/roadmap.md`](./roadmap.md) | Horizontes, critérios e capacidades | Ativo, visão estratégica |
| [`docs/product/vision.md`](./product/vision.md) | Visão e limites do produto local | Ativo, referência de produto |

### Arquitetura e segurança

| Arquivo | Papel | Estado de uso |
| --- | --- | --- |
| [`docs/architecture/overview.md`](./architecture/overview.md) | Arquitetura atual e critérios de módulos | Ativo |
| [`docs/architecture/security.md`](./architecture/security.md) | Modelo de segurança e limites locais | Ativo |
| [`docs/architecture/embedded-ide-ai-design.md`](./architecture/embedded-ide-ai-design.md) | Desenho da IDE embutida, LSP e assistente de IA local | Implementado (tasks 076–083) |
| [`docs/architecture/docker-compose-design.md`](./architecture/docker-compose-design.md) | Desenho da integração Docker Compose | Referência implementada |
| [`docs/architecture/local-editor-design.md`](./architecture/local-editor-design.md) | Desenho do adaptador de editor local | Referência implementada |
| [`docs/architecture/refactoring-arquivos-grandes.md`](./architecture/refactoring-arquivos-grandes.md) | Inventário e plano de refatoração | Ativo, parcialmente pendente |

### Design, protótipos e refatoração

| Arquivo | Papel | Estado de uso |
| --- | --- | --- |
| [`docs/design/information-architecture.md`](./design/information-architecture.md) | Organização das áreas e navegação | Ativo |
| [`docs/design/redesign-2026.md`](./design/redesign-2026.md) | Decisões do redesign e tokens visuais | Ativo |
| [`docs/prototypes/README.md`](./prototypes/README.md) | Índice e política dos protótipos versionados | Referência |
| [`docs/refactor/rake-tasks-mapeamento.md`](./refactor/rake-tasks-mapeamento.md) | Desenho e heurísticas da detecção de Rake tasks (task 066) | Referência implementada |

### Tasks

| Arquivo ou conjunto | Papel | Estado de uso |
| --- | --- | --- |
| [`docs/tasks/README.md`](./tasks/README.md) | Índice individual de `001` a `083`, com uma entrada para cada arquivo numerado | Ativo, mapa do histórico |
| `docs/tasks/001-083-*.md` | Objetivo, decisões, arquivos e validação reais (ou plano, quando ainda não implementada) de cada entrega | Histórico + planos em aberto |
| [`docs/tasks/NEXT.md`](./tasks/NEXT.md) | Plano executável da próxima entrega | Ativo, substituído a cada task |

Para conferir a cobertura do mapa, use `git ls-files '*.md'`. Um Markdown novo
deve entrar na seção correspondente acima ou, se for uma task numerada, no
índice `docs/tasks/README.md`. Protótipos cuja proposta já foi implementada
são removidos (não catalogados aqui) — ver a política em
`docs/prototypes/README.md`.

## Como manter este inventário

Ao concluir uma atividade, remova-a daqui, registre o resultado no documento da
task e reconcilie `docs/roadmap.md`, `docs/tasks/NEXT.md` e o mapa acima. Ideias
novas só entram nesta lista quando representarem trabalho de produto,
engenharia ou governança ainda necessário; limitações deliberadas permanecem
em “Fora do escopo atual”.
