export type FieldErrors = Record<string, string>;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Informe seu e-mail.';
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    return 'Informe um endereço de e-mail válido.';
  }
  return undefined;
}

export function validateRequired(value: string, label: string): string | undefined {
  if (!value.trim()) return `Informe ${label.toLowerCase()}.`;
  return undefined;
}

export function validateName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Informe seu nome.';
  if ([...name].length < 2) return 'O nome deve ter pelo menos 2 caracteres.';
  if ([...name].length > 100) return 'O nome deve ter no máximo 100 caracteres.';
  return undefined;
}

export function validatePassword(value: string, minimumLength = 8): string | undefined {
  if (!value) return 'Informe sua senha.';
  if (value.length < minimumLength) {
    return `A senha deve ter pelo menos ${minimumLength} caracteres.`;
  }
  return undefined;
}

export function validateCompanyName(value: string): string | undefined {
  const name = value.trim().replace(/\\s+/g, ' ');
  if (!name) return 'Informe o nome da empresa.';
  if ([...name].length < 2 || [...name].length > 160) {
    return 'O nome da empresa deve ter entre 2 e 160 caracteres.';
  }
  return undefined;
}
