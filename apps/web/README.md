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

Por padrão, o Vite encaminha `/api` para `http://127.0.0.1:3333`. Consulte `.env.example` para alterar o destino local. Em produção, mantenha `VITE_API_URL=/api/v1`: o Nginx serve o SPA e encaminha `/api` para o container da API na mesma origem.

## Rotas do MVP

- `/` — página institucional
- `/login` e `/cadastro` — criação de conta e autenticação por sessão
- `/dashboard` — visão geral do negócio
- `/clientes` — consulta e cadastro de clientes
- `/atendimentos` — listagem de atendimentos
- `/atendimentos/novo` — criação de atendimento
- `/atendimentos/:id` — detalhes e gestão de serviços extras
- `/aprovar/:token` — aprovação pública do cliente

## Integração

As requisições usam `credentials: include`, portanto o frontend e a API precisam compartilhar a mesma origem pública no deploy recomendado. O reverse proxy em `nginx.conf` fornece essa topologia e também evita cache e logs de acesso nas rotas que contêm tokens de aprovação.

O build gera arquivos estáticos em `dist`. A imagem de produção os serve com o Nginx sem privilégios na porta 8080; HTTPS deve terminar em um proxy externo confiável.
