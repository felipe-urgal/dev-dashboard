
# Próxima atividade

## Task 102 — Conselheiro de impacto após mudanças Git

### Objetivo

Depois de uma troca de branch, pull ou sincronização, comparar o SHA
anterior com o novo SHA e transformar os caminhos alterados em
recomendações claras, sem executar nenhuma ação automaticamente.

### Decisão principal

A primeira versão será um classificador puro e declarativo de paths.
Ela recebe somente dois commits já conhecidos pela mutação Git e usa
`git diff --name-only` com argumentos estruturados. O resultado aponta
para ações existentes; não lê conteúdo dos arquivos e não cria um
executor genérico.

### Escopo

- contrato `ProjectChangeImpact`;
- regras testáveis para lockfiles Node, `Gemfile.lock`, migrations,
  Dockerfile/Compose, `.env.example`, configuração de servidor/worker e
  arquivos de teste;
- captura dos SHAs anterior/novo nas mutações de troca, pull e
  sincronização;
- apresentação do impacto no resultado da operação Git e na visão do
  projeto;
- deep links para Dependências, Banco, Servidor, Variáveis de ambiente
  e Testes quando a ação correspondente já existir;
- lista limitada, deduplicada e ordenada por prioridade.

### Critérios de aceite

- uma mudança de lockfile recomenda revisar/instalar dependências;
- migrations recomendam abrir Banco de dados;
- `.env.example` ou `.env.sample` recomenda revisar nomes de variáveis;
- configuração de servidor/worker recomenda reiniciar somente por ação
  explícita;
- arquivos de teste recomendam executar testes, sem iniciar execução;
- diff inválido ou commits iguais produzem resultado vazio e seguro;
- nenhum conteúdo de arquivo, segredo ou caminho absoluto é devolvido;
- nenhuma recomendação dispara comando automaticamente.

### Fora de escopo

- analisar conteúdo ou AST;
- instalar dependências, migrar banco ou reiniciar processos
  automaticamente;
- comparar commits arbitrários enviados pelo navegador;
- IA ou recomendação probabilística;
- persistência histórica dos impactos na primeira versão.
