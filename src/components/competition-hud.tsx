import { StyleSheet, Text, View } from 'react-native';
import { GameUI as ui } from '@/constants/game-ui';
import type { OnlineStatus } from '@/game/multiplayer-client';

export default function CompetitionHud({ online, compact = false }: { online: OnlineStatus; compact?: boolean }) {
  const round = online.tournament;
  if (!round?.started) return null;
  const own = round.members.find(member => member.id === online.room?.sessionId);
  const economy = online.economy;
  return <View style={styles.hud} pointerEvents="none">
    <Text style={styles.score}>R{round.round} · {own?.points ?? 0}/{round.targetPoints} pontos</Text>
    {round.phase === 'countdown' ? <Text accessibilityLiveRegion="polite" style={styles.score}>Partida em {Math.ceil(round.countdown)}</Text> : <>
      {economy && <>
        <Text style={styles.value}>{compact ? `${economy.balance ?? '—'} moedas · ${economy.fuel.toFixed(1)}/${economy.capacity} L` : `Saldo ${economy.balance ?? '—'} moedas`}</Text>
        {!compact && <Text style={styles.detail}>Combustível {economy.fuel.toFixed(1)}/{economy.capacity} L</Text>}
        <View accessibilityRole="progressbar" accessibilityLabel="Combustível" accessibilityValue={{ min: 0, max: economy.capacity, now: economy.fuel }} style={styles.track}>
          <View style={[styles.fuel, { width: `${Math.max(0, Math.min(100, economy.fuel / Math.max(1, economy.capacity) * 100))}%`, backgroundColor: economy.fuel <= economy.capacity * .2 ? '#df9c8e' : ui.accent }]} />
        </View>
        <Text accessibilityLabel={`Piruetas: ${economy.rotations} voltas completas. Prémio pendente: ${economy.pendingReward} moedas.`} style={styles.detail}>{economy.rotations} × 360° · +{economy.pendingReward} pendente</Text>
        {(economy.fuel <= 0 || economy.walletStatus === 'error') && <Text accessibilityLiveRegion="polite" style={styles.warning}>{economy.fuel <= 0 ? 'Sem combustível · usa a inércia' : 'Saldo por confirmar · falha de rede'}</Text>}
        {economy.unconfirmed > 0 && <Text style={styles.detail}>+{economy.unconfirmed} moedas a guardar</Text>}
      </>}
      {!(compact && own?.needsRecovery) && <Text style={styles.detail}>CP {own?.passed ?? 0}/13 · {Math.ceil(round.remainingSeconds)} s</Text>}
      {own?.needsRecovery && <Text accessibilityLiveRegion="polite" style={styles.warning}>Fora da pista · Recuperar +5 s</Text>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  hud: { gap: 3, marginTop: 4 }, score: { color: ui.accent, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  value: { color: ui.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  detail: { color: ui.muted, fontSize: 12 }, warning: { color: '#ffd1b7', fontSize: 12, fontWeight: '600' },
  track: { height: 5, backgroundColor: ui.border, borderRadius: 3, overflow: 'hidden' }, fuel: { height: '100%' },
});
