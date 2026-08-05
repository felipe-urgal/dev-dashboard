# Guia da aba Testes

> Parte do [Guia passo a passo do dashboard web](README.md).

Executa a suíte de testes do projeto (ou só um arquivo, ou só os testes relacionados às alterações
atuais) direto pelo dashboard, com acompanhamento em tempo real e histórico de execuções.

## Fluxo guiado

A aba funciona em quatro passos:

1. **Tipo de execução**: o dashboard detecta automaticamente qual runner de testes o projeto usa
   e você escolhe o que rodar — a suíte completa, um arquivo específico, ou só os "testes
   relacionados" às mudanças da branch atual.
2. **Configuração**: ajustes específicos do que foi escolhido (por exemplo, qual arquivo).
3. **Confirmar e executar**: mostra o comando exato que será rodado antes de disparar.
4. **Resultado**: status, métricas (quantidade de exemplos, sucessos, falhas, duração total), um
   navegador de falhas e abas de log (Log completo / Erros / Avisos / Detalhes), com paginação e
   opções de copiar/exportar/limpar.

Botões Executar, Repetir e Interromper ficam disponíveis conforme o estado da execução.

## Como o dashboard detecta o comando de teste

Só reconhece um conjunto fechado de possibilidades — nunca aceita um comando digitado livremente:

- **Node**: procura scripts `test`, `test:unit` ou `test:ci` no `package.json` e identifica o
  runner (Vitest, Jest, ou o executor nativo `node --test`) pelo próprio script ou pelas
  dependências do projeto. Se não houver script configurado, tenta usar o binário do runner
  instalado localmente (`node_modules/.bin/vitest run` ou `.../jest --ci`).
- **Rails**: usa `bin/rspec`/`bundle exec rspec` quando RSpec é detectado; `bin/rails test`/
  `bundle exec rails test` para Minitest integrado ao Rails; ou `bundle exec rake test` para
  Minitest sem Rails.
- **Python**: só oferece `pytest` (sem argumentos extras) quando há um sinal explícito de que o
  projeto usa Pytest (arquivo `pytest.ini`, `conftest.py`, seção `[tool.pytest]` no
  `pyproject.toml`, ou `pytest` listado em algum `requirements*.txt`).

## Executar um arquivo específico

Além da suíte completa, é possível escolher um arquivo de teste da lista (filtrada pelas
convenções de nome do runner detectado) e rodar só ele — o comando final é o mesmo da suíte
completa com o caminho do arquivo anexado, sempre validado para garantir que está dentro do
projeto.

## "Testes relacionados"

Usa o próprio Git (sem shell, com limite de 1 MB de saída) para descobrir a branch base, listar os
arquivos alterados (`git diff --name-only`) e mapear esses arquivos para os testes que
provavelmente os cobrem, por convenção de nomes (até 100 arquivos de teste candidatos). Se nenhum
teste relacionado for encontrado, a execução é recusada em vez de rodar a suíte inteira por
engano.

## Execução e tempo real

- O processo do teste roda de forma independente (sem shell), com a variável `CI=true` sempre
  definida, e a saída vai para um arquivo de log dedicado a testes (separado do log do servidor).
- Só é possível ter uma execução de teste por vez, por projeto.
- O acompanhamento ao vivo usa **eventos de servidor (SSE)** — diferente da aba Logs, que faz
  releitura periódica — com reconexão automática caso a conexão caia.
- É possível **interromper** uma execução em andamento a qualquer momento.

## Histórico

Cada execução (suíte completa, arquivo específico ou relacionados) fica salva em um histórico
persistente por projeto, consultável e limpável pela própria aba, sobrevivendo a reinícios do
dashboard.
