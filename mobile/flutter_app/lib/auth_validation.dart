String? validateAuthPassword(
  String? value, {
  required bool isCreatingAccount,
}) {
  final minimumLength = isCreatingAccount ? 8 : 6;
  if (value == null || value.length < minimumLength) {
    return isCreatingAccount
        ? 'Use pelo menos 8 caracteres.'
        : 'Informe uma senha com pelo menos 6 caracteres.';
  }
  return null;
}

String? validateAuthPasswordConfirmation(String? value, String password) {
  if (value == null || value.isEmpty) {
    return 'Confirme sua senha.';
  }
  if (value != password) {
    return 'As senhas não coincidem.';
  }
  return null;
}
