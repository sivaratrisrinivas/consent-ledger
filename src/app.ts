import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import mercurius from "mercurius";
import { join } from "node:path";
import { ConsentLedger, HttpError } from "./service.js";
import { loadChecklist, loadPlans, ROOT } from "./checklist.js";
import { openDb, type Db } from "./db/db.js";
import { schema, resolvers } from "./graphql.js";
import type { DetectorMode } from "./detect/ledger.js";
import { liveProviderAvailable } from "./detect/model.js";

export interface AppOptions { db?: Db; mode?: DetectorMode; apiKey?: string; seed?: boolean; logger?: boolean }

export async function buildApp(opts: AppOptions = {}): Promise<{ app: FastifyInstance; svc: ConsentLedger; db: Db }> {
  const db = opts.db ?? (await openDb());
  const mode = opts.mode ?? ((process.env.DETECTOR as DetectorMode) || "cached");
  const svc = new ConsentLedger(db, loadChecklist(), loadPlans(), mode);
  await svc.init();
  if (opts.seed ?? true) await svc.resetDemo();
  const apiKey = opts.apiKey ?? process.env.API_KEY ?? "demo-key";
  const checkKey = (k: unknown) => { if (k !== apiKey) throw new HttpError(401, "missing or wrong x-api-key header"); };

  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1_000_000 });
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, ...(err.body ?? {}) });
    if (err.validation || err.statusCode === 400) return reply.code(400).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: "internal error" });
  });
  const writeGuard = async (req: any) => checkKey(req.headers["x-api-key"]);

  app.get("/health", async () => ({ ok: true, db: db.kind, detector: mode, live_model: liveProviderAvailable() !== null && mode === "live" }));
  app.get("/checklist", async () => ({ source: svc.checklist.source, contact: svc.checklist.contact, items: svc.checklist.items }));
  app.get("/plans", async () => ({ note: "Synthetic prices for the demo. Not GoGo's prices.", plans: svc.plans }));
  app.get("/calls", async () => ({ calls: await svc.listCalls() }));
  app.post("/calls", { preHandler: writeGuard }, async (req, reply) => reply.code(201).send(await svc.ingest(req.body)));
  app.get<{ Params: { id: string } }>("/calls/:id", async (req) => svc.getCall(req.params.id));
  app.get<{ Params: { id: string } }>("/calls/:id/evidence-pack", async (req, reply) =>
    reply.type("text/markdown; charset=utf-8").send(await svc.evidencePack(req.params.id)));
  app.post<{ Params: { id: string } }>("/registrations/:id/first-charge", { preHandler: writeGuard }, async (req, reply) => {
    const r = await svc.attemptFirstCharge(req.params.id);
    return reply.code(r.http).send(r.body);
  });
  app.post<{ Params: { id: string }; Body: { supervisor_id?: string; reason?: string } }>("/registrations/:id/override", { preHandler: writeGuard }, async (req, reply) =>
    reply.code(201).send(await svc.override(req.params.id, req.body?.supervisor_id, req.body?.reason)));
  app.get<{ Params: { id: string } }>("/registrations/:id", async (req) => svc.getRegistration(req.params.id));
  app.get<{ Params: { id: string } }>("/registrations/:id/audit", async (req) => ({ registration_id: req.params.id, entries: await svc.auditLog(req.params.id) }));
  app.post("/demo/reset", { preHandler: writeGuard }, async () => { await svc.resetDemo(); return { ok: true, calls: (await svc.listCalls()).length }; });

  await app.register(mercurius, { schema, resolvers: resolvers(svc, checkKey) as any, graphiql: false });
  await app.register(fastifyStatic, { root: join(ROOT, "public"), index: ["index.html"] });
  return { app, svc, db };
}
