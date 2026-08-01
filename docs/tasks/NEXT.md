# Próxima atividade

Duas frentes documentadas e aguardando decisão de início — nenhuma delas tem
código escrito ainda:

## 1. Refatoração pura dos arquivos acima de 400 linhas

Plano completo dos 3 primeiros arquivos (`process-manager.ts`,
`ProjectLogsPanel.vue`, `ProjectGitDiffPage.vue`) em
`docs/refactor/plano-arquivos-grandes.md`, com o inventário dos 36 arquivos
no total. Nenhuma API pública muda — é reorganização de arquivo, não de
comportamento. Falta aprovação do plano antes de começar a dividir de fato.

## 2. Abrir o editor local do usuário

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
