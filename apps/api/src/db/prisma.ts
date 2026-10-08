import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaClient(databaseUrl: string, maxConnections = 10): PrismaClient {
  // Driver adapters use pg pool options, not Prisma's connection_limit URL parameter.
  // Prisma Dev needs max=1; configure it through DATABASE_POOL_MAX in the API env.
  const adapter = new PrismaPg({ connectionString: databaseUrl, max: maxConnections });
  return new PrismaClient({ adapter });
}
