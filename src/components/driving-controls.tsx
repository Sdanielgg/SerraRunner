import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type PointerEvent } from 'react-native';
import { GameUI as ui } from '@/constants/game-ui';
import { controlKeys, type Controls } from '@/game/physics';
import { drivingControlLayout, type ControlPreferences } from '@/game/control-layout';

type Props = {
  availableWidth: number; height: number; preferences: ControlPreferences; pressed: Controls;
  speed: number; reverse: boolean; showAir: boolean; disabled: boolean;
  onHold: (identifier: number, control: keyof Controls) => void; onRelease: (identifier: number) => void;
  onHorn: (pressed: boolean) => void; hornPressed: boolean;
};
type KeyEvent = { nativeEvent: { key: string }; preventDefault: () => void; stopPropagation: () => void };
type HoldProps = Pick<Props, 'onHold' | 'onRelease'> & { control: keyof Controls; label: string; symbol: string; width: number; height: number; active: boolean; disabled: boolean; accent?: boolean; brake?: boolean };

function HoldButton({ control, label, symbol, width, height, active, disabled, accent, brake, onHold, onRelease }: HoldProps) {
  const lastActivation = useRef(0);
  const virtualId = -1000 - controlKeys.indexOf(control);
  const latchedId = -2000 - controlKeys.indexOf(control);
  const activate = () => {
    if (disabled || Date.now() - lastActivation.current < 250) return;
    lastActivation.current = Date.now();
    if (active) onRelease(latchedId); else onHold(latchedId, control);
  };
  const press = (identifier: number) => { if (!disabled) onHold(identifier, control); };
  const key = (event: KeyEvent, down: boolean) => {
    if (event.nativeEvent.key !== ' ' && event.nativeEvent.key !== 'Enter') return;
    event.preventDefault(); if (down) event.stopPropagation();
    if (down) press(virtualId); else onRelease(virtualId);
  };
  return <View accessible focusable={!disabled} accessibilityRole="button" accessibilityLabel={label}
    accessibilityHint="Mantém premido. Com leitor de ecrã, ativa para ligar ou desligar."
    accessibilityState={{ disabled, selected: active }} accessibilityActions={[{ name: 'activate', label: active ? 'Desligar' : 'Ligar' }]}
    onAccessibilityTap={activate} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') activate(); }}
    {...(Platform.OS === 'web' ? {
      tabIndex: disabled ? -1 : 0,
      onClick: (event: GestureResponderEvent) => { if ((event.nativeEvent as typeof event.nativeEvent & { detail?: number }).detail === 0) activate(); },
      onKeyDown: (event: KeyEvent) => key(event, true), onKeyUp: (event: KeyEvent) => key(event, false), onBlur: () => onRelease(virtualId),
      onPointerDown: (event: PointerEvent) => { event.preventDefault(); press(event.nativeEvent.pointerId); },
      onPointerUp: (event: PointerEvent) => onRelease(event.nativeEvent.pointerId),
      onPointerCancel: (event: PointerEvent) => onRelease(event.nativeEvent.pointerId),
      onPointerLeave: (event: PointerEvent) => onRelease(event.nativeEvent.pointerId),
    } : {
      onTouchStart: (event: GestureResponderEvent) => event.nativeEvent.changedTouches.forEach(touch => press(touch.identifier)),
      onTouchEnd: (event: GestureResponderEvent) => event.nativeEvent.changedTouches.forEach(touch => onRelease(touch.identifier)),
      onTouchCancel: (event: GestureResponderEvent) => event.nativeEvent.changedTouches.forEach(touch => onRelease(touch.identifier)),
    })}
    style={[styles.button, { width, height }, accent && styles.accelerator, brake && styles.brake, active && styles.active, disabled && styles.disabled]}>
    <View pointerEvents="none" style={styles.buttonContent}>
      <Text style={[styles.symbol, height <= 60 && styles.utilitySymbol, accent && styles.ink]}>{symbol}</Text>
      <Text numberOfLines={2} style={[styles.label, accent && styles.ink]}>{label}</Text>
    </View>
  </View>;
}

export default function DrivingControls(props: Props) {
  const layout = drivingControlLayout(props.availableWidth, props.height, props.preferences.size);
  const hold = (control: keyof Controls, symbol: string, label: string, height: number, accent = false, brake = false) => <HoldButton key={control} control={control} symbol={symbol} label={label} width={layout.button} height={height} accent={accent} brake={brake} active={!!props.pressed[control]} disabled={props.disabled} onHold={props.onHold} onRelease={props.onRelease} />;
  const steering = <View testID="steering-zone" style={styles.thumbZone} pointerEvents="auto">
    {props.showAir && <View style={styles.row}>{hold('flipBackward', '↶', 'Rodar atrás', layout.utilityHeight)}{hold('flipForward', '↷', 'Rodar frente', layout.utilityHeight)}</View>}
    <View style={styles.row}>{hold('left', '←', 'Esquerda', layout.steeringHeight)}{hold('right', '→', 'Direita', layout.steeringHeight)}</View>
  </View>;
  const pedals = <View testID="pedal-zone" style={styles.thumbZone} pointerEvents="auto">
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manter buzina"
        accessibilityHint="Mantém premido para prolongar o som"
        disabled={props.disabled}
        onPressIn={() => props.onHorn(true)}
        onPressOut={() => props.onHorn(false)}
        style={({ pressed }) => [styles.button, { width: layout.button, height: layout.utilityHeight }, (pressed || props.hornPressed) && styles.active, props.disabled && styles.disabled]}
      ><Text style={styles.hornLabel}>Buzina</Text></Pressable>
    </View>
    <View style={[styles.row, styles.pedalRow]}>{hold('brake', 'Ⅱ', 'Travar / recuar', layout.pedalHeight, false, true)}{hold('throttle', '↑', 'Acelerar', layout.pedalHeight, true)}</View>
  </View>;
  const dock = <View testID="speed-zone" style={[styles.dock, { width: layout.stacked ? undefined : layout.dockWidth }, layout.stacked && styles.stackedDock]} pointerEvents="auto">
    <View pointerEvents="none" style={styles.speedRow}><Text style={styles.speed}>{Math.round(props.speed).toString().padStart(2, '0')}</Text><View><Text style={styles.unit}>km/h</Text>{props.reverse && <Text style={styles.range}>R</Text>}</View></View>
  </View>;
  return <View style={styles.root} pointerEvents="box-none">
    {layout.stacked && dock}
    <View style={styles.drivingRow} pointerEvents="box-none">
      {props.preferences.swapped ? pedals : steering}
      {!layout.stacked && dock}
      {props.preferences.swapped ? steering : pedals}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 12 }, drivingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  thumbZone: { gap: 10 }, row: { flexDirection: 'row', gap: 12 }, pedalRow: { alignItems: 'flex-end' },
  button: { borderRadius: 16, borderWidth: 2, borderColor: '#647078', backgroundColor: '#192024ee', justifyContent: 'center', alignItems: 'center', ...{ touchAction: 'none', userSelect: 'none' } },
  buttonContent: { alignItems: 'center', gap: 2 }, accelerator: { backgroundColor: ui.accent, borderColor: '#ffe1a8' },
  brake: { borderColor: '#df9c8e', backgroundColor: '#3a2927ee' }, active: { borderColor: '#ffffff', borderWidth: 3 }, disabled: { opacity: 0.4 },
  symbol: { color: ui.text, fontSize: 28, lineHeight: 30, fontWeight: '700' }, utilitySymbol: { fontSize: 20, lineHeight: 22 }, label: { color: ui.text, fontSize: 11, lineHeight: 13, fontWeight: '600', textAlign: 'center' },
  hornLabel: { color: ui.text, fontSize: 12, fontWeight: '600' }, ink: { color: ui.ink },
  dock: { gap: 10, alignItems: 'center' }, stackedDock: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  speedRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: ui.overlay, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  speed: { color: ui.text, fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] }, unit: { color: ui.text, fontSize: 11 }, range: { color: ui.text, fontSize: 12, fontWeight: '700' },
});
