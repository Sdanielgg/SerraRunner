import { GameUI as ui } from '@/constants/game-ui';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { groundClearance, vehicleList, type VehicleId } from '@/game/vehicles';
import type { TestLocation } from '@/game/network-types';

type Props = {
  visible: boolean;
  current: VehicleId;
  onClose: () => void;
  onTest: (id: VehicleId, location: TestLocation) => void;
};

export default function VehicleGarage({ visible, current, onClose, onTest }: Props) {
  return <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
    <SafeAreaView style={styles.backdrop}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>SERRA RUNNER / {vehicleList.length} VEÍCULOS</Text>
            <Text style={styles.title}>Garagem</Text>
            <Text style={styles.subtitle}>Escolhe o veículo e onde queres conduzir.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar garagem" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Fechar</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.cards}>
          {vehicleList.map((spec, index) => <View key={spec.id} style={[styles.card, current === spec.id && styles.currentCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={[styles.swatch, { backgroundColor: spec.color }]} />
              <Text style={styles.category}>{spec.category.toUpperCase()}</Text>
              {current === spec.id && <Text style={styles.active}>EM USO</Text>}
            </View>
            <Text style={styles.name}>{spec.name}</Text>
            <View style={styles.stats}>
              <View style={styles.stat}><Text style={styles.statValue}>≈ {Math.round(groundClearance(spec) * 100)} cm</Text><Text style={styles.statLabel}>Altura ao solo</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{Math.round(spec.high.forwardLimit * 3.6)} km/h</Text><Text style={styles.statLabel}>Máxima em High</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{Math.round(spec.low.forwardLimit * 3.6)} km/h</Text><Text style={styles.statLabel}>Máxima em Low</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{Math.round(spec.suspensionTravel * 100)} cm</Text><Text style={styles.statLabel}>Curso de suspensão</Text></View>
            </View>
            <Text style={styles.benefit}>{spec.benefit}</Text>
            <Text style={styles.tradeoff}>{spec.tradeoff}</Text>
            <View style={styles.buttons}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Testar ${spec.name} no circuito de corridas em High`} onPress={() => onTest(spec.id, 'race')} style={styles.testFlat}>
                <Text style={styles.testFlatText}>Circuito →</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Testar ${spec.name} na pista em Low`} onPress={() => onTest(spec.id, 'trail')} style={styles.testTrail}>
                <Text style={styles.testTrailText}>Todo-o-terreno →</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Testar ${spec.name} no plano em High`} onPress={() => onTest(spec.id, 'garage')} style={styles.testFlat}>
                <Text style={styles.testFlatText}>Condução livre →</Text>
              </Pressable>
            </View>
          </View>)}
        </ScrollView>
        <Text style={styles.note}>Valores aproximados em plano. A altura varia com a suspensão; podes mudar Low/High durante o teste.</Text>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#080b0de6', justifyContent: 'center', alignItems: 'center', padding: 20 },
  panel: { width: '100%', maxWidth: 1040, maxHeight: '100%', borderWidth: 1, borderColor: ui.border, backgroundColor: ui.background, borderRadius: 12, padding: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1 },
  eyebrow: { color: ui.muted, fontSize: 10, fontWeight: '600', letterSpacing: 2 },
  title: { color: ui.text, fontSize: 26, fontWeight: '600', marginTop: 4 },
  subtitle: { color: ui.muted, fontSize: 13, marginTop: 5 },
  close: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 6, backgroundColor: ui.raised },
  closeText: { color: ui.text, fontSize: 13, fontWeight: '700' },
  scroll: { flexShrink: 1 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 2 },
  card: { flexGrow: 1, flexShrink: 1, flexBasis: 270, maxWidth: '100%', padding: 16, borderWidth: 1, borderColor: ui.border, borderRadius: 8, backgroundColor: ui.surface, gap: 12 },
  currentCard: { borderColor: ui.accent, borderWidth: 1, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  number: { color: ui.muted, fontSize: 12, fontVariant: ['tabular-nums'], marginRight: 4 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  category: { color: ui.muted, fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  active: { color: ui.accent, fontSize: 10, fontWeight: '600', marginLeft: 'auto' },
  name: { color: ui.text, fontSize: 22, fontWeight: '600' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: ui.border },
  stat: { width: '50%', gap: 3 },
  statValue: { color: ui.text, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statLabel: { color: ui.muted, fontSize: 10 },
  benefit: { color: ui.text, fontSize: 13, lineHeight: 20 },
  tradeoff: { color: ui.muted, fontSize: 12, lineHeight: 17 },
  buttons: { marginTop: 'auto', gap: 7 },
  testTrail: { minHeight: 44, borderRadius: 6, backgroundColor: ui.accent, alignItems: 'center', justifyContent: 'center', padding: 10 },
  testTrailText: { color: ui.ink, fontSize: 12, fontWeight: '600' },
  testFlat: { minHeight: 44, borderRadius: 6, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.raised, alignItems: 'center', justifyContent: 'center', padding: 10 },
  testFlatText: { color: ui.text, fontSize: 12, fontWeight: '700' },
  note: { color: ui.muted, fontSize: 10, lineHeight: 16 },
});
