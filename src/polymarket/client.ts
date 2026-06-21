import {
  ClobClient,
  SignatureTypeV2,
  type ApiKeyCreds,
} from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getOptionalEnv,
  getPrivateKey,
  getRuntimeConfig,
  readNumber,
} from "../config.js";

export function createPublicClobClient(): ClobClient {
  const { host, chain } = getRuntimeConfig();
  return new ClobClient({ host, chain, throwOnError: true });
}

export function createL1ClobClient(): ClobClient {
  const { host, chain } = getRuntimeConfig();
  return new ClobClient({
    host,
    chain,
    signer: createSigner(),
    throwOnError: true,
  });
}

export function createAuthenticatedClobClient(creds: ApiKeyCreds): ClobClient {
  const { host, chain } = getRuntimeConfig();
  const signatureType = readSignatureType();
  const funderAddress = getOptionalEnv("POLYMARKET_FUNDER_ADDRESS");

  return new ClobClient({
    host,
    chain,
    signer: createSigner(),
    creds,
    signatureType,
    funderAddress,
    throwOnError: true,
    useServerTime: true,
  });
}

export function createSigner() {
  const account = privateKeyToAccount(getPrivateKey());
  return createWalletClient({ account, transport: http() });
}

function readSignatureType(): SignatureTypeV2 {
  const rawValue = readNumber("POLYMARKET_SIGNATURE_TYPE", SignatureTypeV2.POLY_1271);
  if (!Object.values(SignatureTypeV2).includes(rawValue)) {
    throw new Error(`Unsupported POLYMARKET_SIGNATURE_TYPE: ${rawValue}`);
  }
  return rawValue as SignatureTypeV2;
}
