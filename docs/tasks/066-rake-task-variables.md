# Task 066 — Rake tasks com variáveis declaradas

## Status

Concluída.

## Objetivo

Permitir que tarefas Rake próprias do projeto recebam variáveis declaradas no
código-fonte, sem executar Ruby durante a descoberta e sem aceitar nomes de
tarefa ou de variável livres do navegador.

## Escopo entregue

- varredura estática limitada do `Rakefile` e de até 200 arquivos
  `lib/tasks/**/*.rake`, com limite de 262 KiB por arquivo;
- gramática mínima para namespaces e blocos `task ... do` com nomes literais;
- detecção de `ENV['X']`, `ENV["X"]`, `ENV.fetch('X')` e
  `ENV.fetch('X', padrão)`;
- classificação de variáveis obrigatórias, opcionais e com valor padrão;
- placeholder extraído de exemplos `VAR=valor` presentes no corpo da tarefa;
- tarefas com acesso dinâmico a `ENV` ficam fora do catálogo;
- toda tarefa com variáveis é no mínimo mutável e exige confirmação;
- confirmação vinculada ao projeto, tarefa e conjunto normalizado de valores;
- validação de allowlist, obrigatoriedade, máximo de 20 variáveis, 4 KiB por
  valor e recusa de NUL/quebras de linha;
- execução por `spawn`, sem shell, com variáveis no `env` estruturado do
  processo e logs/histórico já existentes;
- formulário gerado no painel Scripts, prévia do comando e bloqueio até o
  preenchimento dos campos obrigatórios;
- tarefas com formulário não aparecem como ações rápidas na central de
  comandos, porque a paleta não coleta seus valores.

## Decisões de segurança

- a descoberta de tarefas Rails deixa de chamar `bin/rails -T`, que carregava
  código do projeto apenas para montar o catálogo;
- nomes de tarefa e variável são redetectados na API antes de confirmar e antes
  de executar;
- valores não são persistidos no histórico nem incorporados aos argumentos do
  processo;
- variáveis que controlam a inicialização do processo, como `PATH`, `HOME`,
  `RUBYOPT` e `LD_PRELOAD`, não podem virar campos nem ser enviadas à execução;
- tarefas classificadas como destrutivas continuam bloqueadas;
- uma confirmação não pode ser reutilizada com valores diferentes.

## Validação

- testes focados do catálogo estático, execução real com `env`, formulário Vue
  e central de comandos passaram;
- `npm run typecheck` passou;
- `npm run build` passou;
- `npm test` passou nos scripts (6), API (334), web (257), core (8) e
  project-discovery (1). O pacote process-manager manteve 31 testes passando e
  as mesmas 12 falhas conhecidas deste ambiente isolado, relacionadas a
  `os.networkInterfaces()`, processos detached e temporização de locks; nenhuma
  delas percorre a inspeção ou execução de Rake tasks desta entrega.

## Limitações

- somente declarações literais e blocos com indentação convencional são
  reconhecidos;
- `ENV.fetch 'X'` sem parênteses, nomes calculados e acessos indiretos ficam
  fora da gramática;
- argumentos posicionais de Rake (`task :x, [:arg]`) não viram campos;
- valores padrão são exibidos, mas avaliados somente pelo próprio código Ruby;
- tarefas fornecidas apenas por gems não aparecem no catálogo estático.

## PR

- [#147 — Adiciona variáveis seguras em tarefas Rake](https://github.com/felipe-urgal/dev-dashboard/pull/147)
