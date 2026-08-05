# Fluxos de execução

Esta página explica o que o Dev Dashboard executa em seus principais fluxos, quais camadas participam e quais controles precisam permanecer presentes.

## Inicialização de desenvolvimento

```text
npm run dev
        ↓
predev compila packages/*
        ↓
scripts/dev.mjs cria três grupos de processo
        ├── API Fastify :4343
        ├── Vite        :5173
        └── Docs        :4545
        ↓
qualquer filho encerra inesperadamente
        ↓
processo raiz encerra os demais
```

No Linux, os filhos são destacados em grupos próprios. O encerramento envia `SIGTERM` ao grupo e usa `SIGKILL` somente depois do período de tolerância.

## Inicialização da API

```text
server.ts
  ↓ lê configuração
buildApp()
  ↓ cria Fastify e WebSocket
  ↓ registra tratamento de erros
  ↓ constrói AppContext
  ↓ obtém token local
  ↓ registra segurança local
  ↓ registra plugins de rota
  ↓ registra frontend estático quando habilitado
app.listen(127.0.0.1, porta)
```

O `AppContext` concentra dependências de longa duração. Serviços que mantêm recursos ativos precisam ser fechados no hook `onClose`.

## Requisição do navegador

### Desenvolvimento com Vite

```text
Vue em :5173
   ↓ fetch /api/...
proxy Vite
   ↓ adiciona X-Dev-Dashboard-Token
API em :4343
   ↓ valida origem, autenticação e JSON Schema
rota
   ↓ chama serviço/repositório
resposta estruturada
```

O token é lido pelo processo do Vite. Ele não deve ser exposto por variável `VITE_*` nem serializado no frontend.

### Distribuição local

```text
URL com capacidade efêmera no fragmento
   ↓ frontend move para sessionStorage
POST /api/auth/browser-session
   ↓ API valida capacidade
cookie HttpOnly + SameSite=Strict
   ↓ chamadas seguintes usam sessão local
```

Origem e conteúdo JSON são controles adicionais, não substitutos da autenticação.

## Cadastro de workspace

```text
usuário informa diretório
        ↓
frontend envia request estruturado
        ↓
API valida schema
        ↓
Core resolve caminho real
        ↓
confirma que é diretório
        ↓
impede duplicidade
        ↓
persiste workspace
        ↓
retorna contrato público
```

Remover um workspace altera somente a configuração do dashboard. O diretório e os projetos locais não são apagados.

## Scan e descoberta de projetos

```text
POST scan(workspaceId)
        ↓
API encontra workspace persistido
        ↓
Project Discovery lista filhos diretos
        ↓
ignora diretórios internos/dependências
        ↓
detecta Rails ou Node
        ↓
detecta capacidades
        ↓
gera IDs estáveis e warnings
        ↓
ProjectStore substitui o snapshot em memória
        ↓
frontend atualiza a listagem
```

O projeto precisa estar presente no `ProjectStore` para operações posteriores. Após reiniciar a API, um novo scan pode ser necessário.

## Inicialização de servidor de projeto

```text
usuário escolhe Iniciar
        ↓
API exige projectId conhecido
        ↓
lê configurações de porta, health check e ambiente
        ↓
seleciona comando permitido
        ├── Rails: bin/rails server
        │           ou bundle exec rails server
        └── Node: dev → start → serve
        ↓
prepara ambiente reconhecido
        ↓
Process Manager escolhe porta
        ↓
spawn(command, args, shell: false)
        ↓
persiste estado starting, PID, cwd, porta e log
        ↓
health check confirma disponibilidade
        ↓
estado running ou failed
```

O navegador não envia o comando final. A seleção ocorre no backend a partir do tipo e dos arquivos atuais do projeto.

## Encerramento de processo

```text
usuário solicita Parar
        ↓
API encontra estado persistido
        ↓
valida que o PID ainda existe
        ↓
Linux: compara /proc/<pid>/cwd com o projeto
        ↓
envia SIGTERM ao grupo
        ↓
aguarda encerramento
        ↓
usa SIGKILL apenas se necessário
        ↓
persiste stopped
```

Um PID não é prova de identidade porque pode ser reutilizado pelo sistema operacional.

## Leitura de logs

```text
request recebe apenas IDs e limites
        ↓
backend deriva arquivo permitido
        ↓
lê no máximo o teto configurado
        ↓
remove linha inicial incompleta quando necessário
        ↓
mascara segredos conhecidos
        ↓
retorna snapshot e metadados de redaction
```

A API não deve aceitar um caminho arbitrário de log vindo da web.

## Operação Git somente leitura

```text
frontend pede status/diff/histórico
        ↓
API encontra projeto conhecido
        ↓
serviço Git usa cwd canônico
        ↓
executa subcomando permitido
        ↓
normaliza saída
        ↓
retorna contrato limitado
```

Diffs e expansão de contexto precisam respeitar limites de arquivo, linhas e bytes, além de recusar caminhos que não pertençam ao diff consultado.

## Mutação Git com confirmação

```text
usuário prepara ação
        ↓
frontend solicita confirmação
        ↓
API emite token aleatório temporário
   vinculado a projeto + operação + parâmetros
        ↓
usuário confirma
        ↓
frontend envia token e payload fechado
        ↓
API consome token na primeira tentativa
        ↓
serviço executa operação permitida
        ↓
histórico registra resultado
        ↓
frontend atualiza status
```

Tokens de confirmação não podem ser reutilizáveis ou genéricos. Uma mudança nos parâmetros relevantes deve invalidar a confirmação anterior.

## Execução de testes

```text
API redetecta comandos de teste
        ↓
frontend escolhe commandId reconhecido
        ↓
serviço reconstrói programa e argumentos
        ↓
inicia processo controlado
        ↓
persiste estado e histórico
        ↓
publica snapshots por SSE
        ↓
conclusão terminal é persistida
```

Para arquivo específico, o caminho precisa vir de uma listagem reconhecida ou passar por validação equivalente dentro do projeto.

## Catálogo de scripts e tarefas

```text
GET catálogo
        ↓
detecta scripts package.json, tarefas Rails e binários permitidos
        ↓
frontend recebe IDs, nomes e risco
        ↓
na execução, API redetecta o catálogo
        ↓
confirma que o ID ainda representa a mesma ação
        ↓
exige confirmação quando mutável
        ↓
executa sem shell e acompanha histórico/SSE
```

A redetecção no momento da execução evita usar uma descrição obsoleta após o projeto ser alterado.

## Snapshot de banco

### Criação

```text
projectId + environmentId reconhecidos
        ↓
backend recupera host, porta, usuário e banco
        ↓
spawn mysqldump ou pg_dump com argumentos fixos
        ↓
senha via variável de ambiente específica
        ↓
grava arquivo 0600 no estado privado
        ↓
retorna somente metadados
```

### Restauração

```text
usuário escolhe snapshot
        ↓
solicita confirmação vinculada ao snapshot
        ↓
API valida UUID, tamanho, prazo e token
        ↓
executa cliente do banco sem shell
        ↓
limita duração e remove parcial em falha
        ↓
retorna resultado estruturado
```

A restauração é destrutiva e sempre exige confirmação explícita.

## Edição de arquivos

```text
frontend solicita árvore/arquivo por projectId
        ↓
ProjectFileService resolve caminho dentro do projeto
        ↓
valida escopo, tipo, tamanho e encoding
        ↓
retorna conteúdo permitido
        ↓
mutação usa serviço separado e confirmação quando aplicável
```

Caminhos precisam ser relativos ao projeto e permanecer dentro do caminho canônico após resolução de symlinks.

## Assistente de IA e edições de workspace

O assistente deve operar sobre serviços já protegidos:

- leitura por `ProjectFileService`;
- Git por serviço controlado;
- edição por `ProjectWorkspaceEditService`;
- contexto de linguagem por `ProjectLanguageServerService`.

A integração não deve criar um atalho para execução arbitrária, leitura fora do projeto ou bypass de confirmação.

## Central de documentação

```text
node scripts/docs-server.mjs
        ↓
listener somente em 127.0.0.1:4545
        ↓
scan de README, CONTRIBUTING e docs/**/*.md
        ↓
catálogo com grupos, títulos e headings
        ↓
UI solicita conteúdo Markdown
        ↓
renderização segura no navegador
```

O servidor é somente leitura, recusa traversal e só entrega documentos presentes no catálogo.

## Shutdown coordenado

Toda camada que inicia recurso duradouro precisa possuir fechamento explícito:

- servidores HTTP;
- conexões SSE e WebSocket;
- watchers;
- processos filhos;
- timers;
- language servers;
- serviços com arquivos ou streams abertos.

No desenvolvimento, o orquestrador encerra o conjunto quando um serviço falha, evitando ambientes parcialmente ativos.
