# Testes não interativos do CLI bash

Suíte própria para os helpers puros (`_dev_*`, `_project_*`, `_git_*`, `_new_*`)
do CLI bash em `lib/`, sem dependência externa (bats, etc.) — só `bash` e `git`,
consistente com o restante do CLI (sem build step, sem compilador).

**Não é o mesmo que `lib/*/tests/`.** Aqueles diretórios são menus interativos
para rodar a suíte de testes *do projeto alvo* (ex. `bundle exec rspec`, `npm
test`) — ver `CLAUDE.md`. Esta pasta testa o próprio CLI.

## Rodando

```bash
tests/cli/run.sh
```

Cada arquivo em `cases/*.sh` roda de forma independente: `run.sh` zera os
contadores, faz `source` do arquivo, restaura o diretório de trabalho e soma
o resultado ao total. Código de saída é `0` se todos os asserts passaram, `1`
caso contrário.

## Escrevendo um novo caso

1. Crie `cases/NN-nome-do-modulo.sh` (prefixo numérico só para ordenação de
   leitura, não afeta a execução).
2. Faça `source` apenas do(s) arquivo(s) de `lib/` que contêm a(s) função(ões)
   testada(s) — evite carregar `init.sh` de um módulo inteiro, que teria
   efeitos colaterais (`export -f`, dependências de outros módulos).
3. Use `assert_eq`, `assert_success`, `assert_failure` e `skip_case` de
   `framework.sh`.
4. Para funções que dependem de um repositório Git, crie um repo temporário
   com `mktemp -d` e limpe com `rm -rf` ao final — o arquivo já roda com
   `cd` isolado, restaurado automaticamente por `run.sh`.
5. Para funções que dependem de um comando externo opcional (`lsof`, etc.),
   verifique com `command -v` e use `skip_case` quando ausente, em vez de
   falhar o ambiente que não o tem instalado.
6. Se o caso sobrescrever variáveis de ambiente globais (`DEV_BASE`, `HOME`,
   `DEV_RUN_DIR`, etc.) para isolar um cenário — ver
   `cases/06-projects-cache.sh` —, guarde o valor original no início e
   restaure no final. `run.sh` só isola o diretório de trabalho entre casos,
   não variáveis de ambiente.

## Escopo

Cobre apenas helpers **não interativos** — funções que não chamam `gum`,
`read -r -p` ou abrem um subshell de longa duração (`dev-terminal`,
`dev-claude`). Funções de menu/prompt continuam verificadas manualmente,
como descrito em `CLAUDE.md`.
