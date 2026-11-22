import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Animated, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { vehicleList, type VehicleId } from '@/game/vehicles';
import { upgradeEffect, upgradeKinds, upgradeRules } from '@/game/upgrades';

export const vehiclePreviews = {
  jeep: require('../../assets/menu/jeep.png'),
  crawler: require('../../assets/menu/crawler.png'),
  rally: require('../../assets/menu/rally.png'),
  gt3: require('../../assets/menu/gt3.png'),
};

export default function MenuGarage({ car, onChange, onClose }: {
  car: VehicleId; onChange: (car: VehicleId) => void; onClose: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [offset] = useState(() => new Animated.Value(0));
  const [moving, setMoving] = useState(false);
  const [showUpgrades, setShowUpgrades] = useState(false);
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
        <Text accessibilityRole="header" style={styles.title}>{showUpgrades ? 'MELHORIAS' : 'GARAGEM'}</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}><Text style={styles.doneText}>Concluir</Text></Pressable>
      </View>
      {showUpgrades ? <ScrollView contentContainerStyle={styles.catalog}>
        <Text style={styles.name}>{vehicleAt(0).name}</Text>
        <Text style={styles.help}>Ganha moedas nas corridas, nas recolhas e nas piruetas com aterragem válida. Compra melhorias na garagem entre rondas. Cada carro tem os seus níveis por competição.</Text>
        {upgradeKinds.map(kind => <View key={kind} style={styles.upgrade}>
          <Text style={styles.upgradeName}>{upgradeRules[kind].name}</Text>
          <Text style={styles.help}>{upgradeEffect(car, kind, 0)} na origem</Text>
          {upgradeRules[kind].prices.map((price, i) => <View key={i} style={styles.priceRow}>
            <Text style={styles.help}>Nível {i + 1} · {upgradeEffect(car, kind, i + 1)}</Text>
            <Text style={styles.price}>{price} moedas</Text>
          </View>)}
        </View>)}
        <Text style={styles.help}>As compras confirmadas entram na ronda seguinte. O motor melhora a aceleração, o depósito prolonga a autonomia e o controlo aéreo facilita as rotações.</Text>
      </ScrollView> : <View style={styles.stage} onLayout={e => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        {width > 0 && [-1, 0, 1].map(step => <Animated.View key={step} pointerEvents="none"
          style={[StyleSheet.absoluteFill, { left: step * width, right: undefined, width, transform: [{ translateX: offset }] }]}>
          <Image accessible={false} source={vehiclePreviews[vehicleAt(step).id]} resizeMode="contain" style={styles.background}/>
        </Animated.View>)}
      </View>}
      <View style={styles.footer}>
        {!showUpgrades && <Pressable accessibilityRole="button" accessibilityLabel="Carro anterior" onPress={() => settle(-1)} style={styles.arrow}><Text style={styles.glyph}>‹</Text></Pressable>}
        <View style={styles.caption}>
          <Text accessibilityLiveRegion="polite" style={styles.name}>{vehicleAt(0).name}</Text>
          {!showUpgrades && <Text>Arrasta para mudar · {index + 1}/{vehicleList.length}</Text>}
        </View>
        {!showUpgrades && <Pressable accessibilityRole="button" accessibilityLabel="Carro seguinte" onPress={() => settle(1)} style={styles.arrow}><Text style={styles.glyph}>›</Text></Pressable>}
      </View>
      <Pressable accessibilityRole="button" style={[styles.done, { alignSelf: 'center', marginBottom: 8 }]} onPress={() => setShowUpgrades(value => !value)}>
        <Text style={styles.doneText}>{showUpgrades ? 'Voltar aos carros' : 'Ver melhorias e preços'}</Text>
      </Pressable>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  catalog: { padding: 18, gap: 14 },
  help: { color: '#30343a', fontSize: 14, lineHeight: 21 },
  upgrade: { backgroundColor: '#f8f9fa', borderLeftWidth: 4, borderColor: '#ffd129', padding: 16, gap: 8, borderRadius: 8 },
  upgradeName: { color: '#202125', fontSize: 20, fontWeight: '800' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  price: { color: '#202125', fontWeight: '800', fontSize: 14 },
  root: { flex: 1, backgroundColor: '#dee1e7' },
  background: { position: 'absolute', width: '100%', height: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  title: { color: '#202125', fontWeight: '900', fontSize: 26 },
  done: { minHeight: 46, paddingHorizontal: 20, justifyContent: 'center', backgroundColor: '#ffd129', borderRadius: 6 },
  doneText: { color: '#202125', fontWeight: '800' },
  stage: { flex: 1, overflow: 'hidden', touchAction: 'none' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12 },
  caption: { alignItems: 'center', flexShrink: 1 },
  name: { color: '#202125', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  arrow: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#202125', borderRadius: 6 },
  glyph: { color: '#ffd129', fontSize: 30, fontWeight: '800' },
});
