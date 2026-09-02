import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiDirectory = fileURLToPath(new URL("../", import.meta.url));
const missingDotenvPath = join(
  apiDirectory,
  "tests",
  ".env-intentionally-missing",
);
const configFiles = ["prisma.config.ts", "prisma.studio.config.ts"];

function loadPrismaConfig(
  configFile: string,
  databaseUrl: string | undefined,
) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DOTENV_CONFIG_PATH: missingDotenvPath,
  };

  if (databaseUrl === undefined) {
    delete environment.DATABASE_URL;
  } else {
    environment.DATABASE_URL = databaseUrl;
  }

  const configUrl = pathToFileURL(join(apiDirectory, configFile)).href;

  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(configUrl)})`,
    ],
    {
      cwd: apiDirectory,
      encoding: "utf8",
      env: environment,
    },
  );
}

for (const configFile of configFiles) {
  test(`${configFile} exige DATABASE_URL`, () => {
    const result = loadPrismaConfig(configFile, undefined);

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}${result.stderr}`,
      /Cannot resolve environment variable: DATABASE_URL/,
    );
  });

  test(`${configFile} rejeita DATABASE_URL vazia`, () => {
    const result = loadPrismaConfig(configFile, "");

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}${result.stderr}`,
      /Cannot resolve environment variable: DATABASE_URL/,
    );
  });

  test(`${configFile} aceita DATABASE_URL valida sem conectar`, () => {
    const result = loadPrismaConfig(
      configFile,
      "postgresql://test:test@127.0.0.1:1/extraok?schema=public",
    );

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });
}
