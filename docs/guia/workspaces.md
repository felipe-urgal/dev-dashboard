# Workspaces

Um workspace é uma pasta local que reúne os projetos mostrados no dashboard. O cadastro fica em
`~/.config/dev-dashboard/config.json` (ou no diretório configurado por `DEV_DASHBOARD_CONFIG_DIR`/
`XDG_CONFIG_HOME`). Remover um workspace da lista não remove a pasta nem os projetos do computador.

## Cadastrar

1. Abra o seletor de workspace na barra lateral.
2. Clique no botão `+`.
3. Informe um nome e o caminho da pasta, ou use **Escolher pasta**.
4. Ative **Escanear subdiretórios** se a pasta tiver monorepos ou projetos aninhados.
5. Clique em **Adicionar workspace**.

Depois do cadastro, o dashboard seleciona e escaneia a pasta automaticamente.

## Trocar, renomear ou remover

- Selecione outro item no seletor para trocar de workspace.
- Use **Renomear** para alterar apenas o nome exibido.
- Use **Remover** e confirme para tirar o workspace do dashboard. Os arquivos locais permanecem
  intactos.

O workspace ativo é lembrado neste navegador. Se ele não estiver mais disponível, o primeiro item
da lista será selecionado automaticamente.

## Quando algo falhar

Confira se o caminho existe e se o processo da API tem permissão para lê-lo. Erros de cadastro,
renomeação e remoção aparecem dentro do próprio modal. Se nenhum workspace estiver disponível,
cadastre uma pasta novamente pelo botão `+`.
