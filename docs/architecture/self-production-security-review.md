# Security review — self-production

Este documento registra a decisão de segurança da self-production e sua evolução com a instalação local gerenciada.

## Decisão

`strategy=self-update` permanece **user-space** e não exige root.

O fluxo autorizado usa:

- checkout/Git pertencentes ao usuário atual;
- agent, token, socket e estado em diretórios privados do usuário;
- aplicação somente por `git merge --ff-only` da revision confirmada de `origin/main`;
- restart/readiness com alvos fixos e derivados de configuração local confiável;
- nenhuma linha de shell, unit, checkout ou credencial escolhida pelo browser.

A instalação permanente introduzida depois da revisão inicial usa `systemd --user`, mas isso **não** muda a decisão de privilégio: não há `sudo`, unit system-wide ou root.

## Fronteiras

### Browser → deployment

O browser fornece somente IDs/`planHash`/confirmação previstos pelo contrato. Branch e revision são resolvidas e revalidadas pelo backend.

### Deployment → handoff

A etapa `self-update` cria um handoff determinístico vinculado ao deployment. O estado persiste somente metadados necessários como `projectId`, `targetRevision`, `planHash`, timestamps/estado e resultado sanitizado.

Não existe campo remoto para programa, argv, checkout, unit ou URL de restart.

### API → agent

O canal Unix autenticado do agent permanece fechado. O catálogo remoto não é um executor genérico.

`execute <handoff-id>` é tooling local e só opera um handoff previamente persistido/assumido.

### Agent → worker

Antes da API antiga encerrar, o worker precisa comprovar ownership da execução via lock privado/PID esperado. O shutdown não ocorre apenas porque um processo foi spawnado.

### Worker → checkout

Antes da mutação:

- checkout real e pertencente ao usuário;
- projeto `dev-dashboard` reconhecido;
- working tree limpa, incluindo untracked;
- branch `main`;
- `origin/main` exatamente igual à revision confirmada;
- relação fast-forward comprovada.

A aplicação permitida é somente:

```text
git merge --ff-only <targetRevision>
```

Depois, `HEAD` precisa corresponder à revision alvo.

## Restart sem instalação gerenciada

Quando não existe `local:install` válido para a mesma checkout, o worker continua usando o entrypoint conhecido `scripts/dev-web.mjs` em user-space.

Readiness exige `/api/health` saudável e header `x-dev-dashboard-revision` exatamente igual à revision alvo.

## Restart com `local:install`

Quando a instalação local gerenciada está comprovada, o runtime permanente pertence à unit fixa:

```text
dev-dashboard.service
```

A delegação usa somente:

```text
systemctl --user restart dev-dashboard.service
```

Ela exige simultaneamente:

- metadados válidos do instalador;
- mesma checkout real do handoff;
- nome fixo da unit;
- marcador de ownership no arquivo gerenciado.

O browser não escolhe nome de unit, path ou comando. Uma unit externa com o mesmo nome sem o marcador esperado não ganha autoridade.

`systemd --user` é parte da sessão do usuário; não amplia o modelo para root/system-wide.

## Pendência operacional #659

Existe uma falha conhecida no handoff do redeploy instalado: a raiz canônica da checkout ainda pode deixar de ser propagada ao `dev-web`, impedindo o reconhecimento da instalação gerenciada depois que a API antiga encerra.

O efeito observado é a checkout ser atualizada, mas a API não voltar automaticamente sob `dev-dashboard.service` até um restart manual.

Isso é tratado como **falha/recovery**, não como relaxamento de segurança. A correção #659 deve preservar exatamente as provas acima e somente completar a delegação já autorizada ao systemd user.

## Resultado

O modelo atual continua sem autoridade root:

```text
browser limitado
   ↓
planner + confirmação + revalidação
   ↓
handoff privado
   ↓
agent/worker user-space
   ↓
ff-only
   ↓
restart direto OU unit user gerenciada fixa
   ↓
readiness + proof-of-revision
```

Falha em contrato, agent, revision, ownership, instalação, restart ou readiness permanece fail-closed/conservadora.

A operação completa está em [`self-production.md`](self-production.md) e [`../PRODUCTION.md`](../PRODUCTION.md).
