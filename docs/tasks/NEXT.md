# Próxima atividade

A task 066 concluiu o formulário seguro para Rake tasks com variáveis
declaradas no próprio projeto.

## Health checks locais declarativos

Próxima frente candidata para tornar o status do projeto mais útil sem aceitar
comandos livres nem acessar hosts externos.

### Escopo proposto

- detectar automaticamente o health check HTTP do servidor gerenciado;
- permitir somente `GET` para `127.0.0.1`/`localhost` e para a porta já
  resolvida nas configurações do projeto;
- oferecer uma allowlist pequena de caminhos comuns (`/`, `/up`, `/health`,
  `/healthz`) ou um caminho relativo validado e persistido por projeto;
- impor timeout curto, limite de resposta e nenhum redirecionamento externo;
- exibir latência, status HTTP e horário da última verificação no painel do
  servidor;
- nunca enviar headers, cookies, corpo, credenciais ou URL absoluta vindos do
  navegador.

### Decisões antes da implementação

- decidir se o caminho será somente detectado ou também configurável;
- definir quais códigos HTTP representam saudável, degradado e indisponível;
- decidir se a primeira versão será apenas sob demanda ou terá polling enquanto
  a aba Servidor estiver aberta.

Nenhum código desta frente foi escrito ainda.
