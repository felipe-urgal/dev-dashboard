# Roadmap

## Objetivo

Este roadmap organiza a evolução do Dev Dashboard sem interromper o CLI existente.

Cada fase deve entregar valor utilizável e manter:

```bash
npm run typecheck
npm run build
npm test
```

aprovados.

## Fase 0 — Fundação arquitetural

Status: concluída na branch `feat/web-foundation`.

Entregas:

- estrutura de monorepo;
- npm workspaces;
- TypeScript compartilhado;
- contratos de domínio;
- API Fastify;
- aplicação Vue;
- descoberta de projetos;
- workspaces persistentes;
- gerenciamento de processos;
- logs no navegador;
- comando único de desenvolvimento;
- testes iniciais;
- documentação da fundação.

Critério de conclusão:

- cadastrar workspace;
- detectar projetos;
- iniciar servidor;
- acompanhar logs;
- parar servidor;
- continuar utilizando o CLI.

## Fase 1 — Consolidação da fundação

Status: em andamento. A segurança e a confiabilidade do núcleo estão concluídas;
a distribuição local do build final é a próxima entrega.

Objetivo: preparar a base para operações mais sensíveis.

Entregas:

- [x] autenticação local por token;
- [x] validação de `Origin`;
- [x] política CORS explícita;
- [x] tratamento global de erros;
- [x] testes das rotas protegidas;
- [x] isolamento das configurações durante os testes;
- [x] schemas de resposta;
- [x] testes do Process Manager;
- [x] limpeza e retenção de logs;
- [x] diagnóstico de ambiente;
- [ ] script `dev-web`;
- [ ] configuração de produção local;
- [ ] frontend servido pela API no build final.

Critério de conclusão:

- navegador e API iniciados por um comando de instalação;
- rotas protegidas;
- processos cobertos por testes;
- build local independente do servidor Vite.

## Fase 2 — App shell e navegação

Status: parcialmente entregue.

Objetivo: transformar a tela inicial em uma aplicação escalável.

Entregas:

- [x] Vue Router;
- [x] layout principal;
- [x] visão geral com workspaces e repositórios;
- [ ] página global de processos;
- [ ] página de jobs e logs;
- [ ] configurações;
- [ ] painel de atividade;
- [x] estados vazios nos fluxos existentes;
- [ ] loading skeletons consistentes;
- [ ] sistema de notificações;
- [x] componentes reutilizáveis iniciais;
- [x] design tokens iniciais.

Critério de conclusão:

- navegação por URL;
- telas separadas;
- experiência consistente em desktop e tablet.

## Fase 3 — Detalhe do projeto

Status: parcialmente entregue.

Objetivo: centralizar o contexto operacional de cada repositório.

Entregas:

- [x] rota `/projects/:id`;
- [x] cabeçalho do projeto;
- [x] abas por capacidade;
- [x] visão geral;
- [x] servidor;
- [x] logs;
- [x] metadados;
- [x] processos associados de servidor e teste;
- [x] comandos conhecidos de testes e scripts;
- [ ] histórico recente unificado.

Critério de conclusão:

- abrir um projeto e controlar suas principais funções sem voltar à home.

## Fase 4 — Git

Status: parcialmente entregue; consultas são somente leitura.

Objetivo: trazer o fluxo Git cotidiano com segurança.

Entregas:

- [x] status;
- [x] branch atual;
- [x] arquivos alterados;
- [x] commits recentes;
- [ ] criação e troca de branch;
- [ ] pull;
- [ ] push;
- [ ] commit;
- [ ] stash;
- [ ] diff resumido;
- [ ] confirmação para ações destrutivas;
- [ ] histórico de operações.

Critério de conclusão:

- executar o fluxo diário sem abrir outro terminal para operações comuns.

Dependência:

- autenticação local concluída.

## Fase 5 — Testes e scripts

Status: parcialmente entregue; testes podem ser executados e scripts possuem
catálogo somente leitura.

Objetivo: executar e acompanhar automações dos projetos.

Entregas:

- [x] testes Rails;
- [x] testes Node;
- [ ] arquivo específico;
- [ ] cobertura;
- [x] catálogo de scripts do `package.json`;
- [ ] execução de scripts do `package.json`;
- [ ] seleção de package manager para scripts;
- [x] jobs em memória representados por processos gerenciados;
- [x] cancelamento;
- [x] logs por polling durante a execução;
- [ ] histórico persistente de resultados.

Critério de conclusão:

- iniciar uma suíte, acompanhar e consultar o resultado pelo navegador.

## Fase 6 — Ferramentas Rails

Objetivo: alcançar paridade relevante com o CLI Rails.

Entregas:

- migrations;
- status de migrations;
- rollback;
- seed;
- prepare;
- Rake tasks;
- Bundler;
- Sidekiq;
- Webpack;
- routes;
- generators;
- credenciais;
- confirmações para operações de risco.

Critério de conclusão:

- as operações Rails mais frequentes estarem disponíveis no projeto.

## Fase 7 — Eventos e jobs em tempo real

Objetivo: substituir polling onde houver benefício.

Entregas:

- modelo persistente de jobs;
- Server-Sent Events;
- eventos de processo;
- eventos de log;
- progresso;
- cancelamento;
- histórico;
- painel de atividade.

Critério de conclusão:

- ações longas atualizarem a UI sem polling contínuo.

## Fase 8 — Command palette e produtividade

Objetivo: recuperar a velocidade do terminal dentro do navegador.

Entregas:

- `Ctrl+K` e `Cmd+K`;
- busca de projetos;
- troca de workspace;
- ações por contexto;
- recentes;
- favoritos;
- atalhos configuráveis;
- navegação por teclado.

Critério de conclusão:

- executar ações frequentes sem navegar por múltiplas telas.

## Fase 9 — Integrações

Possibilidades:

- GitHub CLI;
- abertura no editor;
- Docker Compose;
- notificações desktop;
- health checks configuráveis;
- perfis de ambiente;
- importação de repositórios;
- clonagem;
- templates de comandos.

Cada integração deve ser avaliada pelo modelo de segurança.

## Fase 10 — Extensibilidade

Objetivo: permitir recursos adicionais sem ampliar continuamente o núcleo.

Possibilidades:

- manifesto de plugin;
- capacidades declarativas;
- ações customizadas controladas;
- extensões por projeto;
- adaptadores;
- temas;
- painéis adicionais.

Não deve existir plugin arbitrário remoto sem revisão do modelo de ameaça.

## Backlog técnico

- [x] testes do Process Manager para o escopo atual;
- [x] testes das rotas Fastify para o escopo atual;
- testes dos componentes Vue;
- Playwright;
- lint e formatação;
- [x] CI;
- release automatizado;
- changelog;
- licença;
- migração de configuração;
- versionamento de estado;
- mascaramento de segredos;
- [x] rotação e retenção de logs;
- suporte a múltiplos bancos;
- detecção de monorepos;
- scans recursivos opcionais;
- symlinks;
- compatibilidade macOS;
- compatibilidade Windows.

## Critérios de priorização

As tarefas devem ser priorizadas por:

1. segurança;
2. confiabilidade;
3. valor diário;
4. redução de tarefas repetitivas;
5. reaproveitamento entre CLI e web;
6. qualidade da experiência;
7. extensibilidade.

## Estratégia de branches

Sugestão inicial:

```text
feat/web-foundation
feat/local-security
feat/app-shell
feat/project-details
feat/git-status
feat/git-actions
feat/test-runner
feat/rails-tools
feat/jobs-and-events
feat/command-palette
```

Cada branch deve:

- partir da `main` atualizada;
- possuir escopo coerente;
- incluir testes;
- atualizar documentação quando necessário;
- passar pelas validações;
- evitar mudanças não relacionadas.

## Próxima branch recomendada

Após o merge da fundação:

```text
feat/local-security
```

Escopo:

- token local;
- proteção de origem;
- CORS;
- testes de API;
- schemas de resposta;
- tratamento global de erros.

Esse trabalho deve acontecer antes das operações Git e de banco.

## Atualização — configuração de servidores locais

A branch `feat/api-response-schemas` também consolida a configuração de
servidores por projeto:

- porta fixa opcional ou seleção automática por projeto;
- validação de porta entre 1024 e 65535;
- erro explícito quando uma porta configurada está ocupada;
- binding dos servidores em `0.0.0.0`;
- acesso simultâneo por `localhost` e pelos IPv4 locais da máquina;
- argumentos de binding para Rails, Vite, Next, Nuxt e Astro;
- variáveis `HOST` e `PORT` para outros projetos Node;
- URLs acessíveis persistidas junto ao processo;
- cleanup de logs sem confiar em caminhos persistidos;
- schemas de erro compartilhados para respostas HTTP.

Ao iniciar um projeto, seu servidor fica acessível na rede local. A API do Dev
Dashboard continua restrita a `127.0.0.1`.
