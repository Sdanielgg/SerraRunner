const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
async function run() {
  const db = new PGlite();
  try {
    // Real PostgreSQL/RLS engine, with a minimal test-only Supabase Auth schema.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      insert into auth.users values ('30000000-0000-4000-8000-000000000001','existing@test.invalid','{"display_name":"Existing"}');
    `);
    for (const file of fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    const existing = await db.query('select display_name from public.profiles');
    if (existing.rows[0]?.display_name !== 'Existing') throw new Error('Existing users must be backfilled');
    // Keep the backfill test isolated from the two-user policy assertions.
    await db.exec("delete from auth.users where id = '30000000-0000-4000-8000-000000000001'");
    await db.exec(fs.readFileSync('supabase/tests/security.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/tests/tournament-security.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/tests/economy-security.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/tests/garage-security.sql', 'utf8'));
    const {upgradeKinds,upgradeRules}=require('../build-server/src/game/upgrades.js');
    const catalog=await db.query('select * from public.upgrade_catalog');
    for(const kind of upgradeKinds){const row=catalog.rows.find(r=>r.kind===kind);if(row?.version!==upgradeRules.version||JSON.stringify(row.prices)!==JSON.stringify(upgradeRules[kind].prices)||Number(row.effect_step)!==upgradeRules[kind].step)throw new Error('SQL/TypeScript catalog mismatch');}
    console.log('Database checks passed on PGlite PostgreSQL: four migrations, catalog parity, protected/private reads and RLS, server-only garage purchases, price/level/balance/phase limits, idempotent debit and round settlement, atomic result/point/money/statistics rollback across participants, champion once and scope preservation. Real Supabase validation remains pending.');
  } finally { await db.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
