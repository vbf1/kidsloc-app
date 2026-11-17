import { describe, expect, it } from 'vitest';
import {
  validateCompanyName,
  validateEmail,
  validateName,
  validatePassword,
  validateRequired,
} from '../lib/form-validation';

describe('KidsLoc form validation messages', () => {
  it('validates required and formatted email fields', () => {
    expect(validateEmail('')).toBe('Informe seu e-mail.');
    expect(validateEmail('nao-e-email')).toBe('Informe um endereço de e-mail válido.');
    expect(validateEmail('pessoa@exemplo.com')).toBeUndefined();
  });

  it('validates names without browser-native prompts', () => {
    expect(validateName(' ')).toBe('Informe seu nome.');
    expect(validateName('A')).toContain('pelo menos 2');
    expect(validateName('Ana')).toBeUndefined();
    expect(validateRequired('', 'a senha')).toBe('Informe a senha.');
  });

  it('validates password length', () => {
    expect(validatePassword('123')).toContain('pelo menos 8');
    expect(validatePassword('12345678')).toBeUndefined();
    expect(validatePassword('123456', 6)).toBeUndefined();
  });

  it('validates company name boundaries', () => {
    expect(validateCompanyName('')).toBe('Informe o nome da empresa.');
    expect(validateCompanyName('A')).toContain('entre 2 e 160');
    expect(validateCompanyName('Minha Locadora')).toBeUndefined();
  });
});
