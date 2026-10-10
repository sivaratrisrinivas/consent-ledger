import { buildApp } from "./app.js";

const { app, db } = await buildApp({ logger: true });
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`consent-ledger on :${port} (db=${db.kind})`);
