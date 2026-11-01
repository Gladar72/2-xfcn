// Isolated PostgreSQL regression check. Install @electric-sql/pglite in a scratch
// directory and pass its absolute path as PGLITE_MODULE; never uses a live DB.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { PGlite } = createRequire(import.meta.url)(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table users (
    id uuid primary key, name text, city text, avatar_url text default '/avatar.jpg',
    is_profile_hidden boolean default false, moderation_status text default 'active',
    approx_lat numeric(8,3), approx_lon numeric(8,3),
    approx_location_at timestamptz default now(), show_distance boolean default true
  );
  create table blocks (blocker_id uuid, blocked_id uuid);
`);
const migration = await readFile(new URL("../../supabase/migrations/0076_nearby_people.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(migration); // Deployment can safely apply it again.
const add = (n, city, lat, lon) => db.query("insert into users(id,name,city,approx_lat,approx_lon) values($1,$2,$3,$4,$5)", [id(n), `Person ${n}`, city, lat, lon]);
const nearby = async (start = null) => (await db.query("select id from nearby_people($1,$2)", [id(0), start])).rows.map((r) => r.id);
await add(0, "Тюмень", 55.750, 37.615); // Viewer is visiting Moscow.
await add(1, "Москва", 55.755, 37.615);
await add(2, "Тюмень", 55.760, 37.615); // Another visitor must be visible too.
await add(3, "Тюмень", 57.150, 65.530); // Same home city, but physically far away.
assert.deepEqual(await nearby(), [id(1), id(2)]);
await db.query("update users set approx_lat=57.150, approx_lon=65.530 where id=$1", [id(0)]);
assert.deepEqual(await nearby(), [id(3)]);
await db.query("update users set approx_lat=55.750, approx_lon=37.615 where id=$1", [id(0)]);
for (const override of ["show_distance=false", "is_profile_hidden=true", "moderation_status='banned'", "avatar_url=' '", "approx_location_at=now()-interval '25 hours'"]) {
  await db.exec("begin");
  await db.exec(`update users set ${override} where id='${id(1)}'`);
  assert.deepEqual(await nearby(id(1)), [id(2)]);
  await db.exec("rollback");
}
for (const pair of [[id(0),id(1)], [id(1),id(0)]]) {
  await db.query("insert into blocks values($1,$2)", pair);
  assert.deepEqual(await nearby(id(1)), [id(2)]);
  await db.exec("truncate blocks");
}
// Ranking happens in SQL before a limit: the nearest record is inserted last.
await db.exec(`insert into users(id,name,city,approx_lat,approx_lon)
  select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, 'Crowd', 'Москва', 55.800, 37.615
  from generate_series(10,1010) n;`);
await add(2000, "Другой город", 55.750, 37.615);
assert.equal((await nearby())[0], id(2000));
assert.equal((await nearby()).length, 60);
assert.ok((await nearby(id(1010))).includes(id(1010)));
// Crossing the date line and high latitudes must not break longitude filtering.
await db.query("update users set approx_lat=70, approx_lon=179.99 where id=$1", [id(0)]);
await add(2001, "Город", 70, -179.99);
assert.deepEqual(await nearby(), [id(2001)]);
await db.query("update users set approx_location_at=now()-interval '25 hours' where id=$1", [id(0)]);
assert.deepEqual(await nearby(), []);
assert.equal((await db.query("select has_function_privilege('anon','nearby_people(uuid,uuid)','execute') as allowed")).rows[0].allowed, false);
assert.equal((await db.query("select has_function_privilege('authenticated','nearby_people(uuid,uuid)','execute') as allowed")).rows[0].allowed, false);
await db.close();
console.log("Nearby PostgreSQL checks passed: travel, distance order, 1000+ users, privacy, selected profile, stale points, date line, RPC access.");
