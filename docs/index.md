# Dev Dashboard â documentaÃ§Ã£o do projeto

O **Dev Dashboard** Ã© uma aplicaÃ§Ã£o local para organizar, inspecionar e operar projetos de desenvolvimento Rails e Node por uma interface web, mantendo o CLI Bash existente como interface complementar.

Esta documentaÃ§Ã£o descreve o produto, a arquitetura, a organizaÃ§Ã£o do repositÃ³rio, os fluxos de execuÃ§Ã£o, as decisÃµes de seguranÃ§a, a operaÃ§Ã£o local e o processo de contribuiÃ§Ã£o. Ela deve ser lida como parte do cÃ³digo: quando o comportamento muda, o documento correspondente tambÃ©m precisa mudar.

## Para quem esta documentaÃ§Ã£o existe

| PÃºblico | O que encontrarÃ¡ aqui |
|---|---|
| Pessoa usuÃ¡ria | InstalaÃ§Ã£o, inicializaÃ§Ã£o, recursos disponÃ­veis e resoluÃ§Ã£o de problemas. |
| Pessoa desenvolvedora | Arquitetura, responsabilidades dos mÃ³dulos, padrÃµes de implementaÃ§Ã£o e testes. |
| Pessoa revisora | Limites de seguranÃ§a, contratos, fluxos mutÃ¡veis e critÃ©rios de qualidade. |
| Pessoa mantenedora | OperaÃ§Ã£o, persistÃªncia, evoluÃ§Ã£o, documentaÃ§Ã£o da API e organizaÃ§Ã£o do monorepo. |

## VisÃ£o do produto

O projeto resolve um problema comum de ambientes de desenvolvimento: cada repositÃ³rio possui comandos, processos, logs, banco de dados, testes e operaÃ§Ãµes Git diferentes. O Dev Dashboard oferece uma camada local Ãºnica para descobrir essas capacidades e executar apenas operaÃ§Ãµes conhecidas.

Os objetivos principais sÃ£o:

- centralizar projetos de vÃ¡rios diretÃ³rios de trabalho;
- detectar automaticamente projetos Rails e Node;
- oferecer uma interface rÃ¡pida e consistente para tarefas recorrentes;
- acompanhar processos e logs sem depender de vÃ¡rias janelas de terminal;
- executar operaÃ§Ãµes mutÃ¡veis com validaÃ§Ã£o e confirmaÃ§Ã£o explÃ­cita;
- manter a aplicaÃ§Ã£o restrita ao computador local por padrÃ£o;
- compartilhar regras entre API, frontend, pacotes TypeScript e CLI legado;
- preservar rastreabilidade por testes, contratos e documentaÃ§Ã£o versionada.

## Capacidades principais

### OrganizaÃ§Ã£o de workspaces e projetos

- cadastro persistente de workspaces locais;
- scan dos diretÃ³rios imediatamente abaixo de cada workspace;
- detecÃ§Ã£o de projetos Rails e Node;
- identificaÃ§Ã£o de capacidades por projeto;
- favoritos e navegaÃ§Ã£o global;
- diagnÃ³stico do ambiente do projeto.

### Desenvolvimento e execuÃ§Ã£o

- inicializaÃ§Ã£o e encerramento de servidores;
- seleÃ§Ã£o segura de porta e ambiente;
- acompanhamento de estado, PID e health check;
- leitura limitada e mascarada de logs;
- gerenciamento de processos em segundo plano;
- abertura de projeto no navegador do sistema.

### Git

- status, diff, histÃ³rico e detalhes de commits;
- criaÃ§Ã£o, troca, acompanhamento, renomeaÃ§Ã£o e exclusÃ£o de branches;
- sincronizaÃ§Ã£o com remotos permitidos;
- pull, push e commit;
- histÃ³rico de mutaÃ§Ãµes;
- operaÃ§Ãµes destrutivas protegidas por confirmaÃ§Ã£o;
- integraÃ§Ã£o com pull requests e desfazer de operaÃ§Ãµes reconhecidas;
- Code Review IA com provider/mode rastreÃ¡veis por execution.

### Assistente de IA multi-provider

- implementaÃ§Ã£o de mudanÃ§as descritas em linguagem natural usando Local/Ollama ou OpenAI cloud;
- seleÃ§Ã£o persistida de provider e modo (`fast`/`complete`) por projeto;
- consentimento explÃ­cito antes de enviar conteÃºdo do projeto para OpenAI;
- catÃ¡logo fechado de ferramentas sobre arquivos, busca, diff e sÃ­mbolos;
- investigaÃ§Ã£o obrigatÃ³ria do projeto antes de concluir alteraÃ§Ãµes concretas;
- prÃ©via de arquivos alterados com aprovaÃ§Ã£o explÃ­cita antes de qualquer escrita;
- validaÃ§Ã£o server-side de modelo antes da inferÃªncia;
- masking compartilhado antes de conteÃºdo textual alcanÃ§ar um provider;
- execuÃ§Ã£o em segundo plano, cancelÃ¡vel, com provider/modo/modelo registrados no snapshot.

### Qualidade e automaÃ§Ã£o

- descoberta e execuÃ§Ã£o de testes;
- execuÃ§Ã£o de arquivo especÃ­fico;
- catÃ¡logo seguro de scripts e tarefas;
- histÃ³rico persistente de execuÃ§Ãµes;
- acompanhamento em tempo real por SSE;
- inspeÃ§Ã£o de dependÃªncias, Bundler, migrations e routes Rails.

### Banco de dados e ambiente

- detecÃ§Ã£o de bancos e ambientes;
- identificaÃ§Ã£o de serviÃ§o local ou Docker;
- inicializaÃ§Ã£o de serviÃ§os reconhecidos;
- snapshots e restauraÃ§Ã£o protegida por confirmaÃ§Ã£o;
- perfis de ambiente reutilizÃ¡veis, com busca na lista e aviso de alteraÃ§Ãµes nÃ£o salvas;
- proteÃ§Ã£o contra persistÃªncia acidental de valores sensÃ­veis.

## Arquitetura em uma pÃ¡gina

```text
ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â Interfaces                                                   â
âââââââââââââââââââââââââââââââââ¬âââââââââââââââââââââââââââââââ¤
â CLI Bash                      â Dashboard Vue 3              â
â dev-tools / lib / init.sh     â http://127.0.0.1:5173       â
âââââââââââââââââ¬ââââââââââââââââ´âââââââââââââââ¬ââââââââââââââââ
                â                              â HTTP / SSE / WS
                â                              â¼
                â                 ââââââââââââââââââââââââââââââ
                â                 â API Fastify                â
                â                 â http://127.0.0.1:4343     â
                â                 ââââââââââââââââ¬ââââââââââââââ
                â                                â
                â¼                                â¼
ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â Pacotes e serviÃ§os                                           â
ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ¤
â contracts â core â project-discovery â process-manager       â
â serviÃ§os Git, testes, banco, Rails, scripts, arquivos e IA   â
âââââââââââââââââââââââââââââââââ¬âââââââââââââââââââââââââââââââ
                                â
                                â¼
ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â Sistema local e integraÃ§Ãµes explÃ­citas                       â
ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ¤
â filesystem â processos â Git â Node â Rails â bancos â Ollamaâ
â OpenAI API somente quando selecionada e autorizada           â
ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
```

A API Ã© a fronteira de seguranÃ§a. O navegador trabalha com identificadores e contratos estruturados; ele nÃ£o recebe permissÃ£o para enviar comandos livres ou caminhos arbitrÃ¡rios.

## PrincÃ­pios arquiteturais

1. **Local por padrÃ£o.** ServiÃ§os de desenvolvimento escutam em `127.0.0.1`; uso de IA cloud exige seleÃ§Ã£o e consentimento explÃ­citos.
2. **CatÃ¡logo fechado.** Comandos e argumentos sÃ£o escolhidos pela aplicaÃ§Ã£o, nÃ£o pelo navegador.
3. **Sem shell arbitrÃ¡rio.** Processos usam programa e argumentos separados, preferencialmente com `shell: false`.
4. **Identificadores em vez de caminhos.** Depois do scan, a maioria das operaÃ§Ãµes recebe `workspaceId`, `projectId` ou outro identificador controlado.
5. **DependÃªncias explÃ­citas.** ServiÃ§os sÃ£o construÃ­dos no contexto da API e entregues Ã s rotas.
6. **Contratos compartilhados.** Frontend e backend reutilizam tipos do pacote `contracts`.
7. **PersistÃªncia mÃ­nima e protegida.** ConfiguraÃ§Ãµes e estados usam diretÃ³rios locais restritos ao usuÃ¡rio.
8. **ConfirmaÃ§Ã£o para mutaÃ§Ãµes sensÃ­veis.** OperaÃ§Ãµes destrutivas ou irreversÃ­veis exigem uma etapa adicional.
9. **Observabilidade limitada.** Logs, diffs e histÃ³ricos possuem limites e mascaramento de segredos.
10. **DocumentaÃ§Ã£o junto do cÃ³digo.** ReferÃªncias automÃ¡ticas e guias manuais fazem parte da validaÃ§Ã£o do projeto.

## ServiÃ§os iniciados no desenvolvimento

ApÃ³s instalar as dependÃªncias, execute:

```bash
npm run dev
```

O comando inicia e encerra em conjunto:

| ServiÃ§o | EndereÃ§o | Responsabilidade |
|---|---|---|
| API | `http://127.0.0.1:4343` | Regras, persistÃªncia, processos e integraÃ§Ãµes locais. |
| Web | `http://127.0.0.1:5173` | Interface Vue para uso do dashboard. |
| Docs | `http://127.0.0.1:4545` | Central navegÃ¡vel e API JSON desta documentaÃ§Ã£o. |

Use `Ctrl+C` para encerrar o grupo de processos.

## Mapa da documentaÃ§Ã£o

### Comece por aqui

- [Primeiros passos](getting-started.md): requisitos, instalaÃ§Ã£o e primeiro uso.
- [VisÃ£o geral da arquitetura](architecture/overview.md): contexto e decisÃµes arquiteturais existentes.
- [Estrutura do repositÃ³rio](architecture/repository-structure.md): diretÃ³rios, camadas e dependÃªncias.
- [Fluxos de execuÃ§Ã£o](architecture/runtime-flows.md): o que acontece em cada operaÃ§Ã£o importante.

### Para usar o dashboard web, aba por aba

- [Guia passo a passo do dashboard web](guia/README.md): o que cada aba do projeto mostra, o que
  cada botÃ£o faz e qual comando roda por trÃ¡s â README, DiagnÃ³stico, Servidor, Logs, Git, Testes,
  Banco de dados, DependÃªncias, Scripts, Terminal/Console e VariÃ¡veis de ambiente.

### Para desenvolver

- [Guia de desenvolvimento](development-guide.md): scripts, padrÃµes, testes e como adicionar recursos.
- [IA no Dev Dashboard](architecture/ai-multi-provider.md): Code review com Ollama local fixo, sem seleÃ§Ã£o de provider nem consentimento cloud.
- [Playbook de correÃ§Ã£o de CI](ci-fix-playbook.md): passo a passo para diagnosticar e corrigir um PR com CI vermelho.
- [SeguranÃ§a](architecture/security.md): modelo de ameaÃ§a e controles obrigatÃ³rios.
- [Contribuindo](../CONTRIBUTING.md): fluxo de branch, commit, revisÃ£o e documentaÃ§Ã£o.

### Para operar e diagnosticar

- [OperaÃ§Ã£o e troubleshooting](operations-and-troubleshooting.md): portas, dados locais, logs e falhas comuns.
- [API da documentaÃ§Ã£o](documentation-api.md): endpoints da central de documentaÃ§Ã£o.
- [ReferÃªncia da API HTTP](architecture/api-reference.md): contratos gerados a partir das rotas Fastify.

### Planejamento

- [Roadmap histÃ³rico da IA multi-provider](../tasks/AI-MULTI-PROVIDER.md): sequÃªncia de PRs que criou a arquitetura.
- [Checklist de fechamento da IA multi-provider](../tasks/AI-MULTI-PROVIDER-FINALIZATION.md): P0/P1/P2 e estado atual do hardening.
- [PendÃªncias](../tasks/PENDENCIAS.md): inventÃ¡rio consolidado do que falta implementar.
- [PrÃ³xima tarefa](../tasks/NEXT.md): prÃ³ximo trabalho priorizado.

## GlossÃ¡rio essencial

| Termo | Significado no projeto |
|---|---|
| Workspace | DiretÃ³rio cadastrado que contÃ©m projetos imediatamente abaixo dele. |
| Projeto | AplicaÃ§Ã£o Rails ou Node detectada e mantida no `ProjectStore`. |
| Capacidade | Recurso reconhecido, como Git, testes, banco, scripts, Sidekiq ou Bundler. |
| Processo gerenciado | Processo iniciado e acompanhado pelo Process Manager. |
| CatÃ¡logo | Lista fechada de comandos ou aÃ§Ãµes detectadas pelo backend. |
| ConfirmaÃ§Ã£o | Token temporÃ¡rio vinculado a uma operaÃ§Ã£o mutÃ¡vel especÃ­fica. |
| DistribuiÃ§Ã£o local | Modo compilado em que a API tambÃ©m serve o frontend estÃ¡tico. |
| Contrato | Tipo e formato de dados compartilhado entre camadas. |
| Snapshot | CÃ³pia controlada de banco armazenada no diretÃ³rio privado de estado. |
| SSE | Canal de eventos do servidor usado para acompanhar execuÃ§Ãµes em tempo real. |
| Provider de IA | Adapter de inferÃªncia selecionÃ¡vel, atualmente Ollama local ou OpenAI cloud. |

## CritÃ©rio de documentaÃ§Ã£o completa

Uma funcionalidade Ã© considerada documentada quando existem informaÃ§Ãµes suficientes para responder:

- o que ela Ã©;
- por que existe;
- onde estÃ¡ implementada;
- quais dados recebe e retorna;
- que comandos ou processos executa;
- que estado persiste;
- quais riscos e limites possui;
- como Ã© testada;
- como diagnosticar falhas;
- como alterÃ¡-la sem quebrar contratos existentes.

Esse critÃ©rio deve orientar novas pÃ¡ginas e revisÃµes futuras.
