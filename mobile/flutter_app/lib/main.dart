import 'package:flutter/material.dart';
import 'quote_create_page.dart';
import 'rental_create_page.dart';
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

class FoundationScreen extends StatelessWidget {
  const FoundationScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _BrandHeader(),
              SizedBox(height: 20),
              Text('Configure a conexão do aplicativo para começar.'),
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
  Widget build(BuildContext context) => Column(
    children: [
      Icon(Icons.celebration, size: 52, color: Theme.of(context).colorScheme.primary),
      const SizedBox(height: 10),
      Text('KidsLoc', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
      Text('Gestão de festas e locações', style: Theme.of(context).textTheme.bodyMedium),
    ],
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

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String? _companyId;
  String _companyName = 'Minha empresa';
  bool _loading = true;
  String? _error;
  final Map<String, int> _counts = {};
  static const _modules = [
    ['Clientes', 'customers'],
    ['Brinquedos e serviços', 'products'],
    ['Locações', 'rentals'],
    ['Orçamentos', 'rental_quotes'],
    ['Contratos', 'rental_contracts'],
    ['Financeiro', 'financial_transactions'],
    ['Agenda', 'rentals'],
  ];

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final client = Supabase.instance.client;
      final user = client.auth.currentUser;
      if (user == null) {
        if (mounted) Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(builder: (_) => const AuthPage()));
        return;
      }
      final membership = await client.from('company_members')
          .select('company_id, companies(name)')
          .eq('user_id', user.id).limit(1).maybeSingle();
      if (membership == null) {
        if (mounted) Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(builder: (_) => const CompanySetupPage()));
        return;
      }
      final company = membership['companies'];
      final name = company is Map ? company['name']?.toString() : null;
      final companyId = membership['company_id'].toString();
      final counts = <String, int>{};
      for (final module in _modules) {
        final response = await client.from(module[1])
            .select('id')
            .eq('company_id', companyId);
        counts[module[0]] = response.length;
      }
      if (!mounted) return;
      setState(() {
        _companyId = companyId;
        _companyName = name ?? 'Minha empresa';
        _counts
          ..clear()
          ..addAll(counts);
        _loading = false;
      });
    } on PostgrestException catch (_) {
      if (mounted) setState(() {
        _error = 'Não foi possível carregar os módulos. Verifique sua conexão e as permissões.';
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() { _error = 'Ocorreu um erro ao carregar o aplicativo.'; _loading = false; });
    }
  }

  Future<void> _openModule(String title, String table) async {
    if (_companyId == null) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => _RecordsPage(title: title, table: table, companyId: _companyId!),
    ));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('KidsLoc App'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
      IconButton(tooltip: 'Sair', onPressed: () => Supabase.instance.client.auth.signOut(), icon: const Icon(Icons.logout)),
    ]),
    body: _loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(20), children: [
        Text('Painel da empresa', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(_companyName, style: Theme.of(context).textTheme.bodyLarge),
        const SizedBox(height: 16),
        if (_error != null) Card(color: Theme.of(context).colorScheme.errorContainer,
          child: Padding(padding: const EdgeInsets.all(16), child: Text(_error!))),
        Text('Módulos de gestão', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        GridView.builder(
          shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
          itemCount: _modules.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.3),
          itemBuilder: (context, index) {
            final module = _modules[index];
            return Card(clipBehavior: Clip.antiAlias, child: InkWell(
              onTap: () => _openModule(module[0], module[1]),
              child: Padding(padding: const EdgeInsets.all(14), child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Icon(Icons.dashboard_customize_outlined, size: 27),
                  Text(module[0], style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text((_counts[module[0]] ?? 0).toString() + ' registros',
                    style: Theme.of(context).textTheme.bodySmall),
                ],
              )),
            ));
          },
        ),
        const SizedBox(height: 16),
        const Text('Os dados são compartilhados com a versão web e respeitam as permissões da sua empresa.', textAlign: TextAlign.center),
      ]),
    ),
  );
}

class _RecordsPage extends StatefulWidget {
  const _RecordsPage({required this.title, required this.table, required this.companyId});
  final String title;
  final String table;
  final String companyId;
  @override
  State<_RecordsPage> createState() => _RecordsPageState();
}

class _RecordsPageState extends State<_RecordsPage> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  List<Map<String, dynamic>> _rows = [];
  bool get _editable => widget.table == 'customers' || widget.table == 'products';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final result = await Supabase.instance.client.from(widget.table).select('*')
          .eq('company_id', widget.companyId).limit(100);
      if (!mounted) return;
      setState(() {
        _rows = result.map((row) => Map<String, dynamic>.from(row)).toList();
        _rows.sort((a, b) => (a['name'] ?? a['description'] ?? '').toString()
            .toLowerCase().compareTo((b['name'] ?? b['description'] ?? '').toString().toLowerCase()));
        _loading = false;
      });
    } on PostgrestException catch (_) {
      if (mounted) setState(() { _error = 'Não foi possível consultar este módulo. Confira sua permissão e tente novamente.'; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Ocorreu um erro ao consultar os registros.'; _loading = false; });
    }
  }

  String _title(Map<String, dynamic> row) {
    for (final key in ['name', 'description', 'title', 'customer_name']) {
      final value = row[key]?.toString().trim();
      if (value != null && value.isNotEmpty) return value;
    }
    for (final key in ['quote_number', 'rental_number', 'contract_number']) {
      if (row[key] != null) return widget.title + ' #' + row[key].toString();
    }
    return 'Registro';
  }

  Future<void> _openEditor([Map<String, dynamic>? row]) async {
    if (!_editable || _saving) return;
    final isCustomer = widget.table == 'customers';
    final definitions = isCustomer
        ? <String, String>{
            'name': 'Nome completo', 'phone': 'Telefone / WhatsApp',
            'email': 'E-mail', 'cpf': 'CPF', 'address': 'Endereço', 'notes': 'Observações',
          }
        : <String, String>{
            'name': 'Nome do brinquedo ou serviço', 'description': 'Descrição',
            'total_quantity': 'Quantidade disponível', 'daily_price': 'Preço por diária (R\$)',
            'event_price': 'Preço por evento (R\$)',
          };
    final fields = <String, TextEditingController>{};
    for (final entry in definitions.entries) {
      fields[entry.key] = TextEditingController(text: row?[entry.key]?.toString() ?? '');
    }
    String itemType = row?['item_type']?.toString() ?? 'toy';
    bool active = row?['active'] as bool? ?? true;
    final formKey = GlobalKey<FormState>();
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, refreshDialog) => AlertDialog(
          title: Text(row == null ? 'Novo registro' : 'Editar registro'),
          content: SizedBox(width: 440, child: SingleChildScrollView(
            child: Form(key: formKey, child: Column(mainAxisSize: MainAxisSize.min, children: [
              ...definitions.entries.map((entry) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextFormField(
                  controller: fields[entry.key],
                  decoration: InputDecoration(labelText: entry.value),
                  keyboardType: entry.key == 'email' ? TextInputType.emailAddress
                    : (entry.key == 'phone' || entry.key == 'cpf' || entry.key.contains('price') || entry.key == 'total_quantity')
                        ? TextInputType.numberWithOptions(decimal: entry.key.contains('price'))
                        : TextInputType.text,
                  maxLines: entry.key == 'notes' || entry.key == 'description' ? 3 : 1,
                  validator: entry.key == 'name' ? (v) => v == null || v.trim().isEmpty ? 'Campo obrigatório.' : null : null,
                ),
              )),
              if (!isCustomer) ...[
                DropdownButtonFormField<String>(
                  value: itemType,
                  decoration: const InputDecoration(labelText: 'Tipo'),
                  items: const [
                    DropdownMenuItem(value: 'toy', child: Text('Brinquedo')),
                    DropdownMenuItem(value: 'machine', child: Text('Máquina')),
                    DropdownMenuItem(value: 'service', child: Text('Serviço')),
                  ],
                  onChanged: (v) => refreshDialog(() => itemType = v ?? 'toy'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero, title: const Text('Ativo no catálogo'),
                  value: active, onChanged: (v) => refreshDialog(() => active = v),
                ),
              ],
            ])),
          )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () {
              if (formKey.currentState!.validate()) Navigator.pop(dialogContext, true);
            }, child: const Text('Salvar')),
          ],
        ),
      ),
    );
    if (saved == true) {
      final values = <String, dynamic>{};
      for (final entry in fields.entries) {
        final value = entry.value.text.trim();
        if (isCustomer) {
          values[entry.key] = value.isEmpty ? null : value;
        } else if (entry.key == 'total_quantity') {
          values[entry.key] = int.tryParse(value) ?? 1;
        } else if (entry.key.contains('price')) {
          values[entry.key] = double.tryParse(value.replaceAll(',', '.')) ?? 0;
        } else {
          values[entry.key] = value.isEmpty ? null : value;
        }
      }
      if (!isCustomer) {
        values['item_type'] = itemType;
        values['inventory_mode'] = 'quantity';
        values['active'] = active;
        values['total_quantity'] = itemType == 'service' ? 0 : (values['total_quantity'] ?? 1);
        values['daily_price'] = itemType == 'service' ? 0 : (values['daily_price'] ?? 0);
        values['event_price'] = itemType == 'service' ? (values['event_price'] ?? 0) : values['event_price'];
      }
      values['company_id'] = widget.companyId;
      values['updated_at'] = DateTime.now().toUtc().toIso8601String();
      setState(() => _saving = true);
      try {
        final client = Supabase.instance.client;
        if (row == null) {
          await client.from(widget.table).insert(values);
        } else {
          await client.from(widget.table).update(values).eq('id', row['id']).eq('company_id', widget.companyId);
        }
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(isCustomer ? 'Cliente salvo.' : 'Item do catálogo salvo.')));
          await _load();
        }
      } on PostgrestException catch (_) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Não foi possível salvar. Confira os campos e suas permissões.')));
      } catch (_) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ocorreu um erro ao salvar o registro.')));
      } finally {
        if (mounted) setState(() => _saving = false);
      }
    }
    for (final controller in fields.values) { controller.dispose(); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.title), actions: [
      if (widget.table == 'rental_quotes') IconButton(
        tooltip: 'Novo orçamento',
        onPressed: _loading ? null : () async {
          final created = await Navigator.of(context).push<bool>(MaterialPageRoute(
            builder: (_) => QuoteCreatePage(companyId: widget.companyId),
          ));
          if (created == true && mounted) _load();
        },
        icon: const Icon(Icons.add_circle_outline),
      ),
      if (widget.table == 'rentals') IconButton(
        tooltip: 'Nova locação',
        onPressed: _loading ? null : () async {
          final created = await Navigator.of(context).push<bool>(MaterialPageRoute(
            builder: (_) => RentalCreatePage(companyId: widget.companyId),
          ));
          if (created == true && mounted) _load();
        },
        icon: const Icon(Icons.add_circle_outline),
      ),
      if (_editable) IconButton(tooltip: 'Novo cadastro', onPressed: _saving ? null : () => _openEditor(), icon: const Icon(Icons.add)),
      IconButton(tooltip: 'Atualizar', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
    ]),
    body: _loading ? const Center(child: CircularProgressIndicator()) :
      _error != null ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(
        mainAxisSize: MainAxisSize.min, children: [
          Text(_error!, textAlign: TextAlign.center), const SizedBox(height: 12),
          FilledButton(onPressed: _load, child: const Text('Tentar novamente')),
        ]))) :
      RefreshIndicator(onRefresh: _load, child: _rows.isEmpty
        ? ListView(children: [
            const SizedBox(height: 120),
            Center(child: Text(_editable ? 'Nenhum registro cadastrado.' : 'Nenhum registro encontrado.')),
            if (_editable) Center(child: TextButton.icon(onPressed: () => _openEditor(), icon: const Icon(Icons.add), label: const Text('Adicionar primeiro registro'))),
          ])
        : ListView.separated(
          padding: const EdgeInsets.all(12), itemCount: _rows.length,
          separatorBuilder: (_, __) => const SizedBox(height: 6),
          itemBuilder: (context, index) {
            final row = _rows[index];
            final status = row['status']?.toString();
            final date = row['start_date'] ?? row['event_date'] ?? row['due_date'] ?? row['created_at'];
            final amount = row['total_amount'] ?? row['amount'] ?? row['daily_price'] ?? row['event_price'];
            final details = <String>[
              if (row['phone'] != null) row['phone'].toString(),
              if (row['email'] != null) row['email'].toString(),
              if (status != null) 'Situação: ' + status,
              if (date != null) 'Data: ' + date.toString().split('T').first,
              if (amount != null) 'Valor: R\$ ' + amount.toString(),
              if (row['active'] == false) 'Inativo',
            ];
            return Card(child: ListTile(
              title: Text(_title(row), maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: details.isEmpty ? null : Text(details.join(' · '), maxLines: 3, overflow: TextOverflow.ellipsis),
              trailing: _editable ? IconButton(tooltip: 'Editar', onPressed: _saving ? null : () => _openEditor(row), icon: const Icon(Icons.edit_outlined)) : null,
            ));
          },
        )),
  );
}
