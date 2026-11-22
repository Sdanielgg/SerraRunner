/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const filename = path.resolve(__dirname, '../src/game', `${name}.ts`);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths; cache.set(name, mod);
  mod.require = request => request.startsWith('./') ? load(request.slice(2)) : Module.prototype.require.call(mod, request);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return mod.exports;
}
const { createChallengeRun, formatRaceTime } = load('challenge-run');
const { challengeGates, challengeHeightAt, challengeRacingLine, challengeSpawn, challengeBlocks, challengeTechnicalSection, challengeLength, challengeTunnel } = load('challenge-course');
const { createPhysics, emptyControls } = load('physics');
const { vehicleList } = load('vehicles');
assert.equal(formatRaceTime(65.43), '01:05.43');
const run = createChallengeRun(); run.start();
run.step(2, challengeSpawn); assert.equal(run.status().phase, 'countdown'); assert.equal(run.status().elapsed, 0);
run.step(1, challengeSpawn); assert.equal(run.status().phase, 'running');
function crossing(gate, backwards = false, lateral = 0) {
  const direction = backwards ? -1 : 1;
  const at = offset => ({ x: gate.x + gate.dx * offset + gate.nx * lateral, y: challengeHeightAt(gate.x,gate.z)+1, z: gate.z + gate.dz * offset + gate.nz * lateral });
  run.step(1 / 60, at(-2 * direction)); return run.step(1 / 60, at(2 * direction));
}
crossing(challengeGates.at(-1)); assert.equal(run.status().passed, 0, 'The finish cannot skip the route');
crossing(challengeGates[0], true); assert.equal(run.status().passed, 0, 'Reverse crossing is rejected');
crossing(challengeGates[0], false, 20); assert.equal(run.status().passed, 0, 'Driving outside a gate is rejected');
crossing(challengeGates[0]); assert.equal(run.status().passed, 1);
const before = run.status().elapsed; const recovery = run.recover();
assert.equal(run.status().elapsed, before + 5); assert.equal(run.status().recoveries, 1); assert.equal(run.status().passed, 1);
assert(Math.hypot(recovery.x - challengeGates[0].x, recovery.z - challengeGates[0].z) < 4, 'Recovery returns to the last valid checkpoint');
for (const gate of challengeGates.slice(1)) crossing(gate);
assert.equal(run.status().phase, 'finished'); const result = run.status().elapsed;
run.step(10, challengeSpawn); assert.equal(run.status().elapsed, result, 'Finish freezes the clock');
run.start(); assert.equal(run.status().best, result); assert.equal(run.status().passed, 0); assert.equal(run.status().recoveries, 0);
run.start('gt3'); assert.equal(run.status().best, null, 'Each car starts with its own record');
assert.equal(run.status().bestByVehicle.jeep, result, 'Changing cars preserves the previous car record');
run.step(3,challengeSpawn);
for (const gate of challengeGates) crossing(gate);
assert.equal(run.status().phase,'finished');
assert.equal(run.status().bestByVehicle.jeep,result,'Finishing with another car does not overwrite the 4x4 record');
assert(run.status().bestByVehicle.gt3>0,'The GT3 receives its own result');
run.start('jeep'); assert.equal(run.status().best, result);
run.cancel(); assert.equal(run.status().phase, 'idle');
console.log('Checkpoint checks passed: countdown, order, direction, width, recovery penalty, finish, replay and session best.');

// Follow the same open-lane arrows shown in the game, with each actual car.
assert(challengeLength > 800, 'The extended course is more than twice the original length');
assert.equal(challengeGates.length, 30, 'The local challenge keeps its own 30 checkpoints'); assert.equal(challengeBlocks.length,8);
for (const spec of vehicleList) {
 const car = createPhysics(spec.id, undefined, true); car.reset(challengeSpawn);
 for (let i=0;i<180;i++) car.step(1/60,{...emptyControls(),brake:true});
 const physicalRun = createChallengeRun(); physicalRun.start(spec.id); physicalRun.step(3,car.chassis.position);
 const route = challengeRacingLine;
 let cursor=0; let completed=false; let maximumHeight=0; let tunnelVisited=false; let bridgeVisited=false;
 for(let tick=0;tick<24000;tick++) {
  const position=car.chassis.position;
  let closest=cursor; let distance=Infinity;
  for(let j=cursor;j<Math.min(cursor+18,route.length+8);j++){
   const p=route[j%route.length];const d=Math.hypot(p.x-position.x,p.z-position.z);
   if(d<distance){distance=d;closest=j;}
  }
  cursor=closest;
  const technical=challengeTechnicalSection(cursor);
  const target=route[(cursor+(technical?3:5))%route.length];
  const forward=car.chassis.quaternion.vmult(new (require('cannon-es').Vec3)(0,0,-1));
  const desired=Math.atan2(-(target.x-position.x),-(target.z-position.z));
  const yaw=Math.atan2(-forward.x,-forward.z);
  const angle=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
  const speed=car.chassis.velocity.length();const limit=technical?3.4:Math.abs(angle)>.35?5:10;
  car.step(1/60,{left:angle>.045,right:angle<-.045,throttle:speed<limit,reverse:false,brake:speed>limit+1},technical?'low':'high');
  maximumHeight=Math.max(maximumHeight,position.y);
  if(Math.abs(position.x-challengeTunnel.x)<3 && Math.abs(position.z-challengeTunnel.z)<3)tunnelVisited=true;
  if(Math.abs(position.x+200)<3 && Math.abs(position.z+82)<3)bridgeVisited=true;
  const status=physicalRun.step(1/60,position);
  if(status.phase==='finished'){
   completed=true;console.log(`${spec.id}: ${formatRaceTime(status.elapsed)}, ${status.passed} checkpoints, peak ${maximumHeight.toFixed(2)} m.`);break;
  }
 }
 assert(completed,`${spec.id}: completes the extended course; checkpoint ${physicalRun.status().passed}, route ${cursor}, position ${car.chassis.position.toString()}`);
 assert(tunnelVisited && bridgeVisited,`${spec.id}: really traverses the tunnel and narrow bridge`);
 assert(maximumHeight>1.7,`${spec.id}: traverses the raised ramps`);
 assert.equal(physicalRun.status().vehicleId,spec.id);
 assert(physicalRun.status().bestByVehicle[spec.id]>0);
 car.dispose();
}
assert(challengeHeightAt(-90,64)>1.4);console.log('All four cars completed the extended challenge.');
