import { PolymarketUS } from "polymarket-us";
import { getPolymarketUSCreds } from "../config.js";

export function createPublicPolymarketUSClient(): PolymarketUS {
  return new PolymarketUS();
}

export function createAuthenticatedPolymarketUSClient(): PolymarketUS {
  return new PolymarketUS({
    ...getPolymarketUSCreds(),
    timeout: 30_000,
  });
}
