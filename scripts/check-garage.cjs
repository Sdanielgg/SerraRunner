const assert=require('node:assert/strict');
const {createPhysics,emptyControls}=require('../build-server/src/game/physics.js');
const {vehicles}=require('../build-server/src/game/vehicles.js');
const {fuelRules}=require('../build-server/src/game/economy-config.js');
const {baseUpgrades,upgradedParameters}=require('../build-server/src/game/upgrades.js');
for(const id of ['jeep','crawler','rally','gt3']){
 const car=createPhysics(id);for(let i=0;i<100;i++)car.step(1/60,emptyControls());
 const levels={engine:2,tank:1,air:3};const tuning=upgradedParameters(id,levels);
 car.beginCompetitionEconomy(levels);assert.equal(car.getFuel().capacity,fuelRules[id].capacity*1.25);
 for(const gearing of ['low','high']){car.chassis.velocity.setZero();car.applyControls(1/60,{...emptyControls(),throttle:true},gearing);assert.equal(car.vehicle.wheelInfos[0].engineForce,vehicles[id][gearing].engineForce*1.2);}
 assert.equal(tuning.lowForce/tuning.highForce,vehicles[id].low.engineForce/vehicles[id].high.engineForce,'LOW/HIGH relative force is preserved');
 const restored=createPhysics(id);restored.restoreState(car.getState());assert.deepEqual(restored.getState().competitionUpgrades,levels);assert.equal(restored.getFuel().capacity,car.getFuel().capacity);
 car.reset();assert.equal(car.getFuel().capacity,fuelRules[id].capacity*1.25,'Recovery keeps loadout');
 car.endCompetitionEconomy();car.chassis.velocity.setZero();car.applyControls(1/60,{...emptyControls(),throttle:true},'low');assert.equal(car.vehicle.wheelInfos[0].engineForce,vehicles[id].low.engineForce,'Local physics returns to base values');assert.equal(car.getState().competitionUpgrades,undefined);
 car.beginCompetitionEconomy(baseUpgrades());assert.equal(car.getFuel().capacity,fuelRules[id].capacity);car.dispose();restored.dispose();
 const base=createPhysics(id),improved=createPhysics(id);base.beginCompetitionEconomy();improved.beginCompetitionEconomy({engine:0,tank:0,air:3});
 for(const vehicle of [base,improved]){vehicle.reset({x:0,y:10,z:0,yaw:0});vehicle.step(1/60,{...emptyControls(),flipBackward:true});}
 assert(improved.chassis.angularVelocity.x>base.chassis.angularVelocity.x*1.5,'Confirmed air upgrade changes physical torque');base.dispose();improved.dispose();
}
console.log('Garage physics passed: per-vehicle base multipliers, unchanged LOW/HIGH limits/ratios, tank capacity, confirmed loadout serialization, recovery and base local physics.');
