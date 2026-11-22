import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GameUI as ui } from '@/constants/game-ui';
import { upgradeEffect, upgradeRules, type GarageSnapshot, type GarageOffer, type UpgradeKind } from '@/game/upgrades';
import { vehicles } from '@/game/vehicles';

export type PurchaseAction = { operationId: string; kind: UpgradeKind } | { type: 'reload' };
export default function CompetitionGarage({ state, disabled, onPurchase }: { state?: GarageSnapshot; disabled: boolean; onPurchase: (action: PurchaseAction) => void }) {
  const [selected, setSelected] = useState<GarageOffer | null>(null);
  const waiting = !state || state.status === 'loading' || state.status === 'buying';
  const offer = state?.offers.find(item => item.operationId === selected?.operationId);
  const canConfirm = !!offer && offer.price !== null && state?.status === 'ready' && !disabled && !state.pendingOperation && state.balance !== null && state.balance >= offer.price;
  return <View style={styles.panel}>
    <Text style={styles.heading}>Melhorias para a próxima ronda</Text>
    <Text style={styles.text}>Saldo da conta: {state?.balance ?? '—'} moedas · {state ? vehicles[state.vehicleId].name : 'A carregar…'}</Text>
    <Text style={styles.muted}>Melhora o teu carro com moedas. Cada compra entra na próxima ronda desta competição.</Text>
    {state?.message ? <Text accessibilityLiveRegion="polite" style={styles.accent}>{state.message}</Text> : null}
    {waiting && <Text style={styles.muted}>{state?.status === 'buying' ? 'Compra por confirmar…' : 'A carregar garagem…'}</Text>}
    {state?.offers.map(offer => {
      const retry = state.pendingOperation === offer.operationId;
      const blocked = disabled || waiting || offer.price === null || (!!state.pendingOperation && !retry) || (!retry && (state.balance === null || state.balance < (offer.price ?? 0)));
      return <View key={offer.kind} style={styles.item}>
        <Text style={styles.text}>{upgradeRules[offer.kind].name} · Nível {offer.level}/{upgradeRules[offer.kind].prices.length}</Text>
        <Text style={styles.accent}>{upgradeEffect(state.vehicleId, offer.kind, offer.level)}{offer.price !== null ? ` → ${upgradeEffect(state.vehicleId, offer.kind, offer.level + 1)}` : ''}</Text>
        <Text style={styles.muted}>{offer.nextEffect}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => retry ? onPurchase({ operationId: offer.operationId, kind: offer.kind }) : setSelected(offer)} style={[styles.button, blocked && styles.disabled]}>
          <Text style={styles.text}>{offer.price === null ? 'Nível máximo' : retry ? 'Confirmar a mesma compra novamente' : `Comprar nível ${offer.level + 1} · ${offer.price} moedas`}</Text>
        </Pressable>
        {offer.price !== null && state.balance !== null && state.balance < offer.price && <Text style={styles.muted}>Faltam {offer.price - state.balance} moedas.</Text>}
      </View>;
    })}
    {state && !state.pendingOperation && !waiting && <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onPurchase({ type: 'reload' })} style={styles.button}><Text style={styles.text}>Atualizar saldo e melhorias</Text></Pressable>}
    {disabled && <Text style={styles.muted}>Cancela Pronto para comprar. As compras abrem após confirmar a ronda e a fase de garagem.</Text>}
    <Modal visible={selected !== null} transparent onRequestClose={() => setSelected(null)} supportedOrientations={['portrait', 'landscape']}>
      <View style={confirmation.backdrop}><View style={confirmation.card}>
        <Text style={styles.heading}>Confirmar melhoria</Text>
        <Text style={styles.text}>{selected && upgradeRules[selected.kind].name} · Nível {(selected?.level ?? 0) + 1}</Text>
        <Text style={styles.accent}>{selected?.price} moedas</Text>
        <Text style={styles.muted}>{canConfirm ? `Saldo após a compra: ${state!.balance! - offer!.price!} moedas.` : 'A oferta mudou ou a compra está indisponível. Fecha e consulta a garagem.'}</Text>
        <Pressable accessibilityRole="button" disabled={!canConfirm} style={[styles.button, !canConfirm && styles.disabled]} onPress={() => {
          if (!canConfirm || !offer) return;
          setSelected(null);
          onPurchase({ operationId: offer.operationId, kind: offer.kind });
        }}><Text style={styles.text}>Confirmar compra</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setSelected(null)}><Text style={styles.text}>Cancelar</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}
const confirmation = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000b', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, backgroundColor: ui.surface, padding: 20, borderRadius: 12, gap: 12 },
});
const styles = StyleSheet.create({ panel: { gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: ui.border }, heading: { color: ui.text, fontSize: 17, fontWeight: '600' }, text: { color: ui.text, fontSize: 13, lineHeight: 19 }, muted: { color: ui.muted, fontSize: 12, lineHeight: 18 }, accent: { color: ui.accent, fontSize: 13 }, item: { gap: 6 }, button: { minHeight: 44, padding: 12, backgroundColor: ui.raised, borderRadius: 6, borderWidth: 1, borderColor: ui.border, justifyContent: 'center' }, disabled: { opacity: 0.45 } });
