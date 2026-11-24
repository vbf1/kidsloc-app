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
