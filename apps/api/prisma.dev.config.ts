import { defineConfig } from "prisma/config";

// `prisma dev` manages its own local database and does not consume an existing
// datasource. Keep this command independent from the fail-closed runtime config.
export default defineConfig({});
