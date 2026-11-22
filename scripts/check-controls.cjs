/* global __dirname */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const root=path.resolve(__dirname,'../src');const React=require('react');
// Shallow React Native host fixture: exercise the production event handlers.
// It does not claim browser layout or physical VoiceOver/TalkBack validation.
function loadControls(platform){
 const cache=new Map();
 function load(file){
  file=fs.existsSync(`${file}.tsx`)?`${file}.tsx`:`${file}.ts`;
  if(cache.has(file))return cache.get(file).exports;
  const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;cache.set(file,mod);
  mod.require=request=>{
   if(request==='react')return {...React,useRef:value=>({current:value})};
   if(request==='react-native')return {View:'View',Text:'Text',Pressable:'Pressable',Platform:{OS:platform},StyleSheet:{create:value=>value}};
   if(request==='@/game/physics')return {controlKeys:['left','right','throttle','reverse','brake','flipForward','flipBackward']};
   if(request.startsWith('@/'))return load(path.join(root,request.slice(2)));
   if(request.startsWith('.'))return load(path.resolve(path.dirname(file),request));
   return Module.prototype.require.call(mod,request);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
  return mod.exports;
 }
 return {Controls:load(path.join(root,'components/driving-controls')).default,layout:load(path.join(root,'game/control-layout'))};
}
function children(element){if(!element||typeof element!=='object')return [];return [element,...React.Children.toArray(element.props?.children).flatMap(children)];}
const web=loadControls('web');const {drivingControlLayout,parseControlPreferences}=web.layout;
assert.deepEqual(parseControlPreferences('bad-json'),{size:'normal',swapped:false});assert.deepEqual(parseControlPreferences('{"size":"large","swapped":true}'),{size:'large',swapped:true});
for(const [width,height] of [[320,640],[390,844],[568,320],[667,375],[844,390],[932,430],[1024,768],[1280,720]])for(const size of ['normal','large']){
 const available=width-24;const l=drivingControlLayout(available,height,size);
 const needed=4*l.button+(l.stacked?3*l.gap:l.dockWidth+4*l.gap);
 assert(needed<=available,`Controls fit ${width}x${height} ${size}`);assert(l.button>=56&&l.utilityHeight>=48,'Touch targets remain usable');assert(l.steeringHeight>=84&&l.pedalHeight>=96);
}
function fixture(platform,options={}){
 const {Controls}=platform==='web'?web:loadControls('ios');const fingers=new Map();let holds=0;
 const props={availableWidth:820,height:390,preferences:{size:'normal',swapped:false},pressed:{},speed:32,reverse:false,showAir:true,disabled:false,onHold:(id,key)=>{fingers.set(id,key);holds++;},onRelease:id=>fingers.delete(id),onHorn:()=>{},hornPressed:false,...options};
 const tree=Controls(props);const hold=(control,extra={})=>{const element=children(tree).find(e=>e.props?.control===control);assert(element,`Visible control ${control}`);return element.type({...element.props,...extra}).props;};
 return {tree,hold,fingers,get holds(){return holds;}};
}
const p=id=>({nativeEvent:{pointerId:id},preventDefault(){}});
const f=fixture('web');f.hold('throttle').onPointerDown(p(1));f.hold('left').onPointerDown(p(2));f.hold('flipForward').onPointerDown(p(3));assert.equal(f.fingers.size,3);
for(const id of ['steering-zone','pedal-zone','speed-zone'])assert.equal(children(f.tree).find(e=>e.props?.testID===id)?.props.pointerEvents,'auto',`${id} blocks camera gestures even between buttons`);
f.hold('left').onPointerLeave(p(2));assert.equal(f.fingers.get(1),'throttle');assert.equal(f.fingers.get(3),'flipForward');f.hold('flipForward').onPointerCancel(p(3));assert.equal(f.fingers.size,1);
let stopped=0;const space={nativeEvent:{key:' '},preventDefault(){},stopPropagation(){stopped++;}};
const keyboard=f.hold('brake');keyboard.onKeyDown(space);assert.equal(stopped,1);keyboard.onKeyUp(space);assert.equal(stopped,1,'Key-up can reach global release handler');assert.equal(f.fingers.size,1);
keyboard.onKeyDown(space);keyboard.onBlur();assert.equal(f.fingers.size,1,'Focus loss releases only its own key');f.hold('throttle').onPointerUp(p(1));assert.equal(f.fingers.size,0);
const accessible=f.hold('throttle');const before=f.holds;accessible.onAccessibilityTap();accessible.onAccessibilityAction({nativeEvent:{actionName:'activate'}});assert.equal(f.holds,before+1,'Duplicate accessibility activation cannot toggle twice');
f.hold('throttle',{active:true}).onAccessibilityTap();assert.equal(f.fingers.size,0,'Assisted activation can release a latched pedal');
f.hold('throttle').onClick({nativeEvent:{detail:1}});assert.equal(f.fingers.size,0,'An ordinary pointer click cannot latch throttle');
f.hold('throttle').onClick({nativeEvent:{detail:0}});assert.equal(f.fingers.size,1,'Assistive browser activation can latch a pedal');f.hold('throttle',{active:true}).onAccessibilityTap();assert.equal(f.fingers.size,0);
const native=fixture('ios');const touch=ids=>({nativeEvent:{changedTouches:ids.map(identifier=>({identifier}))}});
native.hold('throttle').onTouchStart(touch([10,11]));native.hold('right').onTouchStart(touch([12]));native.hold('throttle').onTouchCancel(touch([10]));assert.equal(native.fingers.size,2);native.hold('throttle').onTouchEnd(touch([11]));assert.equal(native.fingers.get(12),'right');
const disabled=fixture('web',{disabled:true});disabled.hold('throttle').onPointerDown(p(1));disabled.hold('throttle').onAccessibilityTap();assert.equal(disabled.fingers.size,0);
const swapped=fixture('web',{preferences:{size:'large',swapped:true}});const order=children(swapped.tree).filter(e=>e.props?.control).map(e=>e.props.control);assert(order.indexOf('throttle')<order.indexOf('left'),'Swapping sides preserves control names while moving the pedal group');
const local=fixture('web',{showAir:false});assert(!children(local.tree).some(e=>e.props?.control==='flipForward'),'Aerial controls remain competition-only');
console.log('Controls passed: responsive target budgets, preferences, independent pointers/touches, cancel/leave/blur, keyboard release propagation, assisted activation, disabled controls and side swapping. Host fixture only; visual/device checks remain pending.');
