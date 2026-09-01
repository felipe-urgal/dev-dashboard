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
5. Use preview/confirmacão/revalidação para mutações sensíveis.
6. Aplique limites a arquivos, logs, streams e respostas externas.
7. Não exponha tokens, `.env`, credenciais ou mensagens internas.
8. Preserve o CLI Bash durante a evolução incremental.
9. Teste regras e regressões, inclusive caminhos de falha.
10. Atualize documentação e issues na mesma entrega.
11. Para produção, represente irreversibilidade/recovery honestamente; não implemente rollback cego.

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
- issue relacionada;
- impacto visual quando houver.

Se o trabalho partiu de plano antigo, confirme no código o comportamento atual e documente o resultado real, não apenas a intenção inicial.

### Checklist sugerido

- [ ] escopo coerente;
- [ ] typecheck;
- [ ] lint;
- [ ] format check;
- [ ] build;
- [ ] testes;
- [ ] CLI Bash;
- [ ] E2E quando aplicável;
- [ ] API docs regeneradas quando necessário;
- [ ] documentação viva atualizada;
- [ ] issues/roadmap coerentes;
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

Antes do PR:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run test:cli
```

Para fluxos web críticos:

```bash
npm run test:e2e
```

Fixtures com filesystem/Git/processo/provider devem ser isoladas e possuir cleanup.

Cobertura usa ratchet por workspace; não reduza thresholds silenciosamente para fazer CI passar.

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
| processo de engenharia | `docs/development-guide.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` |
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

## Release

O projeto é privado e usa SemVer para rastrear versão interna. O fluxo de release permanece nos workflows `release-prepare.yml` e `release-tag.yml`; releases passam pelo mesmo CI/revisão do restante do projeto.

## Definição de pronto

Uma contribuição está pronta quando:

- resolve o problema declarado;
- respeita os limites de segurança;
- possui contratos/erros claros;
- inclui testes suficientes;
- fecha recursos corretamente;
- representa estado/recovery honestamente;
- atualiza docs/issues;
- passa a validação completa no head final;
- passou por auto-review final;
- pode ser entendida por outra pessoa a partir do código, docs e PR.
