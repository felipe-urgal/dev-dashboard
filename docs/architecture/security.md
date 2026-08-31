# Segurança e modelo de ameaça

O Dev Dashboard possui uma característica que domina quase todas as decisões arquiteturais: ele executa operações reais na máquina da pessoa usuária. Isso inclui iniciar processos, ler logs, inspecionar repositórios Git, executar testes, consultar bancos e rodar ferramentas de projeto.

Por esse motivo, a segurança não pode depender apenas de “ser uma aplicação local”. O sistema precisa reduzir o impacto de uma página maliciosa, de dados inesperados do projeto, de erros de implementação e de integrações externas.

## Modelo de ameaça

As ameaças principais consideradas pelo projeto são:

| Ameaça                       | Exemplo                                                              | Mitigação principal                                                           |
| ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Origem web não autorizada    | Uma página aberta no navegador tenta chamar a API local.             | allowlist de `Origin` e autenticação local.                                   |
| Reuso de credencial          | Um token local aparece em histórico ou DevTools e é reutilizado.     | bootstrap curto, cookie HttpOnly e sessão com validade.                       |
| Execução arbitrária          | O frontend envia `rm -rf`, shell syntax ou argumentos não previstos. | catálogos fechados e `spawn`/`execFile` sem shell.                            |
| Path traversal               | Uma rota recebe `../../arquivo-fora-do-projeto`.                     | resolução canônica e validação de raiz.                                       |
| TOCTOU                       | Um symlink muda entre validação e escrita.                           | revalidação no momento da operação e versões esperadas.                       |
| Mutação acidental            | Um clique apaga branch, arquivo ou banco.                            | tokens de confirmação por operação.                                           |
| Exposição de segredos        | Logs, diffs, tool results ou requests cloud contêm API keys/tokens.  | masking, limites, consentimento cloud e ausência de bodies sensíveis em logs. |
| Processo órfão               | A API encerra mas deixa subprocessos vivos.                          | grupos de processos, cleanup e persistência de estado.                        |
| Estado persistido adulterado | Arquivo JSON local é editado/corrompido.                             | diretórios privados, validação e fallback seguro.                             |

## Princípio: local-first

A API e os serviços de desenvolvimento escutam em loopback. O produto não
tem nenhuma capacidade de IA hoje — nem local (Ollama), nem cloud; toda essa
camada (Assistente IA, Code review, `AiProviderResolver`, `OpenAiProvider`)
foi removida — ver
[`architecture/ai-multi-provider.md`](ai-multi-provider.md).

## Bind em loopback

A API e o frontend de desenvolvimento escutam em `127.0.0.1`.

Isso impede exposição direta em interfaces de rede comuns. Ainda assim, loopback não substitui autenticação, porque qualquer página aberta no navegador pode tentar conversar com serviços locais.

## Política de origem

A API mantém uma allowlist explícita de origens.

Em desenvolvimento, por padrão:

```text
http://127.0.0.1:5173
http://localhost:5173
```

Outras origens precisam ser configuradas conscientemente.

Requisições mutáveis sem `Origin` também não devem ser tratadas como equivalentes a uma origem confiável de navegador.

## Autenticação local

O token local de longa duração é mantido fora do repositório e protegido por permissões restritas.

O navegador não deveria manter esse token como credencial de uso cotidiano.

O fluxo preferido é:

```text
bootstrap temporário
       │
       ▼
sessão local HttpOnly
       │
       ▼
requisições autenticadas
```

O bootstrap:

- possui validade curta;
- é descartado depois de utilizado;
- não substitui a sessão permanente;
- não deve aparecer em logs.

## Catálogo fechado de comandos

O frontend não envia comandos arbitrários.

Em vez disso, ele envia identificadores conhecidos:

```json
{
  "scriptId": "package:dev"
}
```

ou:

```json
{
  "operation": "delete-branch",
  "branch": "feature/exemplo"
}
```

O backend resolve isso para um programa e argumentos conhecidos.

### Proibido

```ts
spawn('bash', ['-lc', commandFromBrowser]);
```

ou:

```ts
exec(`git ${argumentFromBrowser}`);
```

### Preferido

```ts
spawn('git', ['branch', '--delete', '--force', '--', branchName], {
  shell: false,
});
```

## Separação de programa e argumentos

Sempre que possível:

```text
programa: git
args: ["status", "--porcelain"]
```

Essa separação elimina uma grande classe de injeções de shell.

Quando uma ferramenta inevitavelmente interpreta um padrão ou expressão, esse comportamento precisa ser validado e limitado antes da execução.

## Segurança de caminhos

Qualquer rota que toca o filesystem precisa distinguir:

1. identificadores internos;
2. paths relativos ao projeto;
3. paths absolutos recebidos externamente.

O padrão preferido é aceitar identificadores ou paths relativos.

### Validação canônica

Antes de ler ou escrever:

1. resolver o path base do projeto;
2. resolver o candidato;
3. canonicalizar quando aplicável;
4. garantir que ele continua abaixo da raiz permitida;
5. validar symlinks no momento da operação.

Uma checagem textual simples como:

```ts
candidate.startsWith(projectRoot);
```

não é suficiente sozinha.

## Arquivos e mutações

Leitura e escrita possuem controles adicionais:

- limite de tamanho;
- detecção de binário;
- respeito a regras de ignore;
- validação de path;
- comparação de versão esperada;
- confirmação para mutações;
- revalidação antes do commit final da escrita.

## Workspace edit

Uma edição proposta por ferramenta de IA não é uma autorização de escrita.

O fluxo é:

```text
modelo propõe edição
      │
      ▼
API lê arquivos e versões atuais
      │
      ▼
preview + confirmationToken
      │
      ▼
pessoa revisa e aprova
      │
      ▼
API revalida versões
      │
      ▼
escrita
```

`expectedVersion` é calculado pelo servidor; o modelo não escolhe a versão que será aceita.

## IA (removida)

O dashboard web não tem hoje nenhuma capacidade de IA — nem Assistente, nem
Code review, nem integração com Ollama ou provider cloud. Toda essa camada
foi removida; ver [`architecture/ai-multi-provider.md`](ai-multi-provider.md)
para o histórico.

## Confirmações para mutações sensíveis

Operações sensíveis utilizam tokens vinculados a:

```text
recurso
+ operação
+ alvo
+ contexto relevante
+ expiração
```

Exemplos:

- apagar branch;
- descartar arquivo;
- restaurar snapshot;
- aplicar workspace edit;
- executar script classificado como sensível.

Um token não pode ser reutilizado para outra operação.

## Deployments de produção

O domínio de deployment aplica uma fronteira adicional sobre o `Production Contract v1`. Um manifesto válido declara capabilities, mas não concede autorização para executar processos.

Para contratos `strategy=command`, os controles são:

- somente scripts canônicos `prod:*` já reconhecidos no contrato podem virar etapas;
- o browser não envia programa, argumentos, `cwd`, linha de shell ou corpo de script;
- o backend deriva `cwd` de `Project.path` resolvido pelo `ProjectStore`;
- package manager e argumentos são resolvidos no backend;
- processos são iniciados com `shell: false` e stdin fechado;
- branch e SHA Git são resolvidos antes do plano e novamente antes da execução;
- o working tree precisa estar limpo, incluindo arquivos não rastreados, para impedir que código fora da revision confirmada seja executado;
- o token de confirmação fica vinculado a `projectId + revision + planHash`, expira rapidamente e é de uso único;
- existe no máximo um deployment ativo globalmente nesta versão;
- stdout/stderr passam por `maskSensitiveLogContent` antes de serem persistidos;
- logs e histórico possuem limites; tokens de confirmação não são persistidos;
- cancelamento envia TERM antes da escalada para KILL;
- falha, cancelamento ou reinício durante/depois de etapa irreversível termina em `recovery_required`, nunca em rollback automático.

A autorização temporária de `sudo` para esse fluxo possui controles adicionais:

- os endpoints de autorização aceitam somente acesso pelo host loopback;
- a senha é usada exclusivamente em `sudo -S -v`, não é persistida e não entra em log;
- a senha nunca é entregue ao `prod:*`, por variável de ambiente, stdin do projeto ou arquivo temporário;
- depois da senha ser aceita, a API valida `sudo -n -v` a partir de **outro processo pai**, aproximando a árvore real em que `npm`/shell executará um novo `sudo`;
- isso impede falso positivo em políticas como `timestamp_type=ppid`, nas quais o ticket pode valer para o processo da API e não para um descendente diferente;
- se a validação descendente falhar, a autorização permanece bloqueada e a orientação é configurar uma regra `NOPASSWD` limitada aos comandos de produção necessários; o dashboard não enfraquece a política sudoers nem repassa a senha ao projeto para contorná-la.

A validação descendente executa apenas um comando interno literal de verificação; nenhum programa, argumento ou fragmento de shell é derivado do navegador ou do projeto.

O `planHash` cobre projeto, provider, branch, revision e etapas. `start()` recalcula o plano antes de consumir a confirmação; mudança de checkout ou de plano invalida a autorização anterior.

O estado persistido fica em `~/.local/state/dev-dashboard/deployments/` (ou sob `DEV_DASHBOARD_STATE_DIR`) com diretório `0700` e arquivos `0600`. A recuperação após crash considera uma etapa irreversível `running` como já iniciada, pois não é seguro assumir que nenhuma mutação aconteceu.

Detalhes de estados e troubleshooting: [Domínio de deployment local](deployment-domain.md).

## Git

### Branch names

Nomes são validados antes de chegar ao processo Git.

Mesmo quando o Git possui validação própria, o backend aplica limites adicionais.

### Separador `--`

Quando comandos aceitam paths ou nomes que podem parecer opções:

```bash
git restore -- arquivo
```

Isso reduz interpretação acidental como flag.

### Operações destrutivas

Exigem confirmação explícita e registram metadados suficientes para diagnóstico sem persistir conteúdo sensível desnecessário.

## Processos

Processos gerenciados são iniciados com:

- `shell: false` quando possível;
- ambiente controlado;
- cwd conhecido;
- logs direcionados para arquivos privados;
- grupos de processo quando necessário;
- cleanup em stop/restart.

### Execuções destacáveis (PTY)

`DetachableExecutionService` (`apps/api/src/services/detachable-execution-service.ts`), usado pela
suíte completa de testes via terminal (`docs/guia/testes.md`), pelas operações de Migration Rails
(`RailsMigrationPtyService`, aba Banco de dados → Operações) e pelas ações de Dependências/Build
(`ProjectDependenciesPtyService`, aba Dependências), roda um comando num PTY que **não é morto ao
desconectar** — diferente do Terminal/Console (`docs/guia/terminal.md`), que mata a sessão de
propósito por ser um shell de acesso total. Isso não amplia a superfície de risco porque:

- o comando continua vindo do catálogo fechado do resolver correspondente (`resolveCommand` do
  detector de testes, `resolveRailsCommand` para Migration, `script-execution/command-resolution.ts`
  para Dependências/Build) — nunca uma string do navegador;
- a conexão WebSocket é **somente leitura** — não existe canal de `input`, então não há stdin
  arbitrário como no Terminal/Console; por isso as operações de Migration não usam mais o token de
  confirmação de uso único que o fluxo antigo (`execFile` bloqueante) exigia — não há stdin livre
  para proteger, só a confirmação do lado do cliente antes de chamar `start()`;
- toda saída passa pela mesma máscara de segredos (`maskSensitiveLogContent`) usada em qualquer
  leitura de log do dashboard, aplicada uma única vez em `DetachableExecutionService` (no handler
  de dados do PTY) — cobre automaticamente qualquer serviço que reutilize essa peça, não precisa
  ser reaplicada por cada consumidor;
- o buffer de saída tem teto de tamanho (mesmo espírito do limite de leitura de log);
- só uma execução por chave (`projectId:kind`) de cada vez.

## Logs e masking

Logs de processo podem conter:

- tokens;
- passwords;
- cookies;
- URLs de banco;
- headers;
- variáveis de ambiente.

Por isso, a leitura passa por máscara de segredos.

A mesma função de masking é reutilizada como base da proteção de saída textual de IA. Não existe uma lista “especial de cloud” separada que possa divergir silenciosamente da proteção de logs.

Novos padrões sensíveis devem ser adicionados de forma centralizada e cobertos por teste.

## Persistência local

Arquivos de estado são mantidos fora do repositório e com permissões restritas.

Dados persistidos devem ser mínimos.

Não persistir por conveniência:

- tokens de confirmação;
- bootstrap tokens;
- API keys cloud;
- bodies de requests de IA;
- respostas completas de provider;
- conteúdo de logs já disponível em arquivos próprios;
- conteúdo de arquivos do projeto quando um identificador basta.

## Banco de dados

Snapshots e restaurações possuem risco elevado.

Controles para snapshots/restores:

- drivers conhecidos;
- argumentos separados;
- confirmação para restore;
- paths internos controlados;
- limites de tamanho;
- diretórios privados.

### Database Explorer somente leitura

O `DatabaseReadonlyService` aceita apenas MySQL, MariaDB e PostgreSQL em hosts de loopback. O
explorador livre combina controles da aplicação com uma política read-only aplicada pelo próprio
banco:

- PostgreSQL usa o driver `pg`, abre `BEGIN READ ONLY` antes da consulta e configura
  `statement_timeout`/`query_timeout` em 15 segundos;
- MySQL/MariaDB usam `mysql2` e abrem `START TRANSACTION READ ONLY` antes da consulta;
- a consulta digitada continua limitada a uma única instrução `SELECT`/`WITH`, sem comentários ou
  comandos múltiplos;
- DML/DDL, locking reads e construções conhecidas com efeitos colaterais são bloqueadas antes de
  chegar ao cliente. Isso inclui, entre outros, `SELECT ... INTO OUTFILE`/`DUMPFILE`, acesso por
  `LOAD_FILE`, locks de sessão e funções administrativas PostgreSQL conhecidas;
- consultas têm até 4.000 caracteres; queries livres são limitadas a 101 linhas no servidor, os
  drivers têm timeout de 15 segundos, a resposta expõe no máximo 100 linhas e mantém teto de 2 MiB;
- as rotas HTTP do explorador usam schemas explícitos com `additionalProperties: false`, limites
  para conexão/query e respostas declaradas; campos inesperados são rejeitados antes do serviço;
- credenciais são entregues diretamente às opções de conexão dos drivers e não passam por argv,
  shell ou logs. Falhas são traduzidas para mensagens genéricas antes de voltar à UI;
- resultados vêm como arrays estruturados + metadados de coluna do protocolo nativo; tab, newline e
  `NULL` não dependem mais de parsing por delimitador TSV;
- falhas do domínio são convertidas em códigos estáveis `DATABASE_EXPLORER_*`; o frontend reage ao
  código retornado pela API, sem usar texto localizado como identificador de lógica.

A configuração read-only do engine é a barreira principal contra mutações SQL de dados/schema; a
validação lexical é apenas defesa adicional. Essa garantia não transforma uma credencial poderosa
em sandbox geral: extensões, UDFs ou funções definidas pelo próprio banco podem produzir efeitos
externos que uma transação read-only não consegue desfazer ou impedir. O serviço bloqueia funções
administrativas conhecidas, mas o princípio operacional continua sendo usar um usuário de banco
com o menor conjunto de privilégios necessário para leitura.

A URL de conexão fica oculta por padrão na interface e só é revelada após ação explícita. Valores
revelados não devem ser persistidos por conveniência, copiados para logs ou incluídos em mensagens
de erro.

## Scripts

Scripts detectados recebem classificação de risco.

O frontend escolhe um `scriptId`; a API resolve o comando real.

Quando um script aceita variáveis, elas passam por validação específica e não se tornam automaticamente parte de uma linha de shell.

## Testes de segurança obrigatórios

Mudanças em áreas sensíveis devem cobrir pelo menos o risco relevante.

Exemplos:

- origem negada;
- sessão inválida;
- token expirado;
- path fora do projeto;
- symlink externo;
- branch inválida;
- confirmação ausente;
- version de arquivo divergente;
- working tree suja antes de produção;
- interrupção durante etapa irreversível;
- ticket sudo aceito no processo local mas não reutilizável por descendentes;
- log mascarado.

## Erros seguros

Mensagens de erro não devem expor:

- stack traces para o frontend;
- segredos;
- tokens;
- paths desnecessariamente amplos;
- bodies integrais de requests externas.

Quando detalhe adicional é necessário para desenvolvimento, ele pode existir no log local, mas sem prompt, diff, tool result ou credencial.

Erros de IA usam uma taxonomia estável (`AiErrorCode`) para distinguir consentimento, provider, modelo, autenticação, quota, rate limit, timeout, cancelamento, resposta inválida e falha upstream sem depender da mensagem textual.

## Responsabilidade operacional

Mesmo com esses controles, o Dev Dashboard possui acesso amplo ao ambiente local.

A pessoa usuária deve:

- executar apenas versões confiáveis do projeto;
- revisar mudanças antes de aprovar;
- proteger a conta local do sistema operacional;
- manter dependências atualizadas;
- revisar integrações externas antes de habilitá-las;
- tratar a API key cloud como segredo;
- entender que escolher e autorizar um provider cloud permite o envio de contexto textual mascarado necessário à tarefa.

## Regra para novas funcionalidades

Antes de adicionar uma rota ou ação, responder:

1. o navegador está escolhendo uma ação conhecida ou enviando um comando?
2. algum path precisa ser canonicalizado?
3. existe mutação destrutiva?
4. precisa de confirmação?
5. algum segredo pode aparecer em input, output, log ou request externo?
6. a operação pode enviar conteúdo do projeto para fora da máquina?
7. existe consentimento explícito antes desse envio?
8. a execução pode deixar processo ou estado órfão?
9. os testes cobrem abuso e não apenas sucesso?

Se uma dessas perguntas não possuir resposta clara, a funcionalidade ainda não está pronta para entrar na API.
