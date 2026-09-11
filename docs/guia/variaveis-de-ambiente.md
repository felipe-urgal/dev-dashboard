# Guia da aba Variáveis de ambiente

> Parte do [Guia passo a passo do dashboard web](README.md).

A aba **Variáveis de ambiente** é somente leitura. Ela existe para conferir a estrutura dos arquivos `.env` reconhecidos, localizar diferenças entre ambientes e consultar uma variável específica sem abrir ou editar os arquivos no editor.

## Como a tela é organizada

A experiência usa um **inspector de arquivos**. No topo há um resumo operacional com três informações derivadas somente dos dados carregados:

- **Estado** — indica se o contrato está consistente, possui pendências, ainda está sendo verificado ou ficou parcialmente indisponível;
- **Arquivo atual** — mostra qual arquivo está selecionado e quantas variáveis e segredos ele possui;
- **Modo** — reforça que a tela é somente leitura.

Abaixo, os arquivos reconhecidos ficam em uma coluna lateral. Apenas **um arquivo é inspecionado por vez**, evitando repetir várias tabelas longas na mesma tela. Ao selecionar outro arquivo, o painel principal troca para aquele contexto.

A coluna lateral também resume a quantidade de pendências do Environment Contract por escopo, como **Padrão**, **Teste**, **Produção** ou **Docker**. Esse resumo não exibe valores e não repete a lista detalhada de variáveis.

## Inspector do arquivo selecionado

O painel principal mostra o nome do arquivo selecionado, sua classificação (`arquivo local`, `template` ou `baseline` quando reconhecido), a quantidade de variáveis, a quantidade de segredos e a situação do baseline aplicável.

Antes da lista de variáveis aparece **Consistência deste arquivo**. Nessa área entram somente diferenças estruturais relacionadas ao contexto selecionado, por exemplo:

- variável obrigatória ausente;
- variável local não documentada;
- declaração duplicada ou fonte conflitante;
- baseline ausente ou ambíguo;
- situação sem baseline confiável que exige revisão.

As pendências são derivadas do Environment Contract já existente. A interface não compara valores para decidir se existe conflito e não inventa estados quando o backend não possui evidência suficiente.

## Valores e segredos

Variáveis não sensíveis continuam exibindo seu valor normalmente. Quando uma variável é classificada como sensível, o inspector mostra o marcador **Segredo** e o botão **Exibir**.

O valor sensível só é solicitado quando o usuário clica explicitamente em **Exibir**. Depois disso, o botão muda para **Ocultar**. O valor revelado fica apenas no estado temporário da tela e é descartado ao ocultar, atualizar a listagem, trocar de projeto ou sair da aba.

A troca entre arquivos não transforma a aba em editor: nenhuma variável pode ser criada, removida ou alterada por essa tela.

## Arquivos reconhecidos

O dashboard usa um catálogo fechado; ele não faz glob irrestrito de `.env*`. São reconhecidos:

- `.env`, `.env.local`, `.env.development`, `.env.test` e `.env.production`;
- `.env.example` e `.env.sample`;
- `.env.production.example`;
- `.env.docker.example` e `.env.docker.sample`.

Backups, arquivos temporários e outros nomes parecidos não entram automaticamente no catálogo. Cada arquivo reconhecido é resolvido e confirmado como estando dentro da pasta do projeto antes de ser aberto.

## Como funciona por trás

- O conteúdo é interpretado com um parser simples de `chave=valor`, incluindo linhas com `export` e removendo aspas externas quando presentes.
- Para cada variável, o **nome** é comparado contra um padrão de palavras que costumam indicar segredo (`SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIAL`, `PRIVATE`, nomes terminados em `_KEY`, `APIKEY`, etc.). Se bater, o valor real não faz parte da listagem inicial.
- O overview dos arquivos e o Environment Contract continuam sendo carregados por fluxos independentes, ambos protegidos contra respostas stale ao trocar de projeto.
- Para o escopo padrão, `.env.example` ou `.env.sample` pode ser o baseline; para produção, `.env.production.example` é tratado separadamente. Se mais de um baseline equivalente existir, o estado fica ambíguo e o dashboard não escolhe silenciosamente.
- Sem baseline confiável, as variáveis ficam com estado `unknown`; isso evita transformar heurística em certeza.
- Se o contrato falhar, o inspector continua permitindo a leitura dos arquivos reconhecidos e sinaliza que a análise estrutural está parcialmente indisponível.

## Segurança do Environment Contract

O contrato retorna apenas nome, classificação sensível, arquivos de origem, baseline, status, `required` quando conhecido e ação sugerida. Nenhum valor — sensível ou não — faz parte desse DTO. O serviço também não compara igualdade de valores nem interpola secrets para tentar detectar conflitos.

A leitura explícita de um valor continua sendo uma capability separada, protegida pela autenticação local existente. O resumo de consistência e a lista lateral não chamam a rota de reveal e não reutilizam valores já revelados para inferir diferenças.

## Limites

- Não existe edição por aqui — é leitura pura, mesmo quando um segredo é exibido.
- Nenhum comando ou script do projeto é executado pelo Environment Contract.
- `optional` só pode ser afirmado quando houver evidência explícita; o MVP não infere opcionalidade a partir do valor ou do nome.
- A opção **Exibir** deve ser usada com cuidado em compartilhamento de tela ou gravações.
- Se um projeto não tiver nenhum arquivo reconhecido, a aba e o contrato não inventam configuração.

## Quando usar

Use a coluna de arquivos para navegar rapidamente entre contextos. Use **Consistência deste arquivo** para entender diferenças estruturais relacionadas ao arquivo selecionado e consulte a lista de variáveis somente quando precisar verificar uma configuração específica. Revele valores sensíveis apenas quando necessário.
