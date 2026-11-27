import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class PushNotifications {
  PushNotifications._();

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'kidsloc_notifications',
    'Notificações do KidsLoc',
    description: 'Avisos importantes sobre locações e atividades da empresa.',
    importance: Importance.high,
  );

  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static bool _initialized = false;
  static String? _companyId;
  static String? _userId;
  static StreamSubscription<String>? _tokenRefreshSubscription;

  static Future<void> initialize() async {
    if (defaultTargetPlatform != TargetPlatform.android || _initialized) return;

    await Firebase.initializeApp();

    await _localNotifications.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
    _initialized = true;
  }

  static Future<void> _showForegroundNotification(RemoteMessage message) async {
    final title = message.notification?.title ?? message.data['title']?.toString();
    final body = message.notification?.body ?? message.data['body']?.toString();
    if (title == null || title.isEmpty) return;

    await _localNotifications.show(
      id: message.messageId?.hashCode ?? DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: title,
      body: body ?? '',
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
        ),
      ),
    );
  }

  static Future<void> registerDevice({
    required String companyId,
    String? userId,
    String? accessToken,
  }) async {
    if (!_initialized || defaultTargetPlatform != TargetPlatform.android) return;

    final client = Supabase.instance.client;
    final resolvedUserId = client.auth.currentUser?.id ?? userId;
    if (resolvedUserId == null || resolvedUserId.isEmpty) return;
    if (accessToken != null && accessToken.isNotEmpty) {
      client.rest.setAuth(accessToken);
    }

    _companyId = companyId;
    _userId = resolvedUserId;

    try {
      final permission = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (permission.authorizationStatus == AuthorizationStatus.denied) return;

      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await _saveToken(token);
      }

      _tokenRefreshSubscription ??=
          FirebaseMessaging.instance.onTokenRefresh.listen(_saveToken);
    } catch (error) {
      debugPrint('KidsLoc: não foi possível registrar o dispositivo para push: $error');
    }
  }

  static Future<void> _saveToken(String token) async {
    final companyId = _companyId;
    final userId = _userId;
    if (companyId == null || userId == null) return;

    try {
      await Supabase.instance.client.from('fcm_device_tokens').upsert(
        {
          'company_id': companyId,
          'user_id': userId,
          'token': token,
          'platform': 'android',
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        },
        onConflict: 'token',
      );
    } catch (error) {
      debugPrint('KidsLoc: não foi possível salvar o token FCM: $error');
    }
  }

  static Future<void> unregisterCurrentDevice() async {
    if (!_initialized) return;

    final userId = _userId ?? Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return;

    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await Supabase.instance.client
            .from('fcm_device_tokens')
            .delete()
            .eq('token', token)
            .eq('user_id', userId);
      }
    } catch (error) {
      debugPrint('KidsLoc: não foi possível remover o registro deste dispositivo: $error');
    } finally {
      await _tokenRefreshSubscription?.cancel();
      _tokenRefreshSubscription = null;
      _companyId = null;
      _userId = null;
    }
  }
}
