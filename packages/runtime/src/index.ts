import { PORT } from "./config";
import { createFetchHandler } from "./server/fetch-handler";
import { RuntimeStore } from "./server/runtime-store";
import { createWebSocketHandler } from "./server/websocket";

const store = new RuntimeStore();

const server = Bun.serve({
  port: Number.isFinite(PORT) ? PORT : 7681,
  fetch: createFetchHandler(store),
  websocket: { ...createWebSocketHandler(store), idleTimeout: 120 },
});

store.attachPublisher((channel, payload) => {
  server.publish(channel, payload);
});

console.log(`Jam running on http://localhost:${server.port}`);
