# Logs no Dashboard

> Parte do [Guia passo a passo do dashboard web](README.md).

**Logs não é mais uma aba própria.** Cada saída aparece no contexto da operação correspondente, como Servidor, Rails, Testes, Scripts, Produção e Banco de dados.

A rota antiga `/projects/:projectId/logs` permanece apenas como redirecionamento para Servidor.

## O que aparece

Enquanto o processo está `starting`, `running` ou `stopping`, a aba Servidor mostra o terminal de log associado ao processo gerenciado.

A experiência prioriza:

- saída real do processo;
- acompanhamento automático do final quando novas linhas chegam;
- pausa do auto-follow quando você rola para conteúdo anterior;
- ação para voltar ao final;
- leitura limitada e mascarada pelo backend.

Logs não interativos usam o mesmo viewer do Dashboard. Ele mantém o texto selecionável para copiar com `Ctrl+C`/`Cmd+C` ou pelo menu nativo do botão direito e oferece **Copiar tudo** quando for necessário levar a saída completa. O cabeçalho também padroniza estado ao vivo, quantidade de linhas e avisos de truncamento ou conteúdo mascarado.

Terminal e Console permanecem superfícies próprias porque aceitam entrada interativa. Diff, README e resultados tabulares também não são tratados como log.

Não existe enhancer global do DOM reconstruindo o conteúdo depois da renderização Vue.

## Segurança

O navegador não escolhe um path de log. A API deriva o arquivo permitido a partir do projeto/processo conhecido, limita a janela lida e aplica masking antes de retornar conteúdo sensível reconhecido.

Não trate masking como permissão para imprimir secrets conscientemente. Logs de aplicações gerenciadas ainda podem conter dados sensíveis e devem ser produzidos com cuidado pelo próprio projeto.

## Lifecycle

O log pertence à execução do processo gerenciado. Ao iniciar/parar/reiniciar o servidor, o estado do terminal acompanha o lifecycle real do Process Manager.

A existência de texto antigo no arquivo não prova que o processo atual está vivo; status, PID/ownership e porta continuam vindo do estado gerenciado.

## Onde operar

Abra:

```text
Projeto → Servidor
```

Para lifecycle, porta, health e detalhes de start/stop/restart, veja [servidor.md](servidor.md).
