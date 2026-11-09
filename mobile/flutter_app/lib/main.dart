import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabasePublishableKey = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty) {
    await Supabase.initialize(url: supabaseUrl, anonKey: supabasePublishableKey);
  }
  runApp(const ProviderScope(child: KidsLocApp()));
}

class KidsLocApp extends StatelessWidget {
  const KidsLocApp({super.key});

  @override
  Widget build(BuildContext context) {
    const purple = Color(0xFF8054D8);
    const yellow = Color(0xFFFFC83D);
    return MaterialApp(
      title: 'KidsLoc App',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: purple, primary: purple, secondary: yellow),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFFAF9FD),
      ),
      home: const FoundationScreen(),
    );
  }
}

class FoundationScreen extends StatelessWidget {
  const FoundationScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 76, height: 76,
                decoration: BoxDecoration(color: const Color(0xFF8054D8), borderRadius: BorderRadius.circular(24)),
                alignment: Alignment.center,
                child: const Text('K', style: TextStyle(color: Colors.white, fontSize: 38, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(height: 20),
              const Text('KidsLoc App', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('Sua locadora organizada. Seus eventos no controle.', textAlign: TextAlign.center),
              const SizedBox(height: 24),
              const Chip(label: Text('Fundação do produto · Fase 1')),
            ],
          ),
        ),
      ),
    ),
  );
}
