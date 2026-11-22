const assert=require('node:assert/strict');
const {Client}=require('colyseus.js');const {matchMaker}=require('@colyseus/core');const {Vec3}=require('cannon-es');
const {createGameServer}=require('../build-server/server/index.js');const {createSupabaseServices}=require('../build-server/server/supabase.js');
const {createSupabaseFixture}=require('./supabase-fixture.cjs');const {NETWORK_VERSION,ROOM_NAME}=require('../build-server/src/game/network-types.js');
const {emptyControls}=require('../build-server/src/game/physics.js');const {raceSamples}=require('../build-server/src/game/race-track.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(test,label,timeout=8000){const start=Date.now();while(!test()){if(Date.now()-start>timeout)throw new Error(label);await pause(20);}}
async function run(){
 const fixture=await createSupabaseFixture();const {game,http}=createGameServer(createSupabaseServices(fixture.env),{countdownSeconds:0.1,roundSeconds:18,resultsSeconds:0.2});
 let host,peer,timer,latest,peerState;
 try{
  await game.listen(0,'127.0.0.1');const client=new Client(`http://127.0.0.1:${http.address().port}`);
  const token=fixture.tokenFor('Ana');const peerToken=fixture.tokenFor('Bruno');fixture.balances.set(fixture.users.get('Bruno').id,500);
  host=await client.create(ROOM_NAME,{version:NETWORK_VERSION,accessToken:token,vehicleId:'jeep'});
  host.onMessage('snapshot',s=>{latest=s;});host.onMessage('competition',()=>{});host.onError(()=>{});
  peer=await client.joinById(host.roomId,{version:NETWORK_VERSION,accessToken:peerToken,vehicleId:'rally'});
  peer.onMessage('snapshot',s=>{peerState=s;});peer.onMessage('competition',()=>{});peer.onError(()=>{});
  await until(()=>latest?.players.length===2,'two players');
  host.send('tournament',{type:'ready',ready:true});peer.send('tournament',{type:'ready',ready:true});await until(()=>latest.tournament.members.every(m=>m.ready),'ready');
  fixture.stats.failRewardWrites=1;host.send('tournament',{type:'start',round:0});await until(()=>latest.tournament.phase==='race'&&latest.economy,'economy race');
  await until(()=>peerState?.economy?.balance===500,'private peer balance');assert.equal(latest.economy.balance,0);assert(latest.players.every(p=>p.balance===undefined));
  const room=matchMaker.getLocalRoomById(host.roomId);const peerCar=room.players.get(peer.sessionId).car;
  peerCar.restoreState({...peerCar.getState(),competitionFuel:0.001});
  peer.send('input',{seq:1,controls:{...emptyControls(),throttle:true},gearing:'high',fuel:999,balance:999999,reward:999999});
  await until(()=>peerState.economy.fuel===0,'fuel exhausted');assert(peerCar.vehicle.wheelInfos.every(w=>w.engineForce===0));
  peer.send('reset','race');await until(()=>peerState.tournament.members.find(m=>m.id===peer.sessionId).recoveries===1,'recovery');assert.equal(peerState.economy.fuel,0,'Recovering never refills');
  let seq=0;timer=setInterval(()=>{
   if(latest.tournament.phase!=='race')return;const own=latest.players.find(p=>p.id===host.sessionId);const car=room.players.get(host.sessionId).car;
   let nearest=0,distance=Infinity;raceSamples.forEach((p,i)=>{const d=Math.hypot(p.x-own.body.position.x,p.z-own.body.position.z);if(d<distance){distance=d;nearest=i;}});
   const target=raceSamples[(nearest+4)%raceSamples.length];const local=car.chassis.quaternion.conjugate().vmult(new Vec3(target.x-own.body.position.x,0,target.z-own.body.position.z));
   const angle=Math.atan2(local.x,-local.z),speed=car.chassis.velocity.length();
   host.send('input',{seq:++seq,controls:{...emptyControls(),left:angle<-.04,right:angle>.04,throttle:speed<8,brake:speed>9},gearing:'high'});
  },35);
  await until(()=>latest.economy.unconfirmed>=10,'a real pickup awaits settlement',12000);
  clearInterval(timer);timer=null;host.send('input',{seq:++seq,controls:{...emptyControls(),brake:true},gearing:'high'});
  assert.equal(latest.economy.balance,0,'Race rewards await atomic round settlement');
  await until(()=>latest.tournament.persistence==='error','atomic persistence failure',16000);
  host.send('tournament',{type:'retry'});await until(()=>latest.economy.balance===10&&latest.economy.unconfirmed===0,'confirmed coin credit');
  const balance=latest.economy.balance;host.send('input',{seq:++seq,controls:emptyControls(),gearing:'high',coins:999999,fuel:999999});await pause(300);
  assert.equal(latest.economy.balance,balance);assert.equal(peerState.economy.balance,500);assert.equal(fixture.credits.size,1);
  await until(()=>latest.tournament.phase==='garage','round duration limit',16000);
  assert.equal(latest.tournament.winnerId,null);assert(latest.tournament.members.every(m=>m.points===0),'Coins cannot award race points');
  console.log('Online economy passed: real server fuel depletion and recovery without refill, authenticated/private balances, physical coin pickup, rejected client money/fuel claims, failed persistence/retry without duplicate credit and money independent from points. Supabase HTTP is test-only.');
 }finally{if(timer)clearInterval(timer);await Promise.allSettled([host?.leave(),peer?.leave()]);await game.gracefullyShutdown(false);await fixture.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
