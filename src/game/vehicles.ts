export type VehicleId = 'jeep' | 'crawler' | 'rally' | 'gt3';
export type VehicleSpec = {
  id: VehicleId; name: string; category: string; color: string;
  benefit: string; tradeoff: string;
  mass: number; widthScale: number; heightScale: number; lengthScale: number;
  wheelRadius: number; wheelWidth: number; track: number;
  suspensionRest: number; suspensionTravel: number; suspensionStiffness: number;
  grip: number; rollInfluence: number; steering: number;
  bellyDepth?: number; bumperDepth?: number; brakeForce?: number; downforceCoefficient?: number;
  high: { engineForce: number; forwardLimit: number; reverseLimit: number };
  low: { engineForce: number; forwardLimit: number; reverseLimit: number };
};

export const vehicles: Record<VehicleId, VehicleSpec> = {
  jeep: {
    id: 'jeep', name: 'Serra 4×4', category: 'Equilibrado', color: '#d5a14e',
    benefit: 'Um compromisso entre velocidade, altura ao solo e suspensão.',
    tradeoff: 'Menos capaz nas lombas que o Crawler e mais lento que o Rally.',
    mass: 700, widthScale: 1, heightScale: 1, lengthScale: 1,
    wheelRadius: 0.46, wheelWidth: 0.32, track: 0.96,
    suspensionRest: 0.34, suspensionTravel: 0.23, suspensionStiffness: 30,
    grip: 3.8, rollInfluence: 0.08, steering: 0.46,
    high: { engineForce: 1850, forwardLimit: 23, reverseLimit: 8 },
    low: { engineForce: 3000, forwardLimit: 9, reverseLimit: 4 },
  },
  crawler: {
    id: 'crawler', name: 'Rocha Crawler', category: 'Todo-o-terreno', color: '#718a57',
    benefit: 'Rodas grandes, mais altura ao solo e maior curso de suspensão para transpor obstáculos.',
    tradeoff: 'Mais pesado e lento; a carroçaria alta exige cuidado nas inclinações laterais.',
    mass: 1000, widthScale: 1.15, heightScale: 1.08, lengthScale: 1.1,
    wheelRadius: 0.66, wheelWidth: 0.44, track: 1.14,
    suspensionRest: 0.48, suspensionTravel: 0.36, suspensionStiffness: 28,
    grip: 4.4, rollInfluence: 0.13, steering: 0.42,
    high: { engineForce: 2200, forwardLimit: 16, reverseLimit: 6 },
    low: { engineForce: 3600, forwardLimit: 6, reverseLimit: 3 },
  },
  rally: {
    id: 'rally', name: 'Vale Rally', category: 'Velocidade', color: '#bd5948',
    benefit: 'Leve, rápido e baixo, com suspensão firme e boa estabilidade em terreno plano.',
    tradeoff: 'Menos altura ao solo: pode raspar o fundo e perder contacto nas lombas mais difíceis.',
    mass: 600, widthScale: 1.08, heightScale: 0.68, lengthScale: 1.06,
    wheelRadius: 0.34, wheelWidth: 0.28, track: 1.02,
    suspensionRest: 0.16, suspensionTravel: 0.12, suspensionStiffness: 42,
    grip: 4.2, rollInfluence: 0.05, steering: 0.43,
    high: { engineForce: 2100, forwardLimit: 34, reverseLimit: 10 },
    low: { engineForce: 2800, forwardLimit: 12, reverseLimit: 5 },
  },
  gt3: {
    id: 'gt3', name: 'Serra GT3', category: 'Circuito', color: '#278fac',
    benefit: 'O mais rápido em asfalto: pneus largos, suspensão firme e apoio aerodinâmico nas curvas.',
    tradeoff: 'Muito baixo e com pouco curso de suspensão; raspa facilmente no terreno difícil.',
    mass: 800, widthScale: 1.16, heightScale: 0.72, lengthScale: 1.25,
    wheelRadius: 0.32, wheelWidth: 0.42, track: 1.1,
    suspensionRest: 0.10, suspensionTravel: 0.08, suspensionStiffness: 60,
    grip: 5.8, rollInfluence: 0.025, steering: 0.48,
    bellyDepth: 0.32, bumperDepth: 0.28, brakeForce: 30, downforceCoefficient: 1.8,
    high: { engineForce: 2800, forwardLimit: 50, reverseLimit: 9 },
    low: { engineForce: 3400, forwardLimit: 14, reverseLimit: 5 },
  },
};

export const vehicleList = Object.values(vehicles);

// Approximate static clearance beneath the lowest chassis box, allowing for
// suspension compression under gravity. Actual clearance varies with the terrain.
export function groundClearance(spec: VehicleSpec) {
  return spec.wheelRadius + spec.suspensionRest - 9.81 / (4 * spec.suspensionStiffness) - (spec.bellyDepth ?? 0.18) * spec.heightScale;
}
