import { AssetType } from "@polymarket/clob-client-v2";
import { getApiCreds, getRuntimeConfig } from "../config.js";
import { createAuthenticatedClobClient } from "../polymarket/client.js";

const client = createAuthenticatedClobClient(getApiCreds());
const config = getRuntimeConfig();

const [closedOnlyMode, openOrders, collateral] = await Promise.all([
  client.getClosedOnlyMode(),
  client.getOpenOrders(),
  client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }),
]);

console.log(
  JSON.stringify(
    {
      host: config.host,
      chainId: config.chain,
      closedOnlyMode,
      openOrderCount: openOrders.length,
      collateral,
    },
    null,
    2,
  ),
);
