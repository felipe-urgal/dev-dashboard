# Visão do produto

## Resumo

O Dev Dashboard é um **control plane local de desenvolvimento** para descobrir projetos, entender o ambiente, operar runtimes e Git, executar testes/diagnósticos e trabalhar com Produção por contratos explícitos.

A meta não é substituir terminal, IDE, Docker Desktop, GitHub ou providers externos. O valor está em reunir contexto e operações recorrentes numa superfície local, simples, ágil e funcional, com guardrails consistentes.

## Problema

Quem mantém vários projetos Rails/Node costuma alternar entre:

- pastas/workspaces;
- processos e portas;
- logs;
- Git/branches/PRs;
- testes;
- banco/migrations;
- dependências/toolchain/environment;
- CI e produção.

A informação existe, mas fica espalhada e exige lembrar comandos, contexto e estado de cada ferramenta.

## Proposta de valor

O Dashboard deve permitir um fluxo próximo de:

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

O CLI Bash original continua válido. A web oferece descoberta, contexto visual, acompanhamento e operações estruturadas. Não existe objetivo de migrar tudo para TypeScript apenas por uniformidade.

### Autoridade mínima

O browser trabalha com IDs/contratos, não com shell, `cwd`, paths absolutos ou credenciais livres.

Mutações sensíveis usam preview/confirmação/revalidação proporcionais ao risco. Depois de uma etapa irreversível, o produto representa recovery honestamente em vez de prometer rollback cego.

### Evidência antes de inferência

Estados importantes devem indicar de onde vieram e, quando necessário, freshness/contexto. Ausência de evidência não vira falso estado saudável.

### Domínios pequenos, não uma engine universal

Process Manager, Script Execution, Deployment, Self Update, Git, banco e outros lifecycles continuam separados quando possuem ownership/recovery distintos.

Novas features devem reutilizar contratos existentes antes de criar uma segunda identidade, allocator, executor ou integração remota.

### UI simples

Priorizar:

- pouco atrito;
- hierarquia clara;
- ações no contexto onde são usadas;
- loading somente durante trabalho real;
- mensagens diretas;
- acessibilidade e responsividade;
- sem dashboards densos apenas porque há dados disponíveis.

## Estado atual do produto

Capacidades já presentes incluem, entre outras:

- workspaces e discovery de projetos;
- Project Profile/provider de discovery;
- Project Doctor e Toolchain Doctor;
- Central de Atenção;
- Process Manager, logs e runtimes Rails reconhecidos;
- Git com diff/histórico/branches/commits/sincronização/PRs;
- Cockpit GitHub read-only com checks/reviews/mergeability;
- testes e histórico/Test Intelligence;
- banco, snapshots e operações reconhecidas;
- Environment Contract;
- Port Registry + Allocator;
- dependências com inventário local confiável;
- Production Contract com `command`, `git-managed`/Vercel e `self-update`;
- instalação permanente do próprio Dashboard via `systemd --user`;
- fundamentos read-only para Worktrees, Docker Compose, Migration Providers, Security Center, Release Readiness e Local CI/`act`.

Esses últimos fundamentos **não significam lifecycle/UI completos**. O status detalhado do trabalho futuro fica nas issues abertas.

## Capacidades removidas

Algumas experiências foram construídas e depois removidas por não justificarem complexidade/posição no produto:

- IDE embutida/Monaco;
- abertura de editor externo pelo Dashboard;
- Assistente IA e Code Review por IA;
- páginas globais que não justificaram navegação própria.

Documentos históricos explicitamente marcados como removidos podem registrar essas decisões, mas não descrevem capacidade atual.

## Direção atual

O roadmap vivo está na issue **#596**. As frentes abertas devem ser lidas pelo estado real de cada issue, não por listas versionadas neste documento.

A sequência estrutural atual prioriza:

1. corrigir o redeploy local/self-update gerenciado (#659);
2. criar uma identidade operacional comum de Development Environment Instance (#598);
3. evoluir Worktrees/Compose/Dev Containers/Stacks sem identidades paralelas;
4. levar fundamentos de Readiness, Dependency Health, Migrations, Security e Local CI às superfícies de produto;
5. conectar Task Context e Activity/Jobs usando as integrações/lifecycles já existentes.

Essa ordem pode mudar; #596 é a fonte de planejamento, enquanto `docs/` continua descrevendo comportamento implementado e princípios permanentes.

## O que não priorizar agora

- acesso remoto genérico à máquina;
- serviço cloud obrigatório do Dev Dashboard;
- Kubernetes dashboard;
- marketplace genérico de plugins;
- cloud IDE;
- agent autônomo que execute mutações sem confirmação;
- editor visual genérico de pipelines;
- executor universal que apague fronteiras de ownership;
- suporte amplo a frameworks/providers sem demanda concreta.

## Critério para novas funcionalidades

Uma proposta deve melhorar pelo menos uma dimensão concreta:

- reduzir uma tarefa repetitiva;
- melhorar visibilidade/diagnóstico;
- reduzir risco operacional;
- preservar contexto entre ferramentas;
- tornar uma operação local mais verificável;
- reutilizar uma fundação existente de forma útil.

E deve responder também:

- qual domínio é owner?
- qual evidência sustenta o estado?
- qual lifecycle/cleanup existe?
- qual autoridade nova é realmente necessária?
- isso simplifica a experiência ou apenas adiciona superfície?

## Métrica qualitativa de sucesso

O produto está evoluindo na direção certa quando a pessoa consegue chegar de **“qual projeto precisa de atenção?”** a **“qual ação segura devo executar?”** com menos navegação, menos comandos memorizados e sem perder transparência sobre o que realmente aconteceu.
