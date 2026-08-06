# Task 113 — Publica a matriz de suporte de sistemas operacionais e runtimes

## Contexto

Item pendente em `tasks/PENDENCIAS.md` ("Distribuição, governança e
compatibilidade"): não havia um lugar único descrevendo o que é validado
hoje por sistema operacional e quais dependências de runtime cada interface
(CLI bash vs. dashboard web) exige. A informação existia espalhada — CI
(`ubuntu-latest`), `package.json` (`engines`), `_dev_os` em
`lib/core/checks.sh`, `dev-doctor` (`lib/doctor/check.sh`) e uma observação
solta em `docs/architecture/security.md` sobre `/proc/<pid>/cwd` ser
específico do Linux.

## Mudança

Nova seção "Sistemas e runtimes suportados" em
`docs/operations-and-troubleshooting.md`, logo após a introdução:

- tabela por sistema operacional (Linux/macOS/Windows) × interface
  (dashboard web / CLI bash), descrevendo o que é testado em CI, o que tem
  tratamento parcial no código e o que não é suportado;
- tabela de dependências de runtime (Node, Bash, `git`, `gum`, `lsof`,
  `ruby`/`bundle`, clientes de banco, `gh`) com onde cada uma é exigida e se
  é obrigatória ou opcional;
- aponta para `npm run doctor` e `dev-doctor` como forma de verificar o
  ambiente atual contra a lista.

A matriz é explicitamente descritiva ("o que é validado hoje"), não uma
promessa de suporte — evita prometer compatibilidade que ainda não existe.

## Fora de escopo

- Implementar suporte real a macOS/Windows — continuam como itens próprios
  em `tasks/PENDENCIAS.md`, agora com uma referência mais precisa do que
  falta (identidade de processo equivalente ao `/proc/<pid>/cwd` fora do
  Linux, cobertura de teste dedicada para os ramos `_dev_os` existentes).

## Arquivos

- `docs/operations-and-troubleshooting.md`
- `tasks/PENDENCIAS.md`

## Verificação

Documentação pura — sem mudança de comportamento; não requer
`typecheck`/`build`/`test`, mas rodei mesmo assim para garantir que nada
mais no branch estava quebrado:

```bash
npm run typecheck
npm run build
npm test
```
