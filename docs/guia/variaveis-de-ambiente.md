# Guia da aba Variáveis de ambiente

> Parte do [Guia passo a passo do dashboard web](README.md).

Aba **somente leitura** — existe para conferir rapidamente quais variáveis de ambiente um projeto espera, sem precisar abrir os arquivos `.env` no editor (e sem correr o risco de editar algo por engano).

## O que aparece na tela

A tela começa pelo bloco **Contrato · Consistência entre ambientes**. Ele usa somente metadata e prioriza pendências estruturais:

- variável obrigatória ausente;
- variável local não documentada;
- declaração duplicada ou fonte conflitante;
- baseline ausente ou ambíguo.

Entradas `present`/`optional` sem ação não ocupam espaço nesse resumo. Para cada pendência aparecem nome, status, arquivos de origem e a ação sugerida. Variáveis classificadas como sensíveis podem ser identificadas como **sensível**, mas o contrato não transporta nem renderiza o valor.

Abaixo do contrato permanece a tabela por arquivo de ambiente encontrado, com duas colunas: **Variável** e **Valor**. Quando o nome de uma variável indica que ela é sensível, o valor começa oculto com o badge **"Oculto (segredo)"** e um botão **Exibir**. Depois de exibir, o botão muda para **Ocultar**, removendo novamente o valor da tela.

Se a consulta do contrato falhar, a tela informa essa degradação no bloco de consistência e mantém a leitura tradicional dos arquivos disponível. Os dois fluxos não compartilham estado de valor.

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
- Ao clicar em **Exibir**, o navegador solicita somente o arquivo e a variável escolhidos. O valor fica apenas no estado temporário da tela e é descartado ao clicar em **Ocultar**, atualizar a listagem, trocar de projeto ou sair da aba.
- O Environment Contract é carregado por uma requisição independente com proteção contra resposta stale ao trocar de projeto.
- Para o escopo padrão, `.env.example` ou `.env.sample` pode ser o baseline; para produção, `.env.production.example` é tratado separadamente. Se mais de um baseline equivalente existir, o estado fica ambíguo e o dashboard não escolhe silenciosamente.
- Sem baseline confiável, as variáveis ficam com estado `unknown`; isso evita transformar heurística em certeza.

## Segurança do Environment Contract

O contrato retorna apenas nome, classificação sensível, arquivos de origem, baseline, status, `required` quando conhecido e ação sugerida. Nenhum valor — sensível ou não — faz parte desse DTO. O serviço também não compara igualdade de valores nem interpola secrets para tentar detectar conflitos.

A leitura explícita de um valor continua sendo uma capability separada, protegida pela autenticação local existente. O novo resumo não chama a rota de reveal e não reutiliza os valores revelados pela tabela.

## Limites

- Não existe edição por aqui — é leitura pura, mesmo quando um segredo é exibido.
- Nenhum comando ou script do projeto é executado pelo Environment Contract.
- `optional` só pode ser afirmado quando houver evidência explícita; o MVP não infere opcionalidade a partir do valor ou do nome.
- A opção **Exibir** deve ser usada com cuidado em compartilhamento de tela ou gravações.
- Se um projeto não tiver nenhum arquivo reconhecido, a aba e o contrato não inventam configuração.

## Quando usar

Use o resumo do Environment Contract para localizar rapidamente diferenças estruturais entre ambientes. Use a tabela por arquivo quando precisar consultar uma configuração específica e, somente quando necessário, revelar explicitamente um valor sensível.
