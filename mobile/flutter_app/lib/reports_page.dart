import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'services/company_realtime.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.companyId});
  final String companyId;
  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  bool _loading = true;
  String? _error;
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  List<Map<String, dynamic>> _transactions = [];
  List<Map<String, dynamic>> _payments = [];
  List<Map<String, dynamic>> _rentals = [];
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _products = [];
  CompanyRealtimeSubscription? _realtime;

  String _date(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  double _number(dynamic v) =>
      v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0;
  String _money(double v) =>
      'R\$ ${v.toStringAsFixed(2).replaceAll('.', ',')}';
  String get _monthKey =>
      '${_month.year.toString().padLeft(4, '0')}-${_month.month.toString().padLeft(2, '0')}';

  Future<List<Map<String, dynamic>>> _fetchAllRows(
    Future<List<Map<String, dynamic>>> Function(int start, int end) fetchPage,
  ) async {
    const pageSize = 1000;
    final rows = <Map<String, dynamic>>[];
    for (var offset = 0;; offset += pageSize) {
      final page = await fetchPage(offset, offset + pageSize - 1);
      rows.addAll(page);
      if (page.length < pageSize) return rows;
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
    _realtime = CompanyRealtimeSubscription.listen(
      client: Supabase.instance.client,
      companyId: widget.companyId,
      channelName: 'kidsloc-mobile-reports-${widget.companyId}',
      tables: const [
        'financial_transactions',
        'payments',
        'rentals',
        'rental_items',
        'products'
      ],
      onChange: () {
        if (mounted) _load(showLoading: false);
      },
    );
  }

  @override
  void dispose() {
    _realtime?.dispose();
    super.dispose();
  }

  Future<void> _load({bool showLoading = true}) async {
    if (showLoading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final db = Supabase.instance.client;
      final membership = await db
          .from('company_members')
          .select('role')
          .eq('company_id', widget.companyId)
          .eq('user_id', db.auth.currentUser!.id)
          .maybeSingle();
      if (membership?['role'] != 'admin') {
        throw Exception('Relatórios disponíveis apenas para administradores.');
      }
      final results = await Future.wait([
        _fetchAllRows((start, end) => db
            .from('financial_transactions')
            .select('id,transaction_type,amount,status,due_date,paid_at')
            .eq('company_id', widget.companyId)
            .neq('status', 'cancelled')
            .order('id', ascending: true)
            .range(start, end)),
        _fetchAllRows((start, end) => db
            .from('payments')
            .select('transaction_id,amount,paid_at')
            .eq('company_id', widget.companyId)
            .order('id', ascending: true)
            .range(start, end)),
        _fetchAllRows((start, end) => db
            .from('rentals')
            .select('id,rental_number,start_date,end_date,status,total_amount')
            .eq('company_id', widget.companyId)
            .order('id', ascending: true)
            .neq('status', 'cancelled')
            .range(start, end)),
        _fetchAllRows((start, end) => db
            .from('rental_items')
            .select('rental_id,product_id,quantity')
            .eq('company_id', widget.companyId)
            .order('id', ascending: true)
            .range(start, end)),
        _fetchAllRows((start, end) => db
            .from('products')
            .select('id,name')
            .eq('company_id', widget.companyId)
            .order('id', ascending: true)
            .range(start, end)),
      ]);
      if (!mounted) return;
      setState(() {
        _transactions =
            results[0].map((e) => Map<String, dynamic>.from(e)).toList();
        _payments =
            results[1].map((e) => Map<String, dynamic>.from(e)).toList();
        _rentals =
            results[2].map((e) => Map<String, dynamic>.from(e)).toList();
        _items = results[3].map((e) => Map<String, dynamic>.from(e)).toList();
        _products =
            results[4].map((e) => Map<String, dynamic>.from(e)).toList();
        _loading = false;
      });
    } on PostgrestException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Map<String, dynamic> get _summary {
    final start = _date(_month);
    final end = _date(DateTime(_month.year, _month.month + 1, 0));
    final tx = _transactions
        .where((t) =>
            (t['due_date']?.toString() ??
                    t['paid_at']?.toString() ??
                    '')
                .startsWith(_monthKey))
        .toList();
    final income =
        tx.where((t) => t['transaction_type'] == 'income').toList();
    final expenses =
        tx.where((t) => t['transaction_type'] == 'expense').toList();
    final received = _payments
        .where((p) => (p['paid_at']?.toString() ?? '').startsWith(_monthKey))
        .fold<double>(0, (s, p) => s + _number(p['amount']));
    final revenue =
        income.fold<double>(0, (s, t) => s + _number(t['amount']));
    final expense =
        expenses.fold<double>(0, (s, t) => s + _number(t['amount']));
    final paidBy = <String, double>{};
    for (final p in _payments) {
      final id = p['transaction_id']?.toString();
      if (id != null) paidBy[id] = (paidBy[id] ?? 0) + _number(p['amount']);
    }
    final pending = income.fold<double>(
        0,
        (s, t) =>
            s +
            (_number(t['amount']) -
                    (paidBy[t['id']?.toString()] ??
                        (t['status'] == 'paid' ? _number(t['amount']) : 0)))
                .clamp(0, double.infinity)
                .toDouble());
    final activeRentals = _rentals.where((r) {
      final rentalStart = r['start_date']?.toString() ?? '9999';
      final rentalEnd = r['end_date']?.toString() ?? '';
      return rentalStart.compareTo(end) <= 0 && rentalEnd.compareTo(start) >= 0;
    }).toList();
    final activeIds = activeRentals.map((r) => r['id'].toString()).toSet();
    final productNames = {
      for (final p in _products)
        p['id'].toString(): p['name']?.toString() ?? 'Item'
    };
    final counts = <String, int>{};
    for (final item in _items) {
      if (activeIds.contains(item['rental_id']?.toString())) {
        final id = item['product_id'].toString();
        counts[id] = (counts[id] ?? 0) + (_number(item['quantity']).toInt());
      }
    }
    final top = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return {
      'revenue': revenue,
      'received': received,
      'expense': expense,
      'result': revenue - expense,
      'pending': pending,
      'rentals': activeRentals.length,
      'booked': activeRentals.fold<double>(
          0, (s, r) => s + _number(r['total_amount'])),
      'top': top
          .take(5)
          .map((e) => '${productNames[e.key] ?? 'Item'} · ${e.value}')
          .toList()
    };
  }

  Future<void> _chooseMonth() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _month,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      initialDatePickerMode: DatePickerMode.year,
    );
    if (picked != null) setState(() => _month = DateTime(picked.year, picked.month));
  }

  Widget _card(String title, String value, IconData icon) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 8),
              Text(title, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 4),
              Text(value,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold))
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Relatórios avançados'),
        actions: [
          IconButton(
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh),
              tooltip: 'Atualizar')
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, textAlign: TextAlign.center)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      OutlinedButton.icon(
                          onPressed: _chooseMonth,
                          icon: const Icon(Icons.calendar_month),
                          label: Text(
                              'Período: ${_monthKey.split('-').reversed.join('/')}')),
                      const SizedBox(height: 12),
                      GridView.count(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          crossAxisCount: 2,
                          childAspectRatio: 1.55,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                          children: [
                            _card('Receitas lançadas', _money(s['revenue']),
                                Icons.trending_up),
                            _card('Recebimentos', _money(s['received']),
                                Icons.payments_outlined),
                            _card('Despesas', _money(s['expense']),
                                Icons.trending_down),
                            _card('Resultado', _money(s['result']), Icons.balance),
                            _card('A receber', _money(s['pending']),
                                Icons.account_balance_wallet_outlined),
                            _card('Locações', s['rentals'].toString(), Icons.event),
                          ]),
                      const SizedBox(height: 18),
                      Card(
                          child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Valor contratado no período',
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleMedium),
                                    const SizedBox(height: 6),
                                    Text(_money(s['booked']),
                                        style: Theme.of(context)
                                            .textTheme
                                            .headlineSmall
                                            ?.copyWith(
                                                fontWeight: FontWeight.bold)),
                                  ]))),
                      const SizedBox(height: 12),
                      Card(
                          child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Itens mais locados',
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleMedium),
                                    const SizedBox(height: 8),
                                    if ((s['top'] as List).isEmpty)
                                      const Text(
                                          'Sem itens para o período selecionado.')
                                    else
                                      for (final item in s['top'] as List<String>)
                                        Padding(
                                            padding: const EdgeInsets.symmetric(
                                                vertical: 5),
                                            child: Text(item)),
                                  ]))),
                      const SizedBox(height: 12),
                      const Text(
                          'Indicadores gerenciais. Resultado calculado por lançamentos financeiros; não substitui demonstrativos contábeis.',
                          style: TextStyle(fontSize: 12, color: Colors.grey)),
                    ],
                  ),
                ),
    );
  }
}
