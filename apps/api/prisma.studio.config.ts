import "dotenv/config";

import { defineConfig, env } from "prisma/config";

const databaseUrl = new URL(env("DATABASE_URL"));

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
