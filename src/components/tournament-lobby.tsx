import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GameUI as ui } from '@/constants/game-ui';
import { vehicleList, vehicles, type VehicleId } from '@/game/vehicles';
import { tournamentRules, type TournamentAction, type TournamentSnapshot } from '@/game/tournament';
import CompetitionGarage, { type PurchaseAction } from './competition-garage';
import type { GarageSnapshot } from '@/game/upgrades';

type Props = { state: TournamentSnapshot; garage?: GarageSnapshot; sessionId: string; available: boolean; busy: boolean; onAction: (action: TournamentAction) => void; onVehicle: (id: VehicleId) => void; onPurchase: (action: PurchaseAction) => void };
const phaseNames = { lobby: 'Lobby', countdown: 'Contagem decrescente', race: 'Corrida', results: 'Resultados', garage: 'Garagem', finished: 'Competição terminada' };
export default function TournamentLobby({ state, garage, sessionId, available, busy, onAction, onVehicle, onPurchase }: Props) {
  const own = state.members.find(m => m.id === sessionId); const host = state.hostId === sessionId;
  const canChoose = state.phase === 'lobby' || state.phase === 'garage';
  const entrants = state.members.filter(m => m.connected);
  const allReady = entrants.length >= tournamentRules.minPlayers && entrants.every(m => m.ready) && !state.members.some(m => !m.connected && !m.departed);
  function button(label: string, action: () => void, disabled = false, selected = false) {
    return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, selected }} disabled={disabled || busy} onPress={action} style={[styles.button, selected && styles.selected, (disabled || busy) && styles.disabled]}><Text style={styles.text}>{label}</Text></Pressable>;
  }
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.heading}>{phaseNames[state.phase]}{state.round ? ` · Ronda ${state.round}` : ''}</Text>
    <Text style={styles.muted}>Circuito da Serra · 399 m · 2–4 jogadores · 1 vitória = 1 ponto · objetivo {state.targetPoints}</Text>
    {state.targetPoints !== 15 && <Text style={styles.accent}>Demonstração · objetivo reduzido para {state.targetPoints} pontos</Text>}
    {state.members.map(member => <View style={styles.member} key={member.id}>
      <View style={[styles.dot, { backgroundColor: member.color }]} />
      <View style={styles.grow}><Text style={styles.text}>{member.name}{member.id === state.hostId ? ' · anfitrião' : ''}{member.id === sessionId ? ' · tu' : ''}</Text>
        <Text style={styles.muted}>{vehicles[member.vehicleId].name} · {member.connected ? member.ready ? 'Pronto' : canChoose ? 'A preparar' : member.status === 'finished' ? 'Chegou' : member.status === 'dnf' ? 'Não terminou' : 'Em pista' : member.departed ? 'Saiu' : 'A reconectar'}</Text>
        {member.finishMs !== null && <Text style={styles.muted}>{(member.finishMs / 1000).toFixed(2)} s · {member.recoveries} recuperações</Text>}
      </View><Text style={styles.score}>{member.points}/{state.targetPoints}</Text>
    </View>)}
    {state.winnerId && ['results', 'garage', 'finished'].includes(state.phase) && <Text accessibilityLiveRegion="polite" style={styles.accent}>Venceu a ronda: {state.members.find(m => m.id === state.winnerId)?.name} · +1 ponto</Text>}
    {!state.winnerId && state.round > 0 && ['results', 'garage', 'finished'].includes(state.phase) && <Text style={styles.accent}>Sem chegada válida: esta ronda não atribui pontos.</Text>}
    {state.championId && <Text style={styles.heading}>Campeão: {state.members.find(m => m.id === state.championId)?.name} · objetivo atingido</Text>}
    {state.persistence === 'pending' && <Text style={styles.muted}>A guardar a ronda…</Text>}
    {state.phasePending && <Text style={styles.muted}>A confirmar a fase da competição. A contagem e as compras aguardam confirmação.</Text>}
    {state.phaseError && host && button('Tentar confirmar fase novamente', () => onAction({ type: 'retry' }))}
    {state.rewardsPending && <Text style={styles.muted}>A confirmar moedas no servidor. A próxima ronda aguarda a confirmação.</Text>}
    {state.rewardsError && host && button('Tentar guardar moedas novamente', () => onAction({ type: 'retry' }))}
    {state.persistence === 'error' && <><Text style={styles.accent}>Falha ao guardar. Os pontos não serão atribuídos novamente ao repetir.</Text>{host && button('Tentar guardar ronda novamente', () => onAction({ type: 'retry' }))}</>}
    {!available && <Text style={styles.accent}>O servidor precisa de persistência Supabase configurada para iniciar.</Text>}
    {state.phase === 'garage' && !state.championId && <CompetitionGarage state={garage} disabled={busy || !!own?.ready || !!state.phasePending || state.persistence !== 'saved'} onPurchase={onPurchase} />}
    {canChoose && !state.championId && <>
      <Text style={styles.text}>Escolhe o teu veículo</Text>
      <View style={styles.row}>{vehicleList.map(spec => <View key={spec.id} style={styles.choice}>{button(spec.name, () => onVehicle(spec.id), !own?.connected, own?.vehicleId === spec.id)}</View>)}</View>
      {host && !state.started && <View style={styles.row}>
        {button('Normal · 15 pontos', () => onAction({ type: 'target', points: 15 }), state.targetPoints === 15, state.targetPoints === 15)}
        {button('Demo · 3 pontos', () => onAction({ type: 'target', points: tournamentRules.demoTargetPoints }), state.targetPoints === tournamentRules.demoTargetPoints, state.targetPoints === tournamentRules.demoTargetPoints)}
      </View>}
      {button(own?.ready ? 'Pronto ✓ · cancelar' : 'Estou pronto', () => onAction({ type: 'ready', ready: !own?.ready }), !own?.connected, own?.ready)}
      {host ? button(state.round ? 'Iniciar próxima ronda' : 'Iniciar competição', () => onAction({ type: 'start', round: state.round }), !allReady || !available || !!state.phasePending || !!state.rewardsPending || state.persistence === 'pending' || state.persistence === 'error') : <Text style={styles.muted}>O anfitrião inicia quando todos estiverem prontos.</Text>}
    </>}
    {state.phase === 'countdown' && <Text style={styles.heading}>Partida em {Math.ceil(state.countdown)}</Text>}
    {state.phase === 'race' && <Text style={styles.accent}>Faltam {Math.ceil(state.remainingSeconds)} s · {own?.passed ?? 0}/{own?.total ?? 13} checkpoints{own?.needsRecovery ? ' · Fora da pista: usa Recuperar' : ''}</Text>}
    {state.phase === 'results' && host && button('Ir para a garagem', () => onAction({ type: 'garage' }))}
    {state.phase === 'garage' && host && button(state.championId ? 'Terminar competição' : 'Terminar sem campeão', () => onAction({ type: 'end' }))}
    {state.phase === 'finished' && host && button('Nova competição · abrir lobby', () => onAction({ type: 'new' }), state.persistence === 'pending' || state.persistence === 'error')}
    <Text style={styles.muted}>Só contam chegadas validadas pelo servidor. Recuperar regressa ao último checkpoint e soma 5 s. Depois do início, entram apenas reconexões válidas.</Text>
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 12, borderTopWidth: 1, borderColor: ui.border, paddingTop: 14 }, heading: { color: ui.text, fontSize: 19, fontWeight: '600' }, text: { color: ui.text, fontSize: 13, lineHeight: 19 }, muted: { color: ui.muted, fontSize: 12, lineHeight: 18 }, accent: { color: ui.accent, fontSize: 13, lineHeight: 19 }, member: { flexDirection: 'row', alignItems: 'center', gap: 10 }, dot: { width: 12, height: 12, borderRadius: 3 }, grow: { flex: 1 }, score: { color: ui.accent, fontSize: 17, fontVariant: ['tabular-nums'] }, button: { minHeight: 44, padding: 12, borderRadius: 6, backgroundColor: ui.raised, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: ui.border }, selected: { borderColor: ui.accent }, disabled: { opacity: 0.5 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { flexBasis: '47%', flexGrow: 1 } });
