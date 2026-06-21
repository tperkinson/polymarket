import { createAuthenticatedPolymarketUSClient } from "../polymarket/us-client.js";

const client = createAuthenticatedPolymarketUSClient();

const [balances, openOrders, positions] = await Promise.all([
  client.account.balances(),
  client.orders.list(),
  client.portfolio.positions({ limit: 25 }),
]);

console.log(
  JSON.stringify(
    {
      authenticatedApi: "https://api.polymarket.us",
      balanceCount: balances.balances.length,
      balances: balances.balances,
      openOrderCount: openOrders.orders.length,
      positionCount: Object.keys(positions.positions).length,
      positionsEof: positions.eof,
      nextCursor: positions.nextCursor,
    },
    null,
    2,
  ),
);
