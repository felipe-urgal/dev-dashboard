# Guia da aba Servidor

> Parte do [Guia passo a passo do dashboard web](README.md).

A aba **Servidor** concentra o lifecycle do servidor de desenvolvimento e o terminal de log associado ao processo gerenciado.

## O que aparece

Conforme o projeto/capability, a tela permite:

- ver estado atual do servidor;
- ver porta/PID/comando reconhecidos quando disponíveis;
- iniciar, parar e reiniciar;
- abrir a aplicação no navegador quando há endereço conhecido;
- configurar opções suportadas pelo projeto, como porta/health/ambiente;
- acompanhar o log do processo enquanto ele está ativo.

A antiga aba separada **Logs** foi removida. A rota antiga redireciona para esta superfície.

## Como o comando é resolvido

O browser não envia a linha de comando final.

Para Node, o backend usa scripts reconhecidos do `package.json` e o package manager detectado pelo projeto. Para Rails, usa os entrypoints Rails/Bundler reconhecidos. O `cwd` vem do `Project.path` conhecido pela API.

A execução usa programa/args estruturados e `shell: false` na fronteira gerenciada.

## Porta e readiness

A porta faz parte do estado operacional do processo. Quando o processo realmente abre uma porta diferente da inicialmente esperada, o Process Manager pode reconciliar a porta observada quando consegue comprovar ownership.

No Linux, um listener só é tratado como evidência positiva do servidor quando pertence ao PID gerenciado ou a um descendente da mesma árvore. Uma aplicação alheia usando a mesma porta não deve transformar o processo em `running` por engano.

Health HTTP, quando configurado/suportado, é um sinal adicional; não substitui a identidade do processo.

## Start

Antes de iniciar, o backend revalida projeto, comando e contexto. Um processo já ativo/transicionando impede start concorrente para a mesma chave.

O estado é persistido de forma que a API possa reconhecer posteriormente qual PID/processo ela possui.

## Stop e restart

Ao parar, o Dashboard não sinaliza um PID apenas porque o número coincide com um registro antigo. A identidade é revalidada antes do sinal.

O encerramento tenta `SIGTERM` no grupo/processo gerenciado e escala para `SIGKILL` somente depois da janela limitada de tolerância quando necessário.

`Reiniciar` preserva a mesma fronteira de ownership; não é um `kill` genérico de qualquer processo na porta.

## Logs integrados

Enquanto o servidor está ativo ou em transição, a aba mostra o terminal de log.

A leitura:

- usa arquivo/estado derivado do processo conhecido;
- é limitada;
- passa por masking de conteúdo sensível reconhecido;
- acompanha o final enquanto novas linhas chegam;
- pausa o auto-follow quando você rola para conteúdo anterior.

Veja [logs.md](logs.md) para a experiência de leitura.

## Ambiente

Quando a superfície oferece seleção/configuração de environment, a mudança é aplicada somente ao processo filho apropriado e não transforma valores secretos em conteúdo público da UI.

A configuração estrutural de environment do projeto também possui documentação própria em [variaveis-de-ambiente.md](variaveis-de-ambiente.md).

## Diagnóstico

Se o servidor não iniciar:

1. confira a mensagem retornada pela própria aba;
2. verifique se a porta está ocupada por outro owner;
3. confira o log integrado;
4. use Diagnóstico/Project Doctor quando o problema for de toolchain, porta ou ambiente;
5. não mate um processo externo sem confirmar sua identidade.
