# ExtraOK API

API HTTP do ExtraOK construída com Fastify, TypeScript, Prisma e PostgreSQL. A aplicação expõe autenticação por sessão, clientes, atendimentos, serviços extras, dashboard e aprovação pública por link.

## Configuração

Copie `.env.example` para `.env` neste diretório. As variáveis obrigatórias são:

- `NODE_ENV`: modo explícito de execução (`development`, `test` ou `production`).
- `DATABASE_URL`: conexão PostgreSQL.
- `WEB_ORIGIN`: origem exata permitida pelo CORS e pela proteção de requisições mutáveis.
- `PASSWORD_PEPPER`: segredo aleatório com pelo menos 32 caracteres.

As demais variáveis possuem valores de desenvolvimento documentados no exemplo. Em produção, use HTTPS em `WEB_ORIGIN`, mantenha o pepper em um cofre de segredos e preserve-o entre deploys; trocá-lo invalida a verificação das senhas existentes.

## Comandos

Execute preferencialmente a partir da raiz do monorepo:

```bash
pnpm --filter @extraok/api dev
pnpm --filter @extraok/api typecheck
pnpm --filter @extraok/api test
pnpm --filter @extraok/api build
pnpm --filter @extraok/api start
```

Banco de dados:

```bash
pnpm db:generate
pnpm db:migrate:dev
pnpm db:migrate:deploy
```

Use `db:migrate:dev` somente no desenvolvimento. Imagens e servidores publicados devem executar `db:migrate:deploy` com as migrações já versionadas.

## Saúde

- `GET /health`: processo ativo, retorna `{ "status": "ok" }`.
- `GET /ready`: processo pronto e PostgreSQL acessível.

As rotas de negócio ficam sob `/api/v1`. Rotas privadas exigem o cookie de sessão emitido no login; os endpoints públicos de aprovação carregam um token na URL e não devem ser enviados a logs ou ferramentas de analytics.
