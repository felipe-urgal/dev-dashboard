# Desenho — detecção e execução de Rake tasks com variáveis

## Status

Implementado na task 066.

## Problema

O catálogo de scripts (`ProjectScriptsPanel.vue` / `script-execution-service.ts`)
hoje reconhece scripts Node e tarefas Rake, mas trata toda rake task como um
comando fixo — `bin/rails <task>`. Tasks que esperam uma variável de
ambiente (`ENV['FILE']`, `ENV['ID']` etc.) simplesmente falham quando
executadas pelo catálogo, porque ninguém preenche a variável.

## Exemplo real (fornecido pelo usuário)

```ruby
# lib/tasks/cultural_spaces.rake (namespace inferido pelo caminho/uso)
namespace :cultural_spaces do
  desc 'Importa espaços culturais de um CSV'
  task import: :environment do
    file_path = ENV['FILE']
    raise 'Informe o arquivo: rake cultural_spaces:import FILE=tmp/espacos-culturais.csv' if file_path.blank?
    # ...
  end
end
```

Ponto chave: a própria task se autodocumenta na mensagem de erro —
`rake cultural_spaces:import FILE=tmp/espacos-culturais.csv` é literalmente
o comando de exemplo, no formato `nome:da:task VAR=valor`. Esse padrão é
comum o bastante em projetos Rails para servir de base de extração.

## Detecção proposta (estática, sem executar Ruby)

Mesmo espírito do resto da inspeção Rails do projeto
(`rails-inspection-service.ts`): regex sobre o código-fonte, nunca `eval`
nem `ruby -e`.

1. Varrer `lib/tasks/**/*.rake` (e `Rakefile` na raiz, se existir tarefas
   fora de `lib/tasks`);
2. Para cada bloco `task <nome>[, [:args]] => [:environment] do ... end`,
   rastrear `namespace :x do ... end` aninhado para montar o nome completo
   (`cultural_spaces:import`);
3. Dentro do corpo da task, procurar `ENV['X']` / `ENV["X"]` — cada
   ocorrência única vira uma variável candidata;
4. Para cada variável candidata, procurar nas linhas seguintes um guard de
   obrigatoriedade: `raise ... if x.blank?`, `raise ... unless x.present?`,
   `abort ... if x.nil?` etc. — se encontrar, a variável é **obrigatória**;
   senão, **opcional**;
5. Se a mensagem do `raise`/`abort` casar com o padrão
   `<mesmo nome da task> ([A-Z_]+=\S+\s*)+`, extrair os pares `VAR=exemplo`
   como placeholder de cada campo na UI (no exemplo:
   `FILE=tmp/espacos-culturais.csv` vira o placeholder do campo `FILE`).

### O que fica de fora (documentar como limitação, não tentar cobrir)

- variáveis lidas indiretamente (`env_name = 'FILE'; ENV[env_name]`) —
  só o literal `ENV['X']`/`ENV["X"]` é reconhecido;
- valor default via `ENV.fetch('X', default)` — é reconhecido como
  **opcional** automaticamente (tem fallback, não precisa de guard);
- tasks que chamam outras tasks (`Rake::Task['outra'].invoke`) — cada task
  é analisada isoladamente, sem seguir a cadeia de invocação.

## Execução implementada

Cada valor informado no formulário entra no objeto `env` passado ao processo.
O programa e os argumentos continuam fechados (`bin/rails` + nome redetectado)
e nunca são concatenados em uma string de shell:

```ts
// nunca isso (shell):
// exec(`bin/rails cultural_spaces:import FILE=${filePath}`)

spawn(railsCommand, [...railsArgs, 'cultural_spaces:import'], {
  cwd,
  shell: false,
  env: { ...process.env, FILE: filePath },
})
```

Validação antes de montar o comando: nome da variável já veio do próprio
código-fonte (não do navegador, então não precisa de allowlist adicional);
o **valor** vem do navegador e precisa dos mesmos cuidados já aplicados a
outras entradas de usuário no projeto — sem `\0`, sem quebra de linha, com
limite de tamanho razoável (ex. 4 KiB por variável).

## Interface proposta

No catálogo de scripts, uma task com variáveis detectadas ganha um formulário
inline em vez de rodar direto: um campo por variável (obrigatórias
marcadas, com o placeholder extraído do exemplo quando existir), e o
comando final pré-visualizado antes de confirmar — mesmo padrão de duas
etapas já usado em `db:migrate`/`rails generate`.

## Resultado

A implementação estende o catálogo e o motor de execução existentes. A inspeção
estática ficou isolada em `rake-task-inspection.ts`; formulário, confirmação,
logs, cancelamento e histórico permanecem no fluxo único de Scripts.
