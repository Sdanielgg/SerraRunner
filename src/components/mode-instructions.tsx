import { StyleSheet, Text, View } from 'react-native';
import { GameUI as ui } from '@/constants/game-ui';

const instructions = [
  ['Condução livre', 'Explora sem limite de tempo. Escolhe um dos quatro carros, o circuito ou o terreno. A transmissão adapta-se ao percurso, sem mudanças manuais. Não há consumo nem melhorias neste modo.'],
  ['Desafio da Serra', 'Escolhe o carro e segue os 30 checkpoints por ordem até à meta. Recuperar acrescenta 5 segundos. O melhor tempo de cada carro fica nesta sessão. Economia e melhorias não alteram estes tempos.'],
  ['Competição', 'Entra com a tua conta. Na sala, escolhe carro e marca Pronto. O anfitrião inicia com 2–4 jogadores, todos prontos. Cada vitória vale 1 ponto; o objetivo normal é 15.'],
  ['Saltos e garagem', 'Só no ar: Rodar atrás / Rodar frente ou Q/E. Voltas completas de 360° ficam pendentes até uma aterragem estável; queda ou recuperação anulam o prémio. Moedas e combustível são individuais por ronda. Acelerar consome combustível; recuperar não reabastece. Compra melhorias entre rondas; entram na ronda seguinte.'],
] as const;
export default function ModeInstructions() {
  return <View style={styles.container}>{instructions.map(([title, text]) => <View key={title} style={styles.item}>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.text}>{text}</Text>
  </View>)}<Text style={styles.text}>Câmara 1 e 2 seguem o carro. Na câmara livre, arrasta fora dos painéis e zonas dos polegares. Podes manter os pedais premidos com outros dedos.</Text></View>;
}
const styles = StyleSheet.create({ container: { gap: 12 }, item: { gap: 4 }, title: { color: ui.accent, fontWeight: '700', fontSize: 13 }, text: { color: ui.muted, fontSize: 13, lineHeight: 20 } });
