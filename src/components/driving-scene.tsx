import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type PointerEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controls, emptyControls, type Gearing } from '@/game/physics';
import { createScene } from '@/game/scene';
import { createTouchControls } from '@/game/touch-controls';

type Scene = ReturnType<typeof createScene>;
type ControlKey = keyof Controls;

export default function DrivingScene() {
  const insets = useSafeAreaInsets();
  const touch = useRef(emptyControls());
  const fingers = useRef(createTouchControls());
  const [pressedControls, setPressedControls] = useState(emptyControls);
  const keyboard = useRef(emptyControls());
  const scene = useRef<Scene | null>(null);
  const animation = useRef(0);
  const running = useRef(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [telemetry, setTelemetry] = useState({ speed: 0, reverse: false });
  const [camera, setCamera] = useState(0);
  const gearingRef = useRef<Gearing>('high');
  const [gearing, setGearing] = useState<Gearing>('high');
  const selectGearing = useCallback((value: Gearing) => {
    gearingRef.current = value;
    setGearing(value);
  }, []);
  const clearInput = useCallback(() => {
    touch.current = fingers.current.clear(); keyboard.current = emptyControls();
    scene.current?.cancelCameraDrag();
    setPressedControls(touch.current);
  }, []);
  const reset = useCallback(() => { clearInput(); scene.current?.reset(); setTelemetry({ speed: 0, reverse: false }); }, [clearInput]);
  const startTrail = useCallback(() => {
    clearInput(); scene.current?.startTrail(); selectGearing('low'); setTelemetry({ speed: 0, reverse: false });
  }, [clearInput, selectGearing]);
  const toggleCamera = useCallback(() => {
    const mode = scene.current?.toggleCamera();
    if (mode !== undefined) setCamera(mode);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      running.current = state === 'active'; clearInput();
    });
    if (Platform.OS !== 'web') return () => subscription.remove();
    const keyMap: Record<string, ControlKey> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'throttle', w: 'throttle', ArrowDown: 'reverse', s: 'reverse', ' ': 'brake' };
    const keyDown = (event: KeyboardEvent) => {
      const key = keyMap[event.key] ?? keyMap[event.key.toLowerCase()];
      if (key) { event.preventDefault(); keyboard.current[key] = true; }
      if (event.key.toLowerCase() === 'r' && !event.repeat) reset();
      if (event.key.toLowerCase() === 'l') selectGearing('low');
      if (event.key.toLowerCase() === 'h') selectGearing('high');
      if (event.key.toLowerCase() === 'c' && !event.repeat) toggleCamera();
      if (event.key.toLowerCase() === 't' && !event.repeat) startTrail();
    };
    const keyUp = (event: KeyboardEvent) => {
      const key = keyMap[event.key] ?? keyMap[event.key.toLowerCase()];
      if (key) { event.preventDefault(); keyboard.current[key] = false; }
    };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', clearInput);
    return () => {
      subscription.remove(); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clearInput);
    };
  }, [clearInput, reset, selectGearing, startTrail, toggleCamera]);
  useEffect(() => () => { cancelAnimationFrame(animation.current); scene.current?.dispose(); scene.current = null; }, []);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    cancelAnimationFrame(animation.current); scene.current?.dispose();
    try {
      const world = createScene(gl); scene.current = world;
      setCamera(0);
      let previous = 0; let lastUpdate = 0;
      const frame = (time: number) => {
        try {
          const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 1 / 60; previous = time;
          if (running.current) {
            const controls = emptyControls();
            (Object.keys(controls) as ControlKey[]).forEach(key => { controls[key] = touch.current[key] || keyboard.current[key]; });
            const info = world.frame(dt, controls, gearingRef.current);
            if (time - lastUpdate > 120) { setTelemetry(info); lastUpdate = time; }
          }
          animation.current = requestAnimationFrame(frame);
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro ao desenhar a cena.'); }
      };
      animation.current = requestAnimationFrame(frame); setReady(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'O dispositivo não conseguiu iniciar o 3D.'); }
  }, []);

  function pedal(control: ControlKey, symbol: string, label: string, accent = false) {
    const press = (identifier: number) => {
      touch.current = fingers.current.press(identifier, control);
      setPressedControls(touch.current);
    };
    const release = (identifier: number) => {
      touch.current = fingers.current.release(identifier);
      setPressedControls(touch.current);
    };
    // Raw touch events let several buttons receive different fingers without
    // competing for the single responder used by Pressable.
    return <View accessibilityRole="button" accessibilityLabel={label}
      {...(Platform.OS === 'web' ? {
        onPointerDown: (event: PointerEvent) => press(event.nativeEvent.pointerId),
        onPointerUp: (event: PointerEvent) => release(event.nativeEvent.pointerId),
        onPointerCancel: (event: PointerEvent) => release(event.nativeEvent.pointerId),
        onPointerLeave: (event: PointerEvent) => release(event.nativeEvent.pointerId),
      } : {
        onTouchStart: (event: GestureResponderEvent) => press(event.nativeEvent.identifier),
        onTouchEnd: (event: GestureResponderEvent) => release(event.nativeEvent.identifier),
        onTouchCancel: (event: GestureResponderEvent) => release(event.nativeEvent.identifier),
      })}
      style={[styles.pedal, accent && styles.accelerator, pressedControls[control] && styles.pressed]}>
      <View pointerEvents="none" style={styles.pedalContent}>
        <Text style={[styles.symbol, accent && styles.darkText]}>{symbol}</Text>
        <Text style={[styles.pedalLabel, accent && styles.darkText]}>{label}</Text>
      </View>
    </View>;
  }
  return <View style={styles.container}>
    <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={4} />
    {camera === 2 && <View style={[StyleSheet.absoluteFill, styles.lookSurface]}
      accessibilityLabel="Arrasta para rodar a câmara livre à volta do jeep"
      {...(Platform.OS === 'web' ? {
        onPointerDown: (event: PointerEvent) => {
          event.preventDefault();
          scene.current?.beginCameraDrag(event.nativeEvent.pointerId, event.nativeEvent.clientX, event.nativeEvent.clientY);
        },
        onPointerMove: (event: PointerEvent) => scene.current?.moveCameraDrag(event.nativeEvent.pointerId, event.nativeEvent.clientX, event.nativeEvent.clientY),
        onPointerUp: (event: PointerEvent) => scene.current?.endCameraDrag(event.nativeEvent.pointerId),
        onPointerCancel: (event: PointerEvent) => scene.current?.endCameraDrag(event.nativeEvent.pointerId),
        onPointerLeave: (event: PointerEvent) => scene.current?.endCameraDrag(event.nativeEvent.pointerId),
      } : {
        onTouchStart: (event: GestureResponderEvent) => {
          const point = event.nativeEvent.changedTouches[0];
          if (point) scene.current?.beginCameraDrag(point.identifier, point.pageX, point.pageY);
        },
        onTouchMove: (event: GestureResponderEvent) => {
          event.nativeEvent.changedTouches.forEach(point => scene.current?.moveCameraDrag(point.identifier, point.pageX, point.pageY));
        },
        onTouchEnd: (event: GestureResponderEvent) => {
          event.nativeEvent.changedTouches.forEach(point => scene.current?.endCameraDrag(point.identifier));
        },
        onTouchCancel: () => scene.current?.cancelCameraDrag(),
      })} />}
    <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 18), paddingLeft: Math.max(insets.left, 20), paddingRight: Math.max(insets.right, 20) }]}>
      <View style={styles.top} pointerEvents="box-none">
        <View pointerEvents="box-none">
        <View pointerEvents="none"><Text style={styles.eyebrow}>SERRA / GARAGEM 01</Text><Text style={styles.title}>Terra livre.</Text><View style={styles.badge}><View style={styles.dot} /><Text style={styles.badgeText}>JEEP LOW POLY · CONDUÇÃO LIVRE</Text></View></View>
          <View style={styles.gearingSelector}>
            {(['low', 'high'] as const).map(value => (
              <Pressable key={value} accessibilityRole="button"
                accessibilityLabel={value === 'low' ? 'Low: mais força, menor velocidade' : 'High: maior velocidade'}
                accessibilityState={{ selected: gearing === value }}
                onPress={() => selectGearing(value)}
                style={[styles.gearingOption, gearing === value && styles.gearingSelected]}>
                <Text style={[styles.gearingLabel, gearing === value && styles.darkText]}>{value === 'low' ? 'LOW' : 'HIGH'}</Text>
                <Text style={[styles.gearingDetail, gearing === value && styles.darkText]}>{value === 'low' ? 'Mais força' : 'Mais velocidade'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mudar câmara" onPress={toggleCamera} style={styles.action}><Text style={styles.actionText}>{['Câmara 1', 'Câmara 2', 'Livre · arrastar'][camera]}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Ir para a pista de terreno difícil" onPress={startTrail} style={styles.action}><Text style={styles.actionText}>Testar terreno</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Repor carro" onPress={reset} style={styles.action}><Text style={styles.actionText}>↺ Repor</Text></Pressable>
        </View>
      </View>
      {!ready || error.length > 0 ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>
            {error ? `Não foi possível iniciar o 3D. ${error}` : 'A preparar o jeep…'}
          </Text>
        </View>
      ) : null}
      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.controls} pointerEvents="box-none">
          <View style={styles.cluster}>{pedal('left', '‹', 'Esquerda')}{pedal('right', '›', 'Direita')}</View>
          <View style={styles.readout} pointerEvents="none"><Text style={styles.speed}>{Math.round(telemetry.speed).toString().padStart(2, '0')}<Text style={styles.unit}> km/h</Text></Text><Text style={styles.gear}>{telemetry.reverse ? 'R · MARCHA-ATRÁS' : 'D · TRAÇÃO 4×4'}</Text></View>
          <View style={styles.cluster}>{pedal('reverse', '↓', 'Recuar')}{pedal('brake', 'Ⅱ', 'Travar')}{pedal('throttle', '↑', 'Acelerar', true)}</View>
        </View>
        <Text style={styles.hint} pointerEvents="none">{camera === 2 ? 'Arrasta na zona livre do ecrã para rodar a câmara à volta do jeep.' : Platform.OS === 'web' ? 'WASD / setas · Espaço trava · L / H gearing · C câmara · T terreno · R repor' : 'Testar terreno: rampas, lombas e subida inclinada. Usa LOW para mais força.'}</Text>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#c8d7ce' },
  lookSurface: { touchAction: 'none' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  eyebrow: { color: '#3b5149', fontSize: 10, fontWeight: '700', letterSpacing: 3 },
  title: { color: '#223b32', fontSize: 34, fontWeight: '800', letterSpacing: -1.5, marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#547658' },
  badgeText: { color: '#40574c', fontSize: 8, fontWeight: '700', letterSpacing: 1.1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { backgroundColor: '#f5f3e5dc', borderRadius: 22, paddingVertical: 12, paddingHorizontal: 15, borderWidth: 1, borderColor: '#ffffff80' },
  actionText: { color: '#30483d', fontSize: 11, fontWeight: '700' },
  bottom: { gap: 12 },
  gearingSelector: { alignSelf: 'flex-start', marginTop: 12, flexDirection: 'row', gap: 4, padding: 4, borderRadius: 18, backgroundColor: '#273f37e8' },
  gearingOption: { minWidth: 104, minHeight: 48, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  gearingSelected: { backgroundColor: '#e6bd6a' },
  gearingLabel: { color: '#f5f2dc', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  gearingDetail: { color: '#e7ecdc', fontSize: 9 },
  readout: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  speed: { fontSize: 38, fontWeight: '800', color: '#263f33', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  unit: { fontSize: 12, fontWeight: '500', letterSpacing: 0 },
  gear: { color: '#405747', fontSize: 8, fontWeight: '700', letterSpacing: 2, marginTop: 3 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 },
  cluster: { flexDirection: 'row', gap: 6 },
  pedal: { width: 50, height: 72, borderRadius: 17, backgroundColor: '#273f37e8', borderWidth: 1, borderColor: '#ffffff25', justifyContent: 'center', alignItems: 'center', gap: 3 },
  accelerator: { backgroundColor: '#e6bd6a', height: 88, borderColor: '#fff2c0' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  pedalContent: { alignItems: 'center', gap: 3 },
  symbol: { color: '#f5f2dc', fontSize: 30, lineHeight: 33, fontWeight: '400' },
  pedalLabel: { color: '#e7ecdc', fontSize: 8, fontWeight: '600' },
  darkText: { color: '#3b422e' },
  hint: { textAlign: 'center', fontSize: 9, color: '#445b4d' },
  message: { alignSelf: 'center', backgroundColor: '#f5f3e5ee', borderRadius: 18, padding: 20, maxWidth: 350 },
  messageText: { color: '#30483d', textAlign: 'center' },
});
