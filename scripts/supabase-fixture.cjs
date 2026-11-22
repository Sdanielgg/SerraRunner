// Test-only HTTP fixture. This is NOT a Supabase deployment or JWT verifier.
// Production always calls the configured Supabase Auth endpoint.
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');

async function createSupabaseFixture() {
  const users = new Map(); const tokens = new Map(); const profiles = new Map();
  const results = new Map(); const revoked = new Set();
  const rounds = new Map();
  const balances = new Map(); const credits = new Set();
  const competitions = new Map(); const upgrades = new Map(); const purchases = new Map();
  const levelsFor=(mid,uid,vehicle)=>upgrades.get(`${mid}:${uid}:${vehicle}`)??{engine:0,tank:0,air:0};
  const garageFor=(mid,uid,vehicle)=>({balance:balances.get(uid)??0,levels:{...levelsFor(mid,uid,vehicle)}});
  const stats = { auth: 0, writes: 0, failWrites: 0 };
  function tokenFor(name, seconds = 3600) {
    if (!users.has(name)) {
      const id = randomUUID(); users.set(name, { id, email: `${name.toLowerCase()}@test.invalid`, aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString() });
      profiles.set(id, { id, display_name: name, vehicle_color: '#123abc' });
      balances.set(id, 0);
    }
    const user = users.get(name);
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + seconds, nonce: randomUUID() })).toString('base64url')}.test-only`;
    tokens.set(token, user); return token;
  }
  const http = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    const user = tokens.get(token);
    const send = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' }); response.end(JSON.stringify(value)); };
    if (url.pathname === '/auth/v1/user') {
      stats.auth++;
      if (!user || revoked.has(token)) return send(401, { code: 'bad_jwt', message: 'Invalid JWT' });
      return send(200, user);
    }
    if (url.pathname === '/auth/v1/token') {
      let body = ''; for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      if (url.searchParams.get('grant_type') === 'password' && data.password !== 'correct-password') return send(400, { code: 'invalid_credentials', message: 'Invalid login credentials' });
      if (url.searchParams.get('grant_type') === 'refresh_token' && data.refresh_token !== 'test-refresh-token') return send(400, { code: 'refresh_token_not_found', message: 'Expired refresh token' });
      const access_token = tokenFor('Ana');
      return send(200, { access_token, refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user: tokens.get(access_token) });
    }
    if (url.pathname === '/auth/v1/logout') return stats.logoutOffline ? send(503, { message: 'Test network unavailable' }) : send(200, {});
    if (url.pathname === '/auth/v1/signup') {
      tokenFor('Novo');
      return send(200, { ...users.get('Novo'), identities: [{ id: randomUUID() }] });
    }
    if (url.pathname === '/auth/v1/resend') return send(200, {});
    if (url.pathname === '/auth/v1/verify') {
      let body = ''; for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      if (data.token !== '123456') return send(403, { code: 'otp_expired', message: 'Expired OTP' });
      const access_token = tokenFor('Novo');
      return send(200, { access_token, refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user: tokens.get(access_token) });
    }
    if (url.pathname === '/rest/v1/profiles' && request.method === 'GET') {
      if (!user || url.searchParams.get('id') !== `eq.${user.id}`) return send(403, { message: 'RLS denied' });
      return send(200, profiles.get(user.id));
    }
    if (url.pathname === '/rest/v1/player_state' && request.method === 'GET') {
      if (token !== 'server-test-secret') return send(403,{message:'Server only'});
      const id=url.searchParams.get('user_id')?.replace(/^eq\./,''); return send(200,{balance:balances.get(id)??0});
    }
    if (url.pathname === '/rest/v1/upgrade_catalog') {
      const {upgradeKinds,upgradeRules}=require('../build-server/src/game/upgrades.js');
      return send(200,upgradeKinds.map(kind=>({kind,version:upgradeRules.version,prices:upgradeRules[kind].prices,effect_step:upgradeRules[kind].step})));
    }
    if (url.pathname === '/rest/v1/rpc/sync_race_competition') {
      if(token!=='server-test-secret')return send(403,{message:'Server only'});
      let body='';for await(const c of request)body+=c;const {payload}=JSON.parse(body);
      if(stats.failPhaseWrites-- > 0)return send(503,{message:'Phase unavailable'});
      competitions.set(payload.match_id,payload);
      return send(200,payload.phase==='countdown'?Object.fromEntries(payload.members.map(m=>[m.user_id,garageFor(payload.match_id,m.user_id,m.vehicle_id)])):{});
    }
    if (url.pathname === '/rest/v1/rpc/garage_state') {
      if(token!=='server-test-secret')return send(403,{message:'Server only'});
      let body='';for await(const c of request)body+=c;const p=JSON.parse(body);
      return send(200,garageFor(p.match_id,p.target_user,p.chosen_vehicle));
    }
    if (url.pathname === '/rest/v1/rpc/purchase_vehicle_upgrade') {
      if(token!=='server-test-secret')return send(403,{message:'Server only'});
      let body='';for await(const c of request)body+=c;const p=JSON.parse(body);stats.purchaseCalls=(stats.purchaseCalls??0)+1;
      if(purchases.has(p.operation_id))return send(200,garageFor(p.match_id,p.target_user,p.chosen_vehicle));
      const {upgradeRules}=require('../build-server/src/game/upgrades.js');const levels={...levelsFor(p.match_id,p.target_user,p.chosen_vehicle)};
      const price=upgradeRules[p.upgrade_type]?.prices[levels[p.upgrade_type]],balance=balances.get(p.target_user)??0;
      if(competitions.get(p.match_id)?.phase!=='garage'||price===undefined||p.expected_level!==levels[p.upgrade_type]||balance<price)return send(400,{code:'P0001',message:'Invalid purchase'});
      if(stats.failPurchases-- > 0)return send(503,{message:'Purchase unavailable'});
      levels[p.upgrade_type]++;upgrades.set(`${p.match_id}:${p.target_user}:${p.chosen_vehicle}`,levels);balances.set(p.target_user,balance-price);purchases.set(p.operation_id,p);
      if(stats.failPurchaseAfterCommit-- > 0)return send(503,{message:'Receipt lost after commit'});
      return send(200,garageFor(p.match_id,p.target_user,p.chosen_vehicle));
    }
    if (url.pathname === '/rest/v1/rpc/credit_race_rewards' && request.method === 'POST') {
      if (token !== 'server-test-secret') return send(403,{message:'Server only'});
      if (stats.failRewardWrites-- > 0) return send(503,{message:'Reward persistence unavailable'});
      let body='';for await(const chunk of request)body+=chunk;const payload=JSON.parse(body);
      let balance=balances.get(payload.target_user)??0;
      for(const credit of payload.credits){const key=`${payload.target_user}:${credit.round_id}:${credit.event_key}`;if(!credits.has(key)){credits.add(key);balance+=credit.amount;}}
      balances.set(payload.target_user,balance);return send(200,balance);
    }
    if (url.pathname === '/rest/v1/competition_results' && request.method === 'POST') {
      if (token !== 'server-test-secret') return send(403, { message: 'Only server may write' });
      stats.writes++;
      if (stats.failWrites-- > 0) return send(503, { message: 'Temporary persistence failure' });
      let body = ''; for await (const chunk of request) body += chunk;
      const result = JSON.parse(body); if (!results.has(result.id)) results.set(result.id, result);
      response.writeHead(201); return response.end();
    }
    if (['/rest/v1/rpc/record_race_round','/rest/v1/rpc/settle_competition_round'].includes(url.pathname) && request.method === 'POST') {
      if (token !== 'server-test-secret') return send(403, { message: 'Only server may write rounds' });
      stats.roundWrites = (stats.roundWrites ?? 0) + 1;
      if (stats.failRoundWrites-- > 0) return send(503, { message: 'Temporary round persistence failure' });
      let body = ''; for await (const chunk of request) body += chunk;
      const { payload } = JSON.parse(body);
      if(stats.failRewardWrites-- > 0)return send(503,{message:'Atomic reward settlement unavailable'});
      if (!rounds.has(payload.id)) {
        rounds.set(payload.id, payload);
        for(const entry of payload.entries)for(const credit of entry.rewards??[]){const key=`${entry.user_id}:${credit.round_id}:${credit.event_key}`;if(!credits.has(key)){credits.add(key);balances.set(entry.user_id,(balances.get(entry.user_id)??0)+credit.amount);}}
      }
      if(stats.failRoundAfterCommit-- > 0)return send(503,{message:'Round receipt lost after commit'});
      return send(200,Object.fromEntries(payload.entries.map(e=>[e.user_id,balances.get(e.user_id)??0])));
    }
    send(404, { message: 'Fixture endpoint not implemented' });
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${http.address().port}`;
  return { url, env: { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: 'public-test-key', SUPABASE_SECRET_KEY: 'server-test-secret' }, tokenFor, users, profiles, revoked, results, rounds, balances, credits, competitions, upgrades, purchases, stats, close: () => new Promise(resolve => http.close(resolve)) };
}
module.exports = { createSupabaseFixture };
