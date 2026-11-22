const assert = require('node:assert/strict');
const { Quaternion, Vec3, RaycastResult } = require('cannon-es');
const { createStuntTracker } = require('../build-server/src/game/stunts.js');
const { createRaceEconomy } = require('../build-server/src/game/race-economy.js');
const { createPhysics, emptyControls } = require('../build-server/src/game/physics.js');
const { racePickups, economyHeightAt } = require('../build-server/src/game/economy-course.js');
const { economyRules, fuelRules } = require('../build-server/src/game/economy-config.js');
const { createEconomyWallet } = require('../build-server/server/economy-wallet.js');
const { createSupabaseServices } = require('../build-server/server/supabase.js');
const { createSupabaseFixture } = require('./supabase-fixture.cjs');
const dt = 1 / 60;
function sample(angle = 0, wheels = 4, extra = {}) { const q = new Quaternion(); q.setFromAxisAngle(new Vec3(1,0,0), angle); return { position: { x: 0, y: wheels ? 0.7 : 3, z: 0 }, quaternion: q, velocity: { x: 0, y: 0, z: 0 }, angularSpeed: 0, wheels, bodyContact: false, impact: 0, clearance: wheels ? 0 : 2, ...extra }; }
function arm(tracker) { for (let i = 0; i < 20; i++) tracker.step(dt, sample()); tracker.step(dt, sample(0, 0)); }
function spin(tracker, turns) { for (let i = 1; i <= Math.abs(turns) * 120; i++) tracker.step(dt, sample(Math.sign(turns) * i * Math.PI * 2 / 120, 0)); }
function land(tracker, extra = {}) { const rewards = []; for (let i = 0; i < 50; i++) { const r = tracker.step(dt, sample(0,4,extra)); if (r) rewards.push(r); } return rewards; }
const tracker = createStuntTracker(); arm(tracker); spin(tracker, 3);
assert.equal(tracker.status().rotations, 3); assert.equal(tracker.status().pendingReward, economyRules.rewardPerRotation * 3);
const paid = land(tracker); assert.equal(paid.length, 1); assert.equal(paid[0].amount, 75); assert.equal(land(tracker).length, 0);
for (const failure of ['impact','upsideDown','body','recover','bounce']) {
 const t = createStuntTracker(); arm(t); spin(t,1);
 if (failure === 'recover') t.cancel();
 const bad = failure === 'impact' ? { impact: 20 } : failure === 'upsideDown' ? { quaternion: new Quaternion(1,0,0,0) } : failure === 'body' ? { bodyContact: true } : {};
 if (failure === 'bounce') { t.step(dt, sample()); t.step(dt, sample(0,0)); }
 assert.equal(land(t,bad).length, 0, `${failure} cancels the pending reward`);
}
const oscillating = createStuntTracker(); arm(oscillating);
for (let i = 0; i < 360; i++) oscillating.step(dt, sample(Math.sin(i / 12) * 1.2,0));
assert.equal(land(oscillating).length,0,'Back-and-forth oscillation is not a full rotation');
const reversed = createStuntTracker(); arm(reversed); spin(reversed,1);
for(let i=1;i<=120;i++) reversed.step(dt,sample(Math.PI*2*(1-i/120),0));
assert.equal(land(reversed).length,0,'A complete reversed rotation cancels net winding');
const ground = createStuntTracker(); for(let i=0;i<480;i++) assert.equal(ground.step(dt,sample(i*Math.PI/60,4)),null);

const events = []; const econ = createRaceEconomy((key,kind,amount)=>events.push({key,kind,amount}));
const coin = racePickups.find(p=>p.kind==='coin'); const atCoin = sample(0,4,{position:{x:coin.x,y:0.7,z:coin.z}});
econ.step(dt,atCoin,true,5,12); for(let i=0;i<100;i++) econ.step(dt,atCoin,true,5,12);
assert.equal(events.length,1); assert.equal(events[0].amount,10);
econ.cancel(); for(let i=0;i<40;i++)econ.step(dt,atCoin,true,5,12); assert.equal(events.length,1,'Recovery does not restore a collected coin');
const independent=[]; const second=createRaceEconomy((...args)=>independent.push(args)); second.step(dt,atCoin,true,5,12); second.step(dt,atCoin,true,5,12); assert.equal(independent.length,1,'Pickups are individual');
const fuelPickup=racePickups.find(p=>p.kind==='fuel'); const atFuel=sample(0,4,{position:{x:fuelPickup.x,y:0.7,z:fuelPickup.z}});
econ.cancel(); for(let i=0;i<40;i++) econ.step(dt,atFuel,true,12,12);
assert(!econ.status().collected.includes(fuelPickup.id),'A full tank does not waste a fuel pickup');
assert.equal(econ.step(dt,atFuel,true,9,12),3); assert.equal(econ.step(dt,atFuel,true,9,12),0,'Fuel pickup cannot be repeated');

for(const id of ['jeep','crawler','rally','gt3']) {
 const car=createPhysics(id); for(let i=0;i<180;i++) car.step(dt,emptyControls()); car.beginCompetitionEconomy();
 assert.equal(car.getFuel().capacity,fuelRules[id].capacity);
 const initial=car.getFuel().fuel; car.step(dt,{...emptyControls(),throttle:true}); assert(car.getFuel().fuel<initial);
 car.restoreState({...car.getState(),competitionFuel:0}); car.chassis.velocity.set(0,0,-5);
 car.applyControls(dt,{...emptyControls(),throttle:true},'high');
 assert(car.vehicle.wheelInfos.every(w=>w.engineForce===0),'Zero fuel disables all wheel propulsion'); car.world.step(dt); assert(car.chassis.velocity.length()>1,'Zero fuel keeps inertia');
 for(let i=0;i<120;i++)car.step(dt,{...emptyControls(),brake:true});assert(car.chassis.velocity.length()<1,'Zero fuel retains effective braking');
 car.reset(); assert.equal(car.getFuel().fuel,0,'Recovery does not create fuel');
 car.addFuel(1); assert.equal(car.getFuel().fuel,1); car.addFuel(1000); assert.equal(car.getFuel().fuel,fuelRules[id].capacity);
 const hit=new RaycastResult(); assert(car.world.raycastClosest(new Vec3(73,10,-21.25),new Vec3(73,-1,-21.25),{},hit)); assert(Math.abs(hit.hitPointWorld.y-economyHeightAt(73,-21.25))<1e-5,'Rendered ramp height and collider agree');
 car.dispose();
}
const grounded=createPhysics(); for(let i=0;i<180;i++) grounded.step(dt,emptyControls()); grounded.beginCompetitionEconomy();
for(let i=0;i<30;i++) grounded.step(dt,{...emptyControls(),flipBackward:true}); assert(Math.abs(grounded.chassis.angularVelocity.x)<0.1,'Ground controls do not apply aerial torque');
grounded.reset({x:0,y:10,z:0,yaw:0}); for(let i=0;i<20;i++) grounded.step(dt,{...emptyControls(),flipBackward:true}); assert(grounded.chassis.angularVelocity.x>1,'Airborne rotation applies physical torque'); grounded.dispose();

// A controlled initial speed within the Crawler's HIGH range, followed by the
// real ramp, suspension, aerial torque and landing. No orientation is injected.
const jumper=createPhysics('crawler'); jumper.beginCompetitionEconomy(); jumper.reset({x:73.5,y:1.5,z:1,yaw:0});
const physicalTracker=createStuntTracker();const physicalRewards=[];let pitch=0,lastPitch=0;
for(let i=0;i<330;i++) {
 if(i===90)jumper.chassis.velocity.set(0,0,-16);
 const s=jumper.getStuntSample();const q=jumper.chassis.quaternion;const current=2*Math.atan2(q.x,q.w);
 let delta=current-lastPitch;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;pitch+=delta;lastPitch=current;
 const controls={...emptyControls(),throttle:i>90&&s.wheels>0};
 if(s.wheels===0&&i>90){controls.flipForward=pitch> -4.8;controls.flipBackward=pitch<= -4.8&&jumper.chassis.angularVelocity.x< -.1;}
 jumper.step(dt,controls);const reward=physicalTracker.step(dt,jumper.getStuntSample());if(reward)physicalRewards.push(reward);
}
assert.equal(physicalRewards.length,1,'A physical ramp flip can be landed and paid once');assert.equal(physicalRewards[0].amount,25);jumper.dispose();

const {createPrediction}=require('../build-server/src/game/prediction.js');const {NETWORK_VERSION}=require('../build-server/src/game/network-types.js');
const serverCar=createPhysics();serverCar.beginCompetitionEconomy();for(let i=0;i<90;i++)serverCar.step(dt,emptyControls());
const pred=createPrediction();const snap=(tick,ack)=>({version:NETWORK_VERSION,tick,players:[{id:'self',vehicleId:'jeep',revision:0,acknowledgedSeq:ack,controlsEnabled:true,body:{position:serverCar.getState().position,quaternion:serverCar.getState().quaternion},physics:serverCar.getState()}]});
pred.reconcile(snap(0,-1),'self');const commands=[];for(let i=0;i<12;i++)commands.push(...pred.advance(dt,{...emptyControls(),throttle:true},'high'));
for(const c of commands.slice(0,6))serverCar.step(dt,c.controls,c.gearing);pred.reconcile(snap(6,commands[5].seq),'self');
assert(Math.abs(pred.pose().car.getFuel().fuel-(fuelRules.jeep.capacity-12*dt*fuelRules.jeep.litresPerSecond))<1e-8,'Fuel ACK/replay never consumes twice');
pred.dispose();serverCar.dispose();

async function walletTest(){
 const fixture=await createSupabaseFixture();
 try {
  fixture.tokenFor('Ana'); const userId=fixture.users.get('Ana').id; const wallet=createEconomyWallet(userId,createSupabaseServices(fixture.env)); await wallet.load();
  const round='10000000-0000-4000-8000-000000000001'; wallet.enqueue(round,'coin:one','coin',10); wallet.enqueue(round,'coin:one','coin',10); assert.equal(wallet.snapshot().unconfirmed,10);
  fixture.stats.failRewardWrites=1; await wallet.flush(true); assert.equal(wallet.snapshot().walletStatus,'error'); assert.equal(wallet.snapshot().unconfirmed,10);
  await wallet.flush(true); assert.equal(wallet.snapshot().balance,10); assert.equal(wallet.snapshot().unconfirmed,0); wallet.enqueue(round,'coin:one','coin',10); await wallet.flush(true); assert.equal(wallet.snapshot().balance,10);
  console.log('Economy passed: multi-flips, stable landing, invalid landing/impact/recovery/bounce, oscillation/ground denial, individual one-time pickups, per-vehicle fuel, zero-fuel inertia, physical air-only torque, ramp/collider agreement and idempotent wallet retry.');
 } finally { await fixture.close(); }
}
walletTest().catch(error=>{console.error(error);process.exitCode=1;});
