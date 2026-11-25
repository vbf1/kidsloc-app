import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'services/app_theme.dart';
import 'services/app_language.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key, required this.companyId, required this.role});
  final String companyId;
  final String role;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final _deposit = TextEditingController(text: '30');
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _notice;
  bool get _canManage => widget.role == 'owner' || widget.role == 'admin';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _deposit.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await Supabase.instance.client.rpc('get_company_settings', params: {
        'p_company_id': widget.companyId,
      });
      if (!mounted) return;
      _deposit.text = (data['default_deposit_percentage'] ?? 30).toString();
    } on PostgrestException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = appText('Não foi possível carregar as configurações.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final value = double.tryParse(_deposit.text.trim().replaceAll(',', '.'));
    if (value == null || value < 0 || value > 100) {
      setState(() => _error = appText('Informe um percentual entre 0 e 100.'));
      return;
    }
    setState(() { _saving = true; _error = null; _notice = null; });
    try {
      final data = await Supabase.instance.client.rpc('update_company_settings', params: {
        'p_company_id': widget.companyId,
        'p_default_deposit_percentage': value,
      });
      if (!mounted) return;
      _deposit.text = (data['default_deposit_percentage'] ?? value).toString();
      setState(() => _notice = appText('Configurações salvas. O percentual será usado nas novas locações.'));
    } on PostgrestException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = appText('Não foi possível salvar as configurações.'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _themeLabel(ThemeMode value) => switch (value) {
    ThemeMode.light => appText('Claro'),
    ThemeMode.dark => appText('Escuro'),
    ThemeMode.system => appText('Automático'),
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(appText('Configurações do app'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(appText('Idioma'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text(appText('Escolha o idioma de todo o aplicativo.')),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: AppLanguageController.languageTag,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: appText('Idioma')),
                        items: AppLanguageController.options.entries.map((entry) => DropdownMenuItem<String>(
                          value: entry.key, child: Text(entry.value),
                        )).toList(),
                        onChanged: (value) async {
                          if (value == null) return;
                          try {
                            await AppLanguageController.setLanguage(value);
                            if (mounted) setState(() => _notice = appText('Idioma atualizado com sucesso.'));
                          } catch (_) {
                            if (mounted) setState(() => _error = 'Não foi possível salvar o idioma na sua conta.');
                          }
                        },
                      ),
                    ]),
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(appText('Aparência'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text(appText('Escolha o tema usado neste dispositivo.')),
                      const SizedBox(height: 8),
                      ...ThemeMode.values.map((value) => RadioListTile<ThemeMode>(
                        contentPadding: EdgeInsets.zero,
                        value: value,
                        groupValue: AppThemeController.mode.value,
                        title: Text(_themeLabel(value)),
                        onChanged: (next) {
                          if (next != null) { AppThemeController.setMode(next).then((_) { if (mounted) setState(() {}); }); }
                        },
                      )),
                    ]),
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(appText('Padrão de sinal'), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text(appText('Percentual sugerido automaticamente nas novas locações.')),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _deposit,
                        enabled: _canManage,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: InputDecoration(labelText: appText('Percentual padrão (%)'), border: const OutlineInputBorder(), helperText: 'Começa em 30%. Pode ser alterado em cada locação.'),
                      ),
                      if (!_canManage) Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(appText('Somente administradores podem alterar esta configuração.')),
                      ),
                      if (_canManage) Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton(
                          onPressed: _saving ? null : _save,
                          child: Text(appText(_saving ? 'Salvando...' : 'Salvar configurações')),
                        ),
                      ),
                    ]),
                  ),
                ),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                if (_notice != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_notice!, style: TextStyle(color: Theme.of(context).colorScheme.primary))),
                const SizedBox(height: 12),
                Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(appText('O tema é salvo neste dispositivo. O percentual de sinal é compartilhado com a empresa e não altera locações antigas automaticamente.')))),
              ],
            ),
    );
  }
}
