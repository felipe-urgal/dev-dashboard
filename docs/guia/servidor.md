# Guia da aba Servidor

> Parte do [Guia passo a passo do dashboard web](README.md).

Liga e desliga o servidor de desenvolvimento do projeto (Rails ou Node), mostra o status dele em
tempo real e permite configurar porta, ambiente e verificação de saúde (health check).

## O que aparece na tela

- **Cartão de configuração**: porta, caminho de health check, seletor de arquivo de ambiente
  (`.env.<nome>`, só para projetos Node), o comando detectado automaticamente (mostrado só para
  leitura) e se o monitoramento está ativo.
- **Cartão de status**: um banner com o estado atual, o resultado do último health check (código
  HTTP, latência, horário da última verificação, com botão para checar de novo), métricas (comando
  em execução, horário de início, tempo ligado).
- Botões **Iniciar**, **Parar**, **Reiniciar** e **Abrir no navegador do sistema**.

## Como o dashboard descobre o comando para iniciar

- **Node**: procura no `package.json` um script chamado `dev`, depois `start`, depois `serve`
  (nessa ordem de prioridade) e identifica o gerenciador de pacotes pelo lockfile presente
  (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lock(b)` → bun, senão npm). O comando final
  roda esse script já passando a porta e o host escolhidos (por exemplo,
  `--host 127.0.0.1 --port 3000` para projetos baseados em Vite/Nuxt/Astro, ou
  `--hostname 127.0.0.1 --port 3000` para Next). Se nenhum desses scripts existir, a inicialização
  falha avisando que não encontrou um script de servidor.
- **Rails**: usa `bin/rails server --binding 127.0.0.1 --port <porta>` se existir o executável
  `bin/rails` no projeto; caso contrário, `bundle exec rails server --binding 127.0.0.1 --port <porta>`.
- A porta usada é, nessa ordem: a que você informou manualmente, a que já estava salva para o
  projeto, ou a primeira porta livre que o dashboard encontrar.

## Como o processo é gerenciado

- O comando é iniciado como um processo independente (`spawn`, sem shell), com a saída padrão e de
  erro gravadas diretamente em um arquivo de log — é esse mesmo arquivo que a aba Logs lê. O
  processo é "destacado" do dashboard, então continua rodando mesmo que a API seja reiniciada.
- Não é possível iniciar um servidor que já está rodando ou em transição de estado (o botão fica
  desabilitado nesses casos).
- Ao **parar**, o dashboard envia um sinal de encerramento educado (SIGTERM) para todo o grupo do
  processo e espera até 5 segundos por um encerramento limpo; se ainda estiver rodando depois
  disso, força o encerramento (SIGKILL) e aguarda mais 2 segundos. Antes de mandar qualquer sinal,
  o dashboard confere que o processo que está prestes a matar é realmente o mesmo que ele iniciou
  (evita, por azar, matar outro processo qualquer que tenha reaproveitado o mesmo PID depois que o
  servidor original já tinha morrido sozinho).

## Health check (verificação de saúde)

O dashboard só faz uma requisição HTTP para `127.0.0.1:<porta>` quando você configura um caminho
de health check existente no projeto. Com o campo vazio, a verificação fica desativada e nenhuma
rota é tentada automaticamente. A requisição tem limite de 2 segundos; o resultado é classificado
como **saudável** (resposta 2xx), **degradado** (redirecionamento 3xx) ou **indisponível** (erro,
timeout, ou nenhuma resposta). Enquanto o servidor estiver rodando e houver um caminho configurado,
essa verificação é repetida automaticamente a cada 15 segundos.

## Trocar de ambiente (Node)

Ao selecionar um `.env.<ambiente>` diferente antes de iniciar/reiniciar, o dashboard pede uma
confirmação explícita antes de aplicar — o diálogo deixa claro que **nenhum valor de variável é
mostrado** nesse processo, é só uma troca de qual arquivo será carregado.

## Limpeza automática

Antes de cada início de servidor, o dashboard varre e remove estados/logs órfãos de execuções
antigas: processos cujo registro tem mais de 7 dias, ou cujo PID salvo já não corresponde a
nenhum processo real em execução.
