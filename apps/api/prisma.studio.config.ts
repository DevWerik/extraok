import "dotenv/config";

import { defineConfig } from "prisma/config";

const databaseUrl = new URL(
  process.env.DATABASE_URL ??
    "postgresql://extraok:extraok@127.0.0.1:5432/extraok?schema=public",
);

// `prisma dev` currently accepts a single active TCP connection. Prisma Studio
// introspects tables and settings concurrently, so keep its pool at one
// connection without changing the pool used by the API.
databaseUrl.searchParams.set("max", "1");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl.toString(),
  },
});
