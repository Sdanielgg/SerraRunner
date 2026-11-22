import type { VehicleId } from '../../src/game/vehicles';

// Altera os caminhos aqui para substituir os sons em todas as plataformas.
// O Metro precisa de caminhos escritos diretamente dentro de require().
export const sounds = {
  engines: {
    jeep: require('./engine-jeep.wav'),
    crawler: require('./engine-crawler.wav'),
    rally: require('./engine-rally.wav'),
    gt3: require('./engine-gt3.wav'),
  } satisfies Record<VehicleId, number>,
  horn: require('./horn.wav') as number,
};
