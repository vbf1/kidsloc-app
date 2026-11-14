export type AuthErrorLike = {
  code?: string;
  name?: string;
  message?: string;
  status?: number;
};

export type AuthErrorContext = 'login' | 'signup' | 'recovery' | 'password_update' | 'company';

function readError(error: unknown): AuthErrorLike {
  if (!error || typeof error !== 'object') return {};
  return error as AuthErrorLike;
}

export function getAuthErrorMessage(
  error: unknown,
  context: AuthErrorContext,
): string {
  const details = readError(error);
  const code = details.code?.toLowerCase() ?? '';
  const name = details.name?.toLowerCase() ?? '';
  const message = details.message?.toLowerCase() ?? '';

  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    code === 'user_already_registered' ||
    message.includes('user already registered') ||
    message.includes('already been registered')
  ) {
    return 'Este e-mail já está cadastrado. Entre na sua conta ou recupere sua senha.';
  }

  if (
    code === 'invalid_credentials' ||
    (code === 'invalid_grant' && context === 'login') ||
    message.includes('invalid login credentials')
  ) {
    return 'E-mail ou senha incorretos.';
  }

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
    code === 'invalid_token' ||
    message.includes('expired') ||
    message.includes('invalid token')
  ) {
    return 'Seu link expirou ou não é válido. Solicite uma nova recuperação de senha.';
  }

  if (
    details.status === 429 ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit'
  ) {
    return 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente.';
  }

  if (
    name === 'authretryablefetcherror' ||
    name === 'typeerror' ||
    code === 'fetch_error' ||
    details.status === 0 ||
    message.includes('failed to fetch') ||
    message.includes('network')
  ) {
    return 'Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.';
  }

  switch (context) {
    case 'login':
      return 'Não foi possível entrar. Confira seus dados e tente novamente.';
    case 'signup':
      return 'Não foi possível criar sua conta. Confira os dados e tente novamente.';
    case 'recovery':
      return 'Não foi possível solicitar a recuperação. Confira os dados e tente novamente.';
    case 'password_update':
      return 'Não foi possível atualizar sua senha. Tente novamente.';
    case 'company':
      return 'Não foi possível concluir o cadastro da empresa. Confira os dados e tente novamente.';
  }
}

export function getPasswordUpdateErrorMessage(error: unknown): string {
  return getAuthErrorMessage(error, 'password_update');
}
