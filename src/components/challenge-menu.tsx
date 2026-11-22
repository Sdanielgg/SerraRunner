import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameUI as ui } from '@/constants/game-ui';
import { challengeGates, challengeLength } from '@/game/challenge-course';
import { formatRaceTime } from '@/game/challenge-run';
import { vehicleList, vehicles, type VehicleId } from '@/game/vehicles';

type Props = {
  visible: boolean; selected: VehicleId; bestByVehicle: Partial<Record<VehicleId, number>>;
  onSelect: (id: VehicleId) => void; onStart: (id: VehicleId) => void; onClose: () => void;
};
export default function ChallengeMenu({ visible, selected, bestByVehicle, onSelect, onStart, onClose }: Props) {
  return <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
    <SafeAreaView style={styles.backdrop}><View style={styles.panel}>
      <View style={styles.header}><View style={styles.heading}>
        <Text style={styles.eyebrow}>DESAFIO DA SERRA / A SOLO</Text><Text accessibilityRole="header" style={styles.title}>Escolhe o teu carro.</Text>
        <Text style={styles.description}>{Math.round(challengeLength)} m · {challengeGates.length} checkpoints · tempos por veículo</Text>
      </View><Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.text}>Fechar</Text></Pressable></View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.description}>Chicane, túnel, ponte estreita, lombas, slalom e duas rampas. Os quatro carros podem completar a mesma volta; trava antes das zonas técnicas.</Text>
        <View style={styles.grid}>
          {vehicleList.map(spec => <Pressable key={spec.id} accessibilityRole="radio" accessibilityLabel={`Escolher ${spec.name}`} accessibilityState={{ checked: selected === spec.id }} onPress={() => onSelect(spec.id)} style={({ pressed }) => [styles.car, selected === spec.id && styles.selected, pressed && styles.pressed]}>
            <View style={styles.row}><View style={[styles.swatch, { backgroundColor: spec.color }]} /><Text style={styles.category}>{spec.category}</Text><Text style={styles.indicator}>{selected === spec.id ? '●' : '○'}</Text></View>
            <Text style={styles.name}>{spec.name}</Text>
            <Text style={styles.description}>{Math.round(spec.high.forwardLimit * 3.6)} km/h · {spec.id === 'gt3' ? 'Baixo: doseia a velocidade nas rampas.' : spec.id === 'crawler' ? 'Mais altura; cuidado nas curvas.' : spec.id === 'rally' ? 'Rápido e baixo; trava nas lombas.' : 'Equilíbrio entre ritmo e obstáculos.'}</Text>
            <Text style={styles.best}>{bestByVehicle[spec.id] === undefined ? 'Ainda sem tempo nesta sessão' : `Melhor: ${formatRaceTime(bestByVehicle[spec.id]!)}`}</Text>
          </Pressable>)}
        </View>
        <Text style={styles.description}>Repor no último checkpoint soma 5 s. Escolher outro carro inicia uma nova tentativa.</Text>
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={() => onStart(selected)} style={({ pressed }) => [styles.start, pressed && styles.pressed]}><Text style={styles.startText}>Iniciar com {vehicles[selected].name}</Text></Pressable>
    </View></SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#080b0de6', justifyContent: 'center', alignItems: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: 700, maxHeight: '100%', padding: 20, gap: 14, backgroundColor: ui.background, borderWidth: 1, borderColor: ui.border, borderRadius: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1, gap: 6 },
  eyebrow: { color: ui.muted, fontSize: 9, letterSpacing: 1.5 },
  title: { color: ui.text, fontSize: 25, fontWeight: '500' },
  close: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: ui.raised, borderRadius: 6 },
  text: { color: ui.text, fontSize: 12 },
  scroll: { flexShrink: 1 },
  content: { gap: 14, paddingBottom: 4 },
  description: { color: ui.muted, fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  car: { flexGrow: 1, flexShrink: 1, flexBasis: 260, maxWidth: '100%', borderWidth: 1, borderColor: ui.border, borderRadius: 8, padding: 14, backgroundColor: ui.surface, gap: 8 },
  selected: { borderColor: ui.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  category: { color: ui.muted, fontSize: 10, flex: 1 },
  indicator: { color: ui.accent, fontSize: 16 },
  name: { color: ui.text, fontSize: 20, fontWeight: '500' },
  best: { color: ui.accent, fontSize: 11, fontVariant: ['tabular-nums'] },
  start: { minHeight: 44, padding: 12, borderRadius: 6, backgroundColor: ui.accent, alignItems: 'center', justifyContent: 'center' },
  startText: { color: ui.ink, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: .75 },
});
