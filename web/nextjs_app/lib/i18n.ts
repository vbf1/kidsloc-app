export const LANGUAGE_OPTIONS = [
  { value: 'pt-BR', label: 'Português (Brasil)' }, { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' }, { value: 'it', label: 'Italiano' },
  { value: 'zh-CN', label: '中文（简体）' }, { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' }, { value: 'ar', label: 'العربية' },
] as const;
export type AppLanguage = typeof LANGUAGE_OPTIONS[number]['value'];
export const LANGUAGE_STORAGE_KEY = 'kidsloc-language';
export const LANGUAGE_EVENT = 'kidsloc:language-change';
export const DEFAULT_LANGUAGE: AppLanguage = 'pt-BR';

const common: Record<string, string[]> = {
  'Menu principal':['Main menu','Menú principal','Menu principal','Hauptmenü','Menu principale','主菜单','メインメニュー','메인 메뉴','القائمة الرئيسية'],
  'Visão geral':['Overview','Resumen','Vue d’ensemble','Übersicht','Panoramica','概览','概要','개요','نظرة عامة'],
  'Início':['Home','Inicio','Accueil','Startseite','Home','首页','ホーム','홈','الرئيسية'],
  'Clientes':['Customers','Clientes','Clients','Kunden','Clienti','客户','顧客','고객','العملاء'],
  'Brinquedos e serviços':['Toys and services','Juguetes y servicios','Jeux et services','Spielgeräte und Services','Giochi e servizi','玩具和服务','遊具・サービス','놀이기구 및 서비스','الألعاب والخدمات'],
  'Brinquedos':['Toys','Juguetes','Jeux','Spielgeräte','Giochi','玩具','遊具','놀이기구','الألعاب'],
  'Locações':['Rentals','Alquileres','Locations','Vermietungen','Noleggi','租赁','レンタル','대여','الحجوزات'],
  'Orçamentos':['Quotes','Presupuestos','Devis','Angebote','Preventivi','报价','見積もり','견적','عروض الأسعار'],
  'Financeiro e relatórios':['Finance and reports','Finanzas e informes','Finance et rapports','Finanzen und Berichte','Finanza e report','财务和报表','財務・レポート','재무 및 보고서','المالية والتقارير'],
  'Financeiro':['Finance','Finanzas','Finance','Finanzen','Finanza','财务','財務','재무','المالية'],
  'Contratos':['Contracts','Contratos','Contrats','Verträge','Contratti','合同','契約','계약','العقود'],
  'Agenda':['Calendar','Calendario','Calendrier','Kalender','Calendario','日历','カレンダー','일정','التقويم'],
  'Configurações':['Settings','Configuración','Paramètres','Einstellungen','Impostazioni','设置','設定','설정','الإعدادات'],
  'Mais':['More','Más','Plus','Mehr','Altro','更多','その他','더보기','المزيد'],
  'Mais opções':['More options','Más opciones','Plus d’options','Weitere Optionen','Altre opzioni','更多选项','その他のオプション','추가 옵션','خيارات إضافية'],
  'Fechar':['Close','Cerrar','Fermer','Schließen','Chiudi','关闭','閉じる','닫기','إغلاق'],
  'Sair':['Sign out','Salir','Déconnexion','Abmelden','Esci','退出','ログアウト','로그아웃','تسجيل الخروج'],
  'Cancelar':['Cancel','Cancelar','Annuler','Abbrechen','Annulla','取消','キャンセル','취소','إلغاء'],
  'Pesquisar':['Search','Buscar','Rechercher','Suchen','Cerca','搜索','検索','검색','بحث'],
  'Limpar':['Clear','Limpiar','Effacer','Zurücksetzen','Pulisci','清除','クリア','지우기','مسح'],
  'Editar':['Edit','Editar','Modifier','Bearbeiten','Modifica','编辑','編集','수정','تعديل'],
  'Excluir':['Delete','Eliminar','Supprimer','Löschen','Elimina','删除','削除','삭제','حذف'],
  'Salvar':['Save','Guardar','Enregistrer','Speichern','Salva','保存','保存','저장','حفظ'],
  'Aparência':['Appearance','Apariencia','Apparence','Darstellung','Aspetto','外观','外観','화면 설정','المظهر'],
  'Claro':['Light','Claro','Clair','Hell','Chiaro','浅色','ライト','라이트','فاتح'],
  'Escuro':['Dark','Oscuro','Sombre','Dunkel','Scuro','深色','ダーク','다크','داكن'],
  'Automático':['System','Automático','Automatique','Automatisch','Automatico','跟随系统','自動','자동','تلقائي'],
  'Fundo claro':['Light background','Fondo claro','Fond clair','Heller Hintergrund','Sfondo chiaro','浅色背景','明るい背景','밝은 배경','خلفية فاتحة'],
  'Confortável à noite':['Comfortable at night','Cómodo por la noche','Confortable la nuit','Angenehm bei Nacht','Confortevole di notte','适合夜间使用','夜間に見やすい','야간에 편안함','مريح ليلاً'],
  'Segue o dispositivo':['Follows device settings','Según el dispositivo','Selon l’appareil','Geräteeinstellung verwenden','Segui il dispositivo','跟随设备设置','端末の設定に従う','기기 설정 따르기','حسب إعدادات الجهاز'],
  'Preferências':['Preferences','Preferencias','Préférences','Einstellungen','Preferenze','偏好设置','設定','환경설정','التفضيلات'],
  'Configurações do app':['App settings','Configuración de la app','Paramètres de l’application','App-Einstellungen','Impostazioni dell’app','应用设置','アプリ設定','앱 설정','إعدادات التطبيق'],
  'Idioma':['Language','Idioma','Langue','Sprache','Lingua','语言','言語','언어','اللغة'],
  'Idioma do aplicativo':['App language','Idioma de la aplicación','Langue de l’application','App-Sprache','Lingua dell’app','应用语言','アプリの言語','앱 언어','لغة التطبيق'],
  'Padrão de sinal':['Deposit default','Anticipo predeterminado','Acompte par défaut','Standardanzahlung','Acconto predefinito','默认定金','デフォルトの予約金','기본 예약금','العربون الافتراضي'],
  'Forma de pagamento':['Payment method','Método de pago','Mode de paiement','Zahlungsart','Metodo di pagamento','付款方式','支払い方法','결제 수단','طريقة الدفع'],
  'Data do pagamento':['Payment date','Fecha de pago','Date du paiement','Zahlungsdatum','Data di pagamento','付款日期','支払日','결제일','تاريخ الدفع'],
  'Dinheiro':['Cash','Efectivo','Espèces','Bargeld','Contanti','现金','現金','현금','نقداً'],
  'Cartão de crédito':['Credit card','Tarjeta de crédito','Carte de crédit','Kreditkarte','Carta di credito','信用卡','クレジットカード','신용카드','بطاقة ائتمان'],
  'Cartão de débito':['Debit card','Tarjeta de débito','Carte de débit','Debitkarte','Carta di debito','借记卡','デビットカード','체크카드','بطاقة خصم'],
  'Transferência bancária':['Bank transfer','Transferencia bancaria','Virement bancaire','Banküberweisung','Bonifico bancario','银行转账','銀行振込','계좌 이체','تحويل بنكي'],
  'Outro':['Other','Otro','Autre','Andere','Altro','其他','その他','기타','أخرى'],
  'Pagou sinal':['Deposit paid','Anticipo pagado','Acompte payé','Anzahlung bezahlt','Acconto pagato','已付定金','予約金支払い済み','예약금 결제 완료','تم دفع العربون'],
  'Quitou saldo restante':['Paid remaining balance','Saldo restante pagado','Solde restant payé','Restbetrag bezahlt','Saldo residuo pagato','已付清余款','残額支払い済み','잔액 결제 완료','تم سداد الرصيد المتبقي'],
  'Histórico de recebimentos':['Payment history','Historial de cobros','Historique des paiements','Zahlungsverlauf','Cronologia pagamenti','收款记录','入金履歴','입금 내역','سجل المدفوعات'],
  'Em andamento':['In progress','En curso','En cours','In Bearbeitung','In corso','进行中','進行中','진행 중','قيد التنفيذ'],
  'Data':['Date','Fecha','Date','Datum','Data','日期','日付','날짜','التاريخ'],
  'Valor':['Amount','Importe','Montant','Betrag','Importo','金额','金額','금액','المبلغ'],
  'Descrição':['Description','Descripción','Description','Beschreibung','Descrizione','描述','説明','설명','الوصف'],
  'Categoria':['Category','Categoría','Catégorie','Kategorie','Categoria','类别','カテゴリ','분류','الفئة'],
  'Observações':['Notes','Observaciones','Notes','Notizen','Note','备注','メモ','메모','ملاحظات'],
  'Telefone':['Phone','Teléfono','Téléphone','Telefon','Telefono','电话','電話番号','전화','الهاتف'],
  'E-mail':['Email','Correo electrónico','E-mail','E-Mail','E-mail','电子邮件','メール','이메일','البريد الإلكتروني'],
  'Empresa':['Company','Empresa','Entreprise','Unternehmen','Azienda','企业','会社','회사','الشركة'],
  'Usuário':['User','Usuario','Utilisateur','Benutzer','Utente','用户','ユーザー','사용자','المستخدم'],
  'Perfil':['Role','Perfil','Rôle','Rolle','Ruolo','角色','役割','역할','الدور'],
  'Anterior':['Previous','Anterior','Précédent','Zurück','Precedente','上一页','前へ','이전','السابق'],
  'Próxima':['Next','Siguiente','Suivant','Weiter','Successivo','下一页','次へ','다음','التالي'],
  'Voltar':['Back','Volver','Retour','Zurück','Indietro','返回','戻る','뒤로','رجوع'],
  'Resumo da operação':['Operations summary','Resumen de operaciones','Résumé des opérations','Betriebsübersicht','Riepilogo operazioni','运营摘要','運営概要','운영 요약','ملخص العمليات'],
  'Próximos eventos':['Upcoming events','Próximos eventos','Événements à venir','Kommende Veranstaltungen','Prossimi eventi','即将举行的活动','今後のイベント','다가오는 행사','الفعاليات القادمة'],
  'Ver agenda':['View calendar','Ver calendario','Voir le calendrier','Kalender ansehen','Vedi calendario','查看日历','カレンダーを見る','일정 보기','عرض التقويم'],
  'Acesso rápido':['Quick access','Acceso rápido','Accès rapide','Schnellzugriff','Accesso rapido','快捷访问','クイックアクセス','빠른 실행','وصول سريع'],
  'Atenção financeira':['Financial alert','Atención financiera','Alerte financière','Finanzhinweis','Attenzione finanziaria','财务提醒','財務アラート','재무 알림','تنبيه مالي'],
};
export function normalizeLanguage(value: unknown): AppLanguage {
  return LANGUAGE_OPTIONS.some((item) => item.value === value) ? value as AppLanguage : DEFAULT_LANGUAGE;
}
export function translateText(value: string, language: AppLanguage): string {
  if (language === 'pt-BR') return value;
  const index = LANGUAGE_OPTIONS.findIndex((item) => item.value === language) - 1;
  return common[value]?.[index] ?? value;
}
