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
```

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
