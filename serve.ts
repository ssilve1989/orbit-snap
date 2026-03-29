import { Hono } from "hono";
import { serveStatic } from "hono/bun";

const app = new Hono();

app.get("/health", (c) => c.text("ok"));
app.use("*", serveStatic({ root: "./dist" }));
app.use("*", serveStatic({ path: "./dist/index.html" }));

export default { port: 3000, fetch: app.fetch, development: false };
