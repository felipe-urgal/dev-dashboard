# Instalação local automática

Este guia descreve a instalação permanente do Dev Dashboard no Linux usando `systemd --user`.

O objetivo é que, depois da instalação inicial, a pessoa faça login na máquina e abra diretamente:

```text
http://dev-dashboard.localhost:4343
```

sem iniciar `npm run dev-web` manualmente e sem copiar bootstrap de logs.

## Requisitos

- Linux com `systemd --user` disponível na sessão;
- Node.js compatível com `package.json`;
- npm e Git;
- checkout local do Dev Dashboard com dependências instaladas.

A instalação é deliberadamente user-space:

- não usa `sudo`;
- não cria unit system-wide;
- não habilita `linger`;
- inicia após o login do usuário, via `default.target`.

## Instalar/reinstalar

Na checkout do Dashboard:

```bash
npm run local:install
```

O comando:

1. prepara automaticamente a release local do self-update agent;
2. cria/atualiza a unit gerenciada `dev-dashboard-self-update-agent.service`, garante que ela esteja ativa e prova que o `pid` autenticado do agent é o `MainPID` dessa unit;
3. valida Linux e acesso ao user manager do systemd;
4. resolve a checkout real e o caminho absoluto do Node atual;
5. executa o build da distribuição;
6. cria/atualiza `~/.config/systemd/user/dev-dashboard.service`;
7. grava metadados privados da instalação e ambiente runtime gerenciado;
8. executa `systemctl --user daemon-reload`;
9. habilita `dev-dashboard.service` para o login;
10. executa `systemctl --user restart dev-dashboard.service`, inclusive quando a unit já estava ativa;
11. aguarda `/api/health` ficar saudável antes de declarar sucesso.

A operação é idempotente. Reexecutar `local:install` prepara novamente o agent se necessário, recompila a distribuição, atualiza somente os arquivos que pertencem ao instalador, reinicia o runtime gerenciado e comprova readiness.

O preparo do agent continua em user-space e usa somente a checkout atual e os paths privados do próprio self-update. Não solicita `sudo` nem amplia o catálogo de ações remotas do agent.

O runtime principal e o agent persistente ficam em units diferentes:

```text
dev-dashboard.service                    # API/UI
dev-dashboard-self-update-agent.service  # agent de self-update
```

Essa separação é obrigatória para o self-update: quando `dev-dashboard.service` recebe `SIGTERM`, o agent precisa continuar vivo para concluir o handoff, aplicar a revision e devolver o runtime principal.

Se já existir qualquer uma das units gerenciadas com o mesmo nome, mas sem o marcador do instalador/bootstrap correspondente, a operação falha sem sobrescrever o arquivo.

Se o restart acontecer mas a API não ficar saudável dentro da janela limitada, o instalador falha e orienta o diagnóstico por `local:status`/`journalctl` em vez de anunciar uma instalação saudável sem prova.

## URL e listener

A URL padrão instalada é:

```text
http://dev-dashboard.localhost:4343
```

O nome amigável não muda o bind da API. O servidor continua escutando exclusivamente em:

```text
127.0.0.1:4343
```

Não há listener em `0.0.0.0`, IP da LAN ou interface pública.

A origem aceita pelo runtime permanece fechada a HTTP local e precisa usar a mesma porta do listener. São aceitos somente hostnames locais previstos pelo servidor, como `127.0.0.1`, `localhost` e `*.localhost`.

## Porta e `.env.local`

A porta usada no momento da instalação pode ser definida antes de rodar o comando:

```bash
DEV_DASHBOARD_API_PORT=5000 npm run local:install
```

Nesse caso a URL instalada será:

```text
http://dev-dashboard.localhost:5000
```

No modo instalado, os metadados criados por `local:install` são a autoridade para **porta e origem**. Isso impede que uma alteração posterior em `.env.local` faça a unit e a política de origem divergirem.

A unit lê `.env.local` como arquivo opcional para outras configurações do processo, incluindo providers como `VERCEL_TOKEN`. Segredos continuam fora dos metadados da instalação e fora da unit versionada.

Para mudar a porta instalada, execute novamente `local:install` com a nova configuração.

Para aplicar com segurança alterações de `.env.local` ao runtime permanente, reexecute `npm run local:install` ou reinicie conscientemente a unit depois de garantir que build/configuração permanecem coerentes.

## Bootstrap seguro do navegador

Cada processo de distribuição gera uma capacidade de bootstrap aleatória e efêmera.

No modo distribuído, o servidor injeta essa capacidade somente no HTML servido em memória. Um script mínimo executado antes da aplicação grava a capacidade diretamente no `sessionStorage` da aba atual. A URL permanece limpa, sem `#bootstrap=...`.

O valor:

- não é gravado no bundle em disco;
- não é versionado;
- não é persistido nos metadados da instalação;
- não precisa ser consultado em `journalctl`;
- não é colocado no fragmento, query string ou pathname da URL;
- existe somente no HTML servido em runtime e no `sessionStorage` da sessão atual;
- é usado para criar o cookie curto e `HttpOnly` da sessão do browser.

A rota de bootstrap continua exigindo a origem local exata configurada. Mutações autenticadas por cookie continuam exigindo sessão válida e origem exata.

## Status

```bash
npm run local:status
```

O comando informa:

- se a instalação gerenciada existe;
- se a unit principal está habilitada;
- se o serviço principal está ativo;
- se `/api/health` está saudável;
- a URL instalada.

O status não considera apenas a existência de um arquivo: metadados e marcador da unit precisam ser coerentes.

O status do self-update agent é verificado separadamente pelo bootstrap e pode ser consultado diretamente:

```bash
systemctl --user status dev-dashboard-self-update-agent.service --no-pager -l
npm run self-update:ensure
```

Depois de um restart manual isolado, o processo pode levar cerca de um segundo para terminar o bootstrap da API; por isso uma consulta feita imediatamente após `systemctl restart` pode observar transitoriamente serviço ativo antes do health. `local:install`, ao contrário, espera readiness antes de retornar sucesso.

## Abrir no navegador

```bash
npm run local:open
```

O comando usa `xdg-open` quando disponível. Se o ambiente gráfico não oferecer o comando, a URL instalada é exibida para abertura manual.

Também é seguro abrir diretamente:

```text
http://dev-dashboard.localhost:4343
```

Não monte nem copie manualmente fragmentos de bootstrap.

## Logs e diagnóstico

Estado básico:

```bash
npm run local:status
```

Status direto da unit principal:

```bash
systemctl --user status dev-dashboard.service --no-pager -l
```

Status do agent persistente:

```bash
systemctl --user status dev-dashboard-self-update-agent.service --no-pager -l
```

Logs recentes da API/UI:

```bash
journalctl --user -u dev-dashboard.service -n 120 --no-pager
```

Logs recentes do agent:

```bash
journalctl --user -u dev-dashboard-self-update-agent.service -n 120 --no-pager
```

Health sem autenticação:

```bash
curl -i http://127.0.0.1:4343/api/health
```

Health pela URL amigável:

```bash
curl -i http://dev-dashboard.localhost:4343/api/health
```

Para testar o HTML como um navegador, envie `Accept: text/html`; uma requisição `HEAD` genérica com `Accept: */*` pode receber `404` pela política do fallback estático:

```bash
curl -I -H 'Accept: text/html' http://dev-dashboard.localhost:4343/
```

Se o serviço não iniciar depois do login, confira primeiro:

1. `systemctl --user show-environment` funciona na sessão;
2. o Node registrado na instalação ainda existe;
3. a checkout registrada ainda existe no mesmo path real;
4. a porta não está ocupada por outro processo;
5. `npm run local:status` não informa instalação inconsistente;
6. `npm run self-update:ensure` consegue comprovar o agent na unit própria.

Se o Node foi removido ou trocado por uma instalação diferente de `nvm`, `asdf`, `fnm` ou similar, rode `npm run local:install` novamente a partir do Node correto. A unit usa o caminho absoluto capturado durante a instalação e não depende de `.bashrc`, `.zshrc` ou shell profile.

## Self-update

A instalação local não substitui o protocolo seguro de self-update.

A mutação continua passando por planner, confirmação, handoff, worker externo, fast-forward e prova da revision final. O bootstrap do agent é automático tanto em `local:install` quanto ao gerar um plano do próprio Dashboard. O lifecycle persistente suportado usa `dev-dashboard-self-update-agent.service`; um processo iniciado manualmente e apenas destacado não é aceito como prova suficiente de ownership.

O contrato de uma instalação gerenciada é:

```text
bootstrap comprova agent em unit própria
        ↓
self-update aplica revision confirmada
        ↓
handoff propaga revision + raiz canônica validada
        ↓
dev-web reconhece a mesma checkout instalada
        ↓
systemctl --user restart dev-dashboard.service
        ↓
/api/health volta
        ↓
header x-dev-dashboard-revision comprova a revision alvo
        ↓
succeeded
```

A delegação só pode usar a unit fixa `dev-dashboard.service` e exige simultaneamente raiz real coincidente, metadados válidos e marcador de ownership da instalação. O browser não escolhe nome de serviço, path ou comando.

Sem instalação local gerenciada, o self-update mantém o comportamento de runtime direto previsto pelo protocolo.

Se o runtime não voltar, use `local:status`, `journalctl` e `/api/health` para diagnosticar antes de repetir o deployment. Um restart manual pode recuperar a disponibilidade, mas não deve fabricar sucesso de um handoff que ainda precise de reconciliação.

## Desinstalar

```bash
npm run local:uninstall
```

O comando:

- desabilita e para somente `dev-dashboard.service` quando ela pertence ao instalador;
- remove a unit gerenciada do runtime principal;
- remove os metadados da instalação local;
- recarrega o user manager do systemd.

`local:uninstall` não remove automaticamente `dev-dashboard-self-update-agent.service`, porque o agent pertence ao protocolo de self-update e pode existir mesmo sem a integração de autostart do runtime principal.

Ele também não remove:

- a checkout do Dev Dashboard;
- `~/.config/dev-dashboard/config.json`;
- token HTTP da API;
- estado/histórico em `~/.local/state/dev-dashboard`;
- configuração de workspaces ou providers.

Assim, instalar e remover a integração de autostart não destrói dados funcionais do Dashboard.

## Fora do escopo

Esta instalação não oferece:

- proxy na porta 80;
- URL sem porta;
- HTTPS local;
- acesso por outra máquina da rede;
- serviço system-wide/root;
- execução antes do login via `linger`;
- suporte a Windows ou macOS.
