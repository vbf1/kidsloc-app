import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AppLanguageController {
  static const storageKey = 'kidsloc-language';
  static const supportedLocales = <Locale>[
    Locale('pt', 'BR'),
    Locale('en'),
    Locale('es'),
    Locale('fr'),
    Locale('de'),
    Locale('it'),
    Locale('zh', 'CN'),
    Locale('ja'),
    Locale('ko'),
    Locale('ar'),
  ];
  static const options = <String, String>{
    'pt-BR': 'Português (Brasil)',
    'en': 'English',
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch',
    'it': 'Italiano',
    'zh-CN': '中文（简体）',
    'ja': '日本語',
    'ko': '한국어',
    'ar': 'العربية',
  };

  static final ValueNotifier<Locale> locale =
      ValueNotifier<Locale>(const Locale('pt', 'BR'));

  static String get languageTag {
    final current = locale.value;
    if (current.languageCode == 'pt') return 'pt-BR';
    if (current.languageCode == 'zh') return 'zh-CN';
    return current.languageCode;
  }

  static Locale _localeFor(String? value) {
    switch (value) {
      case 'en': return const Locale('en');
      case 'es': return const Locale('es');
      case 'fr': return const Locale('fr');
      case 'de': return const Locale('de');
      case 'it': return const Locale('it');
      case 'zh-CN': return const Locale('zh', 'CN');
      case 'ja': return const Locale('ja');
      case 'ko': return const Locale('ko');
      case 'ar': return const Locale('ar');
      default: return const Locale('pt', 'BR');
    }
  }

  static Future<void> load() async {
    final preferences = await SharedPreferences.getInstance();
    var selected = preferences.getString(storageKey) ?? 'pt-BR';
    final client = _supabaseOrNull();
    final accountLanguage = client?.auth.currentUser?.userMetadata?['preferred_language'];
    if (accountLanguage is String && options.containsKey(accountLanguage)) {
      selected = accountLanguage;
      await preferences.setString(storageKey, selected);
    }
    locale.value = _localeFor(selected);
  }

  static SupabaseClient? _supabaseOrNull() {
    try {
      return Supabase.instance.client;
    } catch (_) {
      return null;
    }
  }

  static Future<void> setLanguage(String value) async {
    if (!options.containsKey(value)) return;
    locale.value = _localeFor(value);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(storageKey, value);
    final client = _supabaseOrNull();
    if (client?.auth.currentUser != null) {
      await client!.auth.updateUser(
        UserAttributes(data: {'preferred_language': value}),
      );
    }
  }
}
