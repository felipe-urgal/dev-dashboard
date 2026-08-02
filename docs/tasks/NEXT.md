# Próxima atividade

A task 065 concluiu a primeira integração segura com Docker Compose por
serviços declarados; a task 066, fora de sequência, adicionou build
assíncrono por serviço em cima dela. O plano abaixo (Rake tasks com
variáveis) continua sendo a próxima frente aprovada.

## Rake tasks com variáveis

Próxima frente candidata de ferramentas Rails. O desenho existente em
`docs/refactor/rake-tasks-mapeamento.md` parte de tasks reais que usam
`ENV['FILE']`, `ENV.fetch('LIMIT')` e valores opcionais.

### Escopo proposto

- detectar estaticamente tasks em `lib/tasks/**/*.rake`;
- identificar variáveis `ENV` obrigatórias, opcionais e seus valores padrão;
- gerar um formulário somente a partir desse catálogo detectado;
- validar nomes, quantidade e tamanho dos valores;
- executar `bin/rails <task>` com ambiente estruturado e sem shell;
- reutilizar confirmação e logs do catálogo seguro;
- nunca aceitar nome de task ou variável que não tenha sido redetectado pela
  API no código-fonte do projeto.

### Decisões antes da implementação

- definir a gramática estática mínima reconhecida para `ENV[]` e `ENV.fetch`,
  recusando construções dinâmicas;
- classificar o risco inicial das tasks detectadas, já que o nome sozinho não
  prova se uma task é somente leitura ou mutável;
- decidir se toda task com variáveis exige confirmação na primeira versão ou
  se apenas tasks explicitamente allowlisted podem ser executadas.

Nenhum código desta frente foi escrito ainda.
