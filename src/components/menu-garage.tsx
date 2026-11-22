import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Animated, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { vehicleList, type VehicleId } from '@/game/vehicles';
import { upgradeEffect, upgradeKinds, upgradeRules, type UpgradeLevels } from '@/game/upgrades';

export const vehiclePreviews = {
  jeep: require('../../assets/menu/jeep.png'),
  crawler: require('../../assets/menu/crawler.png'),
  rally: require('../../assets/menu/rally.png'),
  gt3: require('../../assets/menu/gt3.png'),
};

export default function MenuGarage({ car, balance, levels, onChange, onClose }: {
  car: VehicleId; balance: number | null; levels?: UpgradeLevels; onChange: (car: VehicleId) => void; onClose: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [offset] = useState(() => new Animated.Value(0));
  const [moving, setMoving] = useState(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const portrait = screenWidth < screenHeight;
  const compact = screenWidth < 700;
  const index = vehicleList.findIndex(vehicle => vehicle.id === car);
  const vehicleAt = (step: number) => vehicleList[(index + step + vehicleList.length) % vehicleList.length];

  useLayoutEffect(() => {
    offset.stopAnimation();
    offset.setValue(0);
  }, [car, width, offset]);
  useEffect(() => () => offset.stopAnimation(), [offset]);

  const settle = useCallback((step: number) => {
    if (moving || !width) return;
    setMoving(true);
    Animated.timing(offset, { toValue: -step * width, duration: 180, useNativeDriver: false }).start(({ finished }) => {
      if (finished && step) onChange(vehicleList[(index + step + vehicleList.length) % vehicleList.length].id);
      setMoving(false);
    });
  }, [moving, width, offset, index, onChange]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !moving && Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => offset.setValue(Math.max(-width, Math.min(width, g.dx))),
    onPanResponderRelease: (_, g) => {
      const swipe = Math.abs(g.dx) >= Math.min(64, width * 0.16) || (Math.abs(g.dx) > 15 && Math.abs(g.vx) > 0.55);
      settle(swipe ? -Math.sign(g.dx) : 0);
    },
    onPanResponderTerminate: () => settle(0),
  }), [moving, width, offset, settle]);

  return <Modal visible animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={onClose}>
    <SafeAreaView style={styles.root}>
      <Image accessible={false} source={require('../../assets/menu/mountains.png')} resizeMode="stretch" style={styles.background}/>
      <View style={styles.header}>
        <View>
          <Text accessibilityRole="header" style={styles.title}>GARAGEM</Text>
          <Text style={styles.wallet}>Saldo: {balance ?? '—'} moedas</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}><Text style={styles.doneText}>Concluir</Text></Pressable>
      </View>
      <View style={[styles.content, portrait && styles.contentPortrait]}>
        <View style={[styles.vehicleArea, portrait && styles.vehicleAreaPortrait]} onLayout={e => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
          <View style={styles.stage}>
            {width > 0 && [-1, 0, 1].map(step => <Animated.View key={step} pointerEvents="none"
              style={[StyleSheet.absoluteFill, { left: step * width, right: undefined, width, transform: [{ translateX: offset }] }]}>
              <Image accessible={false} source={vehiclePreviews[vehicleAt(step).id]} resizeMode="contain" style={styles.vehicleImage}/>
            </Animated.View>)}
          </View>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" accessibilityLabel="Carro anterior" onPress={() => settle(-1)} style={styles.arrow}><Text style={styles.glyph}>‹</Text></Pressable>
            <View style={styles.caption}>
              <Text accessibilityLiveRegion="polite" style={styles.name}>{vehicleAt(0).name}</Text>
              <Text style={styles.swipeHint}>Arrasta para mudar · {index + 1}/{vehicleList.length}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Carro seguinte" onPress={() => settle(1)} style={styles.arrow}><Text style={styles.glyph}>›</Text></Pressable>
          </View>
        </View>
        <ScrollView
          style={[styles.upgrades, portrait && styles.upgradesPortrait]}
          contentContainerStyle={[styles.catalog, compact && styles.catalogCompact]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.upgradesHeader}>
            <Text accessibilityRole="header" style={styles.upgradesTitle}>MELHORIAS</Text>
            <Text style={styles.sectionHint}>3 níveis por melhoria</Text>
          </View>
          {upgradeKinds.map(kind => {
            const level = levels?.[kind] ?? 0;
            const maximum = level >= upgradeRules[kind].prices.length;
            const nextPrice = maximum ? null : upgradeRules[kind].prices[level];
            return <View key={kind} style={styles.upgrade}>
              <View style={styles.upgradeHeading}>
                <Text style={styles.upgradeName}>{upgradeRules[kind].name}</Text>
                <Text style={styles.levelText}>{level} / 3</Text>
              </View>
              <View style={styles.levelBar} accessibilityLabel={`Nível ${level} de 3 ${upgradeRules[kind].name}`}>
                {upgradeRules[kind].prices.map((_, segment) => <View
                  key={segment}
                  style={[styles.levelSegment, segment >= level && styles.levelSegmentEmpty]}
                />)}
              </View>
              <View style={styles.nextLevelRow}>
                <View style={styles.nextLevelCopy}>
                  <Text style={styles.nextLevelLabel}>{maximum ? 'ESTADO ATUAL' : 'PRÓXIMO NÍVEL'}</Text>
                  <Text style={styles.effect}>{maximum ? upgradeEffect(car, kind, level) : upgradeEffect(car, kind, level + 1)}</Text>
                </View>
                {nextPrice !== null && <Text style={styles.price}>{nextPrice} moedas</Text>}
              </View>
            </View>;
          })}
          <Text style={styles.help}>As melhorias são compradas na garagem das competições online e aplicam-se à próxima ronda.</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  catalog: { gap: 10, paddingHorizontal: 4, paddingBottom: 16 },
  catalogCompact: { gap: 8 },
  help: { color: '#30343a', fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  upgrade: { backgroundColor: '#f8f9fa', borderLeftWidth: 4, borderColor: '#ffd129', padding: 12, gap: 7, borderRadius: 8 },
  upgradeHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  upgradeName: { color: '#202125', fontSize: 17, fontWeight: '800' },
  levelText: { color: '#666b73', fontSize: 12, fontWeight: '900' },
  levelBar: { height: 10, flexDirection: 'row', gap: 6 },
  levelSegment: { flex: 1, height: '100%', borderRadius: 5, backgroundColor: '#ffd129', borderWidth: 1, borderColor: '#c99800' },
  levelSegmentEmpty: { backgroundColor: '#d9dde3', borderColor: '#c0c4cc' },
  nextLevelRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  nextLevelCopy: { flex: 1 },
  nextLevelLabel: { color: '#666b73', fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
  effect: { flex: 1, color: '#30343a', fontSize: 12, lineHeight: 16, marginTop: 2 },
  price: { color: '#202125', fontWeight: '900', fontSize: 12, backgroundColor: '#ffd129', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 7 },
  root: { flex: 1, backgroundColor: '#dee1e7' },
  background: { position: 'absolute', width: '100%', height: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  title: { color: '#202125', fontWeight: '900', fontSize: 26 },
  wallet: { color: '#555a62', fontSize: 12, fontWeight: '700', marginTop: 2 },
  done: { minHeight: 46, paddingHorizontal: 20, justifyContent: 'center', backgroundColor: '#ffd129', borderRadius: 6 },
  doneText: { color: '#202125', fontWeight: '800' },
  content: { flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  contentPortrait: { flexDirection: 'column', gap: 8 },
  vehicleArea: { flex: 1.15, minWidth: 0 },
  vehicleAreaPortrait: { flex: 0.9, minHeight: 210 },
  stage: { flex: 1, overflow: 'hidden', touchAction: 'none' },
  vehicleImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  upgrades: { flex: 0.85, maxWidth: 420, backgroundColor: '#edf0f3', borderRadius: 10, padding: 12 },
  upgradesPortrait: { flex: 1.1, maxWidth: '100%', width: '100%' },
  upgradesHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 2 },
  upgradesTitle: { color: '#202125', fontSize: 20, fontWeight: '900' },
  sectionHint: { color: '#666b73', fontSize: 11, fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  caption: { alignItems: 'center', flexShrink: 1 },
  name: { color: '#202125', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  swipeHint: { color: '#60656e', fontSize: 11, textAlign: 'center', marginTop: 2 },
  arrow: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#202125', borderRadius: 6 },
  glyph: { color: '#ffd129', fontSize: 30, fontWeight: '800' },
});
