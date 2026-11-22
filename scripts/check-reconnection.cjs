const assert=require('node:assert/strict');const {Client}=require('colyseus.js');const {matchMaker}=require('@colyseus/core');const {Vec3}=require('cannon-es');
const {createGameServer}=require('../build-server/server/index.js');const {createSupabaseServices}=require('../build-server/server/supabase.js');const {createSupabaseFixture}=require('./supabase-fixture.cjs');
const {createMultiplayerClient}=require('../build-server/src/game/multiplayer-client.js');const {NETWORK_VERSION,ROOM_NAME}=require('../build-server/src/game/network-types.js');
const {emptyControls}=require('../build-server/src/game/physics.js');const {raceSamples}=require('../build-server/src/game/race-track.js');const {reconnectionRules}=require('../build-server/src/game/reconnection-config.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(test,label,timeout=8000){const start=Date.now();while(!test()){if(Date.now()-start>timeout)throw new Error(label);await pause(20);}}
async function run(){
 assert.equal(reconnectionRules.windowSeconds,30);
 const fixture=await createSupabaseFixture();const {game,http}=createGameServer(createSupabaseServices(fixture.env),{countdownSeconds:.05,roundSeconds:.3,resultsSeconds:.05},{windowSeconds:4});
 let host,peer,controller,bystander,other,timer;let state,peerState,appState,appSnapshot;const phases=[];let denyToken=false;
 function attach(r,set){r.onMessage('snapshot',set);r.onMessage('competition',()=>{});r.onError(()=>{});}
 try{
  await game.listen(0,'127.0.0.1');const address=`http://127.0.0.1:${http.address().port}`;const client=new Client(address);
  const accessToken=fixture.tokenFor('Ana');const userId=fixture.users.get('Ana').id;fixture.balances.set(userId,500);
  host=await client.create(ROOM_NAME,{version:NETWORK_VERSION,accessToken,vehicleId:'jeep'});attach(host,s=>{state=s;});
  peer=await client.joinById(host.roomId,{version:NETWORK_VERSION,accessToken:fixture.tokenFor('Bruno'),vehicleId:'crawler'});attach(peer,s=>{peerState=s;});
  await until(()=>state?.players.length===2,'joined');
  host.send('tournament',{type:'ready',ready:true});peer.send('tournament',{type:'ready',ready:true});await until(()=>state.tournament.members.every(m=>m.ready),'ready');host.send('tournament',{type:'start',round:0});
  await until(()=>state.tournament.phase==='garage'&&!state.tournament.phasePending&&state.garage?.status==='ready','first garage');
  const engine=state.garage.offers.find(o=>o.kind==='engine');host.send('purchase',{operationId:engine.operationId,kind:'engine'});await until(()=>state.garage.levels.engine===1,'engine');
  const tank=state.garage.offers.find(o=>o.kind==='tank');host.send('purchase',{operationId:tank.operationId,kind:'tank'});await until(()=>state.garage.levels.tank===1,'tank');
  const serverRoom=matchMaker.getLocalRoomById(host.roomId);serverRoom.tournamentConfig.roundSeconds=30;
  host.send('tournament',{type:'ready',ready:true});peer.send('tournament',{type:'ready',ready:true});await until(()=>state.tournament.members.every(m=>m.ready),'second ready');host.send('tournament',{type:'start',round:1});await until(()=>state.tournament.phase==='race','race');
  const sessionId=host.sessionId;const player=serverRoom.players.get(sessionId);const car=player.car;let seq=0;
  timer=setInterval(()=>{
   const own=state.players.find(p=>p.id===sessionId);let nearest=0,distance=Infinity;
   raceSamples.forEach((p,i)=>{const d=Math.hypot(p.x-own.body.position.x,p.z-own.body.position.z);if(d<distance){distance=d;nearest=i;}});
   const target=raceSamples[(nearest+4)%raceSamples.length];const local=car.chassis.quaternion.conjugate().vmult(new Vec3(target.x-own.body.position.x,0,target.z-own.body.position.z));const angle=Math.atan2(local.x,-local.z),speed=car.chassis.velocity.length();
   host.send('input',{epoch:state.connection.epoch,seq:++seq,controls:{...emptyControls(),left:angle<-.04,right:angle>.04,throttle:speed<8,brake:speed>9},gearing:'high'});
  },35);
  await until(()=>state.economy.unconfirmed>=10&&state.tournament.members.find(m=>m.id===sessionId).passed>0,'physical checkpoint and coin',12000);clearInterval(timer);timer=null;
  host.send('input',{epoch:0,seq:++seq,controls:{...emptyControls(),throttle:true},gearing:'low',horn:true,hornTone:'low'});await until(()=>peerState.players.find(p=>p.id===sessionId).horn,'horn before drop');
  const token=host.reconnectionToken;serverRoom.clients.getById(sessionId).ref.terminate();await until(()=>player.suspended,'suspended');
  const held={fuel:car.getFuel().fuel,passed:serverRoom.tournament.snapshot().members.find(m=>m.id===sessionId).passed,coins:[...player.economy.status().collected],levels:car.getState().competitionUpgrades,points:serverRoom.tournament.snapshot().members.find(m=>m.id===sessionId).points};
  assert.equal(player.horn,false);assert(!player.controls.throttle);assert.equal(player.inputs.length,0);assert(serverRoom.world.bodies.includes(car.chassis)&&car.chassis.mass>0,'Disconnected car stays dynamic in the collision world');
  const attacker=new Client(address);attacker.http.authToken=fixture.tokenFor('Bruno');await assert.rejects(attacker.reconnect(token),'A copied Colyseus token cannot substitute another Supabase account');
  assert.equal(serverRoom.players.get(sessionId),player);assert(player.suspended&&player.connection===null,'Wrong identity cannot consume the reserved seat');
  await assert.rejects(client.joinById(host.roomId,{version:NETWORK_VERSION,accessToken:fixture.tokenFor('Intruso'),userId,sessionId}),'Room code cannot replace a participant');
  client.http.authToken=fixture.tokenFor('Ana');host=await client.reconnect(token);attach(host,s=>{state=s;});await until(()=>state.connection?.epoch===1,'full authenticated state');
  assert.equal(host.sessionId,sessionId);assert.equal(serverRoom.players.get(sessionId),player);assert.equal(player.car,car);assert.equal(state.connection.resumed,true);
  assert.equal(car.getFuel().fuel,held.fuel);assert.deepEqual(car.getState().competitionUpgrades,held.levels);assert.deepEqual(state.economy.collected,held.coins);assert.equal(state.economy.balance,430);assert.equal(state.economy.unconfirmed,10);
  assert.equal(state.tournament.members.find(m=>m.id===sessionId).passed,held.passed);assert.equal(state.tournament.members.find(m=>m.id===sessionId).points,held.points);assert.equal(state.players.length,2);
  assert.equal(player.gearing,'high','A stale LOW input cannot override the circuit transmission on return');
  assert.equal(state.players.find(p=>p.id===sessionId).location,'race');
  await assert.rejects(client.reconnect(token),'Consumed reconnection tokens cannot create another player');
  host.send('input',{epoch:0,seq:999999,controls:{...emptyControls(),throttle:true},gearing:'high',horn:true});await pause(100);assert.equal(player.receivedSeq,-1);assert.equal(player.horn,false);assert.equal(car.getFuel().fuel,held.fuel,'Old input epoch cannot consume fuel');
  host.send('input',{epoch:1,seq:1,controls:{...emptyControls(),throttle:true},gearing:'low',horn:true});await until(()=>player.receivedSeq===1&&player.horn,'new input epoch');host.send('input',{epoch:1,release:true});
  serverRoom.tournamentConfig.roundSeconds=.3;await until(()=>state.tournament.phase==='garage'&&!state.tournament.phasePending&&state.garage?.status==='ready','second garage');assert.equal(state.economy.balance,440);assert.equal(fixture.credits.size,1,'Coin cannot pay again after reconnect');
  const air=state.garage.offers.find(o=>o.kind==='air');fixture.stats.failPurchaseAfterCommit=1;host.send('purchase',{operationId:air.operationId,kind:'air'});await until(()=>state.garage.pendingOperation===air.operationId&&state.garage.status==='error','purchase receipt lost');const garage=player.garage;
  const secondToken=host.reconnectionToken;serverRoom.clients.getById(sessionId).ref.terminate();await until(()=>player.suspended,'garage drop');client.http.authToken=fixture.tokenFor('Ana');host=await client.reconnect(secondToken);attach(host,s=>{state=s;});await until(()=>state.connection.epoch===2,'garage restored');
  assert.equal(player.garage,garage);assert.equal(state.garage.pendingOperation,air.operationId);host.send('purchase',{operationId:air.operationId,kind:'air'});await until(()=>state.garage.levels.air===1&&state.garage.status==='ready','purchase same UUID retry');assert.equal(state.garage.balance,410);assert.equal(fixture.purchases.size,3);assert.equal(fixture.rounds.size,2);
  await host.leave();host=null;await until(()=>serverRoom.tournament.snapshot().hostId===peer.sessionId,'permanent host transfer');

  // App-level background/foreground, automatic retry, expiry and a host whose
  // peers are all reserved. Uses the production client controller, not a mock.
  controller=createMultiplayerClient(s=>{appState=s;phases.push(s.reconnection?.state);},s=>{appSnapshot=s;});let tokenRequests=0;
  await controller.connect({address,vehicleId:'rally',getAccessToken:async()=>{if(denyToken)throw new Error('Test network failure');return fixture.tokenFor('Eva',tokenRequests++===0?2:3600);}});await until(()=>appState.phase==='online','app online');
  const appRoom=matchMaker.getLocalRoomById(appState.room.code);const appId=appState.room.sessionId;
  bystander=await client.joinById(appState.room.code,{version:NETWORK_VERSION,accessToken:fixture.tokenFor('Nuno'),vehicleId:'jeep'});attach(bystander,()=>{});
  controller.setHorn(true,'low');controller.setInput({...emptyControls(),throttle:true},'high');await until(()=>appRoom.players.get(appId).horn,'app driving');
  controller.setActive(false);await until(()=>appRoom.players.get(appId).suspended,'background reserves');assert.equal(appState.reconnection.state,'background');assert.equal(appRoom.players.get(appId).horn,false);await pause(2200);assert(appRoom.players.get(appId).identity.expiresAt<=Date.now(),'Old JWT expires while reserved');controller.setActive(true);
  await until(()=>appState.phase==='online'&&appState.reconnection?.state==='restored','foreground restored');assert.equal(appState.room.sessionId,appId);assert.equal(appSnapshot.connection.epoch,1);assert.equal(appRoom.players.get(appId).horn,false);
  other=await client.joinById(appState.room.code,{version:NETWORK_VERSION,accessToken:fixture.tokenFor('Outra'),userId:fixture.users.get('Eva').id,sessionId:appId,vehicleId:'gt3'});attach(other,()=>{});assert.notEqual(other.sessionId,appId);assert.equal(appRoom.players.get(other.sessionId).identity.userId,fixture.users.get('Outra').id,'A code and forged userId cannot assume another identity');await other.leave();other=null;
  denyToken=true;appRoom.clients.getById(appId).ref.terminate();await until(()=>appRoom.players.get(appId).suspended,'network drop');await pause(2500);
  const peerToken=bystander.reconnectionToken;const peerId=bystander.sessionId;appRoom.clients.getById(peerId).ref.terminate();await until(()=>appRoom.players.get(peerId).suspended,'remaining peer reserved');
  await until(()=>appState.reconnection?.state==='expired'&&!appRoom.players.has(appId),'expiry',5000);assert.equal(appState.room,null);assert.equal(appRoom.tournament.snapshot().hostId,null);assert(phases.includes('lost')&&phases.includes('retrying')&&phases.includes('restored'));
  controller.setActive(true);assert.equal(appState.phase,'error','Foreground after expiry cannot silently join a new session');
  client.http.authToken=fixture.tokenFor('Nuno');bystander=await client.reconnect(peerToken);attach(bystander,()=>{});await until(()=>appRoom.tournament.snapshot().hostId===peerId,'first returned peer receives host');assert.equal(bystander.sessionId,peerId);
  bystander.send('tournament',{type:'ready',ready:true});bystander.send('tournament',{type:'start',round:0});await pause(100);assert.equal(appRoom.tournament.snapshot().phase,'lobby','A competition cannot start with fewer than two participants');
  console.log('Reconnection passed: real Colyseus 0.16 transport, verified account before token consumption, preserved car/levels/balance/fuel/checkpoints/events, old input rejection, no duplicate coin/purchase/round, background/return, automatic retry/expiry, no identity by room code, host transfer and insufficient participants. Auth HTTP is test-only; physical mobile and real Supabase remain pending.');
 }finally{if(timer)clearInterval(timer);controller?.dispose();await Promise.allSettled([host?.leave(),peer?.leave(),bystander?.leave(),other?.leave()]);await game.gracefullyShutdown(false);await fixture.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
