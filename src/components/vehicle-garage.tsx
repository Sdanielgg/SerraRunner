import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
    <View style={styles.backdrop}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>GARAGEM / {vehicleList.length} VEÍCULOS</Text>
            <Text style={styles.title}>Escolhe o teu caminho.</Text>
            <Text style={styles.subtitle}>Compara a altura ao solo e a velocidade. Testa todos no mesmo percurso.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar garagem" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Fechar ×</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.cards}>
          {vehicleList.map(spec => <View key={spec.id} style={[styles.card, current === spec.id && styles.currentCard]}>
            <View style={styles.cardHeader}>
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
                <Text style={styles.testFlatText}>Circuito de corridas · HIGH</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Testar ${spec.name} na pista em Low`} onPress={() => onTest(spec.id, 'trail')} style={styles.testTrail}>
                <Text style={styles.testTrailText}>Terreno difícil · LOW</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Testar ${spec.name} no plano em High`} onPress={() => onTest(spec.id, 'garage')} style={styles.testFlat}>
                <Text style={styles.testFlatText}>Testar no plano · HIGH</Text>
              </Pressable>
            </View>
          </View>)}
        </ScrollView>
        <Text style={styles.note}>Valores aproximados em plano. A altura varia com a suspensão; podes mudar Low/High durante o teste.</Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#14261ee6', justifyContent: 'center', alignItems: 'center', padding: 20 },
  panel: { width: '100%', maxWidth: 980, maxHeight: '100%', backgroundColor: '#f1efdf', borderRadius: 24, padding: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1 },
  eyebrow: { color: '#63785d', fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#263f33', fontSize: 26, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#5b6b59', fontSize: 12, marginTop: 5 },
  close: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 14, backgroundColor: '#e0e2d2' },
  closeText: { color: '#30483d', fontSize: 12, fontWeight: '700' },
  scroll: { flexShrink: 1 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 2 },
  card: { flexGrow: 1, flexBasis: 250, padding: 16, borderWidth: 1, borderColor: '#d3d8c7', borderRadius: 18, backgroundColor: '#faf8ee', gap: 12 },
  currentCard: { borderColor: '#67805b', borderWidth: 2, padding: 15 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  category: { color: '#63715a', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  active: { color: '#4d6e42', fontSize: 8, fontWeight: '800', marginLeft: 'auto' },
  name: { color: '#263f33', fontSize: 22, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  stat: { width: '50%', gap: 3 },
  statValue: { color: '#30483d', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: '#63715a', fontSize: 10 },
  benefit: { color: '#30483d', fontSize: 12, lineHeight: 18 },
  tradeoff: { color: '#7a624d', fontSize: 11, lineHeight: 17 },
  buttons: { marginTop: 'auto', gap: 7 },
  testTrail: { minHeight: 44, borderRadius: 12, backgroundColor: '#e6bd6a', alignItems: 'center', justifyContent: 'center', padding: 10 },
  testTrailText: { color: '#3b422e', fontSize: 11, fontWeight: '800' },
  testFlat: { minHeight: 44, borderRadius: 12, backgroundColor: '#30483d', alignItems: 'center', justifyContent: 'center', padding: 10 },
  testFlatText: { color: '#f5f2dc', fontSize: 11, fontWeight: '700' },
  note: { color: '#63715a', fontSize: 10, textAlign: 'center' },
});
