# Operação de deployments

Este guia cobre o domínio de deployment do Dev Dashboard para projetos com `Production Contract v1` válido e `production.enabled=true`.

Há duas estratégias com responsabilidades diferentes:

- `strategy=command`: o Dev Dashboard planeja e executa scripts `prod:*` canônicos do projeto;
- `strategy=git-managed` + `provider=vercel`: o Dev Dashboard lê e normaliza o estado remoto, mas não cria commit, faz push nem dispara promoção Vercel.

Os detalhes arquiteturais e de segurança estão em:

- [Production Contract v1](architecture/production-contract.md);
- [Domínio de deployment](architecture/deployment-domain.md);
- [Segurança e modelo de ameaça](architecture/security.md).

## Antes de gerar um plano `command`

Confirme no projeto alvo:

```bash
git status --short --branch
```

O motor exige:

- repositório Git válido;
- HEAD em uma branch, não detached;
- branch atual igual à `production.branch` do contrato;
- working tree completamente limpa, incluindo arquivos não rastreados;
- manifesto de produção válido e scripts `prod:*` reconhecidos.

Não limpe alterações automaticamente apenas para liberar produção. Faça commit, stash fora do fluxo de deployment ou descarte conscientemente antes de tentar novamente.

## Fluxo operacional `command`

A sequência normal é:

```text
gerar plano
    ↓
revisar revision + etapas
    ↓
gerar confirmação
    ↓
iniciar deployment
    ↓
acompanhar timeline/log
    ↓
succeeded | failed | cancelled | recovery_required
```

O plano não executa processos. A confirmação expira e só pode ser usada uma vez.

## Status Vercel `git-managed`

Projetos Vercel usam `production.external.project` como mapeamento explícito para o projeto remoto. O Dev Dashboard não deduz esse vínculo pelo nome da pasta ou do repositório.

A consulta fica disponível em:

```text
GET /api/projects/:projectId/deployments/status
```

Ela resolve:

- projeto Vercel declarado em `external.project`;
- deployment atual com `target=production`;
- estado normalizado do provider;
- URL do deployment;
- branch e commit quando a Vercel fornece `githubCommitRef`/`githubCommitSha`;
- revision já conhecida em `refs/remotes/origin/<production.branch>`;
- drift por igualdade de SHA entre `origin/<branch>` e produção;
- timeline normalizada do provider usando os mesmos estados de etapa do domínio de deployment;
- operações locais `check`, `migrate` e `verify` declaradas no contrato, sem misturá-las com uma etapa `prod:deploy` inexistente.

A consulta **não executa `git fetch`**. Se a ref `origin/<branch>` não existir localmente, `originRevision` fica ausente e `drift=unknown` em vez de alterar o repositório silenciosamente.

### Credenciais locais da Vercel

O adapter lê credenciais somente do processo do Dev Dashboard:

```bash
export VERCEL_TOKEN='...'
export VERCEL_TEAM_ID='team_...'
```

`VERCEL_TOKEN` é necessário para consultar a API. `VERCEL_TEAM_ID` é opcional para projetos pessoais e deve ser definido quando o projeto pertence a um time que exige escopo explícito.

Esses valores:

- não pertencem a `.dev-dashboard/production.json`;
- não são persistidos pelo domínio de deployment;
- não são retornados na API;
- não entram em logs ou mensagens de erro do provider.

### Estados operacionais do provider

`providerAvailability` diferencia:

- `available`: consulta válida;
- `not-configured`: `VERCEL_TOKEN` ausente;
- `auth-error`: token/escopo recusado;
- `quota-limited`: rate limit ou cota conhecida da Vercel;
- `project-not-found`: `external.project` não foi resolvido;
- `unavailable`: falha de transporte ou indisponibilidade externa;
- `invalid-response`: resposta externa fora do contrato aceito.

Os erros usam códigos estáveis `DEPLOYMENT_PROVIDER_*` e mensagens locais sanitizadas. O corpo bruto retornado pela Vercel não é repassado ao browser.

### Drift e saúde são sinais diferentes

`drift=in-sync` significa somente que o SHA conhecido em `origin/<branch>` é igual ao SHA informado pelo deployment de produção.

`drift=drift` significa somente que os SHAs diferem. O Dev Dashboard não presume automaticamente se produção está atrasada, adiantada ou divergente sem uma análise Git adicional.

`READY` da Vercel é representado como sucesso da etapa de provider na timeline, mas **não é prova única de saúde**. Health/readiness do projeto continua sendo uma verificação separada pelo contrato.

### Migration permanece separada

Em projetos como `controle-gastos`, `prod:migrate` continua sendo uma operação local explícita anterior ao código dependente quando `production.policies.migrations=before-deploy`.

O adapter Vercel não executa migration e não cria uma operação `prod:deploy` artificial. A ordem operacional continua sendo responsabilidade explícita do fluxo do projeto, por exemplo:

```text
prod:check
→ checkpoint/backup externo quando aplicável
→ prod:migrate
→ confirmar schema saudável
→ promover código pelo fluxo Git/Vercel existente
→ acompanhar deployment Vercel
→ prod:verify
```

## Concorrência

Para `strategy=command`, nesta versão existe no máximo um deployment ativo globalmente. Se outro projeto estiver em produção, uma nova execução retorna `DEPLOYMENT_ALREADY_RUNNING`.

A leitura do status Vercel não inicia mutação e não ocupa esse slot global.

Essa restrição é intencional. Não encerre o processo do Dev Dashboard para contorná-la: uma interrupção força a recuperação do histórico ativo e pode produzir `recovery_required`.

## Persistência

O domínio `command` grava estado em:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/deployments/
```

O diretório deve permanecer privado (`0700`) e os arquivos são gravados como `0600`.

Cada deployment local possui:

- um registro JSON com revision, plano, estado e timeline;
- um log JSON separado, limitado e já mascarado.

O histórico é limitado a 50 deployments por projeto por padrão. Logs preservam no máximo 512 KiB da cauda UTF-8 por deployment.

Tokens de confirmação não são gravados em disco. A leitura Vercel é um snapshot externo e não persiste token nem resposta bruta do provider.

## Cancelamento

Cancelar uma execução `command` sinaliza o processo atual com `SIGTERM`. Se ele não encerrar, o adapter escalona para `SIGKILL` após a janela de encerramento.

O resultado depende de onde a execução estava:

- antes de etapa irreversível: `cancelled`;
- durante/depois de etapa irreversível: `recovery_required`.

Um cancelamento HTTP bem-sucedido significa que o pedido de cancelamento foi aceito; consulte novamente o deployment para observar o estado terminal.

O status Vercel é somente leitura e, portanto, não oferece cancelamento remoto nesta fase.

## Reinício ou crash do Dev Dashboard

Na inicialização, registros `command` que estavam em estados ativos são recuperados como interrompidos.

Se nenhuma etapa irreversível havia iniciado, o registro termina como `failed` com `DEPLOYMENT_INTERRUPTED`.

Se uma etapa irreversível estava `running` ou já havia concluído, termina como `recovery_required`. Isso é conservador porque uma migration/deploy pode ter produzido efeito parcial antes da queda.

Não repita automaticamente um deployment interrompido.

## `recovery_required`

Esse estado pede investigação manual, não rollback automático.

1. abra a timeline e identifique a etapa irreversível;
2. leia o log mascarado do deployment;
3. confira o estado real da aplicação/serviço;
4. consulte a política `production.policies.rollback` do projeto;
5. confira backup/migration antes de restaurar qualquer coisa;
6. só gere um novo plano quando o estado de produção estiver entendido.

Para Home Music, uma falha durante `prod:deploy` pode incluir migration executada no startup; o backup/política do próprio projeto decide a recuperação.

Para Loto Lab, o dashboard continua tratando Docker Compose apenas como implementação interna dos scripts `prod:*`; a verificação do projeto é responsável por conhecer a porta interna/externa correta.

Para Vercel, rollback continua fora desta fase. Não promova um deployment anterior cegamente quando o schema já avançou.

## Códigos de erro comuns

| Código | Significado | Ação |
| --- | --- | --- |
| `DEPLOYMENT_PRODUCTION_UNAVAILABLE` | capability/contrato não permite a operação | valide `.dev-dashboard/production.json` e faça novo scan |
| `DEPLOYMENT_STRATEGY_UNSUPPORTED` | operação pedida não corresponde à estratégia | use o fluxo compatível com `command` ou `git-managed` |
| `DEPLOYMENT_BRANCH_MISMATCH` | branch atual difere da branch de produção | troque para a branch declarada |
| `DEPLOYMENT_WORKTREE_DIRTY` | existem mudanças locais | commit ou descarte conscientemente as mudanças |
| `DEPLOYMENT_REVISION_UNAVAILABLE` | Git/HEAD não pôde ser resolvido | verifique repositório e detached HEAD |
| `DEPLOYMENT_PLAN_STALE` | revision/plano mudou depois do preview | gere novo plano e nova confirmação |
| `DEPLOYMENT_CONFIRMATION_REQUIRED` | token ausente, expirado, usado ou incompatível | gere nova confirmação para o plano atual |
| `DEPLOYMENT_ALREADY_RUNNING` | já existe deployment ativo | acompanhe/cancele o atual antes de iniciar outro |
| `DEPLOYMENT_COMMAND_FAILED` | script `prod:*` terminou com erro | leia timeline/log e respeite o `failurePoint` |
| `DEPLOYMENT_CANCEL_NOT_AVAILABLE` | deployment já não está ativo | recarregue o estado atual |
| `DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE` | token Vercel não configurado | configure `VERCEL_TOKEN` no processo local |
| `DEPLOYMENT_PROVIDER_AUTH_FAILED` | credencial/escopo Vercel recusado | valide token e `VERCEL_TEAM_ID` sem registrar o segredo |
| `DEPLOYMENT_PROVIDER_QUOTA_EXCEEDED` | limite/cota externa | aguarde a janela informada pelo provider; não crie commits artificiais |
| `DEPLOYMENT_PROVIDER_PROJECT_NOT_FOUND` | `external.project` não existe no escopo | corrija o mapeamento explícito ou o escopo do time |
| `DEPLOYMENT_PROVIDER_UNAVAILABLE` | transporte/provider indisponível | tente novamente depois e mantenha drift como desconhecido |
| `DEPLOYMENT_PROVIDER_RESPONSE_INVALID` | resposta não passou pela validação local | trate como provider indisponível e investigue mudança de contrato/API |

## Diagnóstico pelo filesystem

Se a API não conseguir restaurar um histórico esperado, confira somente metadados e permissões:

```bash
ls -ld ~/.local/state/dev-dashboard/deployments
ls -l ~/.local/state/dev-dashboard/deployments
```

Não edite manualmente registros de deployment para mudar `failed` em `succeeded`, remover `recovery_required` ou fabricar uma confirmação. Arquivo local adulterado não é uma fonte confiável para autorizar nova mutação.

## O que não pertence a esta fase

O domínio ainda não:

- dispara deploy ou promoção Vercel;
- faz `git push` para promover produção;
- executa rollback Vercel automaticamente;
- considera `READY` equivalente a health;
- faz `git fetch` como efeito colateral da consulta de status;
- escolhe portas de projeto;
- conhece comandos systemd/Docker Compose internos;
- atualiza o próprio Dev Dashboard.

Essas responsabilidades permanecem explícitas em adapters ou fluxos separados.
