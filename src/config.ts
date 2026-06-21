import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { Chain, type ApiKeyCreds } from "@polymarket/clob-client-v2";

const envFiles = [".env.local", ".env"];

for (const file of envFiles) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    dotenv.config({ path, override: false });
  }
}

export type RuntimeConfig = {
  host: string;
  chain: Chain;
};

export function getRuntimeConfig(): RuntimeConfig {
  const chainId = readNumber("POLYMARKET_CHAIN_ID", Chain.POLYGON);
  if (chainId !== Chain.POLYGON && chainId !== Chain.AMOY) {
    throw new Error(`Unsupported POLYMARKET_CHAIN_ID: ${chainId}`);
  }

  return {
    host: process.env.POLYMARKET_CLOB_HOST ?? "https://clob.polymarket.com",
    chain: chainId,
  };
}

export function getPrivateKey(): `0x${string}` {
  const value = requireEnv("PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hex string beginning with 0x.");
  }
  return value as `0x${string}`;
}

export function getApiCreds(): ApiKeyCreds {
  return {
    key: requireEnv("CLOB_API_KEY"),
    secret: requireEnv("CLOB_SECRET"),
    passphrase: requireEnv("CLOB_PASS_PHRASE"),
  };
}

export function getPolymarketUSCreds(): { keyId: string; secretKey: string } {
  return {
    keyId: requireEnv("POLYMARKET_US_KEY_ID"),
    secretKey: requireEnv("POLYMARKET_US_SECRET_KEY"),
  };
}

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function readNumber(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }
  return parsed;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
