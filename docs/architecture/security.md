# Segurança e modelo de ameaça

O Dev Dashboard possui uma característica que domina quase todas as decisões arquiteturais: ele executa operações reais na máquina da pessoa usuária. Isso inclui iniciar processos, ler logs, inspecionar repositórios Git, executar testes, consultar bancos e rodar ferramentas de projeto.

Por esse motivo, a segurança não pode depender apenas de “ser uma aplicação local”. O sistema precisa reduzir o impacto de uma página maliciosa, de dados inesperados do projeto, de erros de implementação e de integrações externas.

## Modelo de ameaça

As ameaças principais consideradas pelo projeto são:

| Ameaça | Exemplo | Mitigação principal |
|---|---|---|
| Origem web não autorizada | Uma página aberta no navegador tenta chamar a API local. | allowlist de `Origin` e autenticação local. |
| Reuso de credencial | Um token local aparece em histórico ou DevTools e é reutilizado. | bootstrap curto, cookie HttpOnly e sessão com validade. |
| Execução arbitrária | O frontend envia `rm -rf`, shell syntax ou argumentos não previstos. | catálogos fechados e `spawn`/`execFile` sem shell. |
| Path traversal | Uma rota recebe `../../arquivo-fora-do-projeto`. | resolução canônica e validação de raiz. |
| TOCTOU | Um symlink muda entre validação e escrita. | revalidação no momento da operação e versões esperadas. |
| Mutação acidental | Um clique apaga branch, arquivo ou banco. | tokens de confirmação por operação. |
| Exposição de segredos | Logs, diffs, tool results ou requests cloud contêm API keys/tokens. | masking, limites, consentimento cloud e ausência de bodies sensíveis em logs. |
| Processo órfão | A API encerra mas deixa subprocessos vivos. | grupos de processos, cleanup e persistência de estado. |
| Estado persistido adulterado | Arquivo JSON local é editado/corrompido. | diretórios privados, validação e fallback seguro. |
| Provider cloud indevido | Código do projeto é enviado para OpenAI sem decisão explícita. | seleção por projeto, consentimento separado e revalidação antes da execução. |

## Princípio: local-first, cloud somente por decisão explícita

A API e os serviços de desenvolvimento escutam em loopback. O provider padrão de IA é local (`Ollama`).

O projeto também suporta OpenAI cloud, mas isso não transforma a aplicação em um serviço remoto genérico:

- selecionar OpenAI é uma decisão persistida por projeto;
- seleção e consentimento são estados separados;
- conteúdo do projeto só pode seguir para OpenAI depois de consentimento explícito;
- o consentimento é revalidado em cada nova execução cloud;
- Local → Cloud nunca acontece automaticamente;
- status/listagem de modelos pode consultar a OpenAI sem consentimento porque essa operação não envia conteúdo do projeto;
- a API key da OpenAI permanece no processo da API e é usada somente no header de autenticação.

A fronteira local-first continua sendo o default e o caminho sem custo/privacidade externos.

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
candidate.startsWith(projectRoot)
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

## Assistente de IA multi-provider e fronteira cloud

O Assistente e a Code Review podem operar com provider local ou OpenAI cloud. O poder da IA continua limitado pelo catálogo fechado de ferramentas e pelas regras locais de confirmação.

### O que permanece local

O provider não recebe acesso direto a:

- shell;
- filesystem;
- Git;
- LSP;
- serviço de workspace edit;
- tokens de confirmação;
- API key de outro provider.

Ferramentas são executadas pela API local. O modelo recebe apenas o resultado textual que a aplicação decidiu reapresentar na conversa.

O snapshot de uma `AiImplementationExecution` também é estado local e efêmero. O objeto completo não é enviado a um provider nem persistido como histórico permanente. Entretanto, quando OpenAI está selecionada e autorizada, **o prompt da pessoa usuária e o contexto textual necessário à execução podem ser enviados à OpenAI** depois das barreiras descritas abaixo.

### O que pode sair para OpenAI

Dependendo do fluxo, uma request de inferência pode conter:

- prompt da pessoa usuária;
- conteúdo de arquivos lidos por ferramentas;
- resultados textuais de busca/listagem/diff;
- prefixo/sufixo de completion;
- diff da Code Review;
- contexto agregado para síntese global.

Esse conteúdo nunca deve ser enviado antes da resolução de provider/consentimento e nunca deve contornar a barreira compartilhada de masking.

### Consentimento antes de conteúdo do projeto

`AiProviderResolver` valida OpenAI nesta ordem para uma execução:

1. provider selecionado;
2. consentimento cloud do projeto;
3. disponibilidade/autenticação do provider;
4. modelo solicitado.

Sem consentimento, a execução é recusada antes de consultar diff/arquivos e antes de qualquer request OpenAI do fluxo de inferência.

A consulta de status/modelos é diferente: ela não recebe `Project`, path, prompt ou conteúdo de workspace e pode chamar `/v1/models` mesmo sem consentimento.

Revogar consentimento afeta a próxima execução. Uma nova Code Review ou implementation não pode reutilizar implicitamente a autorização da execução anterior.

### Masking antes da rede

`createAiOutboundProtectionFetch` é a última barreira compartilhada antes do transporte HTTP dos providers.

Ela mascara conteúdo textual de requests antes de chamar o `fetch` real. A proteção cobre os caminhos atuais de:

- chat;
- implementation;
- resultados de ferramentas reapresentados ao modelo;
- completion;
- Code Review por arquivo;
- síntese global da Code Review.

Alguns fluxos, como Code Review, também mascaram o diff antes de construir o prompt. A barreira no transporte continua existindo como defesa adicional.

A API key da OpenAI **não entra no body mascarado**. Ela é lida do ambiente e usada somente no header `Authorization` do request para `api.openai.com`.

### Retenção no provider

Requests OpenAI de inferência usam `store: false`.

Isso evita pedir persistência de application state pelo endpoint, mas não deve ser descrito como garantia de Zero Data Retention. Políticas de retenção dependem da configuração e elegibilidade da organização OpenAI.

### Logs e eventos

Prompts, diffs e tool results não são adicionados como campos estruturados aos logs de erro das rotas de IA.

Eventos SSE expõem mensagens, chamadas/resumos de ferramenta e códigos de erro, mas não transportam a API key. O conteúdo bruto de um arquivo lido por ferramenta é usado como contexto interno e não é emitido no evento `tool-result`.

Erros conhecidos usam `AiErrorCode`, permitindo diagnóstico sem depender de serializar request/response bodies.

Ao final de cada execution de implementation ou Code Review (`completed`/`succeeded`, `failed` ou `cancelled`), o backend registra uma métrica estruturada com `executionKind`, `executionId`, `projectId`, `provider`, `mode`, `status`, `durationMs` e `errorCode` quando houver — nunca prompt, diff, resumo ou achado (`ai-execution-metrics.ts`).

## Code Review IA

A Code Review usa a mesma seleção e consentimento por projeto do Assistente.

Antes de ler o diff para uma nova revisão, o backend resolve provider/modelo. Se OpenAI estiver selecionada sem consentimento, a revisão falha fechada antes de `getReviewFiles`/`getReviewFileDiff` e antes de qualquer request de inferência.

Provider e modo ficam congelados na execution. Revisões por arquivo e síntese global usam o mesmo provider resolvido no início.

O diff é dado não confiável: não pode ampliar o catálogo de ferramentas nem autorizar escrita. A Code Review é consultiva e não possui acesso a `propose_workspace_edit`.

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
PoC de testes via terminal (`docs/guia/testes.md`), roda um comando num PTY que **não é morto ao
desconectar** — diferente do Terminal/Console (`docs/guia/terminal.md`), que mata a sessão de
propósito por ser um shell de acesso total. Isso não amplia a superfície de risco porque:

- o comando continua vindo do catálogo fechado do detector correspondente (nunca uma string do
  navegador);
- a conexão WebSocket é **somente leitura** — não existe canal de `input`, então não há stdin
  arbitrário como no Terminal/Console;
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

Controles:

- drivers conhecidos;
- argumentos separados;
- confirmação para restore;
- paths internos controlados;
- limites de tamanho;
- diretórios privados.

Credenciais de banco vêm do ambiente do projeto e não são devolvidas ao navegador como texto puro.

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
- versão de arquivo divergente;
- log mascarado;
- provider cloud sem consentimento;
- modelo incompatível com provider;
- masking de conteúdo em requests OpenAI;
- tool result mascarado antes da rodada cloud seguinte;
- revogação de consentimento entre executions;
- status/modelos cloud sem conteúdo do projeto;
- API key ausente de bodies/eventos.

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
