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

String appText(String source) {
  final index = switch (AppLanguageController.languageTag) {
    'en' => 0, 'es' => 1, 'fr' => 2, 'de' => 3, 'it' => 4,
    'zh-CN' => 5, 'ja' => 6, 'ko' => 7, 'ar' => 8, _ => -1,
  };
  if (index < 0) return source;
  const translations = <String, List<String>>{
    'Configurações do app': ['App settings','Configuración de la app','Paramètres de l’application','App-Einstellungen','Impostazioni dell’app','应用设置','アプリ設定','앱 설정','إعدادات التطبيق'],
    'Idioma': ['Language','Idioma','Langue','Sprache','Lingua','语言','言語','언어','اللغة'],
    'Escolha o idioma de todo o aplicativo.': ['Choose the language for the entire app.','Elige el idioma de toda la aplicación.','Choisissez la langue de toute l’application.','Wählen Sie die Sprache für die gesamte App.','Scegli la lingua per tutta l’app.','选择整个应用的语言。','アプリ全体の言語を選択します。','앱 전체에서 사용할 언어를 선택하세요.','اختر لغة التطبيق بالكامل.'],
    'Aparência': ['Appearance','Apariencia','Apparence','Darstellung','Aspetto','外观','外観','화면 설정','المظهر'],
    'Escolha o tema usado neste dispositivo.': ['Choose the theme used on this device.','Elige el tema usado en este dispositivo.','Choisissez le thème utilisé sur cet appareil.','Wählen Sie das auf diesem Gerät verwendete Design.','Scegli il tema usato su questo dispositivo.','选择此设备使用的主题。','この端末で使用するテーマを選択します。','이 기기에서 사용할 테마를 선택하세요.','اختر السمة المستخدمة على هذا الجهاز.'],
    'Claro': ['Light','Claro','Clair','Hell','Chiaro','浅色','ライト','라이트','فاتح'],
    'Escuro': ['Dark','Oscuro','Sombre','Dunkel','Scuro','深色','ダーク','다크','داكن'],
    'Automático': ['System','Automático','Automatique','Automatisch','Automatico','跟随系统','自動','자동','تلقائي'],
    'Padrão de sinal': ['Deposit default','Anticipo predeterminado','Acompte par défaut','Standardanzahlung','Acconto predefinito','默认定金','デフォルトの予約金','기본 예약금','العربون الافتراضي'],
    'Percentual sugerido automaticamente nas novas locações.': ['Suggested percentage for new rentals.','Porcentaje sugerido en nuevos alquileres.','Pourcentage suggéré pour les nouvelles locations.','Vorgeschlagener Prozentsatz für neue Vermietungen.','Percentuale suggerita per i nuovi noleggi.','新租赁的建议百分比。','新しいレンタルの推奨割合。','새 대여에 제안되는 비율입니다.','النسبة المقترحة للحجوزات الجديدة.'],
    'Percentual padrão (%)': ['Default percentage (%)','Porcentaje predeterminado (%)','Pourcentage par défaut (%)','Standardprozentsatz (%)','Percentuale predefinita (%)','默认百分比 (%)','標準割合 (%)','기본 비율 (%)','النسبة الافتراضية (%)'],
    'Somente administradores podem alterar esta configuração.': ['Only administrators can change this setting.','Solo los administradores pueden cambiar este ajuste.','Seuls les administrateurs peuvent modifier ce paramètre.','Nur Administratoren können diese Einstellung ändern.','Solo gli amministratori possono modificare questa impostazione.','只有管理员可以更改此设置。','この設定を変更できるのは管理者のみです。','관리자만 이 설정을 변경할 수 있습니다.','يمكن للمسؤولين فقط تغيير هذا الإعداد.'],
    'Salvando...': ['Saving...','Guardando...','Enregistrement...','Speichern...','Salvataggio...','正在保存...','保存中...','저장 중...','جارٍ الحفظ...'],
    'Salvar configurações': ['Save settings','Guardar configuración','Enregistrer les paramètres','Einstellungen speichern','Salva impostazioni','保存设置','設定を保存','설정 저장','حفظ الإعدادات'],
    'Não foi possível carregar as configurações.': ['Could not load settings.','No se pudo cargar la configuración.','Impossible de charger les paramètres.','Einstellungen konnten nicht geladen werden.','Impossibile caricare le impostazioni.','无法加载设置。','設定を読み込めませんでした。','설정을 불러올 수 없습니다.','تعذر تحميل الإعدادات.'],
    'Informe um percentual entre 0 e 100.': ['Enter a percentage between 0 and 100.','Introduce un porcentaje entre 0 y 100.','Saisissez un pourcentage entre 0 et 100.','Geben Sie einen Prozentsatz zwischen 0 und 100 ein.','Inserisci una percentuale tra 0 e 100.','请输入 0 到 100 之间的百分比。','0〜100の割合を入力してください。','0에서 100 사이의 비율을 입력하세요.','أدخل نسبة بين 0 و100.'],
    'Configurações salvas. O percentual será usado nas novas locações.': ['Settings saved. The percentage will be used for new rentals.','Configuración guardada. El porcentaje se usará en nuevos alquileres.','Paramètres enregistrés. Le pourcentage sera utilisé pour les nouvelles locations.','Einstellungen gespeichert. Der Prozentsatz gilt für neue Vermietungen.','Impostazioni salvate. La percentuale sarà usata per i nuovi noleggi.','设置已保存。该百分比将用于新的租赁。','設定を保存しました。この割合は新しいレンタルに適用されます。','설정이 저장되었습니다. 이 비율은 새 대여에 적용됩니다.','تم حفظ الإعدادات. ستُستخدم النسبة في الحجوزات الجديدة.'],
    'Não foi possível salvar as configurações.': ['Could not save settings.','No se pudo guardar la configuración.','Impossible d’enregistrer les paramètres.','Einstellungen konnten nicht gespeichert werden.','Impossibile salvare le impostazioni.','无法保存设置。','設定を保存できませんでした。','설정을 저장할 수 없습니다.','تعذر حفظ الإعدادات.'],
    'O tema é salvo neste dispositivo. O percentual de sinal é compartilhado com a empresa e não altera locações antigas automaticamente.': ['The theme is saved on this device. The deposit percentage is shared with the company and does not automatically change existing rentals.','El tema se guarda en este dispositivo. El porcentaje de anticipo se comparte con la empresa y no cambia automáticamente los alquileres anteriores.','Le thème est enregistré sur cet appareil. Le pourcentage d’acompte est partagé avec l’entreprise et ne modifie pas automatiquement les locations existantes.','Das Design wird auf diesem Gerät gespeichert. Der Anzahlungsprozentsatz wird mit dem Unternehmen geteilt und ändert bestehende Vermietungen nicht automatisch.','Il tema viene salvato su questo dispositivo. La percentuale di acconto è condivisa con l’azienda e non modifica automaticamente i noleggi esistenti.','主题保存在此设备上。定金百分比由公司共享，不会自动更改现有租赁。','テーマはこの端末に保存されます。予約金の割合は会社で共有され、既存のレンタルは自動変更されません。','테마는 이 기기에 저장됩니다. 예약금 비율은 회사와 공유되며 기존 대여를 자동으로 변경하지 않습니다.','يُحفظ المظهر على هذا الجهاز. تتم مشاركة نسبة العربون مع الشركة ولا تغيّر الحجوزات السابقة تلقائياً.'],
  };
  return translations[source]?[index] ?? source;
}
