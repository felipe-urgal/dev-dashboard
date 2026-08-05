# Oportunidades de produto e produtividade — auditoria de agosto de 2026

## Objetivo

Este documento registra funcionalidades novas que podem reduzir atrito no desenvolvimento diário com o Dev Dashboard e que, na auditoria realizada em 05/08/2026, não possuíam uma entrega equivalente implementada nem um item ativo e específico em `docs/PENDENCIAS.md`, `docs/tasks/NEXT.md` ou `docs/tasks/PARALLEL-WORK.md`.

A intenção não é substituir o roadmap nem criar uma segunda fila obrigatória. Este é um inventário de oportunidades, com valor, risco, tamanho, dependências e uma primeira fatia implementável. Uma oportunidade só deve migrar para `NEXT.md` depois de ser escolhida e ganhar critérios de aceite completos.

## Escopo revisado

A auditoria considerou:

- a visão de produto e os princípios local-first;
- a arquitetura do monorepo e a fronteira de segurança da API;
- os manifests raiz, da API e do frontend;
- os pontos de composição da API (`app.ts` e `app-context.ts`);
- as rotas e a arquitetura da informação do frontend;
- o inventário de 95 tasks concluídas;
- `roadmap.md`, `PENDENCIAS.md`, `NEXT.md` e `PARALLEL-WORK.md`;
- os PRs recentes, incluindo IDE/IA local, projetos recentes, cache do CLI, documentação da API, changelog, navegador local, perfis de ambiente e processos Rails auxiliares.

Referências principais:

- [`README.md`](../../README.md)
- [`docs/product/vision.md`](./vision.md)
- [`docs/architecture/overview.md`](../architecture/overview.md)
- [`docs/architecture/security.md`](../architecture/security.md)
- [`docs/design/information-architecture.md`](../design/information-architecture.md)
- [`docs/roadmap.md`](../roadmap.md)
- [`docs/PENDENCIAS.md`](../PENDENCIAS.md)
- [`docs/tasks/README.md`](../tasks/README.md)
- [`docs/tasks/NEXT.md`](../tasks/NEXT.md)
- [`docs/tasks/PARALLEL-WORK.md`](../tasks/PARALLEL-WORK.md)
- [`apps/api/src/app.ts`](../../apps/api/src/app.ts)
- [`apps/api/src/app-context.ts`](../../apps/api/src/app-context.ts)
- [`apps/web/src/router/index.ts`](../../apps/web/src/router/index.ts)

### Limitação da auditoria

O repositório não estava indexado para busca de código pelo conector do GitHub. Portanto, a verificação combinou os documentos ativos, o índice integral de tasks, manifests, composition roots, arquivos representativos e pesquisa no histórico de PRs. A expressão “não encontrado” neste documento significa “sem evidência nas fontes revisadas”, não uma prova matemática de ausência em cada linha do repositório.

## Leitura da arquitetura atual

O Dev Dashboard já deixou de ser apenas uma interface para Git. Hoje ele possui uma plataforma local ampla:

```text
CLI Bash preservado
        │
        ├── apps/api        Fastify, segurança, rotas e serviços
        ├── apps/web        Vue 3, router, painéis e IDE embutida
        └── packages
            ├── contracts
            ├── core
            ├── process-manager
            └── project-discovery
```

Os principais padrões que uma funcionalidade nova deve reutilizar são:

1. **Contratos compartilhados** entre API e frontend.
2. **Catálogo fechado de ações**, sem comando livre vindo do navegador.
3. **Caminhos derivados de IDs conhecidos**, nunca de entrada arbitrária.
4. **Processos gerenciados**, com identidade, logs limitados, cancelamento e encerramento gradual.
5. **Persistência local privada e versionada**, com limites de idade e quantidade.
6. **Confirmação proporcional ao risco** antes de mutações relevantes.
7. **Mascaramento de segredos** antes de qualquer conteúdo chegar à interface.
8. **Ações profundas no detalhe do projeto**, mantendo as páginas globais como resumo e navegação.

A composição atual da API é explícita e testável, mas já reúne muitos repositórios e serviços em `AppContext`. Novas frentes grandes devem evitar aumentar esse ponto de composição sem uma fronteira clara de módulo.

## Inconsistências documentais encontradas

Antes de promover qualquer oportunidade deste documento, vale executar uma reconciliação curta da documentação:

- `docs/tasks/README.md` já registra as tasks 091–095, mas `docs/tasks/NEXT.md` ainda nomeia a próxima entrega como “Task 091”. O próximo número livre é 096.
- `docs/PENDENCIAS.md` ainda apresenta projetos recentes por workspace como pendentes, embora a task 089 esteja concluída.
- partes de `docs/roadmap.md` ainda tratam cache do CLI, documentação da API, perfis de ambiente e Sidekiq/Webpack como pendentes, apesar das tasks 090, 091, 094 e 095.

Essas divergências não impedem o produto de funcionar, mas aumentam a chance de duas pessoas implementarem a mesma ideia ou escolherem um número de task já usado.

## Itens deliberadamente não repetidos

### Já implementados

Este documento não repropoõe:

- Git completo de leitura e principais mutações;
- histórico, diff, branches, sincronização, commit e stash;
- execução e histórico de testes e scripts;
- banco, snapshots, migrations, generators e Rake tasks;
- dependências e build de Rails/Node;
- Docker Compose, health checks, Sidekiq e webpack-dev-server;
- command center, favoritos, recentes, notificações e exportação de logs;
- editor Monaco, LSP, IA local e aplicação segura de edições;
- adaptadores para editor e navegador local;
- documentação de API e changelog automatizados.

### Já anotados como pendência

Também ficam fora desta lista por já possuírem registro ativo:

- política unificada de risco e histórico das mutações Git;
- execução de caso/`describe` e cobertura;
- embeddings locais e restauração das abas da IDE;
- aplicação dos perfis de ambiente a scripts;
- monorepos, scan recursivo e política de symlinks;
- integração com GitHub CLI após modelo de autorização;
- lint, formatação, cobertura interna, `npm audit` e refatoração dos serviços grandes;
- release/tags, licença, migração/backup do estado e compatibilidade de sistemas;
- manifesto de extensões, adaptadores e painéis adicionais.

## Matriz de oportunidades

| ID | Oportunidade | Valor diário | Tamanho | Risco inicial | Prioridade sugerida |
| --- | --- | --- | --- | --- | --- |
| OPP-01 | Doctor por projeto e onboarding guiado | muito alto | M | baixo | P0 |
| OPP-02 | Conselheiro de impacto após mudanças Git | muito alto | M | baixo | P0 |
| OPP-03 | Gerenciador seguro de Git worktrees | muito alto | M/L | médio | P0 |
| OPP-04 | Sessões de desenvolvimento com start/stop coordenado | muito alto | L | médio | P1 |
| OPP-05 | Inspetor seguro de portas locais | alto | S/M | baixo | P0 |
| OPP-06 | Preflight local antes de push/PR | alto | M | baixo | P0 |
| OPP-07 | Navegador estruturado de falhas de teste | alto | M | baixo | P1 |
| OPP-08 | Recursos de processos: CPU, memória e anomalias | alto | M | baixo | P1 |
| OPP-09 | Grafo de serviços e dependências locais | alto | L | médio | P2 |
| OPP-10 | Caixa de manutenção acionável | alto | M | baixo | P1 |
| OPP-11 | URLs locais estáveis por projeto | médio/alto | L | médio/alto | P2 |
| OPP-12 | Snapshot “continuar de onde parei” | médio/alto | M | baixo | P2 |
| OPP-13 | Assistente de limpeza de branches | médio | S/M | médio | P2 |
| OPP-14 | Cliente de API gerado e guarda de contrato | médio | M | baixo | Engenharia |

---

## OPP-01 — Doctor por projeto e onboarding guiado

### Problema

`npm run doctor` valida o próprio Dev Dashboard, mas o desenvolvedor ainda precisa descobrir manualmente por que um projeto gerenciado não inicia, não testa ou não encontra dependências.

### Proposta

Adicionar um diagnóstico somente leitura por projeto, com checks estruturados e ações recomendadas.

Checks possíveis:

- versão requerida e versão disponível de Node, Ruby, npm, pnpm, Yarn e Bundler;
- coerência entre `.ruby-version`, `.node-version`, `.nvmrc`, `engines` e lockfiles;
- dependências instaladas ou ausentes;
- ambiguidade de lockfile;
- disponibilidade de Docker, banco, Redis e executáveis reconhecidos;
- presença de arquivos esperados por Rails/Node;
- nomes de variáveis ausentes em relação a `.env.example`, sem ler ou devolver valores;
- portas configuradas ocupadas;
- diretórios de estado sem permissão adequada;
- capacidade detectada que não consegue ser executada no ambiente atual.

### Primeira fatia

Somente leitura, sem botão “corrigir tudo”. Cada resultado pode apontar para uma ação já existente: instalar dependências, iniciar banco, abrir configurações ou ajustar porta.

### Arquitetura sugerida

- contrato `ProjectDiagnosticReport` em `packages/contracts`;
- serviço `ProjectDoctorService` na API;
- detectores estáticos pequenos e independentes;
- rota `GET /api/projects/:projectId/doctor`;
- card de diagnóstico na visão geral do projeto;
- cache curto vinculado à versão do projeto e ao ambiente.

### Guardas

- nunca devolver valor de variável de ambiente;
- nunca instalar runtime automaticamente;
- não executar shell;
- checks com timeout curto;
- erro de um check não invalida o relatório inteiro.

---

## OPP-02 — Conselheiro de impacto após mudanças Git

### Problema

Depois de trocar de branch, sincronizar ou fazer pull, o desenvolvedor precisa lembrar se deve instalar dependências, rodar migrations, reconstruir imagens ou reiniciar processos.

### Proposta

Comparar o commit anterior e o novo commit e transformar arquivos alterados em recomendações claras.

Regras iniciais:

| Mudança detectada | Recomendação |
| --- | --- |
| `Gemfile`/`Gemfile.lock` | executar `bundle check` ou `bundle install` |
| lockfile Node | instalar dependências com o gerenciador detectado |
| migrations | revisar status e executar migration apropriada |
| Dockerfile/Compose | reconstruir serviço afetado |
| `.env.example` | revisar nomes de variáveis locais |
| configuração de servidor/worker | reiniciar processos relacionados |
| testes/configuração de testes | executar suíte ou arquivo relacionado |

### Primeira fatia

Somente recomendações após branch switch, pull e sincronização. O usuário escolhe cada ação; nada é disparado automaticamente.

### Arquitetura sugerida

- serviço puro de classificação de paths;
- captura dos SHAs antes/depois da mutação;
- contrato `ProjectChangeImpact`;
- apresentação no resultado da operação Git e na visão geral;
- deep links para painéis já existentes.

### Guardas

- sem leitura do conteúdo dos arquivos na primeira versão;
- sem execução automática;
- resultado limitado ao projeto e aos dois commits conhecidos;
- regras declarativas e testáveis.

---

## OPP-03 — Gerenciador seguro de Git worktrees

### Problema

Worktrees reduzem troca de contexto e são especialmente úteis para trabalhar em correções, features e agentes paralelos, mas hoje precisam ser gerenciadas manualmente pelo terminal.

### Proposta

Permitir listar, criar, abrir e remover worktrees vinculadas a um repositório conhecido.

Fluxos:

- listar worktrees existentes e branch associada;
- criar a partir de branch existente ou branch nova prefixada;
- abrir no editor local ou no editor embutido;
- registrar temporariamente a worktree como projeto detectado;
- mostrar processos ativos, dirty state e ahead/behind;
- remover somente após validações e confirmação.

### Primeira fatia

Listagem + criação + abrir no editor. Remoção fica para uma segunda fatia.

### Arquitetura sugerida

- novo serviço Git dedicado, sem ampliar `git-service.ts`;
- diretório derivado pelo servidor, por exemplo um root privado configurado ou uma pasta irmã controlada;
- IDs estáveis de worktree;
- integração com `ProjectStore` sem duplicar o repositório principal;
- bloqueio de branch já usada em outra worktree.

### Guardas

- navegador não envia caminho absoluto;
- nomes passam pela validação de branch existente;
- não remover worktree suja ou com processo gerenciado ativo;
- proteger branch atual, base padrão e worktrees bloqueadas;
- usar argumentos explícitos de Git, sem shell.

---

## OPP-04 — Sessões de desenvolvimento com start/stop coordenado

### Problema

Projetos modernos exigem servidor, banco, worker, webpack e serviços Docker. O dashboard gerencia essas peças, mas o usuário ainda inicia e encerra cada uma separadamente.

### Proposta

Criar sessões nomeadas que referenciem apenas ações já reconhecidas pelo dashboard.

Exemplo:

```text
Sessão “API completa”
1. banco
2. redis
3. servidor
4. sidekiq
5. webpack
```

Recursos:

- ordem e dependências explícitas;
- readiness/health check antes da próxima etapa;
- aplicação opcional de um perfil de ambiente por ID;
- rollback apenas dos processos iniciados pela sessão quando uma etapa falhar;
- botão único para encerrar os processos pertencentes àquela sessão;
- histórico resumido da última inicialização.

### Primeira fatia

Sessão por projeto, sem cruzar repositórios, usando somente processos e serviços já detectados.

### Guardas

- nenhum comando livre;
- somente IDs do catálogo atual;
- timeout e cancelamento por etapa;
- não parar processo preexistente que não tenha sido iniciado pela sessão;
- confirmação separada para etapas mutáveis.

---

## OPP-05 — Inspetor seguro de portas locais

### Problema

O produto detecta conflitos em contextos específicos e escolhe portas livres, mas não oferece uma visão simples de quem está ocupando uma porta e se o processo pertence ao dashboard.

### Proposta

Adicionar uma inspeção somente leitura de portas locais:

- porta e endereço de bind;
- processo gerenciado associado, quando houver;
- processo externo com PID/nome limitado, quando o sistema permitir;
- projeto ou serviço esperado;
- conflito atual;
- sugestão de próxima porta livre;
- deep link para o processo gerenciado.

### Primeira fatia

Linux, loopback e processos do próprio usuário. Nenhuma ação de encerramento externo.

### Relação com `dev-kill-port`

Esta proposta não reabre o comportamento inseguro de matar qualquer PID. O inspetor é somente leitura. Encerrar continua permitido apenas para processos cuja identidade o `ProcessManager` consegue validar.

### Arquitetura sugerida

- adaptador de sistema operacional isolado;
- rota global `GET /api/ports`;
- integração opcional na página Processos e no diagnóstico do projeto;
- limite de quantidade e timeout.

---

## OPP-06 — Preflight local antes de push/PR

### Problema

As ações de teste, build, dependências e Git existem, mas não há um resumo único dizendo se o estado atual está pronto para publicação.

### Proposta

Criar um preflight local composto por checks conhecidos:

- árvore Git e commits não enviados;
- upstream configurado;
- dependências coerentes;
- último teste/build ainda válido para o HEAD atual;
- migrations pendentes;
- health checks dos serviços necessários;
- arquivos grandes ou potencialmente sensíveis prestes a entrar no commit;
- documentação/changelog quando uma política do projeto exigir.

### Primeira fatia

Relatório somente leitura. Ações de correção são links para recursos existentes.

### Evolução posterior

Permitir executar uma sequência de checks seguros e salvar um resultado vinculado ao SHA e a uma assinatura da working tree. Qualquer mudança invalida o selo local.

### Guardas

- não afirmar que CI remoto passará;
- deixar claro o instante e o SHA da verificação;
- não fazer push nem abrir PR automaticamente;
- não ler segredos para classificar arquivos.

---

## OPP-07 — Navegador estruturado de falhas de teste

### Problema

O dashboard exibe logs e histórico, mas o desenvolvedor ainda precisa interpretar manualmente stack traces e localizar arquivos.

### Proposta

Introduzir parsers por runner que extraiam, quando possível:

- arquivo e linha;
- nome do teste;
- mensagem principal;
- trecho curto do stack;
- duração;
- status flaky suspeito por recorrência local.

A interface permitiria:

- abrir arquivo/linha no editor embutido;
- abrir no editor local;
- copiar um contexto limitado e mascarado;
- executar novamente o arquivo já reconhecido;
- navegar entre falhas sem percorrer o log inteiro.

### Primeira fatia

RSpec/Rails Test e Vitest/Jest, sem executar caso individual. A execução de caso/`describe` continua como frente separada já registrada em `PENDENCIAS.md`.

### Guardas

- parser tolerante: falha de parsing mantém o log normal;
- limites de texto e mascaramento existentes;
- paths validados contra o projeto;
- nenhuma dependência em serviço externo.

---

## OPP-08 — Recursos de processos: CPU, memória e anomalias

### Problema

PID, porta, estado e duração não mostram processos que continuam “running”, mas consomem memória excessiva, travam CPU ou geram subprocessos inesperados.

### Proposta

Exibir telemetria local limitada para processos gerenciados:

- CPU atual;
- RSS/memória;
- uptime;
- quantidade de processos no grupo;
- reinícios/falhas recentes;
- alerta simples de crescimento contínuo ou consumo fora do limite configurado.

### Primeira fatia

Snapshot atual na página Processos, sem histórico persistente.

### Guardas

- somente processos gerenciados e validados;
- sem telemetria remota;
- polling adaptativo apenas com a tela visível;
- limites amplos e opt-in para alertas;
- adaptador Linux primeiro.

---

## OPP-09 — Grafo de serviços e dependências locais

### Problema

O detalhe do projeto apresenta várias capacidades, mas não mostra como servidor, banco, Redis, worker, webpack, Docker e health checks se relacionam.

### Proposta

Criar uma topologia derivada de dados já detectados:

```text
browser
   ↓
web/server ──→ database
   ├────────→ redis ──→ sidekiq
   └────────→ webpack
```

O grafo deve mostrar:

- disponível, iniciando, saudável, degradado ou parado;
- origem da detecção;
- porta e health check;
- dependência bloqueante;
- ação contextual já autorizada.

### Primeira fatia

Visualização somente leitura por projeto. O start coordenado fica na OPP-04.

### Guardas

- não inferir dependências sem evidência;
- marcar relações como detectadas, configuradas ou sugeridas;
- nenhuma execução diretamente pelo grafo na primeira entrega.

---

## OPP-10 — Caixa de manutenção acionável

### Problema

A página de Atividade responde “o que aconteceu”. Falta uma visão separada de “o que precisa de atenção agora”.

### Proposta

Uma caixa local de manutenção composta por regras determinísticas:

- branches locais já integradas ou com upstream removido;
- stashes antigos;
- snapshots de banco perto do limite;
- logs/estados ocupando espaço relevante;
- processos falhos ainda persistidos;
- dependências desatualizadas já detectáveis;
- health checks degradados;
- commits locais sem upstream;
- projetos com diagnóstico crítico;
- worktrees abandonadas, quando a OPP-03 existir.

Cada item teria severidade, evidência, data e deep link. A caixa não duplica o histórico de eventos.

### Primeira fatia

Somente sinais não destrutivos e links. Limpezas continuam nas telas especializadas e com confirmação.

---

## OPP-11 — URLs locais estáveis por projeto

### Problema

Portas dinâmicas resolvem conflitos, mas mudam URLs e dificultam favoritos, callbacks locais e troca entre projetos.

### Proposta

Oferecer um proxy local opcional, limitado a `127.0.0.1`, com nomes estáveis sob `.localhost`, por exemplo:

```text
http://meu-projeto.localhost:<porta-do-proxy>
```

O proxy encaminharia apenas para processos gerenciados atualmente ativos.

### Primeira fatia

HTTP, uma única porta do proxy, sem editar `/etc/hosts` e sem TLS automático.

### Riscos e guardas

- revisar cookies, CORS, WebSocket e Host header;
- impedir proxy para destinos arbitrários;
- catálogo derivado de processos gerenciados;
- não expor na rede;
- feature flag e diagnóstico de conflito de porta;
- documentação clara de limitações para OAuth/callbacks HTTPS.

---

## OPP-12 — Snapshot “continuar de onde parei”

### Problema

Projetos recentes ajudam a reencontrar repositórios, mas não preservam o contexto operacional de uma sessão de trabalho.

### Proposta

Salvar um snapshot local e limitado com:

- workspace e projeto ativos;
- branch atual;
- páginas e arquivos abertos no editor;
- última execução de teste consultada;
- painéis abertos;
- processos gerenciados que estavam ativos;
- contagem de alterações Git, sem conteúdo;
- horário do snapshot.

Ao retornar, a interface restaura navegação e oferece reiniciar serviços; nunca reinicia processos automaticamente.

### Diferença para a pendência de restauração da IDE

A restauração de abas já está anotada junto à IDE. Esta oportunidade é mais ampla: representa a sessão operacional do workspace e pode existir mesmo sem abrir o editor embutido.

### Guardas

- metadados apenas;
- retenção curta e opção de limpar;
- paths internos representados por IDs ou caminhos relativos validados;
- nenhuma sincronização remota.

---

## OPP-13 — Assistente de limpeza de branches

### Problema

O CRUD de branches permite remoção, mas não ajuda a identificar branches que provavelmente já podem ser limpas.

### Proposta

Classificar branches locais por sinais:

- totalmente integradas à base configurada;
- upstream removido;
- sem commit exclusivo;
- sem atividade recente;
- associadas a worktree;
- protegidas por nome ou configuração;
- à frente/atrás da base.

A interface explicaria por que cada branch é candidata e permitiria selecionar ações.

### Primeira fatia

Somente branches locais já integradas à base e sem worktree. Sem remoção remota.

### Guardas

- nunca selecionar automaticamente branch atual, base padrão ou protegida;
- atualização do estado imediatamente antes da confirmação;
- recusar branch suja por worktree;
- exclusão forçada continua separada e explicitamente destrutiva.

---

## OPP-14 — Cliente de API gerado e guarda de contrato

### Problema

A documentação da API já é gerada a partir das rotas e schemas, mas o frontend ainda precisa manter clientes e tipos de integração manualmente. À medida que as rotas crescem, aumenta a chance de divergência entre schema, contrato e chamada.

### Proposta

Gerar uma camada de cliente interno a partir da mesma fonte usada por `docs:api`:

- método, URL e parâmetros tipados;
- tipos de resposta referenciando `packages/contracts` quando disponíveis;
- erros conhecidos por rota;
- suporte consistente a `AbortSignal`;
- guarda no CI contra rota sem cliente ou cliente apontando para rota removida.

### Primeira fatia

Gerar somente um manifesto TypeScript de rotas e um teste de drift. Não substituir todos os módulos de API em um único PR.

### Benefício

É uma melhoria de engenharia, não uma tela. Reduz trabalho repetitivo e risco nas futuras funcionalidades deste documento.

## Priorização recomendada

### Fase A — diagnóstico e redução de interrupções

1. **OPP-01 Doctor por projeto**
2. **OPP-05 Inspetor de portas**
3. **OPP-07 Navegador de falhas**
4. **OPP-06 Preflight local**

Essas frentes começam majoritariamente somente leitura e entregam valor sem ampliar muito a superfície de mutação.

### Fase B — contexto Git e continuidade

1. **OPP-02 Conselheiro de impacto**
2. **OPP-03 Worktrees**
3. **OPP-10 Caixa de manutenção**
4. **OPP-13 Limpeza de branches**

### Fase C — orquestração do ambiente

1. **OPP-04 Sessões de desenvolvimento**
2. **OPP-09 Grafo de serviços**
3. **OPP-12 Snapshot de continuidade**

### Fase D — conforto e escala

1. **OPP-08 Recursos de processos**
2. **OPP-11 URLs locais estáveis**
3. **OPP-14 Cliente de API gerado**

## Três primeiras tasks sugeridas

Após concluir ou replanejar a atividade atual de `NEXT.md`, e depois de corrigir a numeração documental, a sequência de menor risco seria:

### Task 096 — Project Doctor somente leitura

Entrega relatório estruturado para Node e Rails, com runtime, lockfile, dependências, serviços e nomes de variáveis esperadas. Sem correção automática.

### Task 097 — Inspetor seguro de portas

Entrega visão Linux/loopback, identifica processos gerenciados e conflitos, sem encerrar processos externos.

### Task 098 — Conselheiro de impacto Git

Entrega recomendações após switch/pull/sync com base apenas na lista de arquivos alterados entre dois SHAs.

## Critérios para promover uma oportunidade

Antes de mover um item para `NEXT.md`:

1. provar que não existe implementação equivalente;
2. escolher uma primeira fatia que caiba em um PR revisável;
3. definir contratos antes da UI;
4. reutilizar serviços existentes em vez de duplicar execução e histórico;
5. documentar o modelo de risco e os dados persistidos;
6. manter API em loopback e ações em catálogo fechado;
7. definir limites, timeout e comportamento de cancelamento;
8. incluir testes de sucesso, falha, troca de projeto e dados obsoletos;
9. reconciliar roadmap, pendências, índice de tasks e `NEXT.md` ao concluir.

## Recomendação final

A melhor próxima funcionalidade nova deste inventário é o **Doctor por projeto**. Ela ataca uma dor recorrente, reaproveita informações já detectadas, pode começar somente leitura, cria base para onboarding, preflight, manutenção e sessões de desenvolvimento, e não exige autorização externa nem uma nova classe de mutação privilegiada.
