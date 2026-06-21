import { getRuntimeConfig } from "../config.js";
import { createPublicClobClient } from "../polymarket/client.js";

const client = createPublicClobClient();
const config = getRuntimeConfig();

const [ok, version, serverTime, markets] = await Promise.all([
  client.getOk(),
  client.getVersion(),
  client.getServerTime(),
  client.getSimplifiedMarkets(),
]);

console.log(
  JSON.stringify(
    {
      host: config.host,
      chainId: config.chain,
      ok,
      version,
      serverTime,
      firstPageMarketCount: Array.isArray(markets?.data) ? markets.data.length : undefined,
      nextCursor: markets?.next_cursor,
    },
    null,
    2,
  ),
);
