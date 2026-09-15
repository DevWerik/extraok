# ExtraOK Web

Frontend do ExtraOK para prestadores de serviço organizarem clientes, atendimentos e aprovações de serviços extras. As telas usam a API real e mantêm a sessão em cookie seguro; não há persistência mockada no navegador.

## Desenvolvimento

Execute os comandos a partir da raiz do monorepo:

```bash
pnpm --filter @extraok/web dev
pnpm --filter @extraok/web typecheck
pnpm --filter @extraok/web lint
pnpm --filter @extraok/web build
```

Por padrão, o Vite encaminha `/api` para `http://127.0.0.1:3333`. Consulte `.env.example` para alterar o destino local.

## Rotas do MVP

- `/` — página institucional
- `/login` e `/cadastro` — criação de conta e autenticação por sessão
- `/recuperar-senha` — recuperação com código por e-mail e cadastro de nova senha
- `/dashboard` — visão geral do negócio
- `/meu-plano` — consumo, três planos, compra e acompanhamento do Pix
- `/clientes` — consulta e cadastro de clientes
- `/atendimentos` — listagem de atendimentos
- `/atendimentos/novo` — criação de atendimento
- `/atendimentos/:id` — detalhes e gestão de serviços extras
- `/aprovar/:token` — aprovação pública do cliente

O catálogo também aparece em `/#planos`. Preços, limites e confirmação de pagamento vêm da API. Consulte [Planos e Pix](../api/BILLING.md) para ativar as cobranças; nenhuma credencial do Mercado Pago pertence ao frontend.

## Cloudflare Workers + Render

O Worker encaminha `/api/v1` do domínio do frontend ao Render, mantendo os cookies de sessão. `wrangler.jsonc` já configura `API_ORIGIN=https://extraok-api.onrender.com`, `worker/index.ts` e os arquivos de `dist`.

1. No Render, em **Environment**, configure `NODE_ENV=production` e `WEB_ORIGIN=https://SEU-DOMINIO-ATUAL-DO-FRONTEND`. Substitua pela origem HTTPS exata do site, sem caminho. Salve e aguarde o deploy. Alterar `apps/api/.env` localmente não altera o Render.
2. No Cloudflare, mantenha a variável de **build** `VITE_API_URL=/api/v1`. Não use a URL do Render nela: o proxy mantém o login. `API_ORIGIN` configura o destino durante a execução do Worker.
3. Para publicação pelo Git, envie as alterações ao repositório conectado. Configure **Root directory** `apps/web`, **Build command** `pnpm build` e **Deploy command** `pnpm exec wrangler deploy`. Reconstrua após alterar `VITE_API_URL`.

Alternativamente, com as dependências instaladas, publique pelo terminal. O frontend já usa `/api/v1` por padrão, portanto não é necessário definir uma variável no terminal quando não houver outra configuração local de `VITE_API_URL`.

**Git Bash (terminal com `MINGW64`):**

```bash
cd /c/Users/Pichau/extraok
pnpm.cmd --filter @extraok/web exec wrangler login
pnpm.cmd --filter @extraok/web run deploy
```

Se o terminal já mostra `~/extraok`, você já está na pasta correta. Execute uma linha por vez, sem copiar o símbolo `$` do prompt. O login abre o navegador para autorização; se já estiver autenticado, pode ir direto ao `run deploy`, que gera o build e publica no Cloudflare.

**PowerShell:**

```powershell
cd C:\Users\Pichau\extraok
pnpm.cmd --filter @extraok/web exec wrangler login
pnpm.cmd --filter @extraok/web run deploy
```

Use explicitamente **`run deploy`**: `pnpm deploy` é um comando próprio do pnpm que exige uma pasta de destino, enquanto `pnpm run deploy` executa o script do projeto. Veja a [documentação do pnpm run](https://pnpm.io/cli/run).

`$env:NOME = "valor"` é sintaxe de PowerShell. No Git Bash, caminhos usam barras `/`, como no exemplo acima. Evite exportar `/api/v1` diretamente pelo Git Bash: a conversão automática do MSYS pode transformá-lo em um caminho do Windows ao chamar `pnpm.cmd`. Se precisar sobrescrever o padrão, configure `VITE_API_URL=/api/v1` no arquivo local `apps/web/.env.production` ou nas variáveis de build do Cloudflare. Referência: [caminhos e variáveis no MSYS2](https://www.msys2.org/docs/filesystem-paths/).

Depois da publicação, abra no domínio do **frontend**:

- `/health`: deve retornar `{"status":"ok"}`.
- `/ready`: deve retornar `{"status":"ready"}`.
- `/api/v1/auth/session`: sem login, HTTP 401 com JSON é esperado; HTML indica que o proxy não entrou em funcionamento.

Teste cadastro, login, recarregamento mantendo a sessão e logout. Testes locais: `pnpm --filter @extraok/web test`.

A recuperação de senha usa o mesmo proxy e exige a ativação do envio na API. Configure o Resend apenas no backend, seguindo o [guia da API](../api/README.md#recuperação-de-senha-por-e-mail). O código e a nova senha ficam somente na memória da tela durante o fluxo; a autorização temporária usa cookie HttpOnly. Recarregar a página reinicia o formulário. Após a troca, todas as sessões anteriores são encerradas e o usuário volta ao login.

`run_worker_first` prioriza o Worker para `/api`, `/api/*`, `/health` e `/ready`. Veja [assets e bindings do Cloudflare](https://developers.cloudflare.com/workers/static-assets/binding/).

## Alternativa com Docker

O `nginx.conf` atende ao deploy com Docker: serve `dist` e encaminha `/api` ao container da API. O Cloudflare executa o Worker e não usa esse Nginx.
