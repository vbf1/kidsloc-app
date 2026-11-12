import { describe, expect, it } from 'vitest';
import { getPasswordUpdateErrorMessage } from '../lib/auth-error-message';

describe('password update error messages', () => {
  it('explains when the new password matches the current password', () => {
    expect(getPasswordUpdateErrorMessage({ code: 'same_password' })).toBe(
      'A nova senha deve ser diferente da senha atual.',
    );
  });

  it('explains weak password errors', () => {
    expect(getPasswordUpdateErrorMessage({ code: 'weak_password' })).toBe(
      'A senha não atende aos requisitos de segurança. Escolha uma senha mais forte.',
    );
  });

  it.each(['otp_expired', 'flow_state_expired', 'session_not_found', 'invalid_grant', 'bad_jwt', 'invalid_token'])(
    'explains invalid or expired recovery links (%s)',
    code => {
      expect(getPasswordUpdateErrorMessage({ code })).toBe(
        'Seu link de recuperação expirou ou não é válido. Solicite uma nova recuperação de senha.',
      );
    },
  );

  it('explains connection errors', () => {
    expect(getPasswordUpdateErrorMessage({ name: 'AuthRetryableFetchError' })).toBe(
      'Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.',
    );
  });

  it('uses a safe generic message for unknown errors', () => {
    expect(getPasswordUpdateErrorMessage({ code: 'unexpected_error' })).toBe(
      'Não foi possível atualizar sua senha. Tente novamente.',
    );
    expect(getPasswordUpdateErrorMessage(null)).toBe(
      'Não foi possível atualizar sua senha. Tente novamente.',
    );
  });
});
