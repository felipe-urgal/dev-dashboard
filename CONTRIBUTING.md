# Contribuindo com o Dev Dashboard

O Dev Dashboard opera arquivos, processos, Git, bancos, runtimes locais e, quando um projeto opta pelo Production Contract, deployments de produção. Mudanças precisam preservar simplicidade de uso, limites de autoridade e documentação viva.

## Antes de começar

Leia:

- [`docs/index.md`](docs/index.md);
- [`docs/architecture/overview.md`](docs/architecture/overview.md);
- [`docs/architecture/security.md`](docs/architecture/security.md);
- [`docs/development-guide.md`](docs/development-guide.md).

Se a mudança tocar produção, leia também:

- [`docs/architecture/production-contract.md`](docs/architecture/production-contract.md);
- [`docs/architecture/deployment-domain.md`](docs/architecture/deployment-domain.md);
- [`docs/deployment-operations.md`](docs/deployment-operations.md);
- [`docs/production-ui.md`](docs/production-ui.md).

Prepare o ambiente:

```bash
npm install
npm run doctor
npm run dev
```

O backlog não é versionado. Não recrie `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou roadmap equivalente. Trabalho que precisa sobreviver a um PR deve ser rastreado em issues.

## Princípios

1. Mantenha API/desenvolvimento local por padrão.
2. Não introduza execução arbitrária de comandos.
3. Prefira IDs conhecidos a paths enviados pela interface.
4. Mantenha API, contratos, web e docs sincronizados.
5. Use preview/confirmação/revalidação para mutações sensíveis.
6. Aplique limites a arquivos, logs, streams e respostas externas.
7. Não exponha tokens, `.env`, credenciais ou mensagens internas.
8. Preserve o CLI Bash durante a evolução incremental.
9. Teste regras e regressões relevantes, inclusive caminhos de falha.
10. Prefira testes de comportamento a testes de implementação.
11. Atualize documentação e issues na mesma entrega.
12. Para produção, represente irreversibilidade/recovery honestamente; não implemente rollback cego.

## Branches

| Prefixo | Uso |
| --- | --- |
| `feature/` | nova funcionalidade |
| `bugfix/` | correção comum |
| `hotfix/` | correção urgente |
| `docs/` | documentação |
| `refactor/` | alteração interna sem mudar comportamento |
| `test/` | testes |

## Commits

Use mensagens curtas e objetivas em português quando possível, por exemplo:

```text
feat: adiciona deployment Vercel ao domínio de produção
fix: recusa revision remota divergente
docs: atualiza operação de produção
test: cobre retry de verify sem nova promoção
```

Separe mudanças sem relação quando isso melhorar revisão.

## Pull request

A descrição deve registrar:

- problema/objetivo;
- o que mudou;
- impacto de usuário/desenvolvimento;
- decisões e guardrails;
- variáveis/persistência novas;
- testes/gates executados;
- documentação atualizada;
- issue relacionada quando houver;
- impacto visual quando houver.

Se o trabalho partiu de plano antigo, confirme no código o comportamento atual e documente o resultado real, não apenas a intenção inicial.

### Checklist sugerido

- [ ] escopo coerente;
- [ ] lint;
- [ ] testes relevantes;
- [ ] build;
- [ ] verificações adicionais proporcionais ao risco (`typecheck`, format, CLI, E2E, coverage);
- [ ] API docs regeneradas quando necessário;
- [ ] documentação viva atualizada;
- [ ] nenhum segredo no diff/log;
- [ ] mutações/recovery revisados;
- [ ] auto-review final no head definitivo;
- [ ] CI do head definitivo verde.

## Mudanças na API

Ao criar/alterar rota:

1. atualize tipos públicos quando necessário;
2. declare schemas fechados;
3. valide params/query/body;
4. aplique autenticação/origem;
5. traduza erros para códigos estáveis;
6. cubra sucesso e falhas relevantes;
7. registre o plugin;
8. execute:

```bash
npm run docs:api
npm run docs:api:check
```

`docs/architecture/api-reference.md` é gerada e não deve ser editada manualmente.

## Processos locais

Documente/teste comando, argumentos, `cwd`, `shell:false`, ambiente, timeout, limite de log, identidade do processo, TERM/KILL e cleanup.

O browser nunca fornece a linha de comando final para uma ação estruturada.

## Providers externos

Ao adicionar/alterar provider como Vercel:

- credencial fica somente no ambiente local do processo;
- manifesto guarda identificador do recurso, não token;
- browser não escolhe parâmetros de autoridade que o backend pode derivar;
- request/response externos possuem timeout/tamanho/shape limitados;
- mensagens do provider são sanitizadas;
- quota/auth/indisponibilidade/resposta inválida viram estados/códigos tipados;
- mutação externa participa do plano, confirmação, timeline, cancelamento e recovery do domínio.

Para Vercel especificamente, preserve a prova direta de `origin/<production.branch>` e o envio do SHA exato confirmado antes de `provider-deploy`.

## Arquivos

Garanta path relativo/ID controlado, resolução canônica, permanência no escopo, limite de tamanho, encoding/tipo definidos, escrita atômica e permissões restritas.

## Segurança

Atualize [`docs/architecture/security.md`](docs/architecture/security.md) quando a mudança tocar:

- autenticação/origem;
- comandos/actions permitidos;
- paths/files;
- confirmação/revalidação;
- segredos;
- processos;
- banco/snapshot;
- logs/masking;
- provider externo;
- Production Contract/deployment/recovery.

## Produção

Mudanças em `Production Contract`, planner, adapters ou UI precisam manter:

- working tree limpa;
- branch/revision revalidadas;
- `planHash` + confirmação forte;
- `strategy=command` limitado a scripts canônicos;
- `strategy=git-managed` sem `prod:deploy` artificial;
- prova remota antes de promoção Vercel;
- SHA exato enviado ao provider;
- provider `READY` separado de `prod:verify`;
- recovery conservador;
- retry de verify sem repetir mutação;
- credenciais fora de contratos/responses/persistência.

## Web

A interface deve permanecer simples, ágil e funcional. Revise hierarquia, redundância, largura, loading/vazio/erro/sucesso, foco/teclado, responsividade, reduced motion, português, bloqueio de ações concorrentes e descarte de respostas stale.

Indicador de atividade só anima durante trabalho real.

## Testes

A validação padrão antes de um PR é:

```bash
npm run lint
npm test
npm run build
```

`npm test` executa as suítes funcionais sem coletar coverage. Isso mantém o feedback rápido e evita transformar percentual em objetivo de desenvolvimento.

Use comandos adicionais quando o risco justificar:

```bash
npm run typecheck
npm run format:check
npm run test:cli
npm run test:e2e
npm run test:coverage
```

Critério prático para testes:

- mantenha regras de negócio, contratos, segurança, mutações, concorrência e regressões reais;
- prefira unidade/função pura quando ela protege a mesma regra com menos custo;
- evite testes que apenas congelem CSS, markup ou ordem incidental de implementação;
- guards estáticos são aceitáveis quando impedem explicitamente uma arquitetura proibida e relevante;
- não escreva testes somente para elevar coverage.

Fixtures com filesystem/Git/processo/provider devem ser isoladas e possuir cleanup.

### Coverage

Coverage é um relatório sob demanda, não um gate percentual de PR.

```bash
npm run test:coverage
```

Não existem thresholds mínimos obrigatórios. Use o relatório para encontrar regras críticas sem proteção, não para perseguir uniformidade de linhas cobertas.

A política completa fica em [`docs/testing-and-quality.md`](docs/testing-and-quality.md).

## Onde documentar

| Alteração | Documento |
| --- | --- |
| primeiro uso/comando | `README.md`, `docs/getting-started.md` |
| arquitetura/camada | `docs/architecture/*` |
| fluxo runtime | `docs/architecture/runtime-flows.md` |
| segurança | `docs/architecture/security.md` |
| variável/porta/persistência | `docs/operations-and-troubleshooting.md` |
| Production Contract | `docs/architecture/production-contract.md` |
| planner/adapter/recovery | `docs/architecture/deployment-domain.md` |
| operação de deployment | `docs/deployment-operations.md` |
| UI de Produção | `docs/production-ui.md`, `docs/guia/producao.md` |
| endpoint | `docs/architecture/api-reference.md` gerada |
| processo de engenharia | `docs/development-guide.md`, `docs/testing-and-quality.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` |
| backlog/roadmap | issues/PRs GitHub, nunca `tasks/` |

`docs/` descreve estado implementado; histórico específico de uma entrega fica no PR, salvo quando virou arquitetura permanente.

## Dados e segredos

Nunca commite:

- `api-token`;
- `.env`/`.env.local` com valores reais;
- `VERCEL_TOKEN` ou outras credenciais;
- logs sensíveis;
- dumps de banco;
- diretórios locais de estado/configuração;
- dados pessoais;
- tokens de confirmação.

Use valores fictícios em testes/documentação.

## Supply chain

Dependências e workflows seguem o mesmo princípio de menor autoridade usado no código:

- atualizações npm e GitHub Actions chegam periodicamente pelo Dependabot e passam pelo CI normal;
- referências `uses:` versionadas usam SHA completo, mantendo a versão legível em comentário;
- não troque pins por tags mutáveis como `@v4`;
- CodeQL roda semanalmente ou manualmente e não adiciona um job ao PR normal;
- aumentos de permissão em `GITHUB_TOKEN` precisam ser locais ao job e justificados.

A política do workflow `Security` fica registrada em [`docs/testing-and-quality.md`](docs/testing-and-quality.md).

## Release

O projeto usa SemVer para rastrear versão. O fluxo de release permanece nos workflows `release-prepare.yml` e `release-tag.yml`; releases passam pelo mesmo CI/revisão do restante do projeto. Como esses workflows possuem permissão de escrita, suas actions também permanecem fixadas por SHA.

## Definição de pronto

Uma contribuição está pronta quando:

- resolve o problema declarado;
- respeita os limites de segurança;
- possui contratos/erros claros;
- inclui testes suficientes para os riscos reais;
- fecha recursos corretamente;
- representa estado/recovery honestamente;
- atualiza docs/issues;
- passa os gates relevantes no head final;
- passou por auto-review final;
- pode ser entendida por outra pessoa a partir do código, docs e PR.
