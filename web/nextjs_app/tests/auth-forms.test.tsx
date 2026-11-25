import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { auth },
}));

import LoginPage from '../app/login/page';
import SignupPage from '../app/signup/page';
import ResetPasswordPage from '../app/reset-password/page';

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
});

describe('web authentication forms', () => {
  it('blocks login with fewer than six characters before calling Supabase', async () => {
    render(<LoginPage />);

    fireEvent.change(await screen.findByLabelText('E-mail'), {
      target: { value: 'pessoa@exemplo.com' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: '12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('A senha deve ter pelo menos 6 caracteres.')).toBeTruthy();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('accepts a six-character existing password and displays safe login errors', async () => {
    render(<LoginPage />);

    fireEvent.change(await screen.findByLabelText('E-mail'), {
      target: { value: 'pessoa@exemplo.com' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'pessoa@exemplo.com',
        password: '123456',
      });
    });
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();
  });

  it('validates signup fields before requesting account creation', async () => {
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText('Confirmar senha'), {
      target: { value: 'senha-diferente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Informe seu nome.')).toBeTruthy();
    expect(screen.getByText('Informe seu e-mail.')).toBeTruthy();
    expect(screen.getByText('Informe sua senha.')).toBeTruthy();
    expect(screen.getByText('As senhas não coincidem.')).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('creates an account only after valid matching password fields', async () => {
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText('Seu nome'), {
      target: { value: 'Ana Souza' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: ' ANA@EXEMPLO.COM ' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: '12345678' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), {
      target: { value: '12345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
        email: 'ANA@EXEMPLO.COM',
        password: '12345678',
        options: expect.objectContaining({
          data: { full_name: 'Ana Souza' },
        }),
      }));
    });
    expect(await screen.findByText(/Enviamos um link de confirmação/)).toBeTruthy();
  });

  it('blocks weak recovery passwords before updating the account', async () => {
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/Nova senha/), {
      target: { value: '1234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(await screen.findByText('A senha deve ter pelo menos 8 caracteres.')).toBeTruthy();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('updates a valid recovery password and shows confirmation', async () => {
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/Nova senha/), {
      target: { value: '12345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => {
      expect(auth.updateUser).toHaveBeenCalledWith({ password: '12345678' });
    });
    expect(await screen.findByText('Senha atualizada com sucesso. Entre novamente com sua nova senha.')).toBeTruthy();
  });
});
