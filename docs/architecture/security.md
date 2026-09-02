# Segurança e modelo de ameaça

O Dev Dashboard executa operações reais na máquina da pessoa usuária: lê arquivos e repositórios, inicia processos, executa testes, acessa bancos e pode coordenar deployments de produção. Por isso, “rodar localmente” não é uma fronteira de segurança suficiente.

A regra central é reduzir a autoridade do navegador e tornar mutações relevantes explícitas, limitadas e auditáveis.

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
| Processo/execução órfã | API encerra durante mutação | persistência de estado + recovery conservador |
| Estado persistido adulterado | JSON local é editado | diretórios privados + validação + ausência de autorização por arquivo isolado |

## Local-first

API e frontend de desenvolvimento escutam em `127.0.0.1`. O produto não possui capacidade de IA ativa.

Loopback reduz exposição de rede, mas não substitui autenticação: páginas abertas no navegador ainda podem tentar conversar com serviços locais.

## Origem e autenticação

A API mantém uma allowlist explícita de origens locais. No desenvolvimento padrão:

```text
http://127.0.0.1:5173
http://localhost:5173
```

A distribuição local usa uma capacidade efêmera de bootstrap para emitir uma sessão curta em cookie `HttpOnly`/`SameSite=Strict`. Clientes locais não navegador usam `X-Dev-Dashboard-Token`.

Tokens persistentes e capacidades efêmeras:

- não entram no bundle web;
- não devem aparecer em logs;
- não são enviados a providers externos;
- permanecem fora do repositório.

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

Quando uma ferramenta interpreta padrões/expressões, o backend deve impor limites e validação antes da execução.

## Caminhos e arquivos

Operações de filesystem devem preferir `projectId`/IDs internos e paths relativos. Antes de ler/escrever:

1. resolve a raiz canônica conhecida pelo `ProjectStore`;
2. resolve o candidato;
3. valida que ele continua sob a raiz permitida;
4. revalida symlinks/versão quando a operação é mutável;
5. aplica limites de tamanho, tipo e encoding.

Uma comparação textual simples com `startsWith()` não é uma garantia suficiente.

Escritas sensíveis usam comparação de versão e confirmação quando aplicável. O browser não escolhe um path absoluto de destino fora do contrato da rota.

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
- o plano contém projeto, provider, branch, revision e etapas;
- `planHash` é determinístico sobre esse contexto;
- a confirmação é vinculada a `projectId + revision + planHash`, expira e é de uso único;
- `start()` recalcula/revalida o plano antes de consumir a confirmação;
- browser não envia programa, argumentos, `cwd`, corpo de script ou credencial de provider;
- logs/erros persistidos são limitados e sanitizados;
- falha depois de etapa irreversível pode resultar em `recovery_required`, nunca rollback cego.

### `strategy=command`

Somente scripts `prod:*` canônicos reconhecidos no contrato podem virar etapas. Package manager, argumentos e `cwd=Project.path` são resolvidos no backend. Execuções usam `shell: false`, stdin fechado e encerramento controlado com TERM antes de KILL.

O dashboard não interpreta comandos internos de systemd ou Docker Compose; essa implementação permanece no projeto alvo.

### Ambiente local de produção por projeto

Etapas locais que realmente consultam ou alteram produção podem receber segredos específicos do projeto a partir do caminho fixo `<Project.path>/.dev-dashboard/.env.production.local`. O browser não escolhe esse path nem envia o conteúdo do arquivo.

`prod:check` é isolado dessa configuração por design. Ele não recebe `.env.production.local`, porque check normalmente executa lint, typecheck, testes e build. Dar credenciais de produção a essa etapa permitiria que uma suíte de testes que usa `DATABASE_URL`, por exemplo, alcançasse o banco de produção antes de qualquer migration ou promoção.

O backend trata esse arquivo como configuração local sensível nas etapas que o consomem:

- ausência é aceita;
- somente arquivo regular é aceito, o que rejeita diretórios e symlinks nesse caminho;
- o tamanho máximo é 64 KiB;
- conteúdo inválido ou ilegível falha fechado antes de iniciar a primeira etapa que precisa dele;
- mensagens de erro não incluem o conteúdo do arquivo;
- valores são adicionados somente ao ambiente do processo filho correspondente e não alteram `process.env` do Dev Dashboard;
- valores do arquivo prevalecem sobre variáveis homônimas herdadas somente naquela execução;
- conteúdo não é persistido nem retornado pela API;
- `prod:check` e `provider-deploy` não leem esse arquivo.

O arquivo deve ser ignorado pelo Git e mantido com permissões locais restritas. Se ele não estiver ignorado, a própria regra de working tree limpa também pode bloquear o plano. Credenciais de provider continuam fora desse arquivo; por exemplo, `VERCEL_TOKEN` pertence ao `.env.local` do Dev Dashboard.

### `strategy=git-managed` + Vercel

O deploy Vercel usa uma etapa própria `provider-deploy`; não existe `prod:deploy` local fictício.

Antes da promoção, existe uma defesa adicional: o backend consulta diretamente a revision de `origin/<production.branch>` e exige igualdade com o SHA confirmado. Uma ref local de tracking não é usada como prova suficiente quando a mutação depende do remote real.

Se o remote não puder ser consultado, a branch não existir ou o SHA tiver mudado, a operação falha **antes** da criação do deployment.

A origem GitHub é derivada do remote reconhecido pelo backend. O browser não escolhe `owner`, `repo`, branch ou SHA. A Vercel recebe:

```text
target=production
project=production.external.project
ref=production.branch
sha=revision confirmada
```

Enviar o SHA exato reduz a janela de corrida de uma branch móvel.

### Credenciais Vercel

`VERCEL_TOKEN` e o opcional `VERCEL_TEAM_ID` existem somente no ambiente local do processo do Dev Dashboard. `npm run dev` pode carregá-los de `.env.local`.

Essas credenciais:

- não pertencem a `.dev-dashboard/production.json`;
- não são persistidas no `DeploymentStore`;
- não são retornadas pela API;
- não são aceitas em request do browser;
- não entram em mensagens sanitizadas do provider.

### Resposta externa e polling

O adapter limita o tamanho das respostas, valida os campos usados e converte falhas para códigos locais `DEPLOYMENT_PROVIDER_*`. Corpo bruto do provider não é repassado ao navegador nem salvo como log operacional.

Depois da criação, o polling é bounded e acompanha o deployment específico até estado terminal. `READY` prova conclusão da etapa do provider, **não** saúde funcional da aplicação; `prod:verify` permanece separado.

### Cancelamento e recovery

Cancelar `provider-deploy` interrompe o polling local e tenta cancelamento remoto quando suportado. A tentativa é best-effort; se a promoção/migration já começou, a execução pode terminar em `recovery_required`.

### Retry de verify

Se somente o `verify` final falhou depois de uma promoção concluída, o backend pode repetir apenas `prod:verify` quando timeline, revision, contrato e ordem histórica provam que o caso é seguro.

O retry não repete `check`, backup, migration, `prod:deploy` ou `provider-deploy`.

## Sudo em deployment local

A autorização temporária de sudo existe apenas para etapas locais que realmente exigem privilégio.

A senha:

- é usada somente em `sudo -S -v`;
- não é persistida;
- não entra em log;
- não é colocada no ambiente;
- não é encaminhada ao stdin do `prod:*`.

Depois da validação inicial, a API executa `sudo -n -v` a partir de outro processo pai para aproximar a árvore real do deployment. Isso detecta políticas como `timestamp_type=ppid`, em que o ticket aceito pela API não seria reutilizável por `npm -> shell -> script`.

Se o ticket não for delegável, o dashboard falha fechado com `DEPLOYMENT_SUDO_TICKET_NOT_DELEGATED` e orienta uma regra `NOPASSWD` **limitada** ao helper necessário. O dashboard não edita sudoers, não desabilita políticas de timestamp e não repassa senha ao projeto.

## Self-update agent

O self-update agent é uma fronteira local separada da API HTTP. Ele existe para que um processo continue dono do handoff quando o Fastify precisar parar em uma futura atualização.

### Instalação

A checkout do repositório não é o executável de longa duração. `self-update:agent install` copia somente um conjunto fechado de arquivos para uma release fora da árvore do projeto e calcula SHA-256 de cada arquivo.

Antes do start:

- `current.json` precisa ser arquivo privado regular e shape válido;
- release precisa ser diretório real, privado e pertencente ao usuário atual;
- cada arquivo precisa ser regular, não symlinkado e sem permissão para grupo/outros;
- hash precisa coincidir com o manifesto;
- o entrypoint do modo `serve` precisa ser exatamente o entrypoint da release instalada.

Uma alteração na checkout depois da instalação não modifica o processo já instalado. Esta propriedade ainda não equivale a isolamento root: o agent atual é user-space e não possui privilégio.

### Canal Unix local

O agent não abre TCP. O canal usa Unix socket em diretório privado `0700`, com o socket em `0600`.

O socket sozinho não é tratado como autenticação suficiente. Existe um token específico do agent, aleatório, privado (`0600`) e separado do token HTTP da API. O token:

- nunca entra em handoff;
- não volta em resposta;
- não deve aparecer em log;
- é comparado em tempo constante;
- não é fornecido pelo browser.

Cada conexão aceita uma única mensagem JSON com limite de tamanho. Shape e ação são fechados. O catálogo atual é somente:

```text
ping
inspect
claim
recover
```

Nenhuma request aceita programa, args, shell, unit, path de checkout, path de instalação, URL ou credencial.

`claim` e `recover` são serializados dentro do agent para evitar corrida de escrita no estado persistido. `inspect` permanece somente leitura.

### Lifecycle e identidade

O processo instalado é iniciado com `process.execPath`, array fixo de argumentos, `shell: false` e `detached: true`. Reiniciar a API/web não encerra o agent.

O controle de `stop` não confia em PID persistido isoladamente: primeiro executa `ping` autenticado no socket e recebe o PID/`instanceId` da instância viva; só então envia `SIGTERM` ao PID retornado.

Socket stale só pode ser removido quando o path existente é um socket real pertencente ao usuário e não aceita conexões. Arquivo arbitrário/symlink no mesmo path falha fechado.

### Recovery

No startup, o agent marca conservadoramente handoffs anteriormente assumidos e sem resultado terminal como `recovery_required`. Ele não inventa sucesso e não executa rollback automático.

O catálogo atual ainda não contém aplicação de revision, restart, readiness ou qualquer ação privilegiada. Esses itens exigem revisão adicional antes de alterar `production.enabled=false`.

## Git

Nomes de branch e parâmetros passam por validação. Subcomandos usam `--` quando nomes/paths poderiam ser interpretados como flags.

Mutações Git importantes são vinculadas a confirmação e revalidam contexto quando necessário. Para produção git-managed, a prova do remote usa uma consulta Git separada da ref local de tracking.

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

## Terminal e Console

Terminal/Console são exceções deliberadas ao catálogo fechado porque oferecem shell interativo real. Por isso possuem confirmação/avisos próprios, limite de sessões e encerramento quando a conexão é fechada. Eles não devem ser usados como implementação oculta de uma ação estruturada que poderia ter contrato próprio.

## Execuções destacáveis PTY

Testes completos, Migration Rails e Dependências/Build podem usar PTY destacável sem canal de input arbitrário. O comando continua vindo do resolver fechado; a saída é limitada e mascarada; uma única execução por chave é permitida.

## Logs e masking

Logs podem conter tokens, senhas, cookies, URLs de banco, headers e variáveis de ambiente. A proteção exige:

- tamanho limitado;
- leitura apenas de arquivos derivados de IDs controlados;
- `maskSensitiveLogContent` antes de persistir/retornar conteúdo sensível;
- mensagens externas produzidas localmente a partir de estados normalizados;
- ausência de bodies brutos de providers.

Novos padrões sensíveis devem ser centralizados e cobertos por testes.

## Persistência local

Estado/configuração ficam fora do repositório, em diretórios privados. Regra padrão:

```text
diretório: 0700
arquivo:   0600
```

Não persistir por conveniência:

- tokens de confirmação;
- bootstrap tokens;
- `VERCEL_TOKEN`/credenciais externas;
- senhas;
- respostas brutas de providers;
- conteúdo de arquivos quando um ID/metadado basta.

O token do self-update agent é uma credencial local persistente necessária para autenticar o canal Unix. Ele fica separado dos handoffs, privado e não é reutilizado como token HTTP da API.

## Banco de dados

Snapshots/restores usam drivers conhecidos, paths internos e confirmação para restore.

O Database Explorer livre é somente leitura e aplica defesa em profundidade:

- PostgreSQL em transação read-only com timeouts;
- MySQL/MariaDB em `START TRANSACTION READ ONLY`;
- uma única instrução `SELECT`/`WITH` dentro dos limites;
- bloqueio de DML/DDL, locking reads e funções administrativas conhecidas;
- limite de linhas/bytes/tempo;
- credenciais passadas diretamente aos drivers, nunca por shell/argv público;
- erros traduzidos para códigos `DATABASE_EXPLORER_*`.

Uma transação read-only não transforma uma credencial poderosa em sandbox universal. Use usuário de banco com o menor privilégio necessário.

## Testes de segurança obrigatórios

Mudanças sensíveis devem cobrir o risco relevante, por exemplo:

- origem/sessão negadas;
- confirmação expirada ou incompatível;
- path/symlink fora do escopo;
- working tree suja;
- plano stale;
- revision remota divergente ou indisponível antes de Vercel;
- credencial Vercel ausente/recusada;
- `prod:check` sem acesso ao `.env.production.local`;
- ambiente local de produção inválido/não regular nas etapas que o consomem;
- resposta externa inválida ou acima do limite;
- interrupção/cancelamento depois de etapa irreversível;
- retry de verify sem repetir mutação;
- ticket sudo não delegável;
- masking de log;
- token/socket do self-update agent com permissões inválidas;
- request do agent com campo/ação não catalogados;
- release instalada adulterada, symlinkada ou com hash divergente;
- concorrência de mutações do handoff;
- restart do agent com handoff já assumido.

## Erros seguros

O frontend não deve receber stack traces, segredos, bodies integrais externos ou paths desnecessariamente amplos. Erros operacionais usam códigos estáveis e mensagens sanitizadas.

Detalhe adicional pode existir em log local quando seguro, sem credencial ou conteúdo bruto sensível.

## Responsabilidade operacional

Mesmo com esses controles, o Dev Dashboard possui autoridade relevante na máquina local. A pessoa usuária deve:

- executar versões confiáveis;
- revisar o plano antes de confirmar mutações;
- proteger a conta do sistema operacional;
- manter credenciais/provider fora do Git;
- usar privilégios mínimos;
- investigar `recovery_required` antes de repetir ou reverter operações.

## Regra para novas funcionalidades

Antes de adicionar uma rota/ação, responda:

1. o browser escolhe uma ação conhecida ou envia um comando?
2. paths ficam dentro de uma raiz canônica?
3. existe mutação destrutiva ou irreversível?
4. precisa de preview/confirmação/revalidação?
5. algum segredo pode aparecer em input, output, log ou provider externo?
6. uma dependência externa precisa de tamanho/shape/timeout bounded?
7. a operação pode deixar processo ou estado órfão?
8. os testes cobrem abuso/falha e não apenas sucesso?

Sem respostas claras, a funcionalidade não está pronta para entrar na API.
