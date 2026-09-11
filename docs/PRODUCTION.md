# Produção

Este é o ponto de entrada canônico para a produção do **próprio Dev Dashboard**.

O projeto usa `strategy=self-update`, `provider=none` e branch `main`. Não existe `prod:deploy` local, provider externo para o próprio Dashboard, executor remoto genérico ou privilégio root/sudo no fluxo suportado.

Quando existe uma instalação local gerenciada por `local:install`, o self-update pode delegar o restart somente à unit fixa `dev-dashboard.service` via `systemctl --user restart`; esse detalhe operacional é resolvido pelo backend e nunca é escolhido pelo browser.

O self-update agent usa uma segunda unit fixa e gerenciada, `dev-dashboard-self-update-agent.service`. Ela pertence ao `systemd --user` e possui cgroup próprio, separado de `dev-dashboard.service`, para continuar disponível quando a API antiga é encerrada durante o handoff.

Documentação aprofundada:

- [`architecture/self-production.md`](architecture/self-production.md): protocolo completo de handoff, agent, worker, restart, revision e recovery;
- [`architecture/production-contract.md`](architecture/production-contract.md): contrato comum de Produção;
- [`architecture/deployment-domain.md`](architecture/deployment-domain.md): planner, confirmação, estados e recovery;
- [`deployment-operations.md`](deployment-operations.md): operação dos deployments;
- [`production-ui.md`](production-ui.md): experiência na aba Produção;
- [`architecture/security.md`](architecture/security.md): fronteiras de segurança;
- [`local-installation.md`](local-installation.md): instalação `systemd --user`, URL e troubleshooting.

## Contrato ativo

`.dev-dashboard/production.json` declara somente:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
commands.status=prod:status
commands.check=prod:check
```

Políticas de backup, migrations e rollback ficam `not-configured` para esta estratégia.

O parser rejeita `deploy`, `migrate`, `backup`, `verify` local ou provider externo para o self-update v1.

## Fluxo canônico

O gate normal de engenharia continua sendo:

```bash
npm run check
```

A operação do self-update acontece pela própria aba **Produção** sem exigir bootstrap manual do agent:

```text
Gerar plano
-> instalar/atualizar a release local do agent
-> garantir dev-dashboard-self-update-agent.service
-> provar readiness + MainPID da unit gerenciada
-> resolver origin/main
-> revisar revision + plano check -> self-update
-> confirmar planHash
-> executar
-> revalidar revision + readiness antes de cada etapa
-> check somente valida
-> handoff para agent externo
-> fast-forward da revision confirmada
-> restart
-> readiness + prova da revision
-> succeeded | failed | recovery_required
```

Não existe comando `npm run prod:deploy` para substituir esse fluxo.

## Bootstrap automático do agent

`Gerar plano` prepara o self-update agent antes de consultar `origin/main`. O backend resolve uma única operação local fixa, `scripts/self-update-agent-bootstrap.mjs ensure`, a partir da checkout registrada do projeto; o browser não fornece programa, `argv`, path, unit ou credencial.

O bootstrap é idempotente e executa somente o necessário para deixar a release local coerente:

1. instala/atualiza a release do agent a partir da checkout atual;
2. cria/atualiza somente a unit marcada `dev-dashboard-self-update-agent.service` em `systemd --user`;
3. executa `daemon-reload` e habilita a unit para a sessão do usuário;
4. consulta o agent pelo canal local autenticado;
5. se houver uma instância antiga ou iniciada fora da unit gerenciada, encerra essa instância e reinicia a unit própria;
6. exige `ping` com `status=ready`, a mesma release preparada e `pid` igual ao `MainPID` informado pelo systemd.

Essa prova de `MainPID` é importante: `detached: true` sozinho não retira um processo do cgroup de `dev-dashboard.service`. O bootstrap não considera o agent persistente apenas porque ele responde no socket; ele precisa responder **e** pertencer à unit separada. Assim o shutdown controlado da API não mata o processo que deve concluir o self-update.

Falhas de ownership, permissões, token, instalação, systemd, start ou readiness continuam falhando fechado. O bootstrap recusa sobrescrever uma unit com o mesmo nome quando o arquivo não contém o marcador de ownership do Dev Dashboard. O catálogo remoto do agent não é ampliado e a UI continua sem poder escolher shell/programa/argumentos/unit.

`npm run local:install` também prepara o agent automaticamente. Durante a execução de um plano `self-update`, a revalidação da revision volta a executar o mesmo `ensure` antes das etapas, inclusive imediatamente antes do handoff. Assim a operação normal não exige `self-update:agent install/start` manual, enquanto `prod:check` permanece estritamente de leitura/validação.

## `prod:status`

```bash
npm run prod:status
```

É somente leitura. Mostra se o contrato de self-production está habilitado e se o agent está disponível/pronto.

## `prod:check`

```bash
npm run prod:check
```

É o preflight específico da self-production e permanece somente leitura. Ele valida o contrato fechado e as capacidades necessárias de ownership/inspeção, incluindo a disponibilidade/readiness atual do agent, sem instalar, iniciar, reiniciar ou alterar a release local.

`prod:check` é diferente de `npm run check`:

- `npm run check` é o gate normal de engenharia/CI;
- `npm run prod:check` valida a infraestrutura local de self-update nesta máquina sem mutá-la.

Um não substitui o outro.

## Agent e tooling interno

Os scripts abaixo são tooling de engenharia, não uma segunda interface pública de deploy:

```bash
npm run self-update:ensure
npm run self-update:helper -- ...
npm run self-update:agent -- ...
```

`self-update:ensure` existe para diagnóstico/engenharia; o uso normal pela UI chama o mesmo bootstrap automaticamente. O lifecycle persistente suportado é a unit `dev-dashboard-self-update-agent.service`; iniciar manualmente o processo do agent não substitui a prova de ownership dessa unit.

O fluxo suportado sempre passa pelo Production Contract, planner, confirmação vinculada ao `planHash` e revalidação da revision.

O agent instalado vive fora da checkout, em user-space, e usa canal local autenticado. O catálogo remoto não aceita shell/programa/argv/path arbitrários.

Para diagnóstico da unit do agent:

```bash
systemctl --user status dev-dashboard-self-update-agent.service --no-pager -l
journalctl --user -u dev-dashboard-self-update-agent.service -n 120 --no-pager
npm run self-update:ensure
```

## Aplicação da revision

O worker revalida:

- checkout válida e pertencente ao usuário;
- projeto `dev-dashboard`;
- working tree completamente limpa;
- branch local `main`;
- `origin/main` ainda igual à revision confirmada;
- HEAD ancestral da revision alvo.

A aplicação permitida é somente:

```text
git merge --ff-only <targetRevision>
```

Não existe `reset --hard`, descarte automático de mudanças locais ou checkout forçado.

## Restart e prova da revision

Depois de aplicar a revision, existem dois caminhos controlados:

### Runtime não gerenciado

Sem instalação local válida para a mesma checkout, o worker inicia a distribuição por `scripts/dev-web.mjs` em processo destacado e aguarda readiness.

### Runtime gerenciado por `local:install`

O handoff para `dev-web.mjs` propaga duas evidências internas derivadas do contexto já validado:

```text
DEV_DASHBOARD_RUNTIME_REVISION=<targetRevision>
DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT=<canonicalRepositoryRoot>
```

`dev-web.mjs` só delega para:

```text
systemctl --user restart dev-dashboard.service
```

quando a raiz real do handoff coincide com a checkout instalada, os metadados de `local:install` são válidos e a unit fixa possui o marcador de ownership do instalador. Nome de unit, path e comando não vêm do browser.

A unit principal e a unit do agent são deliberadamente diferentes:

```text
dev-dashboard.service                    # API/UI, pode ser parada no handoff
dev-dashboard-self-update-agent.service  # agent persistente, precisa sobreviver
```

Em ambos os caminhos, sucesso exige duas provas:

1. `/api/health` saudável;
2. header `x-dev-dashboard-revision` exatamente igual à revision alvo.

Uma porta que voltou com código antigo não é considerada sucesso.

## Recovery

Depois que a aplicação da revision começou, incerteza relevante é tratada de forma conservadora.

Casos como falha de fast-forward, runtime que não volta, readiness expirado, revision divergente ou resultado terminal não confiável podem resultar em:

```text
recovery_required
```

Não existe rollback automático cego.

Se um runtime gerenciado não voltar, diagnostique a causa antes de repetir o deployment. Um restart manual da unit pode recuperar a disponibilidade, mas o estado do handoff/deployment ainda precisa ser reconciliado; recuperação operacional não fabrica `succeeded`.

## Produção de projetos gerenciados pelo Dashboard

Este documento trata a produção do **Dev Dashboard em si**. Para entender como ele opera outros projetos:

- `strategy=command`: scripts `prod:*` canônicos do projeto alvo;
- `strategy=git-managed`: provider externo explícito, como Vercel, sem `prod:deploy` artificial;
- `strategy=self-update`: somente o protocolo fechado do próprio Dashboard.

Consulte [`architecture/production-contract.md`](architecture/production-contract.md) e [`guia/producao.md`](guia/producao.md).

## Checklist antes de considerar a atualização concluída

- `npm run check` verde no código que será promovido;
- `prod:status` coerente;
- `prod:check` verde quando executado para diagnóstico;
- `dev-dashboard-self-update-agent.service` ativo e com `MainPID` igual ao `pid` autenticado do agent;
- working tree limpa;
- plano aponta para a revision correta de `origin/main`;
- confirmação corresponde ao `planHash` atual;
- resultado final comprova readiness + revision;
- qualquer estado `recovery_required` foi tratado antes de nova tentativa destrutiva.
