// Isolated PostgreSQL check; never connects to production.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { PGlite } = createRequire(import.meta.url)(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`create role anon; create role authenticated; create role service_role;
create type gender as enum ('male','female');
create table users (id uuid primary key, city text, gender gender, avatar_url text default '/photo.jpg',
  is_profile_hidden boolean default false, moderation_status text default 'active',
  approx_lat numeric(8,3), approx_lon numeric(8,3), approx_location_at timestamptz default now(), show_distance boolean default true);
create table blocks (blocker_id uuid, blocked_id uuid);`);
const sql = await readFile(new URL('../../supabase/migrations/0077_people_discovery.sql', import.meta.url), 'utf8');
await db.exec(sql); await db.exec(sql);
const add = (n, city, gender, lat, lon) => db.query('insert into users(id,city,gender,approx_lat,approx_lon) values($1,$2,$3,$4,$5)', [id(n),city,gender,lat,lon]);
const discover = async (city='Тюмень', gender=null, start=null, offset=0, limit=41) => (await db.query('select id from discover_people($1,$2,$3,$4,$5,$6)', [id(0),city,gender,start,offset,limit])).rows.map(r=>r.id);
await add(0,'Тюмень','male',57.15,65.53);
await add(1,'Москва','female',57.15,65.53); // Closer but wrong selected city.
await add(2,'Тюмень','female',57.16,65.53);
await add(3,'Тюмень','male',58.15,65.53); // Beyond 15 km remains eligible.
await add(4,'Тюмень','female',null,null);
assert.deepEqual(await discover(),[id(2),id(3),id(4)]);
assert.deepEqual(await discover('Москва'),[id(1)]);
assert.deepEqual(await discover('Тюмень','female'),[id(2),id(4)]);
assert.deepEqual(await discover('Тюмень','male'),[id(3)]);
assert.deepEqual(await discover('Тюмень','female',id(3)),[id(2),id(4)]);
assert.deepEqual(await discover('Тюмень',null,id(1)),[id(2),id(3),id(4)]);
for(const override of ["is_profile_hidden=true","moderation_status='banned'","avatar_url=' '","avatar_url=null"]){
  await db.exec('begin'); await db.exec(`update users set ${override} where id='${id(2)}'`);
  assert.ok(!(await discover('Тюмень',null,id(2))).includes(id(2))); await db.exec('rollback');
}
for(const pair of [[id(0),id(2)],[id(2),id(0)]]){
  await db.query('insert into blocks values($1,$2)',pair);
  assert.ok(!(await discover('Тюмень',null,id(2))).includes(id(2))); await db.exec('truncate blocks');
}
// A stale/hidden position hides distance, not an otherwise public profile.
for(const override of ["show_distance=false","approx_location_at=now()-interval '25 hours'"]){
  await db.exec('begin'); await db.exec(`update users set ${override} where id='${id(2)}'`);
  assert.deepEqual(await discover(),[id(3),id(2),id(4)]); await db.exec('rollback');
}
// Movement affects order only, never the selected city.
await db.exec(`update users set approx_lat=58.15 where id='${id(0)}'`);
assert.deepEqual(await discover(),[id(3),id(2),id(4)]);
await db.exec(`update users set approx_location_at=now()-interval '25 hours' where id='${id(0)}'`);
assert.deepEqual(await discover(),[id(2),id(3),id(4)]);
await db.exec(`insert into users(id,city,gender)
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Тюмень','female' from generate_series(10,3010)n`);
const first = await discover('Тюмень','female',id(3000),0,40);
const second = await discover('Тюмень','female',id(3000),40,40);
assert.equal(first[0],id(3000)); assert.equal(new Set([...first,...second]).size,80);
assert.equal((await discover('Москва')).length,1);
assert.equal((await discover('Нет такого города')).length,0);
for(const role of ['anon','authenticated']) assert.equal((await db.query(`select has_function_privilege('${role}','discover_people(uuid,text,text,uuid,integer,integer)','execute') as ok`)).rows[0].ok,false);
await db.close(); console.log('City discovery PostgreSQL checks passed: city, gender, 3000+ profiles, pagination, selected identity, privacy, distance order, missing/stale location.');
