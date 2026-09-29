# Agent Provider Doctor

A aba **Agente** usa o status dos providers como um doctor guiado. O objetivo é
mostrar uma causa verificável e uma próxima ação sem aceitar shell arbitrário
da interface.

## Diagnósticos locais

Codex e Claude Code diferenciam:

- comando ausente;
- versão abaixo do mínimo suportado;
- autenticação não confirmada;
- timeout de preflight;
- falha de runtime/preflight.

A evidência exposta é sanitizada e não inclui credenciais.

## ChatGPT Browser

O provider Browser diferencia explicitamente:

- token local do Browser Bridge ausente;
- bridge inacessível;
- bridge não saudável;
- bridge pausado;
- extensão sem heartbeat;
- heartbeat stale;
- versão da extensão ausente/inválida ou abaixo de `0.1.0`;
- sessão do ChatGPT indisponível.

Bridge, extensão, compatibilidade de versão e sessão são estados distintos para evitar instruções
genéricas que não resolvem a causa real.

## Revalidação

A própria tela permite **Revalidar providers**. A ação apenas refaz o preflight
estruturado e atualiza o status; não executa comandos fornecidos pelo browser e
não exige reiniciar o Dashboard.

## Guardrails

- nenhuma credencial entra em DTO/log;
- nenhuma instrução da UI vira shell livre;
- ações mutáveis continuam fora do doctor quando não há contrato estruturado e
  seguro;
- ausência de um provider não bloqueia os demais;
- Automatic só fica disponível quando consegue selecionar um provider concreto
  pronto.
