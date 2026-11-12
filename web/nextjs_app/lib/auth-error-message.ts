export type AuthErrorLike = {
  code?: string;
  name?: string;
  message?: string;
  status?: number;
};

export function getPasswordUpdateErrorMessage(error: AuthErrorLike | null | undefined): string {
  const code = error?.code?.toLowerCase();
  const name = error?.name?.toLowerCase();

  if (code === 'same_password') {
    return 'A nova senha deve ser diferente da senha atual.';
  }

  if (code === 'weak_password' || code === 'password_too_short') {
    return 'A senha não atende aos requisitos de segurança. Escolha uma senha mais forte.';
  }

  if (
    code === 'otp_expired' ||
    code === 'flow_state_expired' ||
    code === 'session_not_found' ||
    code === 'invalid_grant' ||
    code === 'bad_jwt' ||
    code === 'invalid_token'
  ) {
    return 'Seu link de recuperação expirou ou não é válido. Solicite uma nova recuperação de senha.';
  }

  if (
    name === 'authretryablefetcherror' ||
    name === 'typeerror' ||
    code === 'fetch_error' ||
    error?.status === 0
  ) {
    return 'Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.';
  }

  return 'Não foi possível atualizar sua senha. Tente novamente.';
}
