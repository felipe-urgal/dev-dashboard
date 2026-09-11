# Visão do produto

## Resumo

O Dev Dashboard é um **control plane local de desenvolvimento** para descobrir projetos, entender o ambiente, operar runtimes e Git, executar testes/diagnósticos e trabalhar com Produção por contratos explícitos.

A meta não é substituir terminal, IDE, Docker Desktop, GitHub ou providers externos. O valor está em reunir contexto e operações recorrentes numa superfície local, simples, ágil e funcional, com guardrails consistentes.

## Problema

Quem mantém vários projetos Rails/Node costuma alternar entre:

- pastas e workspaces;
- processos, portas e logs;
- Git, branches, PRs e CI;
- testes;
- banco e migrations;
- dependências, toolchain e environment;
- produção e providers externos.

A informação existe, mas fica espalhada e exige lembrar comandos, contexto e estado de cada ferramenta.

## Proposta de valor

O Dashboard deve aproximar o fluxo cotidiano de:

```text
descobrir projeto
  ↓
validar ambiente/toolchain
  ↓
entender blockers/atenções
  ↓
subir e acompanhar runtime
  ↓
Git + testes + banco/dependências
  ↓
readiness
  ↓
produção com confirmação/recovery
```

Sempre preservando a possibilidade de abrir a ferramenta especializada quando ela for a melhor interface.

## Princípios

### Local por padrão

A API e os runtimes do Dashboard permanecem locais/loopback por padrão. Operações básicas não dependem de um serviço cloud do próprio produto.

Providers externos são integrações explícitas e degradáveis; sua indisponibilidade não deve derrubar capacidades locais sem relação.

### CLI e Web complementares

O CLI Bash continua válido. A web oferece descoberta, contexto visual, acompanhamento e operações estruturadas. Não existe objetivo de migrar tudo para TypeScript apenas por uniformidade.

### Autoridade mínima

O browser trabalha com IDs e contratos, não com shell, `cwd`, paths absolutos ou credenciais livres.

Mutações sensíveis usam preview, confirmação e revalidação proporcionais ao risco. Depois de uma etapa irreversível, o produto representa recovery honestamente em vez de prometer rollback cego.

### Evidência antes de inferência

Estados importantes devem indicar de onde vieram e, quando necessário, freshness/contexto. Ausência de evidência não vira falso estado saudável.

### Domínios pequenos, não uma engine universal

Process Manager, Script Execution, Deployment, Self Update, Git, banco e outros lifecycles continuam separados quando possuem ownership ou recovery distintos.

Novas features devem reutilizar contratos e identidades existentes antes de criar uma segunda engine, allocator, executor ou integração remota.

### UI simples

Priorizar:

- pouco atrito;
- hierarquia clara;
- ações no contexto onde são usadas;
- loading somente durante trabalho real;
- mensagens diretas;
- acessibilidade e responsividade;
- sem dashboards densos apenas porque há dados disponíveis.

## Capacidades atuais

O produto já cobre, em diferentes níveis de profundidade:

- workspaces e discovery de projetos;
- diagnóstico de projeto, toolchain e environment;
- processos, runtimes, portas e logs;
- Git local, branches, commits, sincronização, diff, histórico e PRs;
- integração GitHub para contexto de PR, checks e reviews;
- testes e inteligência de histórico;
- banco, migrations e operações reconhecidas;
- dependências e evidências de compatibilidade;
- Environment Instance como identidade operacional de contextos paralelos;
- Worktrees e fundações de Docker Compose;
- Security Center e Local CI opcionais;
- Release Readiness como agregação de evidências;
- Production Contract e self-update do próprio Dashboard.

A fonte de verdade de cada comportamento é o documento do domínio correspondente em `docs/architecture/` ou o guia de uso. Detalhes do que ainda falta ficam nas issues abertas, não nesta visão.

## Direção

O roadmap vivo está na issue **#596**. Ela define prioridade e composição entre as frentes abertas sem transformar `docs/` em uma segunda fila de trabalho.

A evolução deve seguir algumas regras:

1. terminar fluxos parcialmente implementados antes de criar abstrações paralelas;
2. reutilizar Environment Instance, ownership, Port Registry, Cockpit GitHub e Readiness quando já resolverem parte do problema;
3. adicionar providers como adapters explícitos, sem espalhar condicionais pelo produto;
4. manter mutações estruturadas, confirmáveis e revalidáveis;
5. tratar ausência, staleness e indisponibilidade como estados normais;
6. só criar uma nova superfície global quando existir volume/fluxo real que a justifique.

## O que não é objetivo

O Dev Dashboard não deve virar:

- IDE ou editor de código;
- shell genérico disfarçado de UI;
- clone completo do GitHub, Docker Desktop ou Vercel;
- plataforma cloud obrigatória;
- executor autônomo de mutações sem confirmação;
- marketplace genérico de plugins;
- orquestrador Kubernetes ou APM distribuído sem demanda concreta.

## Fonte de verdade

- comportamento implementado: `docs/` + código;
- arquitetura estável: `docs/architecture/`;
- uso cotidiano: `docs/guia/`;
- planejamento e débito: issues;
- roadmap: issue #596;
- histórico de decisões removidas: commits e PRs.

Documentação de feature removida não deve permanecer apenas como registro histórico; o Git já cumpre esse papel.
