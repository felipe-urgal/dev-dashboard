# Segurança

## Contexto

O Dev Dashboard possui acesso ao filesystem, aos runtimes de desenvolvimento e aos processos do computador local.

Por isso, a API deve ser tratada como uma aplicação privilegiada, mesmo sendo utilizada apenas pelo próprio desenvolvedor.

Uma vulnerabilidade pode permitir:

- execução indevida de comandos;
- encerramento de processos;
- leitura de arquivos;
- exposição de logs;
- modificação de repositórios;
- acesso a credenciais presentes no ambiente.

## Princípios

### Local por padrão

A API deve escutar somente em:

```text
127.0.0.1
```

Ela não deve utilizar `0.0.0.0` por padrão.

A aplicação não deve ser exposta diretamente:

- à internet;
- à rede Wi-Fi;
- a uma VPN;
- a containers externos;
- a túneis públicos.

### Catálogo fechado de ações

O navegador não pode enviar um comando livre.

Requisições devem representar operações conhecidas:

```text
iniciar servidor
parar servidor
consultar status
ler logs
executar testes
consultar Git
```

A API decide internamente qual programa e quais argumentos serão utilizados.

### Sem shell arbitrário

Subprocessos devem ser criados preferencialmente com:

```ts
spawn(command, args, {
  shell: false,
});
```

Não devem ser montadas strings como:

```ts
exec(`${userInput}`);
```

Entradas do usuário nunca devem ser concatenadas em uma linha de shell.

Na execução do catálogo, o navegador envia somente o identificador atual da ação. A API redetecta o catálogo, reconstrói programa e argumentos a partir da origem reconhecida e seleciona npm, pnpm ou Yarn por um único lockfile. Lockfiles ambíguos ou ausentes são recusados. Ações mutáveis exigem token aleatório de confirmação vinculado ao projeto e ao identificador, válido por um minuto e consumido na primeira tentativa; ações destrutivas permanecem bloqueadas.

Existe no máximo uma execução de catálogo ativa por projeto. O processo usa o caminho canônico do `ProjectStore` como `cwd`, grupo próprio sem `shell`, logs `0600` e encerramento gradual. Antes de sinalizar no Linux, a API compara `/proc/<pid>/cwd` com o projeto esperado.

### Validação de caminhos

Antes de cadastrar um workspace ou projeto:

1. resolver o caminho real;
2. verificar se é diretório;
3. armazenar o caminho canônico;
4. evitar duplicidades;
5. restringir operações aos caminhos cadastrados.

Operações futuras não devem aceitar um caminho arbitrário quando um identificador de workspace ou projeto for suficiente.

### Identidade de processos

Um PID pode ser reutilizado pelo sistema operacional.

Antes de encerrar um processo, não basta verificar que o PID existe.

No Linux, o Process Manager compara:

```text
/proc/<pid>/cwd
```

com o diretório esperado do projeto.

Se não houver correspondência, o processo não deve ser encerrado.

### Encerramento gradual

A sequência padrão deve ser:

1. enviar `SIGTERM`;
2. aguardar o encerramento;
3. usar `SIGKILL` somente quando necessário.

Sempre que possível, o sinal deve ser enviado ao grupo de processos criado pelo dashboard.

### Logs limitados

A API não deve retornar arquivos inteiros sem limite.

A leitura atual:

- aceita apenas logs associados a processos gerenciados;
- não recebe um caminho do navegador;
- limita a quantidade máxima de bytes;
- retorna preferencialmente o trecho final;
- remove uma primeira linha possivelmente incompleta quando o trecho começa no meio do arquivo.

O limite máximo atual é:

```text
262144 bytes
```

A expansão de contexto do diff usa o mesmo teto por leitura. Além dele, a rota
só aceita um caminho que já conste da lista de arquivos do diff do escopo
pedido, limita a faixa a 400 linhas por requisição, recusa arquivos binários e
removidos, e devolve o trecho pelo mesmo mascaramento de segredos das demais
leituras.

### Snapshots de banco

O dump é gerado com o cliente do próprio banco (`mysqldump`/`pg_dump`) por
`spawn` sem `shell`, com argumentos fixos por driver. O navegador envia apenas o
id do ambiente e o id do snapshot: host, porta, usuário, senha e banco vêm
sempre da detecção do projeto, e a senha viaja por `MYSQL_PWD`/`PGPASSWORD`,
nunca na linha de comando.

Os arquivos ficam no diretório de estado, com diretório `0700` e arquivos
`0600`, fora de qualquer caminho servido estaticamente. As respostas trazem
somente metadados — não existe rota de download do dump — e o id do snapshot é
validado como UUID antes de compor qualquer caminho.

A restauração sobrescreve o banco e por isso exige confirmação em duas etapas:
token aleatório de 32 bytes, válido por um minuto, vinculado ao projeto e ao
snapshot, comparado com `timingSafeEqual` e consumido na primeira tentativa.
Cada dump tem teto de 512 MB e dez minutos; ao estourar, o processo é encerrado
e o arquivo parcial removido. A retenção padrão é de dez snapshots por projeto.

### Segredos

Logs podem conter:

- tokens;
- URLs privadas;
- parâmetros sensíveis;
- credenciais;
- dados pessoais.

O dashboard não deve assumir que logs são públicos.

Antes de responder, os leitores de servidor, teste e catálogo mascaram
atribuições sensíveis conhecidas, credenciais em URLs, autenticação Bearer e
prefixos de tokens reconhecidos. A resposta explicita a quantidade de
substituições e a interface apresenta um aviso. O arquivo local original não é
reescrito e permanece protegido por permissão `0600`.

A exportação da task 087 não cria uma segunda leitura nem uma rota de download.
Servidor, testes e scripts geram o arquivo no próprio navegador por `Blob`,
usando somente o snapshot que já foi limitado e mascarado pela API. O cliente
não envia caminho, diretório ou nome de arquivo ao backend; identificadores e
metadados usados no cabeçalho são públicos e o nome do download é sanitizado.
Conteúdo vazio não gera arquivo, o log bruto não é relido e o `ObjectURL`
temporário é revogado após o clique.

A retenção padrão de processos terminais é de sete dias, configurável por
`DEV_DASHBOARD_LOG_RETENTION_DAYS`. A limpeza deriva os caminhos exclusivamente
do diretório de estado gerenciado, e leituras continuam limitadas a 262144 bytes.
Além do par estado+log associado a um processo terminal, a varredura também
remove logs órfãos — arquivos `.log` sem nenhum arquivo de estado
correspondente no mesmo diretório gerenciado, respeitando a mesma janela de
retenção (ou removidos imediatamente sob a limpeza manual). Um arquivo de
estado corrompido ainda conta como existente para esse fim e preserva o log
associado.
Os valores também podem ser persistidos por `PUT /api/settings/retention` dentro
de limites fechados. O arquivo privado não contém caminhos, sua gravação não
dispara limpeza e a política passa a valer de forma uniforme após reiniciar a API.

O stream SSE do catálogo exige a mesma autenticação das demais rotas privadas e aceita somente IDs reconhecidos de projeto e execução. Cada execução admite cinco assinantes e a instância admite vinte; atualizações de log são agrupadas a cada 200 ms, permanecem sob o limite de leitura e são mascaradas. A assinatura termina na conclusão, desconexão ou parada da API. Heartbeats não carregam dados do projeto, e lacunas são recuperadas pelos endpoints HTTP persistidos.

O histórico do catálogo persiste arquivos versionados por UUID, com limite padrão
de 200 registros. A restauração ignora entradas corrompidas e converte estados
ativos órfãos em falha terminal, sem reutilizar ou sinalizar o PID anterior. A
listagem aceita somente ID do projeto e paginação limitada; caminhos de JSON e log
são sempre derivados internamente.

### Permissões de arquivos

Diretórios de configuração e estado devem ser criados com acesso restrito ao usuário.

Permissões pretendidas:

```text
diretórios: 0700
arquivos:   0600
```

Caminhos atuais:

```text
~/.config/dev-dashboard
~/.local/state/dev-dashboard
```

### Variáveis de ambiente

Os processos filhos recebem atualmente o ambiente da API, além de variáveis necessárias para porta e host.

Isso significa que segredos presentes no ambiente da API também podem ficar disponíveis aos projetos iniciados.

Antes de suportar cenários multiusuário ou remotos, será necessário adotar uma política explícita de variáveis permitidas.

### Validação HTTP

Rotas devem usar schemas para validar:

- corpo;
- parâmetros;
- query string;
- tipos;
- limites;
- propriedades adicionais.

Erros internos não devem expor stacks completas ao navegador em produção.

### Health checks de projetos

O health check declarativo de um servidor gerenciado nunca aceita URL absoluta,
host, porta, headers ou corpo do navegador. A API deriva a porta do processo ou
da configuração persistida e fixa o destino em `127.0.0.1`, usando somente
`GET` e um caminho relativo validado de até 128 caracteres.

A requisição expira em dois segundos, não segue redirecionamentos e descarta o
corpo assim que os headers chegam. A resposta pública contém somente caminho,
origem da configuração, classificação, código HTTP, latência e horário. Erros de
rede são resumidos sem endereço, stack ou mensagem bruta do runtime.

### Favoritos de projetos

Favoritos são preferências locais associadas somente ao identificador estável
do projeto. A API não grava metadados dentro do repositório descoberto e só
aceita alterações para projetos presentes no `ProjectStore` após um scan.

A configuração é limitada, validada e persistida atomicamente em
`project-favorites.json`, dentro do diretório de configuração `0700`, com modo
`0600`. A rota de alteração usa autenticação local e schema fechado; ela não
aceita caminhos nem conteúdo livre para gravação.

### Terminal e console do projeto

As abas Terminal (qualquer projeto) e Console (só Rails) são a **única exceção deliberada** ao
princípio de catálogo fechado de ações acima: o navegador abre uma sessão de shell interativa de
verdade — `$SHELL` do usuário (fallback `/bin/bash`) para o Terminal, `bin/rails console` (ou
`bundle exec rails console` sem binstub) para o Console — sem lista fechada de comandos permitidos.
Isso corresponde exatamente ao "terminal arbitrário" listado em "Requisitos antes de operações
destrutivas" abaixo, e esta seção documenta como cada item daquela lista é atendido:

- **Autenticação local**: a rota HTTP de status, a de confirmação e o upgrade do WebSocket de
  conexão passam pelo mesmo hook de autenticação global das demais rotas privadas (cookie de sessão
  local ou `X-Dev-Dashboard-Token`).
- **Confirmação explícita**: além da autenticação acima, cada abertura de sessão exige um token de
  confirmação dedicado (32 bytes aleatórios, válido por um minuto, vinculado ao projeto e ao `kind`
  — `shell` ou `rails-console` —, consumido na primeira tentativa), obtido por
  `POST /api/projects/:id/terminal/:kind/confirmations` e enviado como query string na conexão do
  WebSocket. Reconectar depois de qualquer desconexão passa pelo mesmo fluxo — não existe token de
  sessão de longa duração nem reconexão automática silenciosa.
- **Descrição da ação / visualização do comando**: a interface mostra um aviso de risco antes do
  primeiro clique em "Iniciar sessão", explicando que os comandos rodam com as permissões do
  usuário do sistema operacional sem filtro algum.
- **Trilha de auditoria**: cada conexão, o comando resolvido (`shell` ou `bin/rails
  console`/`bundle exec rails console`) e cada encerramento de sessão são registrados nos logs
  estruturados da API (`request.log`), no mesmo padrão usado para falhas do gateway de Language
  Server. Não existe hoje um log persistido e pesquisável do que foi digitado dentro da sessão —
  isso ficaria em `docs/architecture/overview.md`/`tasks/PENDENCIAS.md` como possível melhoria
  futura, não bloqueante para esta entrega.
- **Classificação de risco**: alta. Esta é a única superfície da API que executa um shell genuíno;
  o restante do modelo de ameaça (usuário único confiável, projetos potencialmente não confiáveis)
  se aplica integralmente — abrir um Terminal ou Console em um projeto não confiável tem o mesmo
  risco que abrir um terminal manualmente nesse mesmo diretório.
- **Testes automatizados**: `apps/api/test/project-terminal-service.test.ts` (protocolo completo —
  confirmação, input/output, resize, limites, encerramento) e
  `apps/api/test/project-terminal-routes.test.ts` (rotas HTTP, autenticação, validação de `kind`,
  projeto inexistente).
- **Cancelamento**: fechar a aba, recarregar a página ou clicar em "Encerrar sessão" fecha o
  WebSocket, o que mata o processo do pseudoterminal (`SIGHUP` via `node-pty`) imediatamente — não
  existe sessão sobrevivendo sem um WebSocket conectado a ela.

Outras salvaguardas, além do checklist:

- Sessões são efêmeras: o processo do shell vive e morre com a conexão WebSocket. Não há
  persistência entre reconexões (nada equivalente a `tmux`/`screen`).
- Limite de sessões simultâneas por projeto+kind (4) e por instância (16), para conter uma aba
  esquecida aberta ou um script automatizando conexões repetidas.
- O processo herda o ambiente da API (mesma ressalva de "Variáveis de ambiente" acima) e roda com
  `cwd` fixado no caminho canônico do projeto vindo do `ProjectStore` — nunca um caminho vindo do
  navegador.
- Mensagens do cliente são limitadas a 65536 bytes e usam o mesmo limitador de taxa por mensagem já
  usado no gateway de Language Server (`withWebSocketMessageRateLimit`).
- Dimensões de `resize` são fixadas em limites (1–500 colunas, 1–200 linhas) antes de chegar ao
  pseudoterminal.

## Autenticação local

No primeiro uso, o Dev Dashboard gera um token criptograficamente aleatório de
32 bytes, representado por 64 caracteres hexadecimais.

O token é persistido em:

```text
~/.config/dev-dashboard/api-token
```

As permissões pretendidas são:

```text
diretório de configuração: 0700
arquivo do token:          0600
```

Rotas privadas exigem:

```text
X-Dev-Dashboard-Token
```

A comparação do token utiliza `timingSafeEqual` quando os valores possuem o
mesmo comprimento.

O endpoint de health check permanece público para permitir diagnóstico local.

## Origem e CORS

Na distribuição local, navegador e API compartilham a origem exata correspondente à porta efetiva. O `dev-web` gera 32 bytes aleatórios por execução e imprime uma URL cujo fragmento contém essa capacidade efêmera. O frontend a guarda somente em `sessionStorage`, remove o fragmento da barra de endereço e a apresenta a `POST /api/auth/browser-session`. O endpoint valida a capacidade — ou o token persistente para clientes locais autorizados — antes de emitir cookie assinado `HttpOnly`, `SameSite=Strict` e com vida limitada. Ele nunca retorna o token persistente. A origem e o tipo JSON são defesas adicionais, não autenticação.

O endpoint de bootstrap não faz parte dos caminhos públicos: falsificar `Origin` em outro processo local não concede sessão sem uma das capacidades. Métodos mutáveis autenticados por cookie também exigem `Origin` exata para mitigar CSRF. A origem efetiva do modo distribuído integra explicitamente a allowlist, inclusive em porta personalizada; origem ausente ou externa não pode fazer bootstrap, e origens externas são rejeitadas mesmo com cookie ou header válido. O modelo assume que sites externos podem induzir requisições ao loopback, mas não conseguem ler o cookie `HttpOnly`, a capacidade no `sessionStorage` nem o token no arquivo `0600`.

A API aceita explicitamente as origens locais do dashboard:

```text
http://127.0.0.1:5173
http://localhost:5173
http://127.0.0.1:4173
http://localhost:4173
```

(as duas últimas são a porta de preview do Vite, usada por `npm run preview`.)

Requisições de navegador vindas de outras origens são rejeitadas.

A política CORS:

- possui lista fechada de origens;
- permite apenas os métodos utilizados pela API;
- permite `Content-Type` e `X-Dev-Dashboard-Token`;
- não utiliza credenciais de navegador;
- responde preflights válidos;
- não adiciona headers CORS para origens externas.

Requisições locais sem header `Origin`, como chamadas feitas por `curl`, ainda
precisam apresentar o token nas rotas privadas.

No desenvolvimento, o proxy do Vite adiciona o token à requisição encaminhada
para a API. O token é lido no processo Node que executa o Vite e não deve ser
exposto por variáveis prefixadas com `VITE_` nem incluído no código do
navegador.

## Modelo de ameaça atual

O modelo atual assume:

- um único usuário local confiável;
- computador de desenvolvimento pessoal;
- nenhum acesso remoto;
- navegador local confiável;
- workspaces cadastrados pelo próprio usuário;
- projetos locais potencialmente não confiáveis.

O último ponto é importante: iniciar um projeto executa código existente nesse repositório. Um projeto malicioso pode executar ações com as permissões do usuário.

O dashboard não transforma um projeto não confiável em um projeto seguro.

## Riscos conhecidos

### Token acessível ao usuário local

O token protege contra chamadas casuais de páginas externas e requisições sem
autorização, mas não isola o dashboard de outros processos executados pela mesma
conta de usuário.

Um processo local com as mesmas permissões pode ler o arquivo do token.

Antes de suportar múltiplos usuários ou acesso remoto, será necessário adotar:

- autenticação por usuário;
- autorização por ação;
- gerenciamento de sessões;
- isolamento de processos;
- auditoria mais forte.

### Estado de projetos em memória

Os projetos descobertos permanecem atualmente na memória da API.

Após reiniciar a API, é necessário escanear os workspaces novamente.

Isso reduz alguns riscos de caminhos antigos, mas ainda exige validação cuidadosa ao executar ações.

### Comandos definidos pelos projetos

Projetos Node podem definir scripts como `dev`, `start` e `serve`.

Executar esses scripts significa confiar no conteúdo do `package.json` e do repositório.

A interface deve deixar claro qual comando será executado.

### Integração com o GitHub CLI (`gh`)

A API já invoca `gh` hoje, como fallback silencioso e somente leitura para
enriquecer informação de pull request quando a API pública do GitHub sem
autenticação falha ou não cobre o dado (`apps/api/src/services/
git-pull-request-service.ts` e `git-pull-request-status-service.ts`):
`gh api` (REST) para status de PR e `gh api graphql` para conversas não
resolvidas, que não têm equivalente na REST pública. Toda invocação segue o
mesmo padrão já exigido para subprocessos: `execFile('gh', args, { cwd, env })`
com `shell: false`, args fixos (nunca construídos a partir de texto livre do
navegador), e falha silenciosa (`try/catch` vira `null`/`checked: false`) sem
quebrar a rota. A resposta expõe só campos estruturados extraídos do payload
(`number`, `title`, `url`, `state`, `ciStatus`, `commentsCount`,
`unresolvedConversationsCount`) — nunca o stdout bruto do `gh`.

**Modelo de autorização**: o dashboard não gerencia nenhuma credencial do
GitHub. `gh` herda a sessão local já autenticada do usuário (`gh auth login`,
fora do dashboard) via ambiente do processo filho, no mesmo espírito da nota
de "Variáveis de ambiente" acima — nenhum token do GitHub é lido, persistido
ou exibido pela API. Isso mantém a integração consistente com o modelo de
ameaça atual (um único usuário local confiável): o dashboard só pode fazer
com `gh` o que o próprio usuário já pode fazer no terminal dele.

**O que isso autoriza hoje**: chamadas de leitura (`gh api` com método GET ou
query GraphQL somente leitura) para enriquecer dados já públicos de PR/CI.

**O que isso não autoriza**: nenhuma ação mutável do `gh` (`pr create`,
`pr merge`, `pr close`, `pr edit`, etc.) está em uso ou planejada por esta
decisão. Expor qualquer uma delas no dashboard web exigiria, antes de
implementar: um catálogo fechado dos subcomandos permitidos (nunca `gh`
arbitrário vindo do navegador), o mesmo padrão de token de confirmação de
ações mutáveis já usado no catálogo de scripts e nas mutações Git, e ações
destrutivas (`pr close`, `pr merge`) permanecerem bloqueadas por padrão até
decisão explícita — seguindo o checklist de novos endpoints.

### Processos fora do dashboard

O gerenciador não deve encerrar automaticamente qualquer processo que ocupe uma porta.

As operações devem permanecer vinculadas ao estado persistido e à identidade validada do processo.

### Compatibilidade entre plataformas

A validação por `/proc/<pid>/cwd` é específica do Linux.

Em outras plataformas, a estratégia atual é menos forte.

Suporte oficial a macOS ou Windows exigirá um mecanismo equivalente de identificação.

## Requisitos antes de operações destrutivas

Antes de implementar ações como:

```text
git reset
git clean
excluir branch
db:drop
db:reset
restaurar snapshot
apagar arquivos
terminal arbitrário
```

devem existir:

- autenticação local;
- confirmação explícita;
- descrição da ação;
- visualização do comando;
- trilha de auditoria;
- classificação de risco;
- testes automatizados;
- tratamento de cancelamento.

## Requisitos antes de acesso remoto

O Dev Dashboard não deve receber acesso remoto somente alterando o host para `0.0.0.0`.

Acesso remoto exigiria, no mínimo:

- autenticação forte;
- TLS;
- autorização por ação;
- proteção CSRF;
- origem confiável;
- isolamento de processos;
- auditoria;
- limitação de tentativas;
- gerenciamento de sessões;
- revisão completa do modelo de ameaça.

Até que isso exista, acesso remoto permanece fora do escopo.

## Checklist para novos endpoints

Antes de adicionar uma rota, confirmar:

- A operação é necessária?
- Pode usar um identificador em vez de caminho?
- O projeto ou workspace foi previamente autorizado?
- A entrada possui schema?
- Há limite de tamanho?
- O comando é fechado?
- `shell` está desabilitado?
- O diretório de execução está definido?
- A saída pode conter segredos?
- A ação pode ser cancelada?
- A ação é destrutiva?
- É necessária confirmação?
- O erro retornado é seguro?
- Existe teste para o comportamento?

## Inspeção segura de portas locais

`GET /api/ports` é uma leitura autenticada e limitada do ambiente Linux.
A API executa somente `ss -H -ltnp` com `execFile`, argumentos fixos,
timeout curto e buffer limitado. A primeira versão considera loopback e
binds em todas as interfaces que também ocupam loopback.

Um PID externo só é devolvido quando `/proc/<pid>/status` confirma que
ele pertence ao mesmo UID da API. O payload limita o nome a 64
caracteres e não inclui comando, argumentos, cwd, arquivo executável ou
ambiente. Processos de outro usuário permanecem não identificados.

O inspetor nunca encerra processo externo. Ações de parada continuam
restritas aos estados cuja identidade o `ProcessManager` valida pelo
projeto, PID e diretório conhecidos.
