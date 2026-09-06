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

## Instalar

Na checkout do Dashboard:

```bash
npm run local:install
```

O comando:

1. valida Linux e acesso ao user manager do systemd;
2. resolve a checkout real e o caminho absoluto do Node atual;
3. executa o build da distribuição;
4. cria `~/.config/systemd/user/dev-dashboard.service`;
5. grava metadados privados da instalação;
6. executa `systemctl --user daemon-reload`;
7. habilita e inicia `dev-dashboard.service`.

A operação é idempotente: executar `local:install` novamente atualiza somente a unit gerenciada e os metadados da instalação.

Se já existir `dev-dashboard.service` sem o marcador do instalador, a operação falha sem sobrescrever o arquivo.

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

Outras variáveis úteis do ambiente continuam disponíveis ao runtime, incluindo configuração opcional de providers como `VERCEL_TOKEN`.

Para mudar a porta instalada, execute novamente `local:install` com a nova configuração.

## Bootstrap seguro do navegador

Cada processo de distribuição continua gerando uma capacidade de bootstrap aleatória e efêmera.

No modo distribuído, o servidor injeta essa capacidade somente no HTML servido em memória. O valor:

- não é gravado no bundle em disco;
- não é versionado;
- não é persistido nos metadados da instalação;
- não precisa ser consultado em `journalctl`;
- é convertido pelo frontend no fragmento `#bootstrap=...` antes da inicialização da aplicação;
- é movido para `sessionStorage` e removido da URL visível;
- é usado para criar o cookie curto e `HttpOnly` da sessão do browser.

A rota de bootstrap continua exigindo a origem local exata configurada. Mutações autenticadas por cookie continuam exigindo sessão válida e origem exata.

## Status

```bash
npm run local:status
```

O comando informa:

- se a instalação gerenciada existe;
- se a unit está habilitada;
- se o serviço está ativo;
- se `/api/health` está saudável;
- a URL instalada.

O status não considera apenas a existência de um arquivo: metadados e marcador da unit precisam ser coerentes.

## Abrir no navegador

```bash
npm run local:open
```

O comando usa `xdg-open` quando disponível. Se o ambiente gráfico não oferecer o comando, a URL instalada é exibida para abertura manual.

## Logs e diagnóstico

Estado básico:

```bash
npm run local:status
```

Status direto da unit:

```bash
systemctl --user status dev-dashboard.service
```

Logs:

```bash
journalctl --user -u dev-dashboard.service
```

Health sem autenticação:

```bash
curl -i http://127.0.0.1:4343/api/health
```

Se o serviço não iniciar depois do login, confira primeiro:

1. `systemctl --user show-environment` funciona na sessão;
2. o Node registrado na instalação ainda existe;
3. a checkout registrada ainda existe no mesmo path real;
4. a porta não está ocupada por outro processo;
5. `npm run local:status` não informa instalação inconsistente.

Se o Node foi removido ou trocado por uma instalação diferente de `nvm`, `asdf`, `fnm` ou similar, rode `npm run local:install` novamente a partir do Node correto. A unit usa o caminho absoluto capturado durante a instalação e não depende de `.bashrc`, `.zshrc` ou shell profile.

## Self-update

A instalação local não substitui o protocolo seguro de self-update.

A mutação continua passando por planner, confirmação, handoff, worker externo, fast-forward e prova da revision final.

Depois da aplicação da nova revision, `scripts/dev-web.mjs` verifica se existe uma instalação local válida para a mesma checkout. Somente nesse caso o restart é delegado para a unit fixa:

```text
dev-dashboard.service
```

A delegação exige metadados válidos e o marcador de ownership da unit. O browser não escolhe nome de serviço, path ou comando.

Sem instalação local gerenciada, o self-update mantém o comportamento anterior de iniciar o runtime diretamente.

## Desinstalar

```bash
npm run local:uninstall
```

O comando:

- desabilita e para somente `dev-dashboard.service` quando ela pertence ao instalador;
- remove a unit gerenciada;
- remove os metadados da instalação local;
- recarrega o user manager do systemd.

Ele não remove:

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

Essas capacidades exigiriam fronteiras operacionais e de segurança próprias.
