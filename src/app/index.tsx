import { useCallback, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/auth-provider';
import type { CompetitionResult } from '@/auth/profile';
import { vehicles, type VehicleId } from '@/game/vehicles';
import MenuGarage, { vehiclePreviews } from '@/components/menu-garage';
import { useGameSettings } from '@/hooks/use-game-settings';

const courses = { garage: 'Condução livre', race: 'Circuito', trail: 'Todo-o-terreno', challenge: 'Desafio da Serra' };
const panels = { car:'Garagem', course:'Percurso', lobby:'Lobby online', settings:'Definições', times:'Os meus tempos' };
const yellow = '#ffd129', ink = '#202125';
function Button({title, onPress, primary, selected, disabled, large}: {title:string; onPress:()=>void; primary?:boolean; selected?:boolean; disabled?:boolean; large?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>[s.button,primary && s.primary,large && {minHeight:72},selected && s.selected,(pressed || disabled) && s.dim]}>
    <Text style={[s.buttonText,primary && s.darkText,large && {fontSize:primary?32:21}]}>{title}</Text></Pressable>;
}
export default function MainMenu() {
  const auth=useAuth();
  const {settings,loaded,saved,updateSettings}=useGameSettings();
  const [car,setCar]=useState<VehicleId>('jeep');
  const [course,setCourse]=useState<keyof typeof courses>('race');
  const [panel,setPanel]=useState<keyof typeof panels|null>(null);
  const [address,setAddress]=useState(process.env.EXPO_PUBLIC_MULTIPLAYER_URL || 'https://serrarunner.onrender.com');
  const [code,setCode]=useState('');
  const [balance,setBalance]=useState<number|null>(null);
  const [times,setTimes]=useState<CompetitionResult[]>([]);
  const [message,setMessage]=useState('');
  const authRef=useRef(auth);
  const user=auth.session?.user.id;
  // Auth actions are recreated by the provider. Refresh account data on focus or identity change.
  useFocusEffect(useCallback(()=>{ authRef.current=auth; },[auth]));
  useFocusEffect(useCallback(()=>{
    let active=true;
    setBalance(null);
    if (user) void authRef.current.balance().then(value => { if (active) setBalance(value); }).catch(() => {});
    return () => { active = false; };
  }, [user]));
  useFocusEffect(useCallback(() => {
    let active = true;
    setTimes([]);setMessage('');
    if(user && panel === 'times'){
      setMessage('A carregar tempos…');
      void authRef.current.results().then(rows=>{
        if(active){setTimes(rows.slice().sort((a,b)=>a.elapsed_ms-b.elapsed_ms));setMessage('');}
      }).catch(()=>{if(active)setMessage('Não foi possível carregar os tempos.');});
    }
    return ()=>{active=false;};
  },[user,panel]));
  const {width,height}=useWindowDimensions(), portrait=width<height, short=height<500;
  const account=()=>{setPanel(null);router.push('/account');};
  const play=(online=false,join=false)=>{
    setPanel(null);
    router.push({pathname:'/play',params:online?{mode:'online',address:address.trim(),code:join?code:'',car}:{car,course}});
  };
  const large = width >= 960 && height >= 610;
  const menuButton=(title:string,p: keyof typeof panels)=><Button large={large} title={title} onPress={()=>setPanel(p)}/>;
  return <SafeAreaView style={s.root}>
    <Image accessible={false} source={require('../../assets/menu/mountains.png')} resizeMode="stretch" style={{position:'absolute',top:0,left:0,width:'100%',height:'100%'}}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" onPress={account} style={s.profile}><Text style={s.profileIcon}>●</Text><Text numberOfLines={1} style={s.profileText}>{auth.profile?.display_name ?? (user?'A minha conta':'Visitante')}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Saldo e perfil" onPress={account} style={s.wallet}><Text style={s.coin}>◈</Text><Text style={s.profileText}>{balance ?? '—'}</Text></Pressable>
    </View>
    <View style={s.brand}><Text style={[s.ramp,{fontSize:short?31:54}]}>RAMP</Text><Text style={[s.rivals,{fontSize:short?40:70}]}>RIVALS</Text><View style={s.stripe}/></View>
    <View style={[s.stage,portrait && s.vertical]}>
      <View style={[s.rail,portrait && s.horizontal]}>{menuButton('GARAGEM','car')}{menuButton('OS MEUS TEMPOS','times')}</View>
      <View style={s.preview}><View style={s.shadow}/><Image source={vehiclePreviews[car]} accessibilityLabel={vehicles[car].name} resizeMode="contain" style={{width:'100%',height:'100%',position:'absolute'}}/></View>
      <View style={[s.rail,portrait && s.horizontal]}>{menuButton('LOBBY','lobby')}{menuButton('DEFINIÇÕES','settings')}</View>
    </View>
    <View style={s.footer}>
      <View style={s.currentCar}>
        <Text style={s.kicker}>EM USO</Text>
        <Text numberOfLines={1} style={s.value}>{vehicles[car].name}</Text>
      </View>
      <Button primary large={large} title="⚑  JOGAR" onPress={()=>play()}/>
      <Pressable accessibilityRole="button" onPress={()=>setPanel('course')} style={s.selector}><Text style={s.kicker}>PERCURSO</Text><Text numberOfLines={1} style={s.value}>{courses[course]}</Text></Pressable>
    </View>
    {panel === 'car' && <MenuGarage car={car} onChange={setCar} onClose={() => setPanel(null)}/>}
    <Modal visible={panel!==null && panel!=='car'} transparent supportedOrientations={['portrait','landscape']} onRequestClose={()=>setPanel(null)}>
      <SafeAreaView style={s.backdrop}><View style={s.sheet}><View style={s.sheetHead}><Text accessibilityRole="header" style={s.heading}>{panel && panels[panel]}</Text><Button title="Fechar" onPress={()=>setPanel(null)}/></View>
        <ScrollView contentContainerStyle={s.options}>
          {panel==='course' && (Object.keys(courses) as (keyof typeof courses)[]).map(k=><Button key={k} selected={k===course} title={courses[k]} onPress={()=>{setCourse(k);setPanel(null);}}/>)}
          {panel==='settings' && <>{([['sound','Som'],['vibration','Vibração'],['reducedGraphics','Gráficos reduzidos']] as const).map(([k,label])=><Button key={k} disabled={!loaded} selected={settings[k]} title={label+' · '+(settings[k]?'Sim':'Não')} onPress={()=>void updateSettings({[k]:!settings[k]})}/>)}{!saved && <Text>Não foi possível guardar as definições.</Text>}</>}
          {panel==='times' && (user ? <><Text>Resultados pessoais recentes, por ordem de tempo.</Text>{times.map(r=><Text key={r.id} style={s.result}>{vehicles[r.vehicle_id as VehicleId]?.name ?? r.vehicle_id} · {(r.elapsed_ms/1000).toFixed(2)} s · {r.course_id}</Text>)}{!times.length && <Text>{message || 'Ainda não terminaste uma corrida online.'}</Text>}</>:<Button title="Entrar para ver os meus tempos" onPress={account}/>)}
          {panel==='lobby' && (auth.session && auth.profile ? <><Text>Servidor</Text><TextInput style={s.input} accessibilityLabel="Endereço do servidor" value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false}/><Button disabled={!address.trim()} title="Criar sala" onPress={()=>play(true)}/><Text>Código de convite</Text><TextInput accessibilityLabel="Código de convite" style={s.input} value={code} onChangeText={v=>setCode(v.toUpperCase().replace(/[^A-F0-9]/g,''))} maxLength={8} placeholder="8 caracteres"/><Button disabled={!address.trim() || code.length!==8} title="Entrar na sala" onPress={()=>play(true,true)}/></>:<Button title="Entrar / Registar" onPress={account}/>)}
        </ScrollView></View></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
const s=StyleSheet.create({
  currentCar:{flex:1,maxWidth:280,paddingHorizontal:12},
  root:{flex:1,backgroundColor:'#dee1e7',paddingHorizontal:'4%',paddingVertical:8,overflow:'hidden'},floor:{position:'absolute',bottom:0,height:'36%',width:'100%',backgroundColor:'#f2f3f5'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},profile:{maxWidth:'65%',minHeight:44,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,backgroundColor:ink,borderBottomWidth:5,borderColor:yellow},profileIcon:{color:yellow,fontSize:25},profileText:{color:'white',fontWeight:'800',fontSize:17,flexShrink:1},wallet:{minHeight:44,paddingHorizontal:16,flexDirection:'row',gap:9,alignItems:'center',backgroundColor:ink,borderRadius:12},coin:{color:yellow,fontSize:23},
  brand:{alignItems:'center'},ramp:{color:ink,fontWeight:'900',letterSpacing:2,includeFontPadding:false},rivals:{color:'#f4bd00',fontWeight:'900',letterSpacing:3,includeFontPadding:false,marginTop:-7},stripe:{height:4,width:'24%',backgroundColor:ink,transform:[{skewX:'-22deg'}]},
  stage:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},vertical:{flexDirection:'column',paddingVertical:12},rail:{gap:10,width:'24%'},horizontal:{width:'100%',flexDirection:'row',justifyContent:'space-evenly'},preview:{flex:1,alignSelf:'stretch',alignItems:'center',justifyContent:'flex-end'},shadow:{width:'59%',height:'8%',borderRadius:100,backgroundColor:'#b9bdc4',marginBottom:'6%'},
  button:{minHeight:45,justifyContent:'center',alignItems:'center',paddingHorizontal:12,paddingVertical:7,backgroundColor:ink,borderBottomWidth:4,borderRightWidth:4,borderColor:yellow,transform:[{skewX:'-7deg'}]},buttonText:{color:'white',fontWeight:'900',textAlign:'center',transform:[{skewX:'7deg'}]},primary:{backgroundColor:yellow,borderColor:'#c99800',minWidth:'26%',borderRadius:8,minHeight:52},darkText:{color:ink,fontSize:21},selected:{backgroundColor:'#4e514a',borderLeftWidth:6},dim:{opacity:.55},
  footer:{flexDirection:'row',alignItems:'center',justifyContent:'space-evenly',gap:8,paddingVertical:4},selector:{flex:1,maxWidth:280,minHeight:48,justifyContent:'center',paddingHorizontal:12,backgroundColor:'#fafafa',borderColor:'#c0c4ce',borderWidth:1,borderBottomWidth:4,borderRadius:8},kicker:{fontSize:10,fontWeight:'800',letterSpacing:1,color:'#535762'},value:{fontSize:15,color:ink,fontWeight:'800'},
  backdrop:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#14171bdc',padding:12},sheet:{maxHeight:'96%',width:'100%',maxWidth:540,backgroundColor:'#f2f3f5',padding:18,borderTopWidth:5,borderColor:yellow},sheetHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},heading:{fontWeight:'900',color:ink,fontSize:23},options:{padding:6,paddingTop:14,gap:10},input:{borderWidth:1,borderColor:'#989ca5',backgroundColor:'#fff',minHeight:44,padding:9,color:ink},result:{fontWeight:'600',paddingVertical:4},
});
