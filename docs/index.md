# Dev Dashboard — documentação do projeto

O **Dev Dashboard** é uma aplicação local para organizar, inspecionar e operar projetos de desenvolvimento Rails e Node por uma interface web, mantendo o CLI Bash existente como interface complementar.

Esta documentação descreve o produto, a arquitetura, a organização do repositório, os fluxos de execução, as decisões de segurança, a operação local e o processo de contribuição. Ela deve ser lida como parte do código: quando o comportamento muda, o documento correspondente também precisa mudar.

## Para quem esta documentação existe

| Público | O que encontrará aqui |
|---|---|
| Pessoa usuária | Instalação, inicialização, recursos disponíveis e resolução de problemas. |
| Pessoa desenvolvedora | Arquitetura, responsabilidades dos módulos, padrões de implementação e testes. |
| Pessoa revisora | Limites de segurança, contratos, fluxos mutáveis e critérios de qualidade. |
| Pessoa mantenedora | Operação, persistência, evolução, documentação da API e organização do monorepo. |

## Visão do produto

O projeto resolve um problema comum de ambientes de desenvolvimento: cada repositório possui comandos, processos, logs, banco de dados, testes e operações Git diferentes. O Dev Dashboard oferece uma camada local única para descobrir essas capacidades e executar apenas operações conhecidas.

Os objetivos principais são:

- centralizar projetos de vários diretórios de trabalho;
- detectar automaticamente projetos Rails e Node;
- oferecer uma interface rápida e consistente para tarefas recorrentes;
- acompanhar processos e logs sem depender de várias janelas de terminal;
- executar operações mutáveis com validação e confirmação explícita;
- manter a aplicação restrita ao computador local;
- compartilhar regras entre API, frontend, pacotes TypeScript e CLI legado;
- preservar rastreabilidade por testes, contratos e documentação versionada.

## Capacidades principais

### Organização de workspaces e projetos

- cadastro persistente de workspaces locais;
- scan dos diretórios imediatamente abaixo de cada workspace;
- detecção de projetos Rails e Node;
- identificação de capacidades por projeto;
- favoritos e navegação global;
- diagnóstico do ambiente do projeto.

### Desenvolvimento e execução

- inicialização e encerramento de servidores;
- seleção segura de porta e ambiente;
- acompanhamento de estado, PID e health check;
- leitura limitada e mascarada de logs;
- gerenciamento de processos em segundo plano;
- abertura de projeto no navegador e editor local;
- editor de arquivos e integração com language server.

### Git

- status, diff, histórico e detalhes de commits;
- criação, troca, acompanhamento, renomeação e exclusão de branches;
- sincronização com remotos permitidos;
- pull, push e commit;
- histórico de mutações;
- operações destrutivas protegidas por confirmação;
- integração com pull requests e desfazer de operações reconhecidas.

### Qualidade e automação

- descoberta e execução de testes;
- execução de arquivo específico;
- catálogo seguro de scripts e tarefas;
- histórico persistente de execuções;
- acompanhamento em tempo real por SSE;
- inspeção de dependências, Bundler, migrations e routes Rails.

### Banco de dados e ambiente

- detecção de bancos e ambientes;
- identificação de serviço local ou Docker;
- inicialização de serviços reconhecidos;
- snapshots e restauração protegida por confirmação;
- perfis de ambiente reutilizáveis, com busca na lista e aviso de alterações não salvas;
- proteção contra persistência acidental de valores sensíveis.

## Arquitetura em uma página

```text
┌──────────────────────────────────────────────────────────────┐
│ Interfaces                                                   │
├───────────────────────────────┬──────────────────────────────┤
│ CLI Bash                      │ Dashboard Vue 3              │
│ dev-tools / lib / init.sh     │ http://127.0.0.1:5173       │
└───────────────┬───────────────┴──────────────┬───────────────┘
                │                              │ HTTP / SSE / WS
                │                              ▼
                │                 ┌────────────────────────────┐
                │                 │ API Fastify                │
                │                 │ http://127.0.0.1:4343     │
                │                 └──────────────┬─────────────┘
                │                                │
                ▼                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Pacotes e serviços                                           │
├──────────────────────────────────────────────────────────────┤
│ contracts │ core │ project-discovery │ process-manager       │
│ serviços Git, testes, banco, Rails, scripts, arquivos e IA   │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Sistema local                                                │
├──────────────────────────────────────────────────────────────┤
│ filesystem │ processos │ Git │ Node │ Rails │ bancos │ editor│
└──────────────────────────────────────────────────────────────┘
```

A API é a fronteira de segurança. O navegador trabalha com identificadores e contratos estruturados; ele não recebe permissão para enviar comandos livres ou caminhos arbitrários.

## Princípios arquiteturais

1. **Local por padrão.** Todos os serviços de desenvolvimento escutam em `127.0.0.1`.
2. **Catálogo fechado.** Comandos e argumentos são escolhidos pela aplicação, não pelo navegador.
3. **Sem shell arbitrário.** Processos usam programa e argumentos separados, preferencialmente com `shell: false`.
4. **Identificadores em vez de caminhos.** Depois do scan, a maioria das operações recebe `workspaceId`, `projectId` ou outro identificador controlado.
5. **Dependências explícitas.** Serviços são construídos no contexto da API e entregues às rotas.
6. **Contratos compartilhados.** Frontend e backend reutilizam tipos do pacote `contracts`.
7. **Persistência mínima e protegida.** Configurações e estados usam diretórios locais restritos ao usuário.
8. **Confirmação para mutações sensíveis.** Operações destrutivas ou irreversíveis exigem uma etapa adicional.
9. **Observabilidade limitada.** Logs, diffs e históricos possuem limites e mascaramento de segredos.
10. **Documentação junto do código.** Referências automáticas e guias manuais fazem parte da validação do projeto.

## Serviços iniciados no desenvolvimento

Após instalar as dependências, execute:

```bash
npm run dev
```

O comando inicia e encerra em conjunto:

| Serviço | Endereço | Responsabilidade |
|---|---|---|
| API | `http://127.0.0.1:4343` | Regras, persistência, processos e integrações locais. |
| Web | `http://127.0.0.1:5173` | Interface Vue para uso do dashboard. |
| Docs | `http://127.0.0.1:4545` | Central navegável e API JSON desta documentação. |

Use `Ctrl+C` para encerrar o grupo de processos.

## Mapa da documentação

### Comece por aqui

- [Primeiros passos](getting-started.md): requisitos, instalação e primeiro uso.
- [Visão geral da arquitetura](architecture/overview.md): contexto e decisões arquiteturais existentes.
- [Estrutura do repositório](architecture/repository-structure.md): diretórios, camadas e dependências.
- [Fluxos de execução](architecture/runtime-flows.md): o que acontece em cada operação importante.

### Para usar o dashboard web, aba por aba

- [Guia passo a passo do dashboard web](guia/README.md): o que cada aba do projeto mostra, o que
  cada botão faz e qual comando roda por trás — README, Diagnóstico, Editor, Servidor, Logs, Git,
  Testes, Dependências, Scripts e Variáveis de ambiente.

### Para desenvolver

- [Guia de desenvolvimento](development-guide.md): scripts, padrões, testes e como adicionar recursos.
- [Segurança](architecture/security.md): modelo de ameaça e controles obrigatórios.
- [Contribuindo](../CONTRIBUTING.md): fluxo de branch, commit, revisão e documentação.

### Para operar e diagnosticar

- [Operação e troubleshooting](operations-and-troubleshooting.md): portas, dados locais, logs e falhas comuns.
- [API da documentação](documentation-api.md): endpoints da central de documentação.
- [Referência da API HTTP](architecture/api-reference.md): contratos gerados a partir das rotas Fastify.

### Planejamento

- [Pendências](../tasks/PENDENCIAS.md): inventário consolidado do que falta implementar.
- [Próxima tarefa](../tasks/NEXT.md): próximo trabalho priorizado.

## Glossário essencial

| Termo | Significado no projeto |
|---|---|
| Workspace | Diretório cadastrado que contém projetos imediatamente abaixo dele. |
| Projeto | Aplicação Rails ou Node detectada e mantida no `ProjectStore`. |
| Capacidade | Recurso reconhecido, como Git, testes, banco, scripts, Sidekiq ou Bundler. |
| Processo gerenciado | Processo iniciado e acompanhado pelo Process Manager. |
| Catálogo | Lista fechada de comandos ou ações detectadas pelo backend. |
| Confirmação | Token temporário vinculado a uma operação mutável específica. |
| Distribuição local | Modo compilado em que a API também serve o frontend estático. |
| Contrato | Tipo e formato de dados compartilhado entre camadas. |
| Snapshot | Cópia controlada de banco armazenada no diretório privado de estado. |
| SSE | Canal de eventos do servidor usado para acompanhar execuções em tempo real. |

## Critério de documentação completa

Uma funcionalidade é considerada documentada quando existem informações suficientes para responder:

- o que ela é;
- por que existe;
- onde está implementada;
- quais dados recebe e retorna;
- que comandos ou processos executa;
- que estado persiste;
- quais riscos e limites possui;
- como é testada;
- como diagnosticar falhas;
- como alterá-la sem quebrar contratos existentes.

Esse critério deve orientar novas páginas e revisões futuras.
