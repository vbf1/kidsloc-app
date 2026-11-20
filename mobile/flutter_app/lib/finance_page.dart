import 'package:flutter/material.dart';
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
  Map<String, double> _paidByTransaction = {};

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
        client.from('payments').select('transaction_id,amount').eq('company_id', widget.companyId),
        client.from('company_members').select('role').eq('company_id', widget.companyId).eq('user_id', userId ?? ''),
      ]);
      final rows = results[0].map((e) => Map<String, dynamic>.from(e)).toList();
      final paid = <String, double>{};
      for (final item in results[1]) {
        final id = item['transaction_id']?.toString();
        if (id != null) paid[id] = (paid[id] ?? 0) + _money(item['amount']);
      }
      final role = results[2].isEmpty ? '' : results[2].first['role']?.toString() ?? '';
      if (!mounted) return;
      setState(() {
        _transactions = rows;
        _paidByTransaction = paid;
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
  double get _expenses => _transactions.where((e) => e['transaction_type'] == 'expense' && e['status'] != 'cancelled').fold<double>(0, (s, e) => s + _money(e['amount']));
  double get _pending => _transactions.where((e) => e['transaction_type'] == 'income' && e['status'] != 'cancelled').fold<double>(0, (s, e) {
    final amount = _money(e['amount']);
    final paid = _paidByTransaction[e['id'].toString()] ?? (e['status'] == 'paid' ? amount : 0.0);
    return s + (amount - paid).clamp(0, double.infinity).toDouble();
  });

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

  Future<void> _openReceive(Map<String, dynamic> row) async {
    final id = row['id'].toString();
    final amount = _money(row['amount']);
    final paid = _paidByTransaction[id] ?? (row['status'] == 'paid' ? amount : 0.0);
    final balance = amount - paid;
    if (balance <= 0 || !_canManage) return;
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
                        _SummaryCard(title: 'A receber', value: fmt(_pending), icon: Icons.account_balance_wallet_outlined),
                        _SummaryCard(title: 'Resultado', value: fmt(_income - _expenses), icon: Icons.balance),
                      ]),
                      const SizedBox(height: 20),
                      Text('Lançamentos', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 8),
                      if (_transactions.isEmpty)
                        const Padding(padding: EdgeInsets.symmetric(vertical: 48), child: Center(child: Text('Nenhum lançamento financeiro.')))
                      else
                        ..._transactions.map((row) {
                          final id = row['id'].toString();
                          final amount = _money(row['amount']);
                          final paid = _paidByTransaction[id] ?? (row['status'] == 'paid' ? amount : 0);
                          final balance = (amount - paid).clamp(0, double.infinity).toDouble();
                          final income = row['transaction_type'] == 'income';
                          final status = row['status'] == 'cancelled' ? 'Cancelado' : balance <= 0 ? 'Pago' : paid > 0 ? 'Parcial' : 'Pendente';
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
                                Text('${income ? 'Receita' : 'Despesa'} • ${row['category'] ?? 'Sem categoria'} • ${row['due_date'] ?? 'Sem vencimento'}'),
                                const SizedBox(height: 4),
                                Text('Recebido/pago: ${fmt(paid)}  •  Saldo: ${fmt(balance)}  •  $status', style: Theme.of(context).textTheme.bodySmall),
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
