/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module'); const ts = require('typescript'); const React = require('react');
function loader(overrides={}) {
  const cache=new Map();
  function load(relative) {
    const base=path.resolve(__dirname,'../src',relative);
    const file=fs.existsSync(`${base}.tsx`)?`${base}.tsx`:`${base}.ts`;
    if(cache.has(file))return cache.get(file).exports;
    const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;cache.set(file,mod);
    mod.require=request=>overrides[request]??(request.startsWith('@/')?load(request.slice(2)):Module.prototype.require.call(mod,request));
    mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
    return mod.exports;
  }
  return load;
}
const load=loader({'react-native':{View:'View',Text:'Text',StyleSheet:{create:value=>value}}});
const {createGameSettings,parseGameSettings,defaultGameSettings}=load('game/game-settings');
function text(element) { if(typeof element==='string'||typeof element==='number')return String(element);return React.Children.toArray(element?.props?.children).map(text).join(' ').replace(/\s+/g,' '); }
async function main() {
  for(const invalid of [null,'bad','null','[]','{"sound":"false","vibration":1,"reducedGraphics":{}}'])assert.deepEqual(parseGameSettings(invalid),defaultGameSettings);
  let read;let saved;let activeWrites=0;let maxWrites=0;let fail=false;
  const storage={getItem:()=>new Promise(resolve=>{read=resolve;}),setItem:async(_key,value)=>{activeWrites++;maxWrites=Math.max(activeWrites,maxWrites);await Promise.resolve();activeWrites--;if(fail)throw Error('disk');saved=value;}};
  const store=createGameSettings(storage);let notifications=0;const unsubscribe=store.subscribe(()=>notifications++);
  const loading=store.load();await store.update({sound:false});
  assert(!store.snapshot().loaded);assert.equal(saved,undefined,'A user change must not overwrite unread settings');
  read('{"sound":true,"vibration":true,"reducedGraphics":true}');await loading;
  assert.deepEqual(store.snapshot().settings,{sound:false,vibration:true,reducedGraphics:true},'Hydration merges early edits without losing stored fields');
  await Promise.all([store.update({sound:true}),store.update({vibration:false}),store.update({reducedGraphics:false}),store.update({sound:false})]);
  assert.equal(maxWrites,1,'Writes remain serial, including rapid changes');
  const reloaded=createGameSettings({...storage,getItem:async()=>saved});await reloaded.load();assert.deepEqual(reloaded.snapshot().settings,store.snapshot().settings,'A new mount restores all settings, including mute');
  fail=true;await store.update({reducedGraphics:true});assert.equal(store.snapshot().saved,false);assert(store.snapshot().settings.reducedGraphics,'Storage failure preserves the current session');
  fail=false;await store.update({sound:true});assert(store.snapshot().saved);assert.equal(JSON.parse(saved).reducedGraphics,true,'Next successful write includes earlier unsaved changes');
  unsubscribe();const count=notifications;await store.update({vibration:true});assert.equal(notifications,count,'Unmounted listeners are removed');
  const failed=createGameSettings({...storage,getItem:async()=>{throw Error('blocked');}});await failed.load();assert(failed.snapshot().loaded&&!failed.snapshot().saved,'Storage read failure leaves usable settings and an error indication');
  const Hud=load('components/competition-hud').default;
  assert.equal(Hud({online:{phase:'offline'}}),null,'Competition HUD stays out of local modes');
  const online={room:{sessionId:'own'},tournament:{started:true,phase:'race',round:2,targetPoints:15,remainingSeconds:81,members:[{id:'own',points:3,passed:4}]},economy:{balance:440,fuel:0,capacity:18,pendingReward:50,rotations:2,unconfirmed:10,walletStatus:'pending'}};
  const displayed=text(Hud({online}));for(const expected of ['3 / 15','440','0.0 / 18','2 × 360°','50 pendente','10 moedas a guardar','Sem combustível','4 /13'])assert(displayed.includes(expected),`HUD exposes ${expected}: ${displayed}`);
  assert(text(Hud({online:{...online,tournament:{...online.tournament,phase:'countdown',countdown:2.1}}})).includes('Partida em 3'));
  const compact=text(Hud({online,compact:true}));for(const expected of ['440 moedas','0.0/18 L','3 / 15','50 pendente'])assert(compact.includes(expected),`Compact HUD exposes ${expected}`);
  const Guide=load('components/mode-instructions').default;const help=text(Guide());for(const mode of ['Condução livre','Desafio da Serra','Competição','30 checkpoints','5 segundos','15','360°','individuais'])assert(help.includes(mode));
  for(const file of ['hooks/use-game-feedback','hooks/use-game-feedback.web']) {
    let pulses=[];let cleanups=[];
    const navDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{vibrate:duration=>pulses.push(duration)}});
    const hooks=loader({react:{useRef:value=>({current:value}),useCallback:value=>value,useEffect:fn=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);}},'react-native':{Vibration:{vibrate:duration=>pulses.push(duration),cancel:()=>pulses.push(0)}}});
    try {
      const feedbackHook=hooks(file).useGameFeedback;const off=feedbackHook(false);off.feedback();assert(!pulses.some(value=>value>0));
      pulses=[];const on=feedbackHook(true);on.feedback();on.feedback();assert.equal(pulses.filter(value=>value>0).length,1,'Feedback is rate-limited');
      on.cancelFeedback();assert.equal(pulses.at(-1),0,'Focus/background cancellation stops vibration');cleanups.forEach(fn=>fn());assert.equal(pulses.at(-1),0);
      if(file.endsWith('.web')){Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});on.feedback();on.cancelFeedback();}
    } finally {if(navDescriptor)Object.defineProperty(globalThis,'navigator',navDescriptor);else delete globalThis.navigator;}
  }
  console.log('Interface passed: settings hydration/edit races, serial persistence, storage failures/retry/unsubscribe, mode HUD, instructions, vibration/mute controls. Host fixtures; physical/web audiovisual and FPS validation pending.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
