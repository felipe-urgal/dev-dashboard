# Próxima atividade

A correção e refatoração da task 063 foi concluída. Ela não altera a prioridade das
frentes abaixo, que continuam aguardando decisão de início.

Duas frentes documentadas e aguardando decisão de início — nenhuma delas tem
código escrito ainda:

## 1. Abrir o editor local do usuário

Próxima candidata concreta de "paridade CLI→Web" (Horizonte 2 do roadmap):
a API roda `code <projeto>` (ou `cursor`/outro, catálogo fechado de
editores conhecidos), sem shell — igual ao adaptador que o CLI Bash já tem
para terminal/Claude. Ainda não tem doc de desenho próprio; é o próximo
passo antes de codar.

Fase 2 dessa mesma frente (editor completo dentro do navegador, tipo
Monaco/CodeMirror lendo qualquer arquivo do projeto pela API) foi
propositalmente adiada para o Horizonte 4 — é uma superfície de acesso a
arquivo muito maior que qualquer endpoint hoje e pede modelo de ameaça
próprio antes de qualquer código.

## 2. Docker Compose por serviços declarados e allowlist

Item do Horizonte 3 do roadmap. Desenho completo em
`docs/architecture/docker-compose-design.md`: ler `docker-compose.yml`/
`compose.yaml` já existente no projeto (nunca criar/buildar imagem),
catálogo fechado de 4 ações (`start`/`stop`/`restart`/`logs`) via
`execFile('docker', [...])` sem shell, confirmação em duas etapas para
`stop`/`restart`. Ponto em aberto que trava o início da implementação: se
`logs` vira um terceiro `kind` de `ManagedProcess` (`'compose-service'`,
reaproveitando o rastreamento de PID/log que já existe, mais retrabalho) ou
uma leitura pontual com `--tail` (mais simples, sem streaming ao vivo) — o
doc recomenda a primeira opção, mas registra o trade-off para decisão na
hora de codar.

## Refatoração concluída

A Fase 7 de `docs/architecture/refactoring-arquivos-grandes.md` deixou todos
os componentes `.vue` abaixo de 400 linhas. As duas classes de serviço que
continuam acima desse limite já foram subdivididas por responsabilidade e
permanecem apenas como candidatas a uma segunda passada, sem prioridade ativa.

## Outras frentes documentadas, sem prioridade definida ainda

- **Rake tasks com variáveis** (`ENV['FILE']` etc.): desenho completo em
  `docs/refactor/rake-tasks-mapeamento.md`, a partir de um exemplo real
  fornecido. Detecção estática das variáveis obrigatórias/opcionais direto
  do código-fonte da task, formulário gerado a partir disso.
- candidatos observados nas entregas 057–060 da aba Banco de dados:
  - os arquivos criados por `rails generate` (060) aparecem só como texto,
    sem ação de abrir no editor — conecta com a frente 2 acima quando ela
    sair;
  - `runMigrationMutation` (migrate/rollback/seed/db:prepare) sempre opera
    em todos os bancos configurados de uma vez; não há como escolher rodar
    só num banco secundário pela interface (059);
  - a correlação entre bloco de `db:migrate:status` e banco configurado
    (059) é heurística (nome do arquivo contém o nome da configuração); não
    há um jeito formal de confirmar a correspondência.
