import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ContractsPage extends StatefulWidget {
  const ContractsPage({super.key, required this.companyId});
  final String companyId;

  @override
  State<ContractsPage> createState() => _ContractsPageState();
}

class _ContractsPageState extends State<ContractsPage> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _notice;
  String? _selectedRentalId;
  String _companyName = 'Empresa';
  final TextEditingController _searchController = TextEditingController();
  String _statusFilter = 'all';
  final TextEditingController _termsController = TextEditingController(text: 'O LOCATÁRIO compromete-se a zelar pelos equipamentos, utilizá-los de forma adequada e devolvê-los nas condições recebidas. O LOCADOR compromete-se a disponibilizar os itens descritos na data e período acordados. Danos decorrentes de mau uso poderão ser cobrados do LOCATÁRIO. O cancelamento e demais condições devem ser ajustados entre as partes antes da assinatura.');
  List<Map<String, dynamic>> _rentals = [];
  List<Map<String, dynamic>> _contracts = [];
  Map<String, Map<String, dynamic>> _customers = {};
  Map<String, List<Map<String, dynamic>>> _itemsByRental = {};

  @override
  void dispose() {
    _termsController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  String _date(dynamic value) {
    if (value == null) return '';
    final text = value.toString();
    return text.contains('T') ? text.split('T').first : text;
  }

  String _money(dynamic value) =>
      'R\$ ${(value is num ? value : num.tryParse(value?.toString() ?? '') ?? 0).toStringAsFixed(2).replaceAll('.', ',')}';

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final client = Supabase.instance.client;
      final companyFuture = client.from('companies').select('name').eq('id', widget.companyId).maybeSingle();
      final rentalsFuture = client.from('rentals').select('id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,delivery_method,delivery_address,total_amount,delivery_fee,discount').eq('company_id', widget.companyId).neq('status', 'cancelled').order('start_date', ascending: false).limit(200);
      final customersFuture = client.from('customers').select('id,name,phone,email,address,cpf,rg,zip,neighborhood,city_state').eq('company_id', widget.companyId);
      final contractsFuture = client.from('rental_contracts').select('id,contract_number,rental_id,status,created_at,contract_snapshot,token_expires_at,signed_at,signer_name').eq('company_id', widget.companyId).order('created_at', ascending: false).limit(200);
      final results = await Future.wait<dynamic>([
        companyFuture,
        rentalsFuture,
        customersFuture,
        contractsFuture,
      ]);
      final company = results[0] as Map<String, dynamic>?;
      final rentalRows = results[1] as List<dynamic>? ?? <dynamic>[];
      final customerRows = results[2] as List<dynamic>? ?? <dynamic>[];
      final contractRows = results[3] as List<dynamic>? ?? <dynamic>[];
      final rentals = rentalRows.map((e) => Map<String, dynamic>.from(e)).toList();
      final customers = <String, Map<String, dynamic>>{
        for (final e in customerRows)
          e['id'].toString(): Map<String, dynamic>.from(e),
      };
      final ids = rentals.map((e) => e['id'].toString()).toList();
      final Map<String, List<Map<String, dynamic>>> itemsByRental = {};
      if (ids.isNotEmpty) {
        final itemRows = await client.from('rental_items').select('rental_id,product_id,quantity,unit_price,subtotal').eq('company_id', widget.companyId).inFilter('rental_id', ids);
        final productRows = await client.from('products').select('id,name').eq('company_id', widget.companyId);
        final productNames = {
          for (final p in productRows) p['id'].toString(): p['name']?.toString() ?? 'Item',
        };
        for (final raw in itemRows) {
          final item = Map<String, dynamic>.from(raw);
          final id = item['rental_id'].toString();
          item['name'] = productNames[item['product_id'].toString()] ?? 'Item';
          (itemsByRental[id] ??= []).add(item);
        }
      }
      if (!mounted) return;
      setState(() {
        _companyName = company?['name']?.toString() ?? 'Empresa';
        _rentals = rentals;
        _customers = customers;
        _contracts = contractRows.map((e) => Map<String, dynamic>.from(e)).toList();
        _itemsByRental = itemsByRental;
        _loading = false;
      });
    } on PostgrestException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'Não foi possível carregar os contratos e locações.';
        _loading = false;
      });
    }
  }

  String _newToken() {
    final random = Random.secure();
    return List<int>.generate(32, (_) => random.nextInt(256))
        .map((value) => value.toRadixString(16).padLeft(2, '0'))
        .join();
  }

  Future<void> _createDraft() async {
    if (_selectedRentalId == null || _saving) return;
    if (_termsController.text.trim().isEmpty) {
      setState(() => _error = 'Informe as condições do contrato.');
      return;
    }
    final rental = _rentals.firstWhere((e) => e['id'].toString() == _selectedRentalId);
    final customer = _customers[rental['customer_id']?.toString()];
    if (customer == null) {
      setState(() => _error = 'A locação precisa estar vinculada a um cliente.');
      return;
    }
    final items = _itemsByRental[rental['id'].toString()] ?? [];
    if (items.isEmpty) {
      setState(() => _error = 'Inclua ao menos um item na locação antes de gerar o contrato.');
      return;
    }
    final snapshot = {
      'company': {'name': _companyName},
      'customer': customer,
      'rental': rental,
      'items': items,
      'generated_at': DateTime.now().toUtc().toIso8601String(),
      'terms': _termsController.text.trim(),
    };
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    try {
      await Supabase.instance.client.from('rental_contracts').insert({
        'company_id': widget.companyId,
        'rental_id': rental['id'],
        'status': 'draft',
        'signature_method': 'external',
        'contract_snapshot': snapshot,
        'created_by': Supabase.instance.client.auth.currentUser?.id,
      });
      if (!mounted) return;
      setState(() {
        _selectedRentalId = null;
        _notice = 'Rascunho de contrato criado. Agora gere o link para assinatura.';
      });
      await _load();
    } on PostgrestException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível criar o contrato.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _generateLink(Map<String, dynamic> contract) async {
    if (_saving || contract['status'] == 'signed' || contract['status'] == 'cancelled') return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final token = _newToken();
    final hash = sha256.convert(token.codeUnits).toString();
    final expiry = DateTime.now().toUtc().add(const Duration(days: 7)).toIso8601String();
    try {
      await Supabase.instance.client.from('rental_contracts').update({
        'token_hash': hash,
        'token_expires_at': expiry,
        'status': 'sent',
        'sent_at': DateTime.now().toUtc().toIso8601String(),
      }).eq('id', contract['id']).eq('company_id', widget.companyId);
      if (!mounted) return;
      final url = 'https://vbf1.github.io/kidsloc-app/assinar/?token=$token';
      await Clipboard.setData(ClipboardData(text: url));
      setState(() => _notice = 'Link seguro gerado e copiado. Ele expira em 7 dias.');
      await _load();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Link de assinatura'),
          content: SelectableText(url),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Fechar')),
            FilledButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: url));
                if (context.mounted) Navigator.pop(context);
              },
              icon: const Icon(Icons.copy),
              label: const Text('Copiar link'),
            ),
          ],
        ),
      );
    } on PostgrestException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível gerar o link de assinatura.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _showContractDetails(Map<String, dynamic> contract) async {
    final snapshot = Map<String, dynamic>.from(contract['contract_snapshot'] ?? {});
    final customer = Map<String, dynamic>.from(snapshot['customer'] ?? {});
    final rental = Map<String, dynamic>.from(snapshot['rental'] ?? {});
    final company = Map<String, dynamic>.from(snapshot['company'] ?? {});
    final items = (snapshot['items'] as List<dynamic>? ?? [])
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final expiry = DateTime.tryParse(contract['token_expires_at']?.toString() ?? '');
    final isExpired = expiry != null && expiry.isBefore(DateTime.now().toUtc()) &&
        ['sent', 'viewed'].contains(contract['status']);
    final status = isExpired ? 'Link expirado' : _status(contract['status'].toString());
    final lines = <String>[
      'CONTRATO DE LOCAÇÃO #${contract['contract_number']}',
      company['name']?.toString() ?? _companyName,
      '',
      'LOCATÁRIO',
      customer['name']?.toString() ?? 'Não informado',
      if ((customer['cpf']?.toString() ?? '').isNotEmpty) 'CPF: ${customer['cpf']}',
      if ((customer['phone']?.toString() ?? '').isNotEmpty) 'Telefone: ${customer['phone']}',
      '',
      'DADOS DA LOCAÇÃO',
      'Data: ${_date(rental['start_date'])} a ${_date(rental['end_date'])}',
      'Horário: ${rental['start_time'] ?? '—'} a ${rental['end_time'] ?? '—'}',
      'Total: ${_money(rental['total_amount'])}',
      '',
      'ITENS',
      ...items.map((item) => '${item['quantity'] ?? 1}x ${item['name'] ?? 'Item'} · ${_money(item['subtotal'])}'),
      '',
      'CONDIÇÕES',
      snapshot['terms']?.toString() ?? 'Condições não informadas.',
      '',
      'Situação: $status',
      if (contract['signer_name'] != null) 'Assinado por: ${contract['signer_name']}',
      if (contract['signed_at'] != null) 'Data da assinatura: ${_date(contract['signed_at'])}',
    ];
    final content = lines.join('\n');
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Contrato #${contract['contract_number']}'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: SelectableText(content, style: const TextStyle(height: 1.5)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Fechar'),
          ),
          FilledButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: content));
              if (dialogContext.mounted) Navigator.pop(dialogContext);
              if (mounted) ScaffoldMessenger.of(this.context).showSnackBar(
                const SnackBar(content: Text('Dados do contrato copiados.')),
              );
            },
            icon: const Icon(Icons.copy),
            label: const Text('Copiar'),
          ),
        ],
      ),
    );
  }

  String _status(String value) => switch (value) {
    'draft' => 'Rascunho',
    'sent' => 'Enviado',
    'viewed' => 'Visualizado',
    'signed' => 'Assinado',
    'cancelled' => 'Cancelado',
    'expired' => 'Expirado',
    _ => value,
  };

  List<Map<String, dynamic>> get _filteredContracts {
    final query = _searchController.text.trim().toLowerCase();
    return _contracts.where((contract) {
      final snapshot = Map<String, dynamic>.from(contract['contract_snapshot'] ?? {});
      final customer = Map<String, dynamic>.from(snapshot['customer'] ?? {});
      final name = customer['name']?.toString().toLowerCase() ?? '';
      final number = contract['contract_number']?.toString() ?? '';
      final status = contract['status']?.toString() ?? '';
      final matchesQuery = query.isEmpty || name.contains(query) || number.contains(query);
      final matchesStatus = _statusFilter == 'all' || status == _statusFilter;
      return matchesQuery && matchesStatus;
    }).toList();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Contratos'),
      actions: [IconButton(tooltip: 'Atualizar', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null && _contracts.isEmpty
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
                    Text('Criar contrato a partir de uma locação', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: _selectedRentalId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Selecione uma locação', border: OutlineInputBorder()),
                      items: _rentals.map((r) {
                        final customer = _customers[r['customer_id']?.toString()]?['name'] ?? 'Cliente';
                        return DropdownMenuItem(value: r['id'].toString(), child: Text('#${r['rental_number']} · $customer · ${_date(r['start_date'])}', overflow: TextOverflow.ellipsis));
                      }).toList(),
                      onChanged: _saving ? null : (v) => setState(() => _selectedRentalId = v),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _termsController,
                      minLines: 3,
                      maxLines: 6,
                      maxLength: 5000,
                      decoration: const InputDecoration(
                        labelText: 'Condições do contrato',
                        hintText: 'Descreva as condições da locação',
                        border: OutlineInputBorder(),
                        helperText: 'As condições ficam salvas neste contrato.',
                      ),
                    ),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: _saving || _selectedRentalId == null || _termsController.text.trim().isEmpty ? null : _createDraft,
                      icon: const Icon(Icons.description_outlined),
                      label: Text(_saving ? 'Salvando...' : 'Criar rascunho'),
                    ),
                    if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                    if (_notice != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_notice!, style: TextStyle(color: Theme.of(context).colorScheme.primary))),
                    const SizedBox(height: 20),
                    Text('Contratos da empresa', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    if (_contracts.isNotEmpty) ...[
                      TextField(
                        controller: _searchController,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Buscar por cliente ou número',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 8),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(children: [
                          for (final filter in const [
                            ('all', 'Todos'),
                            ('draft', 'Rascunhos'),
                            ('sent', 'Enviados'),
                            ('viewed', 'Visualizados'),
                            ('signed', 'Assinados'),
                            ('cancelled', 'Cancelados'),
                          ])
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: Text(filter.$2),
                                selected: _statusFilter == filter.$1,
                                onSelected: (_) => setState(() => _statusFilter = filter.$1),
                              ),
                            ),
                        ]),
                      ),
                    ],
                    if (_contracts.isEmpty)
                      const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: Text('Nenhum contrato criado.')))
                    else if (_filteredContracts.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 28),
                        child: Center(child: Text('Nenhum contrato corresponde à busca ou ao filtro.')),
                      )
                    else
                      ..._filteredContracts.map((contract) {
                        final snapshot = Map<String, dynamic>.from(contract['contract_snapshot'] ?? {});
                        final customer = Map<String, dynamic>.from(snapshot['customer'] ?? {});
                        final rental = Map<String, dynamic>.from(snapshot['rental'] ?? {});
                        final canSend = contract['status'] != 'signed' && contract['status'] != 'cancelled';
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(child: Text('Contrato #${contract['contract_number']} · ${customer['name'] ?? 'Cliente'}', style: const TextStyle(fontWeight: FontWeight.bold))),
                                Text(() { final expiry = DateTime.tryParse(contract['token_expires_at']?.toString() ?? ''); return expiry != null && expiry.isBefore(DateTime.now().toUtc()) && ['sent', 'viewed'].contains(contract['status']) ? 'Link expirado' : _status(contract['status'].toString()); }(), style: Theme.of(context).textTheme.labelMedium),
                              ]),
                              const SizedBox(height: 5),
                              Text('Locação em ${_date(rental['start_date'])} · ${_money(rental['total_amount'])}', style: Theme.of(context).textTheme.bodySmall),
                              if (contract['status'] == 'signed')
                                Padding(padding: const EdgeInsets.only(top: 6), child: Text('Assinado por ${contract['signer_name'] ?? 'cliente'}', style: const TextStyle(color: Colors.green))),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton.icon(
                                  onPressed: () => _showContractDetails(contract),
                                  icon: const Icon(Icons.visibility_outlined),
                                  label: const Text('Visualizar contrato'),
                                ),
                              ),
                              if (canSend)
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: TextButton.icon(
                                    onPressed: _saving ? null : () => _generateLink(contract),
                                    icon: const Icon(Icons.link),
                                    label: Text(contract['status'] == 'draft' ? 'Gerar link de assinatura' : 'Gerar novo link'),
                                  ),
                                ),
                            ]),
                          ),
                        );
                      }),
                  ],
                ),
              ),
  );
}
