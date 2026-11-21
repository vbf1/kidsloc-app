import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class FinancePage extends StatefulWidget {
  const FinancePage({super.key, required this.companyId});
  final String companyId;

  @override
  State<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends State<FinancePage> {
  bool _loading = true;
  bool _saving = false;
  bool _canManage = false;
  String? _error;
  List<Map<String, dynamic>> _transactions = [];
  List<Map<String, dynamic>> _payments = [];
  Map<String, double> _paidByTransaction = {};
  Map<String, Map<String, dynamic>> _rentalInfo = {};
  String _filter = 'all';
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  double _money(dynamic value) => value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final client = Supabase.instance.client;
      final userId = client.auth.currentUser?.id;
      final results = await Future.wait([
        client.from('financial_transactions').select('id,company_id,rental_id,transaction_type,category,description,amount,due_date,paid_at,payment_method,status,created_at').eq('company_id', widget.companyId).order('due_date', ascending: true),
        client.from('payments').select('id,transaction_id,rental_id,amount,paid_at,payment_method,notes').eq('company_id', widget.companyId).order('paid_at', ascending: false),
        client.from('company_members').select('role').eq('company_id', widget.companyId).eq('user_id', userId ?? ''),
      ]);
      final rows = results[0].map((e) => Map<String, dynamic>.from(e)).toList();
      final paymentRows = results[1].map((e) => Map<String, dynamic>.from(e)).toList();
      final paid = <String, double>{};
      for (final item in paymentRows) {
        final id = item['transaction_id']?.toString();
        if (id != null) paid[id] = (paid[id] ?? 0) + _money(item['amount']);
      }
      final role = results[2].isEmpty ? '' : results[2].first['role']?.toString() ?? '';
      final rentalIds = <String>{
        ...rows.map((e) => e['rental_id']?.toString() ?? ''),
        ...paymentRows.map((e) => e['rental_id']?.toString() ?? ''),
      }..removeWhere((id) => id.isEmpty);
      final rentalInfo = <String, Map<String, dynamic>>{};
      if (rentalIds.isNotEmpty) {
        try {
          final rentals = await client.from('rentals').select('id,rental_number,customer_id').eq('company_id', widget.companyId).inFilter('id', rentalIds.toList());
          final customerIds = <String>{};
          for (final item in rentals) {
            final rental = Map<String, dynamic>.from(item);
            final id = rental['id']?.toString();
            if (id != null) rentalInfo[id] = rental;
            final customerId = rental['customer_id']?.toString();
            if (customerId != null && customerId.isNotEmpty) customerIds.add(customerId);
          }
          if (customerIds.isNotEmpty) {
            final customers = await client.from('customers').select('id,name').eq('company_id', widget.companyId).inFilter('id', customerIds.toList());
            final names = {for (final item in customers) item['id'].toString(): item['name']?.toString() ?? ''};
            for (final rental in rentalInfo.values) {
              rental['customer_name'] = names[rental['customer_id']?.toString()] ?? '';
            }
          }
        } catch (_) {
          // Rental/customer details are supplementary; finance remains usable without them.
        }
      }
      if (!mounted) return;
      setState(() {
        _transactions = rows;
        _payments = paymentRows;
        _paidByTransaction = paid;
        _rentalInfo = rentalInfo;
        _canManage = role == 'owner' || role == 'admin';
        _loading = false;
      });
    } on PostgrestException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'Não foi possível carregar o financeiro.';
        _loading = false;
      });
    }
  }

  double get _income => _transactions.where((e) => e['transaction_type'] == 'income' && e['status'] != 'cancelled').fold<double>(0, (s, e) => s + _money(e['amount']));
  double get _received => _transactions.where((e) => e['transaction_type'] == 'income' && e['status'] != 'cancelled').fold<double>(0, (s, e) { final amount = _money(e['amount']); final paid = _paidByTransaction[e['id'].toString()] ?? (e['status'] == 'paid' ? amount : 0.0); return s + paid.clamp(0, amount).toDouble(); });
  double get _expenses => _transactions.where((e) => e['transaction_type'] == 'expense' && e['status'] != 'cancelled').fold<double>(0, (s, e) => s + _money(e['amount']));
  double get _pending => _transactions.where((e) => e['transaction_type'] == 'income' && e['status'] != 'cancelled').fold<double>(0, (s, e) {
    final amount = _money(e['amount']);
    final paid = _paidByTransaction[e['id'].toString()] ?? (e['status'] == 'paid' ? amount : 0.0);
    return s + (amount - paid).clamp(0, double.infinity).toDouble();
  });

  Map<String, dynamic>? _rentalForTransaction(Map<String, dynamic> row) {
    final directId = row['rental_id']?.toString();
    final paymentRentalId = _payments
        .where((payment) => payment['transaction_id']?.toString() == row['id']?.toString())
        .map((payment) => payment['rental_id']?.toString())
        .firstWhere((id) => id != null && id.isNotEmpty, orElse: () => null);
    final rentalId = directId != null && directId.isNotEmpty ? directId : paymentRentalId;
    return rentalId == null ? null : _rentalInfo[rentalId];
  }

  String _displayDate(dynamic value) {
    final raw = value?.toString() ?? '';
    if (raw.length < 10) return raw.isEmpty ? 'Sem data' : raw;
    return _labelDate(raw.substring(0, 10));
  }

  String _format(double value) => 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';

  Future<void> _newTransaction() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _TransactionForm(companyId: widget.companyId),
    );
    if (result == true) _load();
  }

  Future<void> _registerPayment(Map<String, dynamic> row, double amount, String method, DateTime paidAt, String notes) async {
    setState(() => _saving = true);
    try {
      await Supabase.instance.client.rpc('register_financial_payment', params: {
        'p_transaction_id': row['id'],
        'p_amount': amount,
        'p_payment_method': method,
        'p_paid_at': _date(paidAt),
        'p_notes': notes.isEmpty ? null : notes,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Recebimento registrado.')));
      await _load();
    } on PostgrestException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Não foi possível registrar o recebimento.')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _showReceipt(Map<String, dynamic> transaction, Map<String, dynamic> payment) async {
    final date = payment['paid_at']?.toString().split('T').first ?? '';
    final formattedDate = date.isEmpty ? 'Não informada' : _labelDate(date);
    final amount = _format(_money(payment['amount']));
    final method = payment['payment_method']?.toString() ?? 'Não informada';
    final description = transaction['description']?.toString() ?? 'Recebimento';
    final paymentId = payment['id']?.toString() ?? '';
    String? customerName;
    String? rentalNumber;
    final rentalId = payment['rental_id']?.toString() ?? transaction['rental_id']?.toString();
    final rental = rentalId == null ? null : _rentalInfo[rentalId];
    if (rental != null) {
      rentalNumber = rental['rental_number']?.toString();
      customerName = rental['customer_name']?.toString();
    }
    if (!mounted) return;
    final receipt = [
      'COMPROVANTE DE RECEBIMENTO',
      'KidsLoc',
      if (paymentId.length >= 8) 'Comprovante: #${paymentId.substring(0, 8).toUpperCase()}',
      if (customerName != null) 'Cliente: $customerName',
      if (rentalNumber != null) 'Locação: #$rentalNumber',
      'Descrição: $description',
      'Valor recebido: $amount',
      'Data: $formattedDate',
      'Forma de pagamento: $method',
      if ((payment['notes']?.toString() ?? '').isNotEmpty) 'Observações: ${payment['notes']}',
    ].join('\n');
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Comprovante de recebimento'),
        content: SelectableText(receipt),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Fechar')),
          FilledButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: receipt));
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) ScaffoldMessenger.of(this.context).showSnackBar(const SnackBar(content: Text('Comprovante copiado.')));
            },
            icon: const Icon(Icons.copy),
            label: const Text('Copiar'),
          ),
        ],
      ),
    );
  }

  String _labelDate(String value) {
    final parts = value.split('-');
    if (parts.length != 3) return value;
    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }

  Future<void> _openReceive(Map<String, dynamic> row) async {
    final id = row['id'].toString();
    final amount = _money(row['amount']);
    final paid = _paidByTransaction[id] ?? (row['status'] == 'paid' ? amount : 0.0);
    final balance = (amount - paid).clamp(0, double.infinity).toDouble();
    if (balance <= 0 || !_canManage || _saving) return;
    final result = await showDialog<_PaymentData>(
      context: context,
      builder: (_) => _PaymentDialog(balance: balance),
    );
    if (result != null) {
      await _registerPayment(row, result.amount, result.method, result.paidAt, result.notes);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = _format;
    final filteredTransactions = _transactions.where((row) {
      final id = row['id'].toString();
      final amount = _money(row['amount']);
      final paid = _paidByTransaction[id] ?? (row['status'] == 'paid' ? amount : 0.0);
      final cancelled = row['status'] == 'cancelled';
      final balance = cancelled ? 0.0 : (amount - paid).clamp(0, double.infinity).toDouble();
      final income = row['transaction_type'] == 'income';
      final dueDateValue = row['due_date']?.toString() ?? '';
      final dueDate = dueDateValue.length >= 10 ? dueDateValue.substring(0, 10) : '';
      final today = _date(DateTime.now());
      final dueSoonLimit = _date(DateTime.now().add(const Duration(days: 7)));
      final matchesFilter = switch (_filter) {
        'income' => income && !cancelled,
        'expense' => !income && !cancelled,
        'pending' => income && balance > 0 && !cancelled,
        'overdue' => income && balance > 0 && !cancelled && dueDate.isNotEmpty && dueDate.compareTo(today) < 0,
        'due_soon' => income && balance > 0 && !cancelled && dueDate.isNotEmpty && dueDate.compareTo(today) >= 0 && dueDate.compareTo(dueSoonLimit) <= 0,
        'paid' => balance <= 0 && !cancelled,
        'cancelled' => cancelled,
        _ => true,
      };
      final normalize = (String value) => value.toLowerCase().replaceAll(RegExp(r'[áàâãä]'), 'a').replaceAll(RegExp(r'[éèêë]'), 'e').replaceAll(RegExp(r'[íìîï]'), 'i').replaceAll(RegExp(r'[óòôõö]'), 'o').replaceAll(RegExp(r'[úùûü]'), 'u').replaceAll('ç', 'c');
      final query = normalize(_search.trim());
      final rental = _rentalForTransaction(row);
      final text = normalize('${row['description'] ?? ''} ${row['category'] ?? ''} ${rental?['customer_name'] ?? ''} ${rental?['rental_number'] ?? ''}');
      return matchesFilter && (query.isEmpty || text.contains(query));
    }).toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Financeiro'),
        actions: [
          if (_canManage) IconButton(tooltip: 'Novo lançamento', onPressed: _loading || _saving ? null : _newTransaction, icon: const Icon(Icons.add)),
          IconButton(tooltip: 'Atualizar', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: _load, child: const Text('Tentar novamente')),
                ])))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        _SummaryCard(title: 'Receitas', value: fmt(_income), icon: Icons.trending_up),
                        _SummaryCard(title: 'Despesas', value: fmt(_expenses), icon: Icons.trending_down),
                        _SummaryCard(title: 'Recebido', value: fmt(_received), icon: Icons.payments_outlined),
                        _SummaryCard(title: 'A receber', value: fmt(_pending), icon: Icons.account_balance_wallet_outlined),
                        _SummaryCard(title: 'Resultado', value: fmt(_income - _expenses), icon: Icons.balance),
                      ]),
                      const SizedBox(height: 20),
                      Text('Lançamentos', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 10),
                      TextField(
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Buscar por descrição, categoria, cliente ou locação',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        onChanged: (value) => setState(() => _search = value),
                      ),
                      const SizedBox(height: 10),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(children: [
                          for (final option in [
                            ('all', 'Todos'),
                            ('income', 'Receitas'),
                            ('expense', 'Despesas'),
                            ('pending', 'A receber'),
                            ('overdue', 'Vencidos'),
                            ('due_soon', 'Vencem em 7 dias'),
                            ('paid', 'Pagos'),
                            ('cancelled', 'Cancelados'),
                          ])
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: Text(option.$2),
                                selected: _filter == option.$1,
                                onSelected: (_) => setState(() => _filter = option.$1),
                              ),
                            ),
                        ]),
                      ),
                      const SizedBox(height: 8),
                      if (_transactions.isEmpty)
                        const Padding(padding: EdgeInsets.symmetric(vertical: 48), child: Center(child: Text('Nenhum lançamento financeiro.')))
                      else if (filteredTransactions.isEmpty)
                        const Padding(padding: EdgeInsets.symmetric(vertical: 32), child: Center(child: Text('Nenhum lançamento corresponde à busca ou ao filtro.')))
                      else
                        ...filteredTransactions.map((row) {
                          final id = row['id'].toString();
                          final amount = _money(row['amount']);
                          final paid = _paidByTransaction[id] ?? (row['status'] == 'paid' ? amount : 0);
                          final balance = row['status'] == 'cancelled' ? 0.0 : (amount - paid).clamp(0, double.infinity).toDouble();
                          final income = row['transaction_type'] == 'income';
                          final dueDateValue = row['due_date']?.toString() ?? '';
                          final dueDate = dueDateValue.length >= 10 ? dueDateValue.substring(0, 10) : '';
                          final today = _date(DateTime.now());
                          final dueSoonLimit = _date(DateTime.now().add(const Duration(days: 7)));
                          final overdue = income && balance > 0 && row['status'] != 'cancelled' && dueDate.isNotEmpty && dueDate.compareTo(today) < 0;
                          final dueSoon = income && balance > 0 && row['status'] != 'cancelled' && dueDate.isNotEmpty && dueDate.compareTo(today) >= 0 && dueDate.compareTo(dueSoonLimit) <= 0;
                          final status = row['status'] == 'cancelled' ? 'Cancelado' : balance <= 0 ? 'Pago' : overdue ? 'Vencido' : dueSoon ? 'Vence em breve' : paid > 0 ? 'Parcial' : 'Pendente';
                          return Card(
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Row(children: [
                                  Icon(income ? Icons.arrow_downward : Icons.arrow_upward, color: income ? Colors.green : Theme.of(context).colorScheme.error),
                                  const SizedBox(width: 8),
                                  Expanded(child: Text(row['description']?.toString() ?? 'Lançamento', style: const TextStyle(fontWeight: FontWeight.w600))),
                                  Text(fmt(amount), style: const TextStyle(fontWeight: FontWeight.bold)),
                                ]),
                                const SizedBox(height: 6),
                                Text('${income ? 'Receita' : 'Despesa'} • ${row['category'] ?? 'Sem categoria'} • ${_displayDate(row['due_date'])}'),
                                if (_rentalForTransaction(row) != null) ...[
                                  const SizedBox(height: 3),
                                  Text(
                                    [
                                      if ((_rentalForTransaction(row)?['customer_name']?.toString() ?? '').isNotEmpty) _rentalForTransaction(row)!['customer_name'].toString(),
                                      if ((_rentalForTransaction(row)?['rental_number']?.toString() ?? '').isNotEmpty) 'Locação #${_rentalForTransaction(row)!['rental_number']}',
                                    ].join(' • '),
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                                const SizedBox(height: 4),
                                Text('Recebido/pago: ${fmt(paid)}  •  Saldo: ${fmt(balance)}  •  $status', style: Theme.of(context).textTheme.bodySmall),
                                ..._payments.where((p) => p['transaction_id']?.toString() == id).map((payment) => Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: Row(
                                    children: [
                                      Expanded(child: Text('${fmt(_money(payment['amount']))} · ${_labelDate(payment['paid_at'].toString().split('T').first)} · ${payment['payment_method'] ?? 'Sem forma'}', style: Theme.of(context).textTheme.bodySmall)),
                                      TextButton.icon(
                                        onPressed: () => _showReceipt(row, payment),
                                        icon: const Icon(Icons.receipt_long_outlined, size: 18),
                                        label: const Text('Comprovante'),
                                      ),
                                    ],
                                  ),
                                )),
                                if (income && balance > 0 && _canManage && row['status'] != 'cancelled')
                                  Align(alignment: Alignment.centerRight, child: TextButton.icon(
                                    onPressed: _saving ? null : () => _openReceive(row),
                                    icon: const Icon(Icons.payments_outlined),
                                    label: const Text('Registrar recebimento'),
                                  )),
                              ]),
                            ),
                          );
                        }),
                      if (!_canManage) const Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: Text('Somente proprietários e administradores podem criar lançamentos ou registrar recebimentos.', textAlign: TextAlign.center),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.title, required this.value, required this.icon});
  final String title;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 164,
    child: Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20),
        const SizedBox(height: 8),
        Text(title, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 3),
        Text(value, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
      ],
    ))),
  );
}

class _TransactionForm extends StatefulWidget {
  const _TransactionForm({required this.companyId});
  final String companyId;
  @override
  State<_TransactionForm> createState() => _TransactionFormState();
}

class _TransactionFormState extends State<_TransactionForm> {
  final _key = GlobalKey<FormState>();
  final _description = TextEditingController();
  final _category = TextEditingController();
  final _amount = TextEditingController();
  String _type = 'income';
  DateTime _due = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    _description.dispose(); _category.dispose(); _amount.dispose();
    super.dispose();
  }

  Future<void> _pickDue() async {
    final d = await showDatePicker(context: context, initialDate: _due, firstDate: DateTime(2020), lastDate: DateTime(2100));
    if (d != null) setState(() => _due = d);
  }

  Future<void> _save() async {
    if (!_key.currentState!.validate() || _saving) return;
    setState(() => _saving = true);
    try {
      await Supabase.instance.client.from('financial_transactions').insert({
        'company_id': widget.companyId,
        'transaction_type': _type,
        'category': _category.text.trim().isEmpty ? null : _category.text.trim(),
        'description': _description.text.trim(),
        'amount': double.parse(_amount.text.replaceAll(',', '.')),
        'due_date': '${_due.year.toString().padLeft(4, '0')}-${_due.month.toString().padLeft(2, '0')}-${_due.day.toString().padLeft(2, '0')}',
        'status': 'pending',
        'created_by': Supabase.instance.client.auth.currentUser?.id,
      });
      if (mounted) Navigator.pop(context, true);
    } on PostgrestException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Confira o valor informado.')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(left: 20, right: 20, top: 8, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
    child: Form(key: _key, child: ListView(shrinkWrap: true, children: [
      Text('Novo lançamento', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 12),
      SegmentedButton<String>(segments: const [
        ButtonSegment(value: 'income', label: Text('Receita'), icon: Icon(Icons.add_circle_outline)),
        ButtonSegment(value: 'expense', label: Text('Despesa'), icon: Icon(Icons.remove_circle_outline)),
      ], selected: {_type}, onSelectionChanged: (v) => setState(() => _type = v.first)),
      TextFormField(controller: _description, decoration: const InputDecoration(labelText: 'Descrição'), validator: (v) => v == null || v.trim().isEmpty ? 'Informe a descrição.' : null),
      TextFormField(controller: _category, decoration: const InputDecoration(labelText: 'Categoria')),
      TextFormField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Valor (R\$)'), validator: (v) {
        final n = double.tryParse((v ?? '').replaceAll(',', '.'));
        return n == null || n <= 0 ? 'Informe um valor maior que zero.' : null;
      }),
      OutlinedButton.icon(onPressed: _pickDue, icon: const Icon(Icons.calendar_today), label: Text('Vencimento: ${_due.day.toString().padLeft(2, '0')}/${_due.month.toString().padLeft(2, '0')}/${_due.year}')),
      const SizedBox(height: 12),
      FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? 'Salvando...' : 'Salvar lançamento')),
    ])),
  );
}

class _PaymentData {
  const _PaymentData({required this.amount, required this.method, required this.paidAt, required this.notes});
  final double amount;
  final String method;
  final DateTime paidAt;
  final String notes;
}

class _PaymentDialog extends StatefulWidget {
  const _PaymentDialog({required this.balance});
  final double balance;
  @override
  State<_PaymentDialog> createState() => _PaymentDialogState();
}

class _PaymentDialogState extends State<_PaymentDialog> {
  final _key = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  String _method = 'pix';
  DateTime _date = DateTime.now();

  @override
  void initState() {
    super.initState();
    _amount.text = widget.balance.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _amount.dispose(); _notes.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Registrar recebimento'),
    content: Form(key: _key, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text('Saldo pendente: R\$ ${widget.balance.toStringAsFixed(2)}'),
      TextFormField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Valor recebido'), validator: (v) {
        final n = double.tryParse((v ?? '').replaceAll(',', '.'));
        return n == null || n <= 0 || n > widget.balance ? 'Informe um valor até o saldo pendente.' : null;
      }),
      OutlinedButton.icon(
        onPressed: _pickDate,
        icon: const Icon(Icons.calendar_today),
        label: Text('Data do recebimento: ${_date.day.toString().padLeft(2, '0')}/${_date.month.toString().padLeft(2, '0')}/${_date.year}'),
      ),
      DropdownButtonFormField<String>(initialValue: _method, decoration: const InputDecoration(labelText: 'Forma de pagamento'), items: const [
        DropdownMenuItem(value: 'pix', child: Text('Pix')),
        DropdownMenuItem(value: 'cash', child: Text('Dinheiro')),
        DropdownMenuItem(value: 'credit_card', child: Text('Cartão de crédito')),
        DropdownMenuItem(value: 'debit_card', child: Text('Cartão de débito')),
        DropdownMenuItem(value: 'bank_transfer', child: Text('Transferência')),
        DropdownMenuItem(value: 'other', child: Text('Outro')),
      ], onChanged: (v) => setState(() => _method = v ?? 'pix')),
      TextFormField(controller: _notes, decoration: const InputDecoration(labelText: 'Observações (opcional)')),
    ]))),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
      FilledButton(onPressed: () {
        if (!_key.currentState!.validate()) return;
        final n = double.parse(_amount.text.replaceAll(',', '.'));
        Navigator.pop(context, _PaymentData(amount: n, method: _method, paidAt: _date, notes: _notes.text.trim()));
      }, child: const Text('Confirmar recebimento')),
    ],
  );
}
