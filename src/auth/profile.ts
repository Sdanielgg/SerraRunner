export const profileRules = { nameMin: 2, nameMax: 20, passwordMin: 8, defaultColor: '#526a59' } as const;
export type Profile = { id: string; display_name: string; vehicle_color: string };
export type CompetitionResult = { id: string; vehicle_id: string; course_id?: string; upgrade_levels?: { engine: number; tank: number; air: number }; elapsed_ms: number; created_at: string; points_awarded?: number; round_number?: number | null };

export function validateProfile(name: string, color: string) {
  const trimmed = name.trim();
  if (trimmed.length < profileRules.nameMin || trimmed.length > profileRules.nameMax || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error('O nome deve ter entre 2 e 20 caracteres, sem caracteres de controlo.');
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Usa uma cor no formato #RRGGBB.');
  return { display_name: trimmed, vehicle_color: color.toLowerCase() };
}

export function authErrorMessage(error: unknown): string {
  const value = error as { code?: string; message?: string; status?: number; name?: string };
  if (value?.code === 'invalid_credentials') return 'Email ou palavra-passe incorretos.';
  if (value?.code === 'email_not_confirmed') return 'Confirma o teu email antes de entrar.';
  if (value?.code === 'user_already_exists') return 'Esta conta já existe. Tenta iniciar sessão.';
  if (value?.code === 'weak_password') return 'Escolhe uma palavra-passe mais forte.';
  if (value?.code === 'otp_expired') return 'O código expirou ou é inválido. Pede um novo.';
  if (value?.status === 429) return 'Demasiadas tentativas. Aguarda antes de tentar novamente.';
  if (value?.status === 401 || /refresh_token|session_not_found|bad_jwt/.test(value?.code ?? '')) return 'A sessão expirou. Inicia sessão novamente.';
  if (value?.name === 'AuthRetryableFetchError' || /fetch|network|timeout|aborted/i.test(value?.message ?? '')) return 'Falha de rede. Verifica a ligação e tenta novamente.';
  return value?.message || 'Não foi possível concluir. Tenta novamente.';
}
