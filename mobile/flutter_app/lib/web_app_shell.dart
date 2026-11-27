import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'services/push_notifications.dart';

const _kidsLocWebUrl = 'https://vbf1.github.io/kidsloc-app/login/';
const _kidsLocWebHost = 'vbf1.github.io';

class KidsLocWebApp extends StatefulWidget {
  const KidsLocWebApp({super.key});

  @override
  State<KidsLocWebApp> createState() => _KidsLocWebAppState();
}

class _KidsLocWebAppState extends State<KidsLocWebApp>
    with WidgetsBindingObserver {
  late final WebViewController _controller;
  bool _loading = true;
  String? _pageError;
  String? _lastRegisteredSession;
  String? _webVersion;
  bool _versionCheckInProgress = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF8F7FC))
      ..addJavaScriptChannel(
        'KidsLocNative',
        onMessageReceived: _handleNativeMessage,
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (!mounted) return;
            setState(() {
              _loading = true;
              _pageError = null;
            });
          },
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() => _loading = false);
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame != true || !mounted) return;
            setState(() {
              _loading = false;
              _pageError =
                  'Não foi possível carregar o KidsLoc. Verifique sua conexão e tente novamente.';
            });
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.prevent;
            if (uri.scheme == 'https' && uri.host == _kidsLocWebHost) {
              return NavigationDecision.navigate;
            }
            if (uri.scheme == 'http' || uri.scheme == 'https' ||
                uri.scheme == 'mailto' || uri.scheme == 'tel') {
              launchUrl(uri, mode: LaunchMode.externalApplication);
            }
            return NavigationDecision.prevent;
          },
        ),
      )
      ;
    unawaited(_openLatestVersion());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_checkForWebUpdate());
    }
  }

  Uri _urlForVersion(String? version) {
    final uri = Uri.parse(_kidsLocWebUrl);
    if (version == null || version.isEmpty) return uri;
    return uri.replace(queryParameters: {'v': version});
  }

  Future<String?> _fetchWebVersion() async {
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 5);
    try {
      final uri = Uri.parse(
        'https://$_kidsLocWebHost/kidsloc-app/app-version.json'
        '?check=${DateTime.now().microsecondsSinceEpoch}',
      );
      final request = await client.getUrl(uri).timeout(
            const Duration(seconds: 6),
          );
      request.headers.set(HttpHeaders.cacheControlHeader, 'no-cache');
      final response = await request.close().timeout(
            const Duration(seconds: 6),
          );
      if (response.statusCode != HttpStatus.ok) return null;
      final body = await utf8.decoder.bind(response).join().timeout(
            const Duration(seconds: 4),
          );
      final decoded = jsonDecode(body);
      if (decoded is! Map<String, dynamic>) return null;
      final version = decoded['version'];
      return version is String && version.isNotEmpty ? version : null;
    } catch (error) {
      debugPrint('KidsLoc: não foi possível verificar a versão web: $error');
      return null;
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _openLatestVersion() async {
    final version = await _fetchWebVersion();
    if (!mounted) return;
    _webVersion = version;
    await _controller.loadRequest(_urlForVersion(version));
  }

  Future<void> _checkForWebUpdate() async {
    if (_versionCheckInProgress || !mounted) return;
    _versionCheckInProgress = true;
    try {
      final latestVersion = await _fetchWebVersion();
      if (!mounted || latestVersion == null) return;
      if (_webVersion == null) {
        _webVersion = latestVersion;
        return;
      }
      if (latestVersion == _webVersion) return;

      setState(() {
        _loading = true;
        _pageError = null;
      });
      await _controller.clearCache();
      _webVersion = latestVersion;
      await _controller.loadRequest(_urlForVersion(latestVersion));
    } finally {
      _versionCheckInProgress = false;
    }
  }

  Future<void> _handleNativeMessage(JavaScriptMessage message) async {
    try {
      final decoded = jsonDecode(message.message);
      if (decoded is! Map<String, dynamic>) return;
      switch (decoded['type']) {
        case 'session':
          final companyId = decoded['companyId'] as String?;
          final userId = decoded['userId'] as String?;
          final accessToken = decoded['accessToken'] as String?;
          if (companyId == null || companyId.isEmpty ||
              userId == null || userId.isEmpty ||
              accessToken == null || accessToken.isEmpty) {
            return;
          }
          final sessionKey = '$companyId:$userId:$accessToken';
          if (_lastRegisteredSession == sessionKey) return;
          await PushNotifications.registerDevice(
            companyId: companyId,
            userId: userId,
            accessToken: accessToken,
          );
          _lastRegisteredSession = sessionKey;
          break;
        case 'logout':
          await PushNotifications.unregisterCurrentDevice();
          _lastRegisteredSession = null;
          break;
      }
    } catch (error) {
      debugPrint('KidsLoc: integração nativa indisponível: $error');
    }
  }

  Future<void> _retry() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _pageError = null;
    });
    await _openLatestVersion();
  }

  Future<void> _handleBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF8F7FC),
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_loading && _pageError == null)
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(
                    minHeight: 2,
                    color: Color(0xFF8054D8),
                    backgroundColor: Color(0xFFF0EAFB),
                  ),
                ),
              if (_pageError != null)
                Positioned.fill(
                  child: ColoredBox(
                    color: Color(0xFFF8F7FC),
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.wifi_off_rounded,
                              size: 46,
                              color: Color(0xFF8054D8),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'Sem conexão com o KidsLoc',
                              style: TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF29243A),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              _pageError!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Color(0xFF777184),
                                height: 1.5,
                              ),
                            ),
                            const SizedBox(height: 20),
                            FilledButton.icon(
                              onPressed: _retry,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Tentar novamente'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
