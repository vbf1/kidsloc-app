import 'package:flutter_test/flutter_test.dart';
import 'package:kidsloc_app/auth_validation.dart';

void main() {
  group('validateAuthEmail', () {
    test('requires an email address', () {
      expect(validateAuthEmail(null), 'Informe seu e-mail.');
      expect(validateAuthEmail('  '), 'Informe seu e-mail.');
    });

    test('rejects malformed email addresses', () {
      expect(validateAuthEmail('usuario'), 'Informe um endereço de e-mail válido.');
      expect(validateAuthEmail('usuario@'), 'Informe um endereço de e-mail válido.');
      expect(validateAuthEmail('usuario@dominio'), 'Informe um endereço de e-mail válido.');
      expect(validateAuthEmail('usuario @dominio.com'), 'Informe um endereço de e-mail válido.');
    });

    test('accepts a valid address and trims surrounding whitespace', () {
      expect(validateAuthEmail('usuario@dominio.com'), isNull);
      expect(validateAuthEmail('  usuario@dominio.com  '), isNull);
    });
  });

  group('validateAuthPassword', () {
    test('requires at least 8 characters when creating an account', () {
      expect(
        validateAuthPassword('1234567', isCreatingAccount: true),
        'Use pelo menos 8 caracteres.',
      );
      expect(
        validateAuthPassword('12345678', isCreatingAccount: true),
        isNull,
      );
    });

    test('accepts existing passwords with 6 or 7 characters at login', () {
      expect(
        validateAuthPassword('12345', isCreatingAccount: false),
        'Informe uma senha com pelo menos 6 caracteres.',
      );
      expect(validateAuthPassword('123456', isCreatingAccount: false), isNull);
      expect(validateAuthPassword('1234567', isCreatingAccount: false), isNull);
    });

    test('rejects a missing password in both flows', () {
      expect(
        validateAuthPassword(null, isCreatingAccount: true),
        'Use pelo menos 8 caracteres.',
      );
      expect(
        validateAuthPassword(null, isCreatingAccount: false),
        'Informe uma senha com pelo menos 6 caracteres.',
      );
    });
  });

  group('validateAuthPasswordConfirmation', () {
    test('requires a confirmation value', () {
      expect(
        validateAuthPasswordConfirmation(null, '12345678'),
        'Confirme sua senha.',
      );
      expect(
        validateAuthPasswordConfirmation('', '12345678'),
        'Confirme sua senha.',
      );
    });

    test('rejects a confirmation that does not match', () {
      expect(
        validateAuthPasswordConfirmation('87654321', '12345678'),
        'As senhas não coincidem.',
      );
    });

    test('accepts a matching confirmation', () {
      expect(
        validateAuthPasswordConfirmation('12345678', '12345678'),
        isNull,
      );
    });
  });
}
