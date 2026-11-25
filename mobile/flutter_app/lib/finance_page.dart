import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'services/company_realtime.dart';
import 'widgets/pagination_controls.dart';

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
  int _page = 0;
  CompanyRealtimeSubscription? _realtime;

  @override
  void initState() {
    super.initState();
    _load();
  }

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  double _money(dynamic value) => value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;

  Future<void> _load({bool showLoading = true}) async {
    if (showLoading) setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final client = Supabase.instance.client;
      final userId = client.auth.currentUser?.id;
      if (userId == null) {
        if (mounted) setState(() {
          _error = 'Sua sessão expirou. Entre novamente para acessar o financeiro.';
          _loading = false;
        });
        return;
      }
      final membership = await client.from('company_members')
          .select('role')
          .eq('company_id', widget.companyId)
          .eq('user_id', userId)
          .maybeSingle();
      final role = membership?['role']?.toString() ?? '';
      if (role != 'admin') {
        if (mounted) setState(() {
          _error = 'O módulo Financeiro está disponível apenas para administradores.';
          _loading = false;
        });
        return;
      }
      _realtime ??= CompanyRealtimeSubscription.listen(
        client: client,
        companyId: widget.companyId,
        channelName: 'kidsloc-mobile-finance-${widget.companyId}',
        tables: const ['financial_transactions', 'payments', 'rentals'],
        onChange: () { if (mounted) _load(showLoading: false); },
      );
      final results = await Future.wait([
        client.from('financial_transactions').select('id,company_id,rental_id,transaction_type,category,description,amount,due_date,paid_at,payment_method,status,created_at').eq('company_id', widget.companyId).order('due_date', ascending: true),
        client.from('payments').select('id,transaction_id,rental_id,amount,paid_at,payment_method,notes').eq('company_id', widget.companyId).order('paid_at', ascending: false),
      ]);
      final rows = results[0].map((e) => Map<String, dynamic>.from(e)).toList();
      final paymentRows = results[1].map((e) => Map<String, dynamic>.from(e)).toList();
      final paid = <String, double>{};
      for (final item in paymentRows) {
        final id = item['transaction_id']?.toString();
        if (id != null) paid[id] = (paid[id] ?? 0) + _money(item['amount']);
      }
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
        _canManage = role == 'admin';
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

  Future<void> _registerRentalStage(Map<String, dynamic> row, String stage) async {
    final rentalId = row['rental_id']?.toString();
    if (rentalId == null || rentalId.isEmpty || !_canManage || _saving) return;
    try {
      final rawSummary = await Supabase.instance.client.rpc('get_rental_payment_summary', params: {
        'p_company_id': widget.companyId, 'p_rental_id': rentalId,
      });
      final summary = Map<String, dynamic>.from(rawSummary as Map);
      final applyDefault = stage == 'deposit' && summary['legacy_deposit_missing'] == true;
      final percentage = (summary['default_deposit_percentage'] as num?)?.toDouble() ?? 30;
      final total = _money(row['amount']);
      final target = applyDefault ? (total * percentage / 100) : _money(summary['deposit_amount']);
      final paid = _money(summary['paid_total']);
      final amount = stage == 'deposit'
          ? (target - paid).clamp(0, double.infinity).toDouble()
          : _money(summary['balance_remaining']);
      if (amount <= 0) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(stage == 'deposit' ? 'Não há sinal pendente.' : 'Esta locação já está quitada.')));
        return;
      }
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(stage == 'deposit' ? 'Confirmar pagamento do sinal' : 'Confirmar quitação do saldo'),
          content: Text(applyDefault
              ? 'Esta locação antiga ainda não possui sinal definido. Aplicaremos $percentage% (${_format(amount)}) somente nesta locação e registraremos o recebimento. Confirma?'
              : 'Será registrado o recebimento de ${_format(amount)} para a locação. Confirma?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Confirmar')),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      setState(() => _saving = true);
      await Supabase.instance.client.rpc('register_rental_payment_stage', params: {
        'p_company_id': widget.companyId,
        'p_rental_id': rentalId,
        'p_stage': stage,
        'p_payment_method': null,
        'p_paid_at': _date(DateTime.now()),
        'p_apply_default_deposit': applyDefault,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(stage == 'deposit' ? 'Sinal registrado no Financeiro.' : 'Quitação registrada no Financeiro.')));
      await _load();
    } on PostgrestException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
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
    final pageSize = MediaQuery.sizeOf(context).width >= 1024 ? 21 : 6;
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
    final currentPage = _page.clamp(0, (filteredTransactions.length / pageSize).ceil().clamp(1, 999999) - 1).toInt();
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
                      const Text('GESTÃO DA EMPRESA', style: TextStyle(color: Color(0xFF8054D8), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.5)),
                      const SizedBox(height: 6),
                      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Financeiro', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xFF172033))),
                          const SizedBox(height: 5),
                          Text('Acompanhe receitas, despesas, recebimentos e saldos pendentes.', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: const Color(0xFF64748B))),
                        ])),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
                          decoration: BoxDecoration(color: const Color(0xFFF5F0FF), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE9DFFF))),
                          child: Text('${_transactions.length} ${_transactions.length == 1 ? 'lançamento' : 'lançamentos'}', style: const TextStyle(color: Color(0xFF6840BD), fontSize: 11, fontWeight: FontWeight.w700)),
                        ),
                      ]),
                      const SizedBox(height: 18),
                      LayoutBuilder(builder: (context, constraints) {
                        final columns = constraints.maxWidth >= 1050 ? 5 : constraints.maxWidth >= 650 ? 3 : 2;
                        return GridView.count(
                          crossAxisCount: columns,
                          crossAxisSpacing: 10,
                          mainAxisSpacing: 10,
                          childAspectRatio: constraints.maxWidth < 380 ? 1.75 : 2.05,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [
                            _SummaryCard(title: 'Receitas lançadas', value: fmt(_income), icon: Icons.trending_up, accent: const Color(0xFF15803D)),
                            _SummaryCard(title: 'Recebido', value: fmt(_received), icon: Icons.payments_outlined, accent: const Color(0xFF047857)),
                            _SummaryCard(title: 'Despesas lançadas', value: fmt(_expenses), icon: Icons.trending_down, accent: const Color(0xFFBE123C)),
                            _SummaryCard(title: 'A receber', value: fmt(_pending), icon: Icons.account_balance_wallet_outlined, accent: const Color(0xFFB45309)),
                            _SummaryCard(title: 'Resultado', value: fmt(_income - _expenses), icon: Icons.balance, accent: const Color(0xFF6840BD)),
                          ],
                        );
                      }),
                      const SizedBox(height: 24),
                      Text('Lançamentos financeiros', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xFF172033))),
                      const SizedBox(height: 4),
                      Text('Pesquise por descrição, categoria, cliente ou locação e filtre por situação.', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: const Color(0xFF64748B))),
                      const SizedBox(height: 12),
                      TextField(
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.search, color: Color(0xFF8054D8)),
                          hintText: 'Buscar lançamentos',
                          hintStyle: const TextStyle(fontSize: 13),
                          filled: true,
                          fillColor: Colors.white,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF8054D8), width: 1.5)),
                        ),
                        onChanged: (value) => setState(() { _search = value; _page = 0; }),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
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
                            ChoiceChip(
                              label: Text(option.$2),
                              selected: _filter == option.$1,
                              showCheckmark: false,
                              onSelected: (_) => setState(() { _filter = option.$1; _page = 0; }),
                              labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _filter == option.$1 ? const Color(0xFF6840BD) : const Color(0xFF475569)),
                              selectedColor: const Color(0xFFF3ECFF),
                              backgroundColor: Colors.white,
                              shape: StadiumBorder(side: BorderSide(color: _filter == option.$1 ? const Color(0xFFD8C5FF) : const Color(0xFFE2E8F0))),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      if (_transactions.isEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 42, horizontal: 20),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0xFFE2E8F0))),
                          child: const Column(children: [
                            Icon(Icons.account_balance_wallet_outlined, size: 32, color: Color(0xFF94A3B8)),
                            SizedBox(height: 10),
                            Text('Nenhum lançamento financeiro.', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF334155))),
                          ]),
                        )
                      else if (filteredTransactions.isEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0xFFE2E8F0))),
                          child: const Center(child: Text('Nenhum lançamento corresponde à busca ou ao filtro.', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF64748B)))),
                        )
                      else
                        ...filteredTransactions.skip(currentPage * pageSize).take(pageSize).map((row) {
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
                          final statusColor = row['status'] == 'cancelled' ? const Color(0xFF64748B) : balance <= 0 ? const Color(0xFF15803D) : overdue ? const Color(0xFFB91C1C) : dueSoon ? const Color(0xFFB45309) : const Color(0xFF6840BD);
                          final rental = _rentalForTransaction(row);
                          final linkedPayments = _payments.where((p) => p['transaction_id']?.toString() == id).toList();
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(15),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0xFFE2E8F0)), boxShadow: const [BoxShadow(color: Color(0x080F172A), blurRadius: 12, offset: Offset(0, 3))]),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Container(
                                  width: 38, height: 38,
                                  decoration: BoxDecoration(color: income ? const Color(0xFFECFDF3) : const Color(0xFFFFF1F2), borderRadius: BorderRadius.circular(12)),
                                  child: Icon(income ? Icons.south_west : Icons.north_east, size: 19, color: income ? const Color(0xFF15803D) : const Color(0xFFBE123C)),
                                ),
                                const SizedBox(width: 11),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                                    decoration: BoxDecoration(color: income ? const Color(0xFFECFDF3) : const Color(0xFFFFF1F2), borderRadius: BorderRadius.circular(20)),
                                    child: Text(income ? 'RECEITA' : 'DESPESA', style: TextStyle(fontSize: 9, letterSpacing: .7, fontWeight: FontWeight.w800, color: income ? const Color(0xFF15803D) : const Color(0xFFBE123C))),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(row['description']?.toString() ?? 'Lançamento', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF172033))),
                                  const SizedBox(height: 4),
                                  Text('${row['category'] ?? 'Sem categoria'} · Vencimento: ${_displayDate(row['due_date'])}', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                                  if (rental != null) ...[
                                    const SizedBox(height: 4),
                                    Text('${rental['customer_name'] ?? ''}${rental['rental_number'] != null ? ' · Locação #${rental['rental_number']}' : ''}', style: const TextStyle(fontSize: 11, color: Color(0xFF475569), fontWeight: FontWeight.w600)),
                                  ],
                                ])),
                                const SizedBox(width: 8),
                                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                  Text(fmt(amount), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF172033))),
                                  const SizedBox(height: 5),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(color: statusColor.withOpacity(.09), borderRadius: BorderRadius.circular(20)),
                                    child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
                                  ),
                                ]),
                              ]),
                              const SizedBox(height: 12),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
                                decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12)),
                                child: Wrap(spacing: 16, runSpacing: 5, children: [
                                  Text('Recebido/pago: ${fmt(paid)}', style: const TextStyle(fontSize: 11, color: Color(0xFF475569))),
                                  Text('Saldo: ${fmt(balance)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF334155))),
                                ]),
                              ),
                              if (linkedPayments.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                const Text('HISTÓRICO DE RECEBIMENTOS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: .8, color: Color(0xFF64748B))),
                                const SizedBox(height: 7),
                                ...linkedPayments.map((payment) => Container(
                                  margin: const EdgeInsets.only(bottom: 6),
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                  decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(11), border: Border.all(color: const Color(0xFFF1F5F9))),
                                  child: Row(children: [
                                    Expanded(child: Text('${fmt(_money(payment['amount']))} · ${_labelDate(payment['paid_at'].toString().split('T').first)} · ${payment['payment_method'] ?? 'Sem forma'}', style: const TextStyle(fontSize: 11, color: Color(0xFF475569)))),
                                    TextButton.icon(onPressed: () => _showReceipt(row, payment), icon: const Icon(Icons.receipt_long_outlined, size: 16), label: const Text('Comprovante', style: TextStyle(fontSize: 11))),
                                  ]),
                                )),
                              ],
                              if (income && balance > 0 && _canManage && row['status'] != 'cancelled') ...[
                                const SizedBox(height: 8),
                                Wrap(alignment: WrapAlignment.end, spacing: 8, runSpacing: 8, children: [
                                  if (row['rental_id'] != null) OutlinedButton.icon(
                                    onPressed: _saving ? null : () => _registerRentalStage(row, 'deposit'),
                                    icon: const Icon(Icons.payments_outlined, size: 17),
                                    label: const Text('Pagou sinal'),
                                  ),
                                  if (row['rental_id'] != null) FilledButton.tonalIcon(
                                    onPressed: _saving ? null : () => _registerRentalStage(row, 'balance'),
                                    icon: const Icon(Icons.check_circle_outline, size: 17),
                                    label: const Text('Quitou saldo restante'),
                                  ),
                                  OutlinedButton.icon(
                                    onPressed: _saving ? null : () => _openReceive(row),
                                    icon: const Icon(Icons.add_card_outlined, size: 17),
                                    label: const Text('Recebimento parcial'),
                                  ),
                                ]),
                              ],
                            ]),
                          );
                        }),
                       PaginationControls(totalCount: filteredTransactions.length, page: currentPage, pageSize: pageSize, onPageChanged: (value) => setState(() => _page = value)),
                      if (!_canManage) const Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: Text('Somente administradores podem criar lançamentos ou registrar recebimentos.', textAlign: TextAlign.center),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.title, required this.value, required this.icon, required this.accent});
  final String title;
  final String value;
  final IconData icon;
  final Color accent;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: const Color(0xFFE2E8F0)),
      boxShadow: const [BoxShadow(color: Color(0x060F172A), blurRadius: 10, offset: Offset(0, 2))],
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Row(children: [
        Icon(icon, size: 18, color: accent),
        const SizedBox(width: 6),
        Expanded(child: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10, height: 1.2, fontWeight: FontWeight.w700, color: Color(0xFF64748B)))),
      ]),
      const SizedBox(height: 8),
      FittedBox(alignment: Alignment.centerLeft, fit: BoxFit.scaleDown, child: Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: accent))),
    ]),
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
