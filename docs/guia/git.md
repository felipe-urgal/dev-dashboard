# Guia da aba Git

> Parte do [Guia passo a passo do dashboard web](README.md). Esta página cobre a aba **Git**
> de um projeto, com as suas sete sub-abas: Sincronização, Branches, Diff, Commit, Desfazer,
> Pull Request e Histórico.

A aba Git nunca chama `git` diretamente a partir do navegador. Toda ação passa pela API
(`http://127.0.0.1:4343`), que executa o binário `git` no diretório do projeto via
`execFile`/`spawn` **sem shell** (`shell: false`) — ou seja, o navegador nunca monta uma string
de comando, apenas escolhe entre ações de um catálogo fechado.

Os dados de leitura são carregados automaticamente ao entrar na aba Git. Ao abrir a sub-aba
**Sincronização**, o dashboard também atualiza as referências remotas antes de exibir o estado.
Não é necessário manter um botão de atualização em cada tela: trocar de projeto ou voltar à aba
Git dispara uma nova leitura.

## Como funciona a confirmação antes de qualquer mutação

Toda ação que muda alguma coisa (criar branch, commit, pull, sincronizar, etc. — tudo que não é
puramente leitura) segue sempre o mesmo fluxo de duas etapas:

1. O dashboard pede um **token de confirmação** para aquela ação específica
   (`POST .../confirmations`), enviando os dados que a pessoa preencheu (nome da branch, mensagem
   de commit, etc.). A API valida esses dados e devolve um token aleatório de 32 bytes.
2. O dashboard reenvia esse token junto com o pedido real da ação
   (`POST .../<ação>`). Sem o token, ou com um token vencido/errado, a API recusa com o erro
   `GIT_MUTATION_CONFIRMATION_REQUIRED` (ou uma variante local, como
   `GIT_SYNC_CONFIRMATION_REQUIRED`).

O token vale por **60 segundos**, serve para uma única execução e está amarrado ao projeto, à
ação e ao alvo exatos que foram confirmados — não dá para gerar o token para uma branch e usá-lo
em outra. Esse é o motivo de, ao clicar em "Excluir branch" ou "Sincronizar", normalmente aparecer
uma pequena confirmação antes da ação realmente rodar.

Toda operação (com sucesso ou falha) é anotada no histórico de mutações do projeto (mantido pela
API, sem tela própria no dashboard hoje), exceto quando a própria confirmação falha — isso é
tratado como erro de protocolo do cliente, não como uma tentativa real de mexer no repositório.

Cada ação do catálogo tem uma classificação de risco fixa, usada tanto para decidir se pede
confirmação quanto para o selo mostrado nesse histórico de mutações:

| Risco          | Selo mostrado    | Significado                                                                            |
| -------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `read-only`    | Leitura          | Não altera nada.                                                                       |
| `write-safe`   | Alteração local  | Muda o repositório local, mas de forma reversível (branch, commit comum, etc.).        |
| `write-remote` | Alteração remota | Publica ou apaga algo em `origin`/`upstream`.                                          |
| `destructive`  | Destrutiva       | Pode descartar trabalho (força push, excluir branch, desfazer commit, apagar arquivo). |

---

## Sincronização

O que aparece: um cartão para a **branch atual** (só some se você já estiver na `main`) e um
cartão fixo para a **`main`**. Cada um mostra um selo — Verificando, Sincronização indisponível,
Tudo sincronizado, Alterações locais pendentes ou Sincronização pendente — e um botão de ação.

### "Atualizar local" (branch atual)

Traz commits novos do upstream configurado para a branch em que você está, sem nunca criar merge
nem rebase.

- Comando executado: `git pull --ff-only`.
- Antes de rodar, a API confere: o repositório existe, o HEAD não está "destacado", a branch tem
  upstream configurado, e a árvore de trabalho está limpa (sem alterações não commitadas).
- Se não for possível avançar por fast-forward (a branch local e a remota divergiram), o erro é
  `GIT_PULL_DIVERGED` — a interface não tenta merge automático, é preciso resolver manualmente.
- O botão fica desabilitado quando você tem commits locais ainda não publicados (`ahead > 0`),
  porque nesse caso um simples fast-forward não seria suficiente.
- Risco: alteração local (`write-safe`).

### "Sincronizar" (main)

É a ação mais elaborada da aba. Ela pega o que há de novo no repositório principal
(`upstream/main`) e publica isso na sua cópia de `origin/main` — pensada para manter a `main` do
seu fork/clone alinhada com o projeto original.

Sequência exata executada pelo backend:

1. `git fetch --prune upstream` — busca as referências mais recentes do repositório principal.
2. Confirma que `refs/remotes/upstream/main` existe.
3. `git checkout main`.
4. `git merge --no-edit upstream/main`.
5. `git push origin main:main` — publica a `main` atualizada no seu `origin`.

Antes de começar, a API exige árvore de trabalho limpa, `upstream` e `origin` configurados, e uma
branch local `main` existente.

Se o merge do passo 4 gerar conflito, o dashboard **desfaz tudo automaticamente**
(`git merge --abort`) e devolve o erro `GIT_SYNC_CONFLICT` — a `main` volta exatamente para o
estado de antes, nada fica pela metade. Se o merge for bem-sucedido mas o `push` falhar (por
exemplo, por falta de permissão ou rede), o erro avisa explicitamente que a `main` **já foi
atualizada localmente**, mas não foi possível publicá-la — ou seja, rodar "Sincronizar" de novo
deve resolver, sem perder nada.

- Risco: alteração remota (`write-remote`), porque o passo final publica em `origin`.
- Depois de sincronizar com sucesso, o dashboard pode mostrar o
  [banner de impacto de mudança](#banner-de-impacto-de-mudanca) se algum arquivo sensível
  (dependências, migrations, `.env.example`, configuração de servidor ou testes) tiver mudado.

---

## Branches

Uma tabela única combina branches locais e do `origin`, casadas pelo nome. Cada linha mostra o
nome, se é a branch atual, se existe só local ou só remota, e um selo **Protegida** (com ícone de
cadeado) para `main`/`master`. Há filtros para ver Todas / Locais / Remotas, um botão **Nova
branch** (com prefixos sugeridos: `feature/`, `bugfix/`, `hotfix/`, `docs/`, `refactor/`, `test/`)
e, por linha, os botões Trocar, Publicar/Enviar, Trazer para local, e um menu com Renomear,
Remover branch local e Remover do origin.

O botão de publicação aparece em dois casos: **Publicar**, quando a branch ainda não existe no
`origin`, e **Enviar**, quando a branch já foi publicada mas o local está à frente do
`origin/<branch>` (novos commits feitos depois da publicação inicial, como o cenário de "abri a PR
e agora quero mandar mais um commit"). Os dois casos chamam a mesma rota/comando; a rota já era
idempotente em relação a isso, só faltava o botão continuar visível depois da primeira publicação.

| Ação                                                                                    | Comando git                                                                                                                                                                                                         | Observações                                                                                                                                                                                                                                                     | Risco            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Nova branch**                                                                         | `git switch --create <nome>` (depois de checar duplicidade com `git show-ref`)                                                                                                                                      | Exige árvore de trabalho limpa; nome validado por um padrão fixo de caracteres permitidos.                                                                                                                                                                      | Alteração local  |
| **Trocar**                                                                              | `git switch <nome>`                                                                                                                                                                                                 | Exige árvore de trabalho limpa; pode acionar o banner de impacto (o HEAD mudou de commit).                                                                                                                                                                      | Alteração local  |
| **Renomear**                                                                            | `git branch --move -- <atual> <novo>`                                                                                                                                                                               | Recusa renomear `main`/`master` (`GIT_BRANCH_PROTECTED`).                                                                                                                                                                                                       | Alteração local  |
| **Remover branch local**                                                                | `git branch --delete --force -- <branch>`                                                                                                                                                                           | Usa `--force`, ou seja, remove mesmo que a branch tenha commits não mesclados em nenhum outro lugar. Recusa a branch atual, `main`/`master` e o HEAD padrão configurado nos remotos. O modal pede para digitar o nome exato da branch antes de liberar o botão. | **Destrutiva**   |
| **Publicar / Enviar**                                                                   | `git push --set-upstream origin refs/heads/<branch>:refs/heads/<branch>`                                                                                                                                            | Exige `origin` configurado; se o remoto rejeitar por não ser fast-forward, `GIT_PUSH_REJECTED`. Mostrado quando a branch é só local, ou quando já está publicada e tem commits locais ainda não enviados (`ahead > 0`).                                         | Alteração remota |
| **Trazer para local** (branch só remota)                                                | `git switch --create <local> --track <remoto>/<local>`                                                                                                                                                              | Exige que a referência remota exista e que ainda não haja uma branch local com esse nome.                                                                                                                                                                       | Alteração local  |
| **Remover do origin**                                                                   | `git push origin --delete <branch>`, seguido de `git fetch --prune origin`                                                                                                                                          | Só funciona para o remoto `origin`; recusa `main`/`master`.                                                                                                                                                                                                     | Alteração remota |
| **Reenviar com lease** (aparece após um "Alterar último commit" em branch já publicada) | `git fetch --quiet --no-tags origin +refs/heads/<b>:refs/remotes/origin/<b>` para saber o SHA remoto atual, depois `git push --force-with-lease=refs/heads/<b>:<sha-esperado> origin refs/heads/<b>:refs/heads/<b>` | Só permitido na branch atual; recusa branch protegida; se alguém publicou algo nessa branch entre a confirmação e o envio, falha com `GIT_FORCE_WITH_LEASE_REJECTED` em vez de sobrescrever o trabalho de outra pessoa.                                         | **Destrutiva**   |

---

## Diff

Sub-aba 100% de leitura — nenhum botão aqui altera o repositório.

Mostra a comparação combinada entre `HEAD`, o índice (stage) e a árvore de trabalho: contagem de
arquivos alterados, total de linhas adicionadas/removidas, busca por nome de arquivo ou por
conteúdo, alternância entre visão Unificada e Lado-a-lado, "Recolher/Expandir tudo" e uma barra de
progresso "N de M revisados" (esse "revisado" existe só no navegador, não é salvo em lugar
nenhum).

Como o Diff é somente leitura, não há ação de atualização manual nessa tela. A entrada na página
é o gatilho de atualização; as mensagens de erro explicam quando o repositório não pode ser lido.

- A lista geral vem de `git status --porcelain=v2 -z` combinado com `git diff --numstat -z`.
- O diff de um arquivo específico roda `git diff -- <arquivo>` (o resultado é cortado em 262.144
  caracteres e passa pela mesma máscara de segredos usada nos logs, então um `.env` staged por
  engano não aparece em texto puro).
- Ao clicar para expandir mais linhas de contexto acima/abaixo de um trecho, o dashboard lê o
  conteúdo direto do blob do Git (`git show :<arquivo>`) ou do arquivo em disco, em blocos de até
  400 linhas por vez.
- Imagens suportadas (`png`, `jpg/jpeg`, `gif`, `webp` e `svg`) podem ser revisadas visualmente com
  os lados **Antes** e **Depois** correspondentes ao mesmo escopo do diff. SVG mantém também a
  alternativa de código textual quando existe diff de texto.
- PDFs são tratados como preview binário visual: o dashboard recupera os blobs **Antes/Depois** e
  usa o visualizador PDF nativo do navegador. Arquivo adicionado/removido mostra somente o lado
  existente. Cada lado possui limite de 8 MiB; acima do limite, ou quando o navegador não consegue
  renderizar o formato, a tela mantém o fallback de arquivo binário em vez de tentar interpretar
  o conteúdo como texto.

---

## Commit

Alterna entre **Novo commit** e **Alterar último commit** (amend), com uma caixa de mensagem
(limite de 500 caracteres) e um resumo de quantas alterações estão sendo incluídas.

| Ação                      | Comando git                                                                                     | Observação                                                                                                                                                                                         | Risco           |
| ------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Novo commit**           | `git add --update` (inclui todas as alterações rastreadas), depois `git commit -m "<mensagem>"` | Se não houver nada para commitar depois do `add`, erro `GIT_NOTHING_TO_COMMIT`.                                                                                                                    | Alteração local |
| **Alterar último commit** | `git add .` (inclui também arquivos novos), depois `git commit --amend -m "<mensagem>"`         | Reescreve o hash do último commit — é por isso que, se essa branch já estava publicada, aparece o aviso "O último commit foi reescrito" com o botão **Reenviar com lease** (ver sub-aba Branches). | Alteração local |

A mensagem precisa ter conteúdo e no máximo 500 caracteres; mensagens vazias ou maiores são
recusadas antes de qualquer chamada ao Git.

---

## Desfazer

Duas ações, sempre com confirmação prévia por serem classificadas como **destrutivas**.

### Desfazer / reverter o último commit

O rótulo do botão muda sozinho conforme a situação:

- **"Desfazer último commit"**, quando o commit ainda não foi publicado (a branch está à frente do
  upstream): roda `git reset --soft HEAD^` — o commit sai do histórico, mas as alterações
  continuam presentes e staged, prontas para editar e commitar de novo.
- **"Reverter commit publicado"**, quando o commit já foi enviado ao remoto: roda
  `git revert --no-edit HEAD` — cria um **novo** commit que desfaz o anterior, sem reescrever o
  histórico já publicado. Se o revert gerar conflito, o dashboard cancela automaticamente
  (`git revert --abort`) e devolve erro, sem deixar a árvore de trabalho suja.

Não é possível desfazer o primeiro commit do repositório (não existe "commit anterior" para
comparar).

### Desfazer arquivo

Descarta as alterações de um arquivo específico na árvore de trabalho, voltando-o ao estado do
último commit. O comando exato depende do tipo de mudança:

- Arquivo novo, ainda não rastreado: é apagado do disco.
- Arquivo já existente em `HEAD`: `git restore --source=HEAD --staged --worktree -- <arquivo>`.
- Arquivo renomeado: desfaz o `add` de ambos os nomes e restaura o nome antigo a partir de `HEAD`.
- Arquivo novo já adicionado ao stage: sai do stage (`git reset HEAD -- <arquivo>`) e é apagado.

O diálogo de confirmação avisa explicitamente quando a ação vai **remover um arquivo novo**, já
que essa mudança não pode ser recuperada pelo próprio dashboard depois.

---

## Pull Request

Esta sub-aba **não cria a pull request pelo dashboard** — ela monta a URL de criação já preenchida
no GitHub ou GitLab e abre no navegador do sistema. Nenhum comando `git` mutante roda aqui.

O que ela faz:

1. Detecta a branch atual e para onde ela foi publicada (`origin`/`upstream`), avisando se ainda
   não tiver upstream configurado ("publique antes de abrir uma PR").
2. Você escolhe o remoto de destino e a branch base; preenche título e descrição.
3. Antes de abrir, o dashboard faz uma verificação best-effort de **PR já existente** para esse
   par origem/destino, consultando a API pública do GitHub (`api.github.com`) ou GitLab
   (`gitlab.com/api/v4`) — se a chamada anônima falhar (limite de taxa, repositório privado), tenta
   usar a sessão local do CLI `gh`, se estiver configurada na máquina. O dashboard nunca guarda
   nem manipula tokens de acesso do GitHub/GitLab.
4. Ao confirmar, monta a URL final:
   - **GitHub**: `.../compare/<base>...<head>?quick_pull=1&title=...&body=...`.
   - **GitLab**: `.../-/merge_requests/new?merge_request[source_branch]=...&merge_request[target_branch]=...`
     (só funciona dentro do mesmo repositório — GitLab não suporta comparar forks por essa URL).

Se origem e destino forem provedores diferentes (por exemplo, `origin` no GitHub e `upstream` em
outro host), a ação é recusada com um erro explicando que a combinação não é suportada.

---

## Histórico

Sub-aba 100% de leitura, para navegar pelos commits.

- **Escopo "Exclusivos da branch"** (padrão): mostra só os commits que existem na branch atual e
  não existem na branch padrão do repositório (a que o `HEAD` remoto aponta — normalmente `main`).
  O dashboard calcula automaticamente o ponto de divergência (`git merge-base`) e lista apenas o
  que veio depois dele.
- **Escopo "Toda a branch"**: mostra o histórico completo da referência escolhida, sem cortar pela
  divergência.
- Há busca por mensagem/hash, filtro por autor e filtro por tipo (Todos / Commit regular / Merge),
  com paginação e agrupamento por dia.
- Clicar em um commit abre um modal com metadados completos, lista de arquivos alterados
  (`git show --name-status`), estatísticas por arquivo (`git show --numstat`) e o patch completo
  (`git show --unified=3`, também truncado e mascarado como no Diff). É possível abrir o diff de um
  arquivo específico do commit isoladamente, inclusive quando ele foi renomeado.
- Quando o arquivo do commit é PDF, o histórico recupera o blob do commit e do pai correspondente
  e exibe **Antes/Depois** no mesmo visualizador PDF usado no Diff. Adições e remoções mostram só o
  lado existente, renomes usam o caminho anterior correto e o mesmo limite de 8 MiB por lado evita
  carregar previews grandes demais.

---

## Banner de impacto de mudança

Depois de **trocar de branch**, **atualizar a branch atual**, **sincronizar uma referência remota**
ou **sincronizar a `main`**, pode aparecer um banner informativo logo acima da aba, avisando que
essa mudança de código provavelmente exige atenção em outro lugar do dashboard. Ele nunca aparece
depois de um commit comum (só quando a ação também mexeu em referências/branches).

O dashboard compara os arquivos que mudaram entre o commit anterior e o novo e sinaliza, por
categoria:

| O que mudou                                                                                                    | Aviso mostrado                     | Leva para                 |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------- |
| Lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, etc.)                           | "Revisar dependências"             | Aba Dependências          |
| Migrations Rails (`db/migrate/**`)                                                                             | "Abrir Banco de dados"             | Aba Banco de dados        |
| `.env.example` / `.env.sample`                                                                                 | "Revisar variáveis de ambiente"    | Aba Variáveis de ambiente |
| Arquivos de infraestrutura (`Dockerfile`, `docker-compose*.yml`, `Procfile`, config de Puma/Sidekiq/Webpacker) | "Revisar configuração do servidor" | Aba Servidor              |
| Arquivos de teste (`spec/`, `test/`, `__tests__/`, `*.spec.*`, `*_test.rb`)                                    | "Executar testes"                  | Aba Testes                |

O banner só sugere para onde ir (com um link direto) — ele nunca dispara nenhuma ação sozinho.
