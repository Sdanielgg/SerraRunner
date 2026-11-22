import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameUI as ui } from '@/constants/game-ui';
import { formatRaceTime, type ChallengeStatus } from '@/game/challenge-run';
import { vehicles } from '@/game/vehicles';

export function ChallengeHud({ status, compact = false }: { status: ChallengeStatus; compact?: boolean }) {
  if (status.phase === 'idle') return null;
  return <View style={[styles.hud, compact && styles.compactHud]} pointerEvents="none">
    <View style={styles.timeRow}><Text style={[styles.time, compact && styles.compactTime]}>{formatRaceTime(status.elapsed)}</Text><Text style={styles.detail}>CP {status.passed}/{status.total}</Text></View>
    {!compact && <Text style={styles.detail}>{vehicles[status.vehicleId].name}</Text>}
    <View style={styles.track}><View style={[styles.progress, { width: `${status.passed / status.total * 100}%` }]} /></View>
    <Text style={styles.next} numberOfLines={compact ? 1 : 2}>{status.next} · {Math.round(status.distance)} m</Text>
    <Text style={styles.detail}>Penalização +{status.recoveries * 5} s · {status.recoveries} reposições</Text>
  </View>;
}

export function ChallengeOverlay({ status, onReplay, onLeave, onChooseCar }: { status: ChallengeStatus; onReplay: () => void; onLeave: () => void; onChooseCar: () => void }) {
  return <>
    {status.phase === 'countdown' && <View pointerEvents="none" style={styles.countdown}>
      <Text style={styles.countdownLabel}>PREPARA-TE</Text><Text style={styles.countdownNumber}>{Math.ceil(status.countdown)}</Text>
      <Text style={styles.countdownHint}>Segue os arcos amarelos até à meta.</Text>
    </View>}
    <Modal visible={status.phase === 'finished'} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onLeave}>
      <SafeAreaView style={styles.backdrop}><View style={styles.result}><ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
        <Text style={styles.detail}>DESAFIO DA SERRA</Text>
        <Text accessibilityRole="header" style={styles.title}>Meta alcançada.</Text>
        <Text style={styles.resultTime}>{formatRaceTime(status.elapsed)}</Text>
        <Text style={styles.next}>{status.total}/{status.total} checkpoints · {status.recoveries} reposições</Text>
        <Text style={styles.next}>{vehicles[status.vehicleId].name} · melhor nesta sessão: {formatRaceTime(status.best ?? status.elapsed)}</Text>
        <Pressable accessibilityRole="button" onPress={onReplay} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Tentar outra vez</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onChooseCar} style={styles.secondary}><Text style={styles.secondaryText}>Escolher outro carro</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondary}><Text style={styles.secondaryText}>Voltar à condução livre</Text></Pressable>
      </ScrollView></View></SafeAreaView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  hud: { marginTop: 12, gap: 5 },
  compactHud: { marginTop: 6, gap: 3 }, compactTime: { fontSize: 22 },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  time: { color: ui.text, fontSize: 27, fontWeight: '500', fontVariant: ['tabular-nums'], letterSpacing: -.7 },
  detail: { color: ui.muted, fontSize: 11, fontWeight: '600', letterSpacing: .3 },
  track: { height: 3, backgroundColor: ui.border, borderRadius: 2, overflow: 'hidden', marginVertical: 3 },
  progress: { height: '100%', backgroundColor: ui.accent },
  next: { color: ui.muted, fontSize: 11, lineHeight: 17 },
  countdown: { position: 'absolute', top: '38%', left: 12, right: 12, alignItems: 'center' },
  countdownLabel: { color: ui.text, backgroundColor: ui.overlay, padding: 7, fontSize: 12, letterSpacing: 2 },
  countdownNumber: { color: ui.accent, fontSize: 76, fontWeight: '700', backgroundColor: ui.overlay, minWidth: 106, textAlign: 'center', borderRadius: 8, marginVertical: 5 },
  countdownHint: { color: ui.text, backgroundColor: ui.overlay, padding: 7, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: '#080b0de6', justifyContent: 'center', alignItems: 'center', padding: 16 },
  result: { width: '100%', maxWidth: 420, maxHeight: '100%', borderWidth: 1, borderColor: ui.border, borderTopColor: ui.accent, borderRadius: 12, backgroundColor: ui.background },
  resultScroll: { flexShrink: 1 },
  resultContent: { padding: 22, gap: 10 },
  title: { color: ui.text, fontSize: 27, fontWeight: '500' },
  resultTime: { color: ui.accent, fontSize: 42, fontVariant: ['tabular-nums'], fontWeight: '500' },
  primary: { minHeight: 44, padding: 12, borderRadius: 6, backgroundColor: ui.accent, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryText: { color: ui.ink, fontSize: 13, fontWeight: '600' },
  secondary: { minHeight: 44, padding: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: ui.text, fontSize: 13 },
  pressed: { opacity: .75 },
});
