import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/auth/auth-provider';
import { authErrorMessage, profileRules, type CompetitionResult } from '@/auth/profile';
import { GameUI as ui } from '@/constants/game-ui';
import type { GameHistory } from '@/auth/game-history';
import { vehicles, type VehicleId } from '@/game/vehicles';

export default function AccountScreen() {
  const auth = useAuth();
  // Reset private form data when identities change or the initial profile loads.
  return <AccountForm key={`${auth.session?.user.id ?? 'guest'}:${auth.profile ? 'loaded' : 'loading'}`} />;
}
function AccountForm() {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'confirm'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [name, setName] = useState(auth.profile?.display_name ?? ''); const [color, setColor] = useState<string>(auth.profile?.vehicle_color ?? profileRules.defaultColor);
  const [busy, setBusy] = useState(false); const [results, setResults] = useState<CompetitionResult[]>([]);
  const [history, setHistory] = useState<GameHistory | null>(null);
  async function perform(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); auth.setMessage('');
    try { await action(); } catch (error) { auth.setMessage(authErrorMessage(error)); }
    finally { setBusy(false); }
  }
  function button(label: string, action: () => void, secondary = false) {
    return <Pressable accessibilityRole="button" disabled={busy || auth.loading || !auth.configured} onPress={action} style={[styles.button, secondary && styles.secondary, (busy || !auth.configured) && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  }
  return <SafeAreaView style={styles.root}><KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.heading}><Text style={styles.title}>Ramp Rivals · Conta</Text><Pressable accessibilityRole="button" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} style={styles.secondary}><Text style={styles.buttonText}>Voltar ao jogo</Text></Pressable></View>
      <Text style={styles.text}>Condução livre e Desafio da Serra local estão sempre disponíveis sem conta.</Text>
      {!auth.configured && <Text style={styles.message}>A autenticação precisa de configuração Supabase. O modo local continua disponível.</Text>}
      {(auth.loading || busy || auth.profileLoading) && <ActivityIndicator accessibilityLabel="A carregar conta" color={ui.accent} />}
      {!!auth.message && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>{auth.message}</Text>}
      {auth.session ? <>
        <Text style={styles.text}>{auth.session.user.email}</Text>
        <Text style={styles.label}>Nome</Text><TextInput accessibilityLabel="Nome do perfil" value={name} onChangeText={setName} maxLength={20} editable={!busy} style={styles.input} />
        <Text style={styles.label}>Cor preferida do veículo</Text><View style={styles.row}><View style={[styles.swatch, { backgroundColor: /^#[\da-fA-F]{6}$/.test(color) ? color : ui.muted }]} /><TextInput accessibilityLabel="Cor preferida no formato hexadecimal" value={color} onChangeText={setColor} maxLength={7} autoCapitalize="none" editable={!busy} style={[styles.input, styles.grow]} /></View>
        {button('Guardar perfil', () => { void perform(() => auth.saveProfile(name, color)); })}
        {!auth.profile && button('Tentar carregar perfil', () => { void perform(auth.loadProfile); }, true)}
        {button('Carregar resultados guardados', () => { void perform(async () => { setResults(await auth.results()); auth.setMessage('Resultados atualizados.'); }); }, true)}
        {results.map(result => <Text style={styles.text} key={result.id}>{new Date(result.created_at).toLocaleDateString('pt-PT')} · {vehicles[result.vehicle_id as VehicleId]?.name ?? result.vehicle_id} · {(result.elapsed_ms / 1000).toFixed(2)} s · {result.course_id === 'serra-circuit-race-v3' ? 'Competição com melhorias' : result.course_id === 'serra-circuit-race-v2' ? 'Competição com economia' : result.course_id === 'serra-circuit-race-v1' ? 'Competição base' : 'Treino individual'}{result.round_number ? ` · Ronda ${result.round_number} · +${result.points_awarded ?? 0} pontos` : ''}{result.course_id === 'serra-circuit-race-v3' && result.upgrade_levels ? ` · Motor ${result.upgrade_levels.engine} / Depósito ${result.upgrade_levels.tank} / Ar ${result.upgrade_levels.air}` : ''}</Text>)}
        {button('Carregar saldo, estatísticas e histórico', () => { void perform(async () => { setHistory(await auth.history()); auth.setMessage('Histórico atualizado.'); }); }, true)}
        {history && <>
          <Text style={styles.title}>Saldo · {history.balance} moedas</Text>
          <Text style={styles.text}>{history.statistics?.rounds ?? 0} rondas · {history.statistics?.finishes ?? 0} chegadas · {history.statistics?.wins ?? 0} vitórias · {history.statistics?.competitions_won ?? 0} competições ganhas</Text>
          <Text style={styles.text}>{history.statistics?.recoveries ?? 0} recuperações · {history.statistics?.coins_earned ?? 0} moedas ganhas · {history.statistics?.coins_spent ?? 0} gastas</Text>
          <Text style={styles.label}>Últimas rondas guardadas</Text>
          {history.rounds.map(round => <Text style={styles.text} key={round.id}>{new Date(round.created_at).toLocaleDateString('pt-PT')} · Ronda {round.round_number} · {round.winner_user_id === auth.session?.user.id ? 'Vitória · +1 ponto' : round.winner_user_id ? 'Vitória de outro participante' : 'Sem chegada válida'}</Text>)}
          <Text style={styles.label}>Participações e melhorias por competição</Text>
          {history.competitions.map(c => <Text style={styles.text} key={c.competition_id}>{c.competition_id.slice(0, 8)} · {c.points} pontos · {vehicles[c.vehicle_id as VehicleId]?.name ?? c.vehicle_id}</Text>)}
          {history.upgrades.map(u => <Text style={styles.text} key={`${u.competition_id}:${u.vehicle_id}`}>{u.competition_id.slice(0, 8)} · {vehicles[u.vehicle_id as VehicleId]?.name ?? u.vehicle_id} · Motor {u.engine} / Depósito {u.tank} / Ar {u.air}</Text>)}
          <Text style={styles.label}>Últimos movimentos de dinheiro</Text>
          {history.movements.map(m => <Text style={styles.text} key={m.id}>{new Date(m.created_at).toLocaleDateString('pt-PT')} · {m.kind === 'purchase' ? 'Compra' : m.kind === 'coin' ? 'Moeda' : 'Salto'} · {m.amount > 0 ? '+' : ''}{m.amount} moedas{m.vehicle_id ? ` · ${vehicles[m.vehicle_id as VehicleId]?.name ?? m.vehicle_id}` : ''}</Text>)}
          {!history.movements.length && <Text style={styles.text}>Ainda sem movimentos guardados.</Text>}
        </>}
        {button('Terminar sessão', () => { void perform(auth.logout); }, true)}
      </> : <>
        <Text style={styles.title}>{mode === 'register' ? 'Criar conta' : mode === 'confirm' ? 'Confirmar email' : 'Iniciar sessão'}</Text>
        <TextInput accessibilityLabel="Email" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!busy} style={styles.input} placeholderTextColor={ui.muted} />
        {mode !== 'confirm' && <TextInput accessibilityLabel="Palavra-passe" placeholder="Palavra-passe" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} editable={!busy} style={styles.input} placeholderTextColor={ui.muted} />}
        {mode === 'register' && <>
          <TextInput accessibilityLabel="Nome para registo" placeholder="Nome (2–20 caracteres)" value={name} onChangeText={setName} maxLength={20} editable={!busy} style={styles.input} placeholderTextColor={ui.muted} />
          <TextInput accessibilityLabel="Cor para registo" placeholder="#526a59" value={color} onChangeText={setColor} maxLength={7} autoCapitalize="none" editable={!busy} style={styles.input} />
        </>}
        {mode === 'confirm' ? <>
          <Text style={styles.text}>Introduz o código recebido por email. Se recebeste um link, confirma-o e volta para iniciar sessão.</Text>
          <TextInput accessibilityLabel="Código de confirmação" placeholder="Código do email" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" editable={!busy} style={styles.input} placeholderTextColor={ui.muted} />
          {button('Confirmar código', () => { void perform(() => auth.confirm(email, code)); })}
          {button('Reenviar confirmação', () => { void perform(() => auth.resend(email)); }, true)}
        </> : button(mode === 'register' ? 'Registar' : 'Entrar', () => { void perform(async () => {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Indica um email válido.');
          if (!password) throw new Error('Indica a palavra-passe.');
          if (mode === 'register') { if (await auth.register(email, password, name, color)) { setMode('confirm'); setPassword(''); } }
          else await auth.login(email, password);
        }); })}
        {button(mode === 'login' ? 'Criar uma conta' : 'Já tenho conta · Entrar', () => { setMode(mode === 'login' ? 'register' : 'login'); auth.setMessage(''); }, true)}
        {mode === 'login' && button('Confirmar email pendente', () => { setMode('confirm'); }, true)}
      </>}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.background }, content: { padding: 24, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  title: { color: ui.text, fontSize: 21, fontWeight: '600' }, text: { color: ui.text, fontSize: 14, lineHeight: 21 }, label: { color: ui.muted, fontSize: 12 },
  message: { color: ui.accent, fontSize: 14, lineHeight: 21 }, input: { minHeight: 46, borderWidth: 1, borderColor: ui.border, borderRadius: 6, padding: 12, color: ui.text, backgroundColor: ui.surface },
  button: { minHeight: 46, padding: 12, backgroundColor: ui.accent, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: ui.ink, fontWeight: '600' },
  secondary: { minHeight: 44, padding: 12, borderRadius: 6, backgroundColor: ui.muted, justifyContent: 'center' }, disabled: { opacity: 0.5 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' }, swatch: { width: 32, height: 32, borderRadius: 5 }, grow: { flex: 1 },
});
