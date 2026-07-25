# Task 006 — Distribuição local do dashboard web

## Status

Concluída em 25/07/2026.

## Objetivo e escopo

Entregar um comando único que diagnostica, compila e executa o frontend pela API, sem Vite, com sessão segura para o navegador. A aplicação continua **estritamente limitada a `127.0.0.1`**; acesso remoto, serviço de sistema, TLS e empacotamento desktop permanecem fora do escopo.

## Decisões de segurança

- o host é uma constante, não uma variável configurável;
- o diretório do build vem somente do ambiente do processo, é canonicalizado e validado antes do listen; nenhum caminho vem do navegador;
- `/api` nunca recebe fallback da SPA;
- o token persistente continua disponível apenas no header de clientes locais e no proxy Vite;
- o navegador obtém cookie assinado `HttpOnly`, `SameSite=Strict`, de vida curta, por bootstrap `POST` com JSON e origem exata;
- o bootstrap não é público: exige uma capacidade efêmera de 32 bytes gerada pelo `dev-web` e entregue no fragmento da URL, ou o token local para clientes autorizados;
- a origem efetiva da distribuição é incluída na allowlist, inclusive quando a porta é personalizada, e a rota declara schemas explícitos para `204`, `401` e `403`;
- cookie em método mutável exige novamente a origem exata, e origens externas são recusadas mesmo com credencial válida;
- o build é examinado pelo valor real do token disponível e por padrões de credencial, não apenas pelo nome do header.

## Critérios de aceite

- [x] `npm run dev` permanece com API e Vite separados.
- [x] `npm run dev-web` diagnostica, compila e inicia uma única origem local.
- [x] HTML, assets, cache, fallback e namespace `/api` possuem testes por `inject()`.
- [x] bootstrap, header, cookie, origem, CSRF, expiração e renovação possuem testes.
- [x] configuração de porta e diretório e orquestração possuem testes unitários.
- [x] nenhum token é incorporado ao frontend.
- [x] typecheck, build e testes passam.

## Roteiro de QA

1. Executar `npm run dev-web` a partir de fora da raiz.
2. Abrir a URL temporária impressa pelo comando e confirmar que o fragmento some da barra de endereço após o primeiro bootstrap.
3. Navegar para uma sub-rota Vue e recarregar diretamente a URL.
4. Confirmar no DevTools que a sessão é `HttpOnly` e que assets possuem cache imutável, enquanto `index.html` usa `no-cache`.
5. Usar `Ctrl+C` e confirmar o encerramento da API; repetir com `SIGTERM`.
6. Renomear temporariamente `index.html` ou um asset referenciado e confirmar falha de inicialização em português.

## Resultado, arquivos e limitações

Foram alterados a configuração/inicialização da API, segurança local, cliente HTTP web, diagnóstico e documentação; foram criados o plugin estático, configuração testável, orquestrador e testes correspondentes. Após a revisão, o bootstrap deixou de ser público, passou a exigir capacidade efêmera não forjável por `Origin`, ganhou schemas de resposta explícitos e a origem distribuída efetiva passou a integrar a allowlist. A sessão e a capacidade vivem somente no navegador e expiram com o prazo ou a aba; reiniciar a API não revoga cookies já assinados enquanto o token persistente e o prazo forem válidos. O modelo continua mono usuário e não protege contra outro processo executado pelo mesmo usuário que consiga ler o token ou observar a URL temporária no terminal.

## PR

Título: `feat: distribuir dashboard web localmente com sessão segura`

Referência: criada após o commit desta entrega.
