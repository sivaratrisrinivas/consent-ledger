// Same gate flow against a real MySQL server. Runs when MYSQL_TEST=1 (downloads MySQL via mysql-memory-server)
// or when TEST_MYSQL_URL points at a server you already have. Skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openMysql, migrate, type Db } from "../src/db/db.js";

const enabled = process.env.MYSQL_TEST === "1" || !!process.env.TEST_MYSQL_URL;
let stop: (() => Promise<void>) | null = null;
let ctx: Awaited<ReturnType<typeof buildApp>>;

describe.skipIf(!enabled)("MySQL", () => {
  beforeAll(async () => {
    let url = process.env.TEST_MYSQL_URL;
    if (!url) {
      const { createDB } = await import("mysql-memory-server");
      const m = await createDB();
      url = `mysql://${m.username}@127.0.0.1:${m.port}/${m.dbName}`;
      stop = async () => { await m.stop(); };
    }
    const db: Db = await openMysql(url);
    await migrate(db);
    await migrate(db); // idempotent
    ctx = await buildApp({ db, apiKey: "k", mode: "cached" });
  }, 600_000);
  afterAll(async () => { await ctx?.app.close(); await ctx?.db.close(); await stop?.(); });

  it("holds, overrides and charges on MySQL; second charge is not duplicated", async () => {
    const H = { "x-api-key": "k" };
    expect((await ctx.app.inject({ method: "POST", url: "/registrations/reg_3/first-charge", headers: H })).statusCode).toBe(409);
    await ctx.app.inject({ method: "POST", url: "/registrations/reg_3/override", headers: H, payload: { supervisor_id: "sup.lee", reason: "Called back and read the exact fee." } });
    const [a, b] = await Promise.all([
      ctx.app.inject({ method: "POST", url: "/registrations/reg_3/first-charge", headers: H }),
      ctx.app.inject({ method: "POST", url: "/registrations/reg_3/first-charge", headers: H }),
    ]);
    expect([a.json().result, b.json().result].sort()).toEqual(["already_charged", "charged"]);
    const rows = await ctx.db.query("SELECT COUNT(*) AS n FROM charges WHERE registration_id = ?", ["reg_3"]);
    expect(Number(rows[0].n)).toBe(1);
  });
});
