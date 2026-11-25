import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppThemeController {
  AppThemeController._();

  static const _key = 'kidsloc_theme_mode';
  static final ValueNotifier<ThemeMode> mode = ValueNotifier(ThemeMode.system);

  static Future<void> load() async {
    final preferences = await SharedPreferences.getInstance();
    mode.value = switch (preferences.getString(_key)) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  static Future<void> setMode(ThemeMode value) async {
    mode.value = value;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_key, switch (value) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    });
  }
}
