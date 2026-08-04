# Próxima atividade

A task 089 adicionou projetos recentes por workspace com persistência privada,
registro apenas em navegação deliberada e prioridade explícita dos favoritos. A
task 090, executada em paralelo, entregou cache da detecção inicial do CLI. A
próxima melhoria operacional priorizada pela auditoria da task 086 é reduzir a
inconsistência entre confirmações e resultados das mutações Git.

## Task 091 — Política unificada de risco e histórico Git

### Objetivo

Criar um contrato comum para classificar, confirmar e registrar as mutações Git
já existentes, tornando previsíveis as operações de branch, sincronização,
commit, stash, arquivos e desfazer sem alterar seus comandos ou permitir shell
livre.

### Decisão principal

A API continuará sendo a autoridade das mutações. Cada operação reconhecida
será descrita por um catálogo fechado com identificador, nível de risco,
impacto resumido e exigência de confirmação. O histórico guardará apenas
metadados operacionais limitados, nunca comandos arbitrários, conteúdo de
arquivos, patches, credenciais ou caminhos absolutos.

### Escopo

- inventariar todas as operações aceitas por `GitMutationOperation` e rotas Git;
- definir níveis comuns de risco, inicialmente:
  - `read-only` para consultas, fora do histórico de mutações;
  - `write-safe` para alterações locais reversíveis;
  - `write-remote` para publicação ou remoção em remoto;
  - `destructive` para descarte, exclusão ou reescrita com impacto elevado;
- centralizar rótulo, descrição, risco e política de confirmação em catálogo
  compartilhado pela API e frontend;
- manter tokens de confirmação curtos, vinculados a projeto, operação e
  parâmetros normalizados, com uso único e expiração;
- criar histórico persistente e limitado de resultados das mutações:
  - projeto e workspace conhecidos;
  - operação do catálogo;
  - risco;
  - instante definido pelo servidor;
  - resultado `succeeded` ou `failed`;
  - código de erro controlado, quando houver;
- não registrar mensagens de commit, nomes sensíveis, caminhos, patches,
  stdout/stderr ou tokens de confirmação;
- expor uma rota paginada e autenticada para o histórico do projeto;
- adicionar uma visão compacta no painel Git, sem substituir o Histórico de
  commits;
- migrar confirmações existentes por etapas sem mudar o comportamento dos
  comandos Git;
- adicionar testes de catálogo, vínculo/expiração, persistência, limites,
  paginação, mascaramento e compatibilidade das rotas atuais;
- atualizar segurança, roadmap, pendências e documentação da task.

### Política inicial

- manter no máximo 200 eventos por projeto e 2.000 no total;
- retenção somente local, sem sincronização;
- evento escrito após a tentativa, inclusive em falha controlada;
- falha ao persistir histórico não transforma uma mutação bem-sucedida em
  falha, mas deve ser registrada no log interno da API;
- operações somente leitura não entram nesse histórico;
- catálogo fechado é a única fonte de rótulo e risco exibidos na UI.

### Critérios de aceite

- operações equivalentes usam o mesmo vocabulário de risco e confirmação;
- uma confirmação não pode ser reutilizada, trocada de projeto/operação ou
  aplicada após expirar;
- o histórico sobrevive ao reinício e respeita limites por projeto e globais;
- nenhum evento expõe conteúdo de arquivos, comandos livres, credenciais ou
  caminho absoluto;
- a UI diferencia histórico de mutações do histórico de commits;
- rotas Git existentes mantêm seus códigos e resultados funcionais;
- typecheck, build, testes e smoke E2E continuam aprovados.

### Fora do escopo

- undo automático universal;
- auditoria remota ou multiusuário;
- execução de comandos Git fornecidos pelo navegador;
- armazenamento de patches ou diffs no histórico;
- substituir o histórico de commits;
- alterar a estratégia atual de pull, push ou sincronização da `main`;
- integração com provedores externos.
