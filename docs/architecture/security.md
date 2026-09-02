# Segurança e modelo de ameaça

O Dev Dashboard executa operações reais na máquina da pessoa usuária: lê arquivos e repositórios, inicia processos, executa testes, acessa bancos e pode coordenar deployments de produção. Por isso, “rodar localmente” não é uma fronteira de segurança suficiente.

A regra central é reduzir a autoridade do navegador e tornar mutações relevantes explícitas, limitadas, revalidadas e auditáveis.

## Modelo de ameaça

| Ameaça | Exemplo | Mitigação principal |
| --- | --- | --- |
| Origem web não autorizada | página externa chama a API local | loopback + allowlist de `Origin` + autenticação/sessão |
| Execução arbitrária | browser envia linha de shell | catálogo fechado + programa/args resolvidos no backend |
| Path traversal/symlink | path escapa do projeto | resolução canônica + revalidação no momento da operação |
| Mutação acidental | exclusão/restore/deploy por clique indevido | preview + confirmação vinculada ao alvo |
| TOCTOU | estado muda entre preview e execução | versões/revisions/hash revalidados antes da mutação |
| Exposição de segredo | token aparece em log/resposta | masking + limites + credenciais fora dos contratos públicos |
| Provider externo comprometido/instável | resposta Vercel inesperada | tamanho/shape limitados + erros sanitizados + fail-closed |
| Processo/execução órfã | API encerra durante mutação | persistência de estado + ownership externo + recovery conservador |
| Estado persistido adulterado | JSON local é editado | diretórios privados + validação + ausência de autorização por arquivo isolado |
| Self-update adulterado | checkout muda após confirmação | agent instalado/verificado + revision remota exata + fast-forward + prova pós-restart |

## Local-first

API e frontend de desenvolvimento escutam em `127.0.0.1`. Loopback reduz exposição de rede, mas não substitui autenticação: páginas abertas no navegador ainda podem tentar conversar com serviços locais.

O self-update agent não abre TCP; ele usa Unix socket privado.

## Origem e autenticação

A API mantém allowlist explícita de origens locais. A distribuição local usa uma capacidade efêmera de bootstrap para emitir sessão curta em cookie `HttpOnly`/`SameSite=Strict`. Clientes locais não navegador usam `X-Dev-Dashboard-Token`.

Tokens persistentes e capacidades efêmeras:

- não entram no bundle web;
- não devem aparecer em logs;
- não são enviados a providers externos;
- permanecem fora do repositório.

`GET /api/health` é a única rota HTTP pública.

## Catálogo fechado de ações

O frontend envia identificadores e payloads estruturados, não uma linha de comando.

Preferido:

```ts
spawn('git', ['branch', '--delete', '--force', '--', branchName], {
  shell: false,
});
```

Proibido para ações estruturadas:

```ts
exec(`git ${argumentFromBrowser}`);
spawn('bash', ['-lc', commandFromBrowser]);
```

Quando uma ferramenta interpreta padrões/expressões, o backend impõe limites e validação antes da execução.

## Caminhos e arquivos

Operações de filesystem devem preferir `projectId`/IDs internos e paths relativos. Antes de ler/escrever:

1. resolve a raiz canônica conhecida pelo `ProjectStore`;
2. resolve o candidato;
3. valida que ele continua sob a raiz permitida;
4. revalida symlinks/versão quando a operação é mutável;
5. aplica limites de tamanho, tipo e encoding.

Uma comparação textual simples com `startsWith()` não é garantia suficiente.

O browser não escolhe path absoluto de destino fora do contrato da rota.

## Confirmações

Operações sensíveis usam tokens temporários vinculados a recurso, operação, alvo, contexto e expiração. Um token não pode ser reutilizado para outra mutação.

Exemplos:

- apagar branch;
- descartar arquivo;
- restaurar snapshot;
- executar ação sensível;
- iniciar deployment de produção.

## Deployments de produção

Um `Production Contract v1` válido declara capabilities e políticas, mas não concede autorização genérica para mutar produção.

### Invariantes comuns

Para `strategy=command` e `strategy=git-managed`:

- branch e SHA são resolvidos pelo backend;
- working tree precisa estar limpa, incluindo arquivos não rastreados;
- plano contém projeto, provider, branch, revision e etapas;
- `planHash` é determinístico sobre esse contexto;
- confirmação é vinculada a `projectId + revision + planHash`, expira e é de uso único;
- `start()` recalcula/revalida o plano antes de consumir a confirmação;
- browser não envia programa, argumentos, `cwd`, corpo de script ou credencial de provider;
- logs/erros persistidos são limitados e sanitizados;
- falha depois de etapa irreversível pode resultar em `recovery_required`, nunca rollback cego.

### `strategy=command`

Somente scripts `prod:*` canônicos reconhecidos no contrato podem virar etapas. Package manager, argumentos e `cwd=Project.path` são resolvidos no backend. Execuções usam `shell: false`, stdin fechado e encerramento controlado com TERM antes de KILL.

O dashboard não interpreta comandos internos de systemd ou Docker Compose; essa implementação permanece no projeto alvo.

### Ambiente local de produção por projeto

Etapas locais que realmente consultam ou alteram produção podem receber segredos específicos do projeto a partir do caminho fixo `<Project.path>/.dev-dashboard/.env.production.local`. O browser não escolhe esse path nem envia o conteúdo do arquivo.

`prod:check` é isolado dessa configuração por design.

O backend trata esse arquivo como configuração local sensível:

- ausência é aceita;
- somente arquivo regular é aceito;
- tamanho máximo é 64 KiB;
- conteúdo inválido/ilegível falha fechado;
- mensagem de erro não inclui o conteúdo;
- valores entram somente no ambiente do processo filho correspondente;
- conteúdo não é persistido nem retornado pela API;
- `prod:check` e `provider-deploy` não leem esse arquivo.

Credenciais de provider continuam fora desse arquivo.

### `strategy=git-managed` + Vercel

O deploy Vercel usa uma etapa própria `provider-deploy`; não existe `prod:deploy` local fictício.

Antes da promoção, o backend consulta diretamente a revision de `origin/<production.branch>` e exige igualdade com o SHA confirmado. Uma ref local de tracking não é prova suficiente.

A origem GitHub é derivada do remote reconhecido pelo backend. O browser não escolhe `owner`, `repo`, branch ou SHA.

A Vercel recebe `target=production`, projeto declarado no contrato, branch e SHA exatos confirmados.

### Credenciais Vercel

`VERCEL_TOKEN` e o opcional `VERCEL_TEAM_ID` existem somente no ambiente local do Dev Dashboard. `npm run dev` pode carregá-los de `.env.local`; `.env.example` documenta o formato sem conter segredo.

Essas credenciais:

- não pertencem a `.dev-dashboard/production.json`;
- não são persistidas no `DeploymentStore`;
- não são retornadas pela API;
- não são aceitas em request do browser;
- não entram em mensagens sanitizadas do provider.

### Resposta externa, polling e retry

O adapter limita tamanho de resposta, valida campos usados e converte falhas para códigos locais `DEPLOYMENT_PROVIDER_*`. Corpo bruto do provider não é repassado ao navegador nem salvo como log operacional.

Polling de deployment é bounded. `READY` prova conclusão da etapa do provider, não saúde funcional; `prod:verify` permanece separado.

Se somente o verify final falhar depois de promoção concluída, o backend pode repetir apenas `prod:verify` quando timeline, revision, contrato e ordem histórica provam que o caso é seguro.

## Sudo em deployment local

A autorização temporária de sudo existe apenas para etapas locais que realmente exigem privilégio.

A senha:

- é usada somente em `sudo -S -v`;
- não é persistida;
- não entra em log;
- não é colocada no ambiente;
- não é encaminhada ao stdin do `prod:*`.

Se o ticket não for delegável para a árvore real do deployment, o dashboard falha fechado e orienta privilégio mínimo específico. O dashboard não edita sudoers e não desabilita políticas de timestamp.

## Self-update agent

Self-update é uma fronteira separada porque a API antiga precisa poder encerrar sem perder ownership.

O Production Contract continua fail-closed mesmo com a cadeia operacional implementada:

```text
production.enabled=false
strategy=disabled
provider=none
```

O PR D é responsável pela revisão/habilitação final; o PR C não cria rota pública nem bypass do planner.

### Handoff persistente

O handoff contém somente ID, `action=self-update`, `projectId`, `targetRevision`, `planHash`, estados/timestamps e resultado terminal sanitizado.

Ele não contém shell, programa, argumentos, checkout, unit ou credencial. Arquivos vivem em diretório privado e são revalidados na leitura.

### Instalação do agent

A checkout não é o executável de longa duração. `self-update:agent install` copia apenas arquivos conhecidos para uma release fora do projeto e calcula SHA-256.

Antes do start são validados manifesto, owner, permissões, symlinks, arquivos e hashes. O modo `serve` precisa apontar exatamente para a release instalada.

### Canal Unix local

O agent usa Unix socket em diretório `0700`, socket `0600` e token próprio separado do token HTTP.

O catálogo remoto permanece:

```text
ping
inspect
claim
recover
```

Nenhuma request aceita programa, args, shell, unit, checkout, instalação, URL ou credencial. O #523 **não adiciona `execute` remoto** ao socket.

### Integração API → agent e shutdown

`SelfUpdateHandoffService` usa scripts/argv fixos:

1. valida `projectId`, revision e `planHash`;
2. faz `ping` autenticado;
3. persiste `prepare`;
4. transfere ownership por `claim` do mesmo handoff;
5. chama localmente `execute <handoff-id>`;
6. exige `execution.lock` privado com o PID e handoff ID retornados;
7. confirma que esse PID continua vivo;
8. só então agenda `SIGTERM` para a API atual.

O `execute` local faz preflight antes de spawnar o worker. Assim, “processo nasceu” não é tratado como prova suficiente de ownership.

O lock é validado por tipo, symlink, owner, permissão, tamanho e conteúdo fechado. Lock de outro handoff/processo falha fechado.

### Checkout e Git

A checkout precisa ser diretório absoluto real, pertencente ao usuário, com `package.json` de `dev-dashboard`, working tree limpa e branch `main`.

O executor consulta `origin/main` por fetch, exige igualdade com `targetRevision` e prova fast-forward. A aplicação é somente:

```text
git merge --ff-only <targetRevision>
```

Depois comprova `HEAD == targetRevision`. Não há `reset --hard` nem descarte automático de estado local.

### Restart e proof-of-revision

O worker aguarda a API antiga sair, aplica a revision, reinstala a release do agent e inicia `scripts/dev-web.mjs` destacado.

O restart é user-space: sem `sudo`, `systemctl` ou unit configurável.

A API mantém o JSON público de `/api/health` estável. No runtime iniciado pelo worker, a revision validada é publicada no header:

```text
x-dev-dashboard-revision: <targetRevision>
```

O worker só aceita readiness quando `status=ok`, `service=dev-dashboard-api` e esse header contém exatamente a revision alvo. O valor do body não pode substituir a prova do header.

`DEV_DASHBOARD_RUNTIME_REVISION` é preenchida internamente pelo worker a partir da revision já validada/aplicada. Ela não é input do browser nem configuração manual suportada para autorizar self-update.

### Recovery

Falha antes da mutação pode terminar em `failed`. Depois de `applying`, falha vira `recovery_required`.

O teste de integração real cobre inclusive o caso em que a nova porta volta saudável, mas com revision diferente: health sem a prova exata não produz sucesso e o handoff termina em recovery.

No startup, o agent também marca handoffs anteriormente assumidos e sem resultado terminal como `recovery_required`. Não há rollback automático cego.

### Privilégio

O PR C usa somente privilégios do usuário atual. Fastify não recebe sudo amplo e a senha de deployment não é reutilizada.

A revisão final ainda precisa confirmar se esse modelo user-space é suficiente para a habilitação. Se o PR D exigir root/systemd, isso será uma nova fronteira que deverá usar uma ação mínima instalada fora da checkout e sem unit/path/comando livre.

## Git

Nomes de branch e parâmetros passam por validação. Subcomandos usam `--` quando nomes/paths poderiam ser interpretados como flags.

Mutações Git importantes são vinculadas a confirmação/revalidação quando necessário. Para produção git-managed e self-update, a prova do remote usa consulta Git separada do estado local de tracking.

## Processos

Processos gerenciados usam:

- comando/catálogo conhecido;
- `cwd` controlado;
- `shell: false` quando aplicável;
- grupos de processo;
- limites de logs;
- validação de identidade antes de sinalizar PID;
- TERM antes de KILL;
- cleanup em shutdown.

O worker de self-update tem lifecycle/store próprios porque precisa sobreviver ao Fastify antigo.

## Terminal e Console

Terminal/Console são exceções deliberadas ao catálogo fechado porque oferecem shell interativo real. Por isso possuem confirmação/avisos próprios, limite de sessões e encerramento quando a conexão fecha.

Eles não devem ser usados como implementação oculta de ação estruturada que poderia ter contrato próprio.

## Execuções destacáveis PTY

Testes completos, Migration Rails e Dependências/Build podem usar PTY destacável sem canal de input arbitrário. O comando continua vindo do resolver fechado; saída é limitada/mascarada e uma única execução por chave é permitida.

## Logs e masking

Logs podem conter tokens, senhas, cookies, URLs de banco, headers e variáveis de ambiente.

A proteção exige:

- tamanho limitado;
- leitura apenas de arquivos derivados de IDs controlados;
- masking antes de persistir/retornar conteúdo sensível;
- mensagens externas produzidas localmente a partir de estados normalizados;
- ausência de bodies brutos de providers.

Novos padrões sensíveis devem ser centralizados e cobertos por testes.

## Persistência local

Estado/configuração ficam fora do repositório, em diretórios privados.

Padrões principais:

```text
~/.config/dev-dashboard
~/.local/state/dev-dashboard
~/.local/lib/dev-dashboard/self-update-agent
```

Tokens locais e arquivos sensíveis usam permissões privadas. Estado persistido é tratado como dado não confiável na leitura: tipo, symlink, tamanho, shape e permissões são revalidados.

## Regra de fechamento

Uma capacidade de produção/self-update só é considerada segura quando comportamento, documentação e testes concordam.

O PR #523 fecha a cadeia operacional e o teste real de restart/recovery. O contrato continua fechado até a revisão específica de privilégio/segurança e a habilitação explícita do PR D.
