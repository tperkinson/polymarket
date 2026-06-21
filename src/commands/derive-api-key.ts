import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createL1ClobClient } from "../polymarket/client.js";

const writeEnvArg = getArgValue("--write-env");
const showSecrets = process.argv.includes("--show-secrets");

const client = createL1ClobClient();
const creds = await client.createOrDeriveApiKey();

const envBlock = [
  `CLOB_API_KEY=${creds.key}`,
  `CLOB_SECRET=${creds.secret}`,
  `CLOB_PASS_PHRASE=${creds.passphrase}`,
].join("\n");

if (writeEnvArg) {
  const outputPath = resolve(process.cwd(), writeEnvArg);
  upsertEnvFile(outputPath, {
    CLOB_API_KEY: creds.key,
    CLOB_SECRET: creds.secret,
    CLOB_PASS_PHRASE: creds.passphrase,
  });
  console.log(`Wrote CLOB credentials to ${outputPath}`);
} else if (showSecrets) {
  console.log(envBlock);
} else {
  console.log(
    JSON.stringify(
      {
        key: creds.key,
        secret: redact(creds.secret),
        passphrase: redact(creds.passphrase),
        note: "Run with --write-env .env.local to save credentials locally, or --show-secrets to print them.",
      },
      null,
      2,
    ),
  );
}

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function upsertEnvFile(path: string, values: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();

  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line;

    const key = match[1];
    if (!(key in values)) return line;

    seen.add(key);
    return `${key}=${values[key]}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  const body = updatedLines.filter((line, index) => line || index < updatedLines.length - 1).join("\n");
  writeFileSync(path, `${body}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function redact(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
