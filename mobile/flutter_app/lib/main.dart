import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _webAppBaseUrl = 'https://vbf1.github.io/kidsloc-app';

const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabasePublishableKey =
    String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty) {
    await Supabase.initialize(
        url: supabaseUrl, publishableKey: supabasePublishableKey);
  }
  runApp(const ProviderScope(child: KidsLocApp()));
}

class KidsLocApp extends StatelessWidget {
  const KidsLocApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'KidsLoc App',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF8054D8),
            primary: const Color(0xFF8054D8),
            secondary: const Color(0xFFFFC83D),
          ),
          useMaterial3: true,
          scaffoldBackgroundColor: const Color(0xFFFAF9FD),
        ),
        home: supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty
            ? const AuthGate()
            : const FoundationScreen(),
      );
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final client = Supabase.instance.client;
    return StreamBuilder<AuthState>(
      stream: client.auth.onAuthStateChange,
      builder: (context, _) {
        if (client.auth.currentSession == null) return const AuthPage();
        return const CompanySetupPage();
      },
    );
  }
}

class AuthPage extends StatefulWidget {
  const AuthPage({super.key});

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _creating = false;
  bool _busy = false;
  String? _message;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final auth = Supabase.instance.client.auth;
      if (_creating) {
        final response = await auth.signUp(
          email: _email.text.trim(),
          password: _password.text,
          emailRedirectTo: '$_webAppBaseUrl/app/company/',
          data: {'full_name': _name.text.trim()},
        );
        if (response.session == null && mounted) {
          setState(() =>
              _message = 'Conta criada. Confirme seu e-mail para continuar.');
        }
      } else {
        await auth.signInWithPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
    } on AuthException catch (_) {
      if (mounted) {
        setState(() => _message =
            'Não foi possível autenticar. Confira os dados e tente novamente.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _message = 'Ocorreu um erro. Tente novamente.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const _BrandHeader(),
                      const SizedBox(height: 32),
                      Text(
                        _creating ? 'Criar sua conta' : 'Entrar na sua conta',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 20),
                      if (_creating) ...[
                        TextFormField(
                          controller: _name,
                          decoration:
                              const InputDecoration(labelText: 'Seu nome'),
                          validator: (value) =>
                              (value == null || value.trim().length < 2)
                                  ? 'Informe seu nome.'
                                  : null,
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(labelText: 'E-mail'),
                        validator: (value) =>
                            (value == null || !value.contains('@'))
                                ? 'Informe um e-mail válido.'
                                : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: 'Senha'),
                        validator: (value) =>
                            (value == null || value.length < 8)
                                ? 'Use pelo menos 8 caracteres.'
                                : null,
                      ),
                      if (_message != null) ...[
                        const SizedBox(height: 16),
                        Text(_message!,
                            style: const TextStyle(color: Colors.red)),
                      ],
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        child: Text(_busy
                            ? 'Aguarde...'
                            : _creating
                                ? 'Criar conta'
                                : 'Entrar'),
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _creating = !_creating;
                                  _message = null;
                                }),
                        child: Text(_creating
                            ? 'Já tenho uma conta'
                            : 'Ainda não tenho conta'),
                      ),
                      if (!_creating)
                        TextButton(
                          onPressed: () async {
                            final email = _email.text.trim();
                            if (!email.contains('@')) {
                              setState(() => _message =
                                  'Informe seu e-mail acima para recuperar a senha.');
                              return;
                            }
                            try {
                              await Supabase.instance.client.auth
                                  .resetPasswordForEmail(
                                email,
                                redirectTo: '$_webAppBaseUrl/reset-password/',
                              );
                              if (mounted) {
                                setState(() => _message =
                                    'Se o e-mail estiver cadastrado, você receberá o link de recuperação.');
                              }
                            } catch (_) {
                              if (mounted) {
                                setState(() => _message =
                                    'Não foi possível solicitar a recuperação.');
                              }
                            }
                          },
                          child: const Text('Esqueci minha senha'),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class CompanySetupPage extends StatefulWidget {
  const CompanySetupPage({super.key});

  @override
  State<CompanySetupPage> createState() => _CompanySetupPageState();
}

class _CompanySetupPageState extends State<CompanySetupPage> {
  final _name = TextEditingController();
  bool _busy = false;
  bool _checking = true;
  String? _message;

  @override
  void initState() {
    super.initState();
    _checkMembership();
  }

  Future<void> _checkMembership() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) return;
      final rows = await Supabase.instance.client
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .limit(1);
      if (!mounted) return;
      if (rows.isNotEmpty) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(builder: (_) => const HomePage()),
        );
        return;
      }
    } on PostgrestException catch (_) {
      if (mounted) {
        setState(() => _message =
            'Não foi possível consultar seu vínculo com a empresa. Tente novamente.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _message = 'Não foi possível verificar a empresa.');
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _createCompany() async {
    final name = _name.text.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (name.runes.length < 2 || name.runes.length > 160) {
      setState(() =>
          _message = 'Informe um nome de empresa entre 2 e 160 caracteres.');
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await Supabase.instance.client.rpc('create_company', params: {
        'p_name': name,
      });
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(builder: (_) => const HomePage()),
        );
      }
    } on PostgrestException catch (_) {
      if (mounted) {
        setState(() => _message =
            'Não foi possível cadastrar a empresa. Confira os dados e tente novamente.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _message = 'Ocorreu um erro. Tente novamente.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Cadastro da empresa'),
          actions: [
            IconButton(
              tooltip: 'Sair',
              onPressed: () => Supabase.instance.client.auth.signOut(),
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: _checking
            ? const Center(child: CircularProgressIndicator())
            : Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const _BrandHeader(),
                        const SizedBox(height: 28),
                        Text(
                          'Cadastre sua empresa',
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Essas informações serão usadas para organizar seus clientes, brinquedos, serviços e reservas.',
                        ),
                        const SizedBox(height: 20),
                        TextField(
                          controller: _name,
                          decoration: const InputDecoration(
                            labelText: 'Nome da empresa',
                          ),
                          maxLength: 160,
                        ),
                        const SizedBox(height: 12),
                        if (_message != null) ...[
                          const SizedBox(height: 16),
                          Text(
                            _message!,
                            style: const TextStyle(color: Colors.red),
                          ),
                        ],
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: _busy ? null : _createCompany,
                          child: Text(
                            _busy ? 'Salvando...' : 'Cadastrar empresa',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
      );
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('KidsLoc App'),
          actions: [
            IconButton(
              tooltip: 'Sair',
              onPressed: () => Supabase.instance.client.auth.signOut(),
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Cadastro da empresa concluído. Seu acesso ao KidsLoc está ativo.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
}

class FoundationScreen extends StatelessWidget {
  const FoundationScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _BrandHeader(),
                  SizedBox(height: 20),
                  Text(
                    'Configure a URL e a chave publicável do Supabase para habilitar o acesso.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) => const Column(
        children: [
          SizedBox(
            width: 72,
            height: 72,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Color(0xFF8054D8),
                borderRadius: BorderRadius.all(Radius.circular(22)),
              ),
              child: Center(
                child: Text(
                  'K',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ),
          SizedBox(height: 12),
          Text(
            'KidsLoc App',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
          ),
        ],
      );
}
