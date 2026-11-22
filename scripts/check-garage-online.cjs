const assert=require('node:assert/strict');const {Client}=require('colyseus.js');
const {createGameServer}=require('../build-server/server/index.js');const {createSupabaseServices}=require('../build-server/server/supabase.js');
const {createSupabaseFixture}=require('./supabase-fixture.cjs');const {NETWORK_VERSION,ROOM_NAME}=require('../build-server/src/game/network-types.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(test,label,timeout=8000){const start=Date.now();while(!test()){if(Date.now()-start>timeout)throw new Error(label);await pause(20);}}
async function run(){const fixture=await createSupabaseFixture();
 const services = createSupabaseServices(fixture.env);
 let releasePurchase;
 const gate = new Promise(resolve => { releasePurchase = resolve; });
 const {game,http}=createGameServer({...services, async purchase(order) {
   await gate;
   return services.purchase(order);
 }},{countdownSeconds:.1,roundSeconds:1.3,resultsSeconds:.1});let host,peer,s;
 try{
  await game.listen(0,'127.0.0.1');const client=new Client(`http://127.0.0.1:${http.address().port}`);const token=fixture.tokenFor('Ana');fixture.balances.set(fixture.users.get('Ana').id,500);
  host=await client.create(ROOM_NAME,{version:NETWORK_VERSION,accessToken:token,vehicleId:'jeep'});host.onMessage('snapshot',v=>{s=v;});host.onMessage('competition',()=>{});host.onError(()=>{});
  peer=await client.joinById(host.roomId,{version:NETWORK_VERSION,accessToken:fixture.tokenFor('Bruno'),vehicleId:'crawler'});peer.onMessage('snapshot',()=>{});peer.onMessage('competition',()=>{});peer.onError(()=>{});
  await until(()=>s?.players.length===2,'joined');host.send('purchase',{operationId:'forged',kind:'engine',price:0,userId:fixture.users.get('Bruno').id});await pause(100);assert(!fixture.stats.purchaseCalls);
  host.send('tournament',{type:'ready',ready:true});peer.send('tournament',{type:'ready',ready:true});await until(()=>s.tournament.members.every(m=>m.ready),'ready');
  fixture.stats.failPhaseWrites=1;fixture.stats.failRoundAfterCommit=1;host.send('tournament',{type:'start',round:0});await until(()=>s.tournament.phaseError,'phase failure');await pause(250);assert.equal(s.tournament.phase,'countdown','Unconfirmed phase freezes countdown');
  host.send('tournament',{type:'retry'});await until(()=>s.tournament.persistence==='error','lost round receipt');assert.equal(fixture.rounds.size,1);assert.equal(s.garage,undefined,'Garage awaits a confirmed atomic settlement');
  host.send('tournament',{type:'retry'});await until(()=>s.tournament.phase==='garage'&&!s.tournament.phasePending&&s.garage?.status==='ready','persisted garage');assert.equal(fixture.rounds.size,1);
  assert.equal(s.garage.balance,500);assert(s.players.every(p=>p.garage===undefined),'Garage is private');
  const engine=s.garage.offers.find(o=>o.kind==='engine');host.send('purchase',{operationId:engine.operationId,kind:'engine',price:0,userId:fixture.users.get('Bruno').id});host.send('purchase',{operationId:engine.operationId,kind:'engine'});
  await until(()=>s.garage.status==='buying','first purchase waiting for persistence');
  const competingOffer = s.garage.offers.find(o=>o.kind==='air');
  let busyError = '';
  host.onError((_code, message)=>{busyError = message;});
  host.send('purchase',{operationId:competingOffer.operationId,kind:'air'});
  await until(()=>busyError.includes('operação em curso'),'second purchase rejected while the first is pending');
  assert.equal(s.garage.balance,500);
  releasePurchase();
  await until(()=>s.garage.levels.engine===1,'engine purchased');assert.equal(s.garage.balance,460);assert.equal(fixture.purchases.size,1);assert.equal(s.players.find(p=>p.id===host.sessionId).physics.competitionFuel,undefined,'Garage keeps base physics');
  fixture.stats.failPurchaseAfterCommit=1;const tank=s.garage.offers.find(o=>o.kind==='tank');host.send('purchase',{operationId:tank.operationId,kind:'tank'});
  await until(()=>s.garage.status==='error'&&s.garage.pendingOperation,'lost receipt');assert.equal(s.garage.levels.tank,0,'No optimistic upgrade');assert.equal(s.garage.balance,460,'No optimistic debit');
  host.send('tournament',{type:'ready',ready:true});host.send('tournament',{type:'end'});host.send('vehicle',{vehicleId:'rally',location:'garage'});await pause(100);assert.equal(s.garage.vehicleId,'jeep');assert.equal(s.tournament.phase,'garage');assert(!s.tournament.members.find(m=>m.id===host.sessionId).ready);
  host.send('purchase',{operationId:tank.operationId,kind:'tank'});await until(()=>s.garage.levels.tank===1&&s.garage.status==='ready','same purchase retry');assert.equal(s.garage.balance,430);assert.equal(fixture.purchases.size,2);
  await pause(450);host.send('vehicle',{vehicleId:'rally',location:'garage'});await until(()=>s.garage.vehicleId==='rally'&&s.garage.status==='ready','switch vehicle');assert.equal(s.garage.levels.engine,0);assert.equal(s.garage.levels.tank,0);
  await pause(450);host.send('vehicle',{vehicleId:'jeep',location:'garage'});await until(()=>s.garage.vehicleId==='jeep'&&s.garage.status==='ready','return vehicle');assert.equal(s.garage.levels.engine,1);
  host.send('tournament',{type:'ready',ready:true});peer.send('tournament',{type:'ready',ready:true});await until(()=>s.tournament.members.every(m=>m.ready),'next ready');host.send('tournament',{type:'start',round:1});
  await until(()=>s.tournament.phase==='race','next race');const physics=s.players.find(p=>p.id===host.sessionId).physics;assert.deepEqual(physics.competitionUpgrades,{engine:1,tank:1,air:0});assert.equal(s.economy.capacity,15);
  host.send('purchase',{operationId:engine.operationId,kind:'engine'});await until(()=>s.tournament.phase==='garage'&&!s.tournament.phasePending&&s.garage?.status==='ready','second garage');assert.equal(fixture.purchases.size,2);assert.equal(s.garage.balance,430);
  host.send('tournament',{type:'end'});await until(()=>s.tournament.phase==='finished'&&!s.tournament.phasePending,'end persisted');host.send('tournament',{type:'new'});await until(()=>s.tournament.phase==='lobby','new competition');
  host.send('tournament',{type:'ready',ready:true});peer.send('tournament',{type:'ready',ready:true});await until(()=>s.tournament.members.every(m=>m.ready),'new ready');host.send('tournament',{type:'start',round:0});await until(()=>s.tournament.phase==='race','new match race');
  assert.deepEqual(s.players.find(p=>p.id===host.sessionId).physics.competitionUpgrades,{engine:0,tank:0,air:0});assert.equal(s.economy.balance,430,'Global account balance survives a new competition');
  console.log('Online garage passed: authenticated quotes, phase gating and retry, purchases/deduplication, lost committed receipt without optimistic state, blocked ready/vehicle/end while uncertain, per-vehicle levels, next-round loadout and new-match scope. Supabase HTTP is test-only.');
 }finally{await Promise.allSettled([host?.leave(),peer?.leave()]);await game.gracefullyShutdown(false);await fixture.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
