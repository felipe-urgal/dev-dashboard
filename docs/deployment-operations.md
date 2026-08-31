# Operação de deployments locais

Este guia cobre a operação do motor de deployment local do Dev Dashboard. Ele se aplica somente a projetos com `Production Contract v1` válido, `production.enabled=true` e `strategy=command`.

Os detalhes arquiteturais e de segurança estão em:

- [Production Contract v1](architecture/production-contract.md);
- [Domínio de deployment local](architecture/deployment-domain.md);
- [Segurança e modelo de ameaça](architecture/security.md).

## Antes de gerar um plano

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

## Fluxo operacional

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

## Concorrência

Nesta versão existe no máximo um deployment ativo globalmente. Se outro projeto estiver em produção, uma nova execução retorna `DEPLOYMENT_ALREADY_RUNNING`.

Essa restrição é intencional. Não encerre o processo do Dev Dashboard para contorná-la: uma interrupção força a recuperação do histórico ativo e pode produzir `recovery_required`.

## Persistência

O domínio grava estado em:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/deployments/
```

O diretório deve permanecer privado (`0700`) e os arquivos são gravados como `0600`.

Cada deployment possui:

- um registro JSON com revision, plano, estado e timeline;
- um log JSON separado, limitado e já mascarado.

O histórico é limitado a 50 deployments por projeto por padrão. Logs preservam no máximo 512 KiB da cauda UTF-8 por deployment.

Tokens de confirmação não são gravados em disco.

## Cancelamento

Cancelar sinaliza o processo atual com `SIGTERM`. Se ele não encerrar, o adapter escalona para `SIGKILL` após a janela de encerramento.

O resultado depende de onde a execução estava:

- antes de etapa irreversível: `cancelled`;
- durante/depois de etapa irreversível: `recovery_required`.

Um cancelamento HTTP bem-sucedido significa que o pedido de cancelamento foi aceito; consulte novamente o deployment para observar o estado terminal.

## Reinício ou crash do Dev Dashboard

Na inicialização, registros que estavam em estados ativos são recuperados como interrompidos.

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

## Códigos de erro comuns

| Código | Significado | Ação |
| --- | --- | --- |
| `DEPLOYMENT_PRODUCTION_UNAVAILABLE` | capability/contrato não permite produção local | valide `.dev-dashboard/production.json` e faça novo scan |
| `DEPLOYMENT_STRATEGY_UNSUPPORTED` | estratégia não é `command` | aguarde/use o adapter específico do provider |
| `DEPLOYMENT_BRANCH_MISMATCH` | branch atual difere da branch de produção | troque para a branch declarada |
| `DEPLOYMENT_WORKTREE_DIRTY` | existem mudanças locais | commit ou descarte conscientemente as mudanças |
| `DEPLOYMENT_REVISION_UNAVAILABLE` | Git/HEAD não pôde ser resolvido | verifique repositório e detached HEAD |
| `DEPLOYMENT_PLAN_STALE` | revision/plano mudou depois do preview | gere novo plano e nova confirmação |
| `DEPLOYMENT_CONFIRMATION_REQUIRED` | token ausente, expirado, usado ou incompatível | gere nova confirmação para o plano atual |
| `DEPLOYMENT_ALREADY_RUNNING` | já existe deployment ativo | acompanhe/cancele o atual antes de iniciar outro |
| `DEPLOYMENT_COMMAND_FAILED` | script `prod:*` terminou com erro | leia timeline/log e respeite o `failurePoint` |
| `DEPLOYMENT_CANCEL_NOT_AVAILABLE` | deployment já não está ativo | recarregue o estado atual |

## Diagnóstico pelo filesystem

Se a API não conseguir restaurar um histórico esperado, confira somente metadados e permissões:

```bash
ls -ld ~/.local/state/dev-dashboard/deployments
ls -l ~/.local/state/dev-dashboard/deployments
```

Não edite manualmente registros de deployment para mudar `failed` em `succeeded`, remover `recovery_required` ou fabricar uma confirmação. Arquivo local adulterado não é uma fonte confiável para autorizar nova mutação.

## O que não pertence a este motor

O motor local não:

- executa Vercel ou outro provider `git-managed`;
- faz `git push` para promover produção;
- escolhe portas de projeto;
- conhece comandos systemd/Docker Compose internos;
- executa rollback automaticamente;
- atualiza o próprio Dev Dashboard.

Essas responsabilidades são adapters ou fluxos separados.
