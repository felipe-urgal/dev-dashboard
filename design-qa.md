# QA visual — Padronização dos painéis Git

## Evidência

- referência de Commit:
  `/workspace/scratch/560252e246ed/upload/image(144).png`;
- referência de largura do painel Branches:
  `/workspace/scratch/560252e246ed/upload/image(145).png`;
- referência de Sincronização e navegação:
  `/workspace/scratch/560252e246ed/upload/image(146).png`;
- implementações:
  - `apps/web/src/components/ProjectGitCommitPage.vue`;
  - `apps/web/src/components/ProjectGitSyncPage.vue`;
  - `apps/web/src/git-icon/constants.ts`.

## Alterações conferidas no código

- Commit ocupa toda a largura útil e usa espaçamento vertical compacto;
- Sincronização voltou a ocupar toda a largura útil do painel após a versão
  limitada ter deixado a composição visual desequilibrada;
- Branches usa `ShareIcon`, o ícone de ramificação da biblioteca Heroicons;
- as operações, estados e regras de negócio dos três painéis foram preservados.

## Validação automatizada

- `npm run typecheck --workspace=@dev-dashboard/web`: aprovado;
- teste direcionado de `ProjectGitPanel`: aprovado;
- `npm run build --workspace=@dev-dashboard/web`: aprovado;
- `git diff --check`: aprovado.

## Tentativas de captura

1. O Vite iniciou localmente na porta 4173 com um shim para a limitação
   `uv_interface_addresses` do container.
2. O cloud browser tentou abrir `http://terminal.local:4173/`, mas recebeu
   `ERR_CONNECTION_REFUSED`.
3. `sites-preview start` não iniciou porque o mailbox
   `/tmp/sites-previewd/requests` não está disponível neste ambiente.

## Finding

- [P1] Captura browser-rendered indisponível.
  - Impacto: impede a comparação visual final em desktop e mobile.
  - Mitigação: dimensões foram conferidas diretamente contra as referências;
    typecheck, build e testes direcionados validam a integração.
  - Continuação: repetir a captura quando o serviço de preview estiver
    disponível.

final result: blocked
