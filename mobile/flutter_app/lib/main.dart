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

class _RentalCreatePage extends StatefulWidget {
  const _RentalCreatePage({required this.companyId});
  final String companyId;

  @override
  State<_RentalCreatePage> createState() => _RentalCreatePageState();
}

class _RentalCreatePageState extends State<_RentalCreatePage> {
  final _formKey = GlobalKey<FormState>();
  final _address = TextEditingController();
  final _total = TextEditingController();
  final _startTime = TextEditingController(text: '09:00');
  final _endTime = TextEditingController(text: '18:00');
  bool _loading = true;
  bool _saving = false;
  String? _error;
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _products = [];
  String? _customerId;
  String _deliveryMethod = 'customer_pickup';
  String _status = 'pending';
  DateTime _startDate = DateTime.now();
  DateTime _endDate = DateTime.now();
  String? _productId;
  final List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _loadOptions();
  }

  @override
  void dispose() {
    _address.dispose();
    _total.dispose();
    _startTime.dispose();
    _endTime.dispose();
    super.dispose();
  }

  Future<void> _loadOptions() async {
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('customers').select('id,name,phone')
            .eq('company_id', widget.companyId).order('name'),
        client.from('products').select('id,name,item_type,inventory_mode,total_quantity,daily_price,event_price')
            .eq('company_id', widget.companyId).eq('active', true).order('name'),
      ]);
      if (!mounted) return;
      setState(() {
        _customers = results[0].map((e) => Map<String, dynamic>.from(e)).toList();
        _products = results[1].map((e) => Map<String, dynamic>.from(e)).toList();
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'Não foi possível carregar clientes e brinquedos. Confira suas permissões.';
        _loading = false;
      });
    }
  }

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  Future<void> _pickDate(bool start) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: start ? _startDate : _endDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      if (start) {
        _startDate = picked;
        if (_endDate.isBefore(picked)) _endDate = picked;
      } else {
        _endDate = picked;
      }
    });
  }

  void _addProduct() {
    if (_productId == null || _items.any((item) => item['product_id'] == _productId)) return;
    final product = _products.firstWhere((p) => p['id'] == _productId);
    final price = product['event_price'] ?? product['daily_price'] ?? 0;
    setState(() {
      _items.add({
        'product_id': _productId,
        'name': product['name'],
        'quantity': 1,
        'unit_price': (price as num).toDouble(),
      });
      _productId = null;
      _recalculateTotal();
    });
  }

  void _recalculateTotal() {
    final total = _items.fold<double>(
      0,
      (sum, item) => sum + (item['quantity'] as int) * (item['unit_price'] as double),
    );
    _total.text = total.toStringAsFixed(2);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _items.isEmpty || _saving) {
      if (_items.isEmpty) setState(() => _error = 'Adicione pelo menos um brinquedo ou serviço.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      final total = double.parse(_total.text.replaceAll(',', '.'));
      await Supabase.instance.client.rpc('create_rental_with_items', params: {
        'p_company_id': widget.companyId,
        'p_customer_id': _customerId,
        'p_start_date': _date(_startDate),
        'p_end_date': _date(_endDate),
        'p_status': _status,
        'p_delivery_method': _deliveryMethod,
        'p_total_amount': total,
        'p_items': _items.map((item) => {
          'product_id': item['product_id'],
          'quantity': item['quantity'],
          'unit_price': item['unit_price'],
        }).toList(),
        'p_delivery_address': _deliveryMethod == 'delivery' ? _address.text.trim() : null,
        'p_responsible_user_ids': userId == null ? <String>[] : <String>[userId],
        'p_start_time': _startTime.text.trim(),
        'p_end_time': _endTime.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Locação criada. Estoque e horários validados pelo sistema.')),
      );
      Navigator.pop(context, true);
    } on PostgrestException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível salvar a locação. Tente novamente.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Nova locação')),
    body: _loading
      ? const Center(child: CircularProgressIndicator())
      : _error != null && _customers.isEmpty
        ? Center(child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: _loadOptions, child: const Text('Tentar novamente')),
            ]),
          ))
        : Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Cliente', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: _customerId,
                  decoration: const InputDecoration(labelText: 'Selecione o cliente'),
                  items: _customers.map((customer) => DropdownMenuItem(
                    value: customer['id'].toString(),
                    child: Text(customer['name'].toString(), overflow: TextOverflow.ellipsis),
                  )).toList(),
                  onChanged: (value) => setState(() => _customerId = value),
                  validator: (value) => value == null ? 'Selecione um cliente.' : null,
                ),
                const SizedBox(height: 20),
                Text('Período do evento', style: Theme.of(context).textTheme.titleMedium),
                Row(children: [
                  Expanded(child: OutlinedButton.icon(
                    onPressed: () => _pickDate(true),
                    icon: const Icon(Icons.calendar_today),
                    label: Text('Início: ${_date(_startDate)}'),
                  )),
                  const SizedBox(width: 8),
                  Expanded(child: OutlinedButton.icon(
                    onPressed: () => _pickDate(false),
                    icon: const Icon(Icons.event),
                    label: Text('Fim: ${_date(_endDate)}'),
                  )),
                ]),
                Row(children: [
                  Expanded(child: TextFormField(
                    controller: _startTime,
                    decoration: const InputDecoration(labelText: 'Horário inicial', hintText: '09:00'),
                    validator: (v) => v == null || !RegExp(r'^([01]\d|2[0-3]):[0-5]\d
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
      if (_editable) IconButton(tooltip: 'Novo cadastro', onPressed: _saving ? null : () => _openEditor(), icon: const Icon(Icons.add)),
      if (widget.table == 'rentals') IconButton(
        tooltip: 'Nova locação',
        onPressed: _loading ? null : () async {
          final created = await Navigator.of(context).push<bool>(MaterialPageRoute(
            builder: (_) => _RentalCreatePage(companyId: widget.companyId),
          ));
          if (created == true && mounted) _load();
        },
        icon: const Icon(Icons.add_circle_outline),
      ),
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
).hasMatch(v)
                      ? 'Use HH:MM' : null,
                  )),
                  const SizedBox(width: 12),
                  Expanded(child: TextFormField(
                    controller: _endTime,
                    decoration: const InputDecoration(labelText: 'Horário final', hintText: '18:00'),
                    validator: (v) => v == null || !RegExp(r'^([01]\d|2[0-3]):[0-5]\d
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
).hasMatch(v)
                      ? 'Use HH:MM' : null,
                  )),
                ]),
                const SizedBox(height: 20),
                Text('Brinquedos e serviços', style: Theme.of(context).textTheme.titleMedium),
                Row(children: [
                  Expanded(child: DropdownButtonFormField<String>(
                    value: _productId,
                    decoration: const InputDecoration(labelText: 'Selecione um item'),
                    items: _products.map((product) => DropdownMenuItem(
                      value: product['id'].toString(),
                      child: Text(product['name'].toString(), overflow: TextOverflow.ellipsis),
                    )).toList(),
                    onChanged: (value) => setState(() => _productId = value),
                  )),
                  IconButton(onPressed: _addProduct, icon: const Icon(Icons.add_circle), tooltip: 'Adicionar item'),
                ]),
                ..._items.map((item) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(children: [
                      Row(children: [
                        Expanded(child: Text(item['name'].toString(), style: const TextStyle(fontWeight: FontWeight.w600))),
                        IconButton(onPressed: () => setState(() {
                          _items.remove(item);
                          _recalculateTotal();
                        }), icon: const Icon(Icons.delete_outline)),
                      ]),
                      Row(children: [
                        SizedBox(width: 100, child: TextFormField(
                          initialValue: '1',
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'Quantidade'),
                          onChanged: (value) => setState(() {
                            item['quantity'] = int.tryParse(value) ?? 1;
                            _recalculateTotal();
                          }),
                        )),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(
                          initialValue: (item['unit_price'] as double).toStringAsFixed(2),
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(labelText: 'Preço unitário (R$)'),
                          onChanged: (value) => setState(() {
                            item['unit_price'] = double.tryParse(value.replaceAll(',', '.')) ?? 0;
                            _recalculateTotal();
                          }),
                        )),
                      ]),
                    ]),
                  ),
                )),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: _deliveryMethod,
                  decoration: const InputDecoration(labelText: 'Entrega'),
                  items: const [
                    DropdownMenuItem(value: 'customer_pickup', child: Text('Cliente retira')),
                    DropdownMenuItem(value: 'delivery', child: Text('Entregar no endereço')),
                  ],
                  onChanged: (value) => setState(() => _deliveryMethod = value ?? 'customer_pickup'),
                ),
                if (_deliveryMethod == 'delivery')
                  TextFormField(
                    controller: _address,
                    decoration: const InputDecoration(labelText: 'Endereço de entrega'),
                    validator: (value) => _deliveryMethod == 'delivery' && (value == null || value.trim().isEmpty)
                      ? 'Informe o endereço.' : null,
                  ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: _status,
                  decoration: const InputDecoration(labelText: 'Situação'),
                  items: const [
                    DropdownMenuItem(value: 'pending', child: Text('Pendente')),
                    DropdownMenuItem(value: 'confirmed', child: Text('Confirmada')),
                  ],
                  onChanged: (value) => setState(() => _status = value ?? 'pending'),
                ),
                TextFormField(
                  controller: _total,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Valor total (R$)'),
                  validator: (value) => value == null || double.tryParse(value.replaceAll(',', '.')) == null
                    ? 'Informe um valor válido.' : null,
                ),
                if (_error != null) Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.save),
                  label: Text(_saving ? 'Salvando...' : 'Salvar locação'),
                ),
              ],
            ),
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
