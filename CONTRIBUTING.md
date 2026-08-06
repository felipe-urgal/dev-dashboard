# Contribuindo com o Dev Dashboard

Obrigado por contribuir. O Dev Dashboard opera arquivos, processos, Git, bancos e runtimes locais; por isso, mudanças precisam preservar simplicidade de uso e controles de segurança.

## Antes de começar

Leia:

- [`docs/index.md`](docs/index.md);
- [`docs/architecture/overview.md`](docs/architecture/overview.md);
- [`docs/architecture/security.md`](docs/architecture/security.md);
- [`docs/development-guide.md`](docs/development-guide.md).

Prepare o ambiente:

```bash
npm install
npm run doctor
npm run dev
```

## Princípios de contribuição

1. Mantenha o produto local por padrão.
2. Não introduza execução arbitrária de comandos.
3. Prefira IDs conhecidos a caminhos enviados pela interface.
4. Mantenha API, contratos e web sincronizados.
5. Use confirmação explícita para mutações sensíveis.
6. Aplique limites a arquivos, logs, diffs e streams.
7. Não exponha tokens, credenciais, `.env` ou mensagens internas.
8. Preserve o CLI legado durante a migração incremental.
9. Escreva testes para regras e regressões.
10. Atualize a documentação na mesma mudança.

## Branches

Use um prefixo que represente o trabalho:

| Prefixo | Uso |
|---|---|
| `feature/` | nova funcionalidade |
| `bugfix/` | correção comum |
| `hotfix/` | correção urgente |
| `docs/` | documentação |
| `refactor/` | alteração interna sem mudança de comportamento |
| `test/` | testes |

Exemplos:

```text
feature/documentation-api
bugfix/process-loading-state
docs/security-flow
```

## Commits

Escreva mensagens curtas, no imperativo ou como descrição objetiva do resultado.

Exemplos:

```text
feat: adiciona central local de documentação
fix: impede loading sem sincronização ativa
docs: explica fluxo de confirmação Git
test: cobre encerramento do servidor de docs
```

Separe mudanças sem relação. Não misture refatoração ampla com correção urgente quando isso dificultar a revisão.

## Pull request

A descrição deve informar:

- o que mudou;
- por que mudou;
- impacto para usuário e desenvolvimento;
- riscos e controles;
- arquivos persistidos ou novas variáveis;
- testes executados;
- documentação atualizada;
- screenshots quando houver mudança visual.

### Checklist sugerido

- [ ] Escopo claro e sem arquivos não relacionados.
- [ ] Typecheck executado.
- [ ] Build executado.
- [ ] Testes executados.
- [ ] Referência da API regenerada quando necessário.
- [ ] Documentação atualizada.
- [ ] Nenhum segredo no diff.
- [ ] Operações mutáveis revisadas.
- [ ] Shutdown e cleanup revisados.
- [ ] Estados de UI revisados.

## Mudanças na API

Ao criar ou alterar uma rota:

1. atualize tipos compartilhados, quando públicos;
2. declare schemas fechados;
3. valide params, query e body;
4. aplique autenticação e origem existentes;
5. traduza erros para códigos estáveis;
6. cubra sucesso, validação e autorização;
7. registre o plugin em `app.ts`;
8. execute:

```bash
npm run docs:api
npm run docs:api:check
```

A referência em `docs/architecture/api-reference.md` é gerada. Não a edite manualmente.

## Mudanças que executam processos

Documente e teste:

- origem do comando;
- argumentos permitidos;
- `cwd` canônico;
- uso de `shell: false`;
- ambiente herdado ou preparado;
- timeout;
- limite de log;
- identificação do processo;
- `SIGTERM` antes de `SIGKILL`;
- cleanup em erro e shutdown.

O navegador nunca deve fornecer uma linha de comando livre.

## Mudanças que leem ou escrevem arquivos

Garanta:

- caminho relativo ou identificador controlado;
- resolução canônica;
- verificação de permanência no escopo;
- limite de tamanho;
- recusa de binário quando necessário;
- encoding definido;
- escrita atômica;
- permissões restritas;
- nenhuma exposição de arquivo arbitrário.

## Mudanças de segurança

Uma alteração deve atualizar `docs/architecture/security.md` quando modificar:

- autenticação ou sessão;
- origem/CORS;
- comandos permitidos;
- confirmação;
- persistência de segredos;
- leitura de arquivos;
- processos;
- snapshots;
- logs e mascaramento;
- acesso remoto;
- modelo de ameaça.

## Mudanças na web

A interface deve continuar simples, ágil e funcional.

Revise:

- hierarquia visual;
- redundância de títulos e botões;
- largura consistente;
- estados de loading, vazio, erro e sucesso;
- foco e teclado;
- responsividade;
- movimento reduzido;
- textos em português;
- impossibilidade de ação duplicada;
- descarte de respostas obsoletas.

Um indicador de atividade deve girar somente quando existe trabalho ativo.

## Testes

Execute o conjunto relevante durante o desenvolvimento e o conjunto completo antes do PR:

```bash
npm run typecheck
npm run build
npm test
```

Para fluxos de navegador:

```bash
npm run test:e2e
```

Para a documentação:

```bash
node --test scripts/docs-server.test.mjs
```

Testes com arquivos, repositórios Git ou processos devem usar fixtures temporárias e cleanup garantido.

### Cobertura

`npm test` já mede cobertura e falha se cair abaixo do piso configurado por
workspace (política de ratchet: o piso é a cobertura medida no momento em
que foi definido, task 118 — nunca um alvo arbitrário, e só sobe, nunca
desce). Node (`--experimental-test-coverage` em `apps/api`,
`packages/core`, `packages/process-manager`, `packages/project-discovery`,
restrito a `src/**/*.ts` via `--test-coverage-include`) e Vitest
(`@vitest/coverage-v8`, `coverage.thresholds` em `apps/web/vitest.config.ts`,
restrito a `src/**/*.{ts,vue}`).

Se uma mudança legítima reduzir a cobertura (ex. remover um branch de
tratamento de erro que não existe mais), baixar o piso é aceitável — mas
precisa ser deliberado e justificado no PR, não silencioso. Se uma mudança
aumentar a cobertura de forma sustentável, considere subir o piso do
workspace na mesma entrega para travar o ganho.

`scripts/*.mjs` (tooling de dev) e o CLI bash (`lib/`) ficam fora da
medição — o primeiro por não ser código de produto, o segundo por não ter
instrumentação de cobertura equivalente para Bash configurada neste
repositório.

## Documentação

Uma mudança está incompleta quando altera o comportamento sem atualizar a explicação correspondente.

### Onde documentar

| Alteração | Documento |
|---|---|
| primeiro uso ou comando | `README.md` e `docs/getting-started.md` |
| nova camada ou dependência | `docs/architecture/*` |
| fluxo operacional | `docs/architecture/runtime-flows.md` |
| variável, porta ou persistência | `docs/operations-and-troubleshooting.md` |
| processo de engenharia | `docs/development-guide.md` ou este arquivo |
| endpoint | referência gerada da API |
| planejamento | `tasks/PENDENCIAS.md` ou `tasks/*` |

Abra `http://127.0.0.1:4545` durante o desenvolvimento para revisar a navegação e a renderização.

## Dados e segredos

Nunca commite:

- `api-token`;
- `.env` com valores reais;
- credenciais;
- logs brutos sensíveis;
- dumps de banco;
- diretórios locais de configuração/estado;
- dados pessoais;
- tokens de confirmação.

Use valores fictícios em testes e exemplos.

## Release

O projeto é `"private": true` (uso interno, sem publicação em registro npm).
Versionamento segue `MAJOR.MINOR.PATCH` no `package.json` raiz, só para
rastrear histórico e compatibilidade — não há cadência fixa, releases são
manuais e sob demanda.

Fluxo, em dois workflows:

1. **Release — prepare** (`.github/workflows/release-prepare.yml`,
   `workflow_dispatch` manual, escolhendo `patch`/`minor`/`major`): roda
   `npm run release -- <bump>` (`scripts/release.mjs`), que incrementa a
   versão em `package.json` e regenera `CHANGELOG.md`
   (`scripts/generate-changelog.mjs`, task 093), e abre um PR normal
   (`chore(release): vX.Y.Z`) — passa pelo mesmo processo de revisão de
   qualquer outra mudança.
2. **Release — tag** (`.github/workflows/release-tag.yml`, dispara em push
   em `main` que altera `package.json`): se a versão mudou e a tag
   correspondente ainda não existe, cria a tag `vX.Y.Z` e um GitHub Release
   com notas geradas automaticamente pelo GitHub a partir dos PRs
   mergeados desde o release anterior.

Rodar `npm run release -- patch` localmente também funciona (sem abrir PR
automaticamente) — útil para conferir o resultado antes de disparar o
workflow.

## Compatibilidade

O projeto mantém duas interfaces: CLI Bash e dashboard web. Não remova comportamento do CLI apenas porque existe uma alternativa web, salvo quando a migração estiver explicitamente planejada e validada.

## Definição de pronto

Uma contribuição está pronta quando:

- resolve o problema declarado;
- respeita os limites de segurança;
- possui contratos e erros claros;
- inclui testes suficientes;
- fecha recursos corretamente;
- mantém a interface consistente;
- atualiza documentação e referência;
- passa na validação do repositório;
- pode ser explicada por outra pessoa a partir do código e dos documentos.
