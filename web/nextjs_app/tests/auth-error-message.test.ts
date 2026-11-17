import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage, getPasswordUpdateErrorMessage } from '../lib/auth-error-message';

describe('standardized authentication error messages', () => {
  it('explains an already registered email', () => {
    expect(getAuthErrorMessage({ code: 'user_already_exists' }, 'signup')).toContain('já está cadastrado');
    expect(getAuthErrorMessage({ message: 'User already registered' }, 'signup')).toContain('já está cadastrado');
  });

  it('explains invalid login credentials', () => {
    expect(getAuthErrorMessage({ code: 'invalid_credentials' }, 'login')).toBe('E-mail ou senha incorretos.');
  });

  it('explains when the new password matches the current password', () => {
    expect(getPasswordUpdateErrorMessage({ code: 'same_password' })).toBe(
      'A nova senha deve ser diferente da senha atual.',
    );
  });

  it('explains weak password errors', () => {
    expect(getPasswordUpdateErrorMessage({ code: 'weak_password' })).toContain('não atende aos requisitos');
  });

  it.each(['otp_expired', 'flow_state_expired', 'session_not_found', 'invalid_grant', 'bad_jwt', 'invalid_token'])(
    'explains invalid or expired recovery links (%s)',
    code => {
      expect(getPasswordUpdateErrorMessage({ code })).toContain('link expirou ou não é válido');
    },
  );

  it('explains rate limits without exposing provider details', () => {
    expect(getAuthErrorMessage({ code: 'over_email_send_rate_limit', status: 429 }, 'recovery')).toContain('Muitas tentativas');
  });

  it('explains connection errors', () => {
    expect(getAuthErrorMessage({ name: 'AuthRetryableFetchError' }, 'login')).toContain('Não foi possível conectar');
  });

  it('uses a safe contextual message for unknown errors', () => {
    expect(getAuthErrorMessage({ code: 'unexpected_error' }, 'signup')).toBe(
      'Não foi possível criar sua conta. Confira os dados e tente novamente.',
    );
    expect(getPasswordUpdateErrorMessage(null)).toBe(
      'Não foi possível atualizar sua senha. Tente novamente.',
    );
  });
});
