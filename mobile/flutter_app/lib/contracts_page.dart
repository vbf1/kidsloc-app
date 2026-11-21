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
  Map<String, dynamic> _companySettings = {};
  final TextEditingController _searchController = TextEditingController();
  String _statusFilter = 'all';
  final TextEditingController _termsController = TextEditingController();
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
      final companyFuture = client.from('companies').select('name,contract_settings').eq('id', widget.companyId).maybeSingle();
      final rentalsFuture = client.from('rentals').select('id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,delivery_method,delivery_address,total_amount,delivery_fee,discount').eq('company_id', widget.companyId).neq('status', 'cancelled').order('start_date', ascending: false).limit(200);
      final customersFuture = client.from('customers').select('id,name,phone,email,address,cpf,rg,zip,neighborhood,city_state').eq('company_id', widget.companyId);
      final contractsFuture = client.from('rental_contracts').select('id,contract_number,rental_id,status,created_at,contract_snapshot,token_expires_at,signed_at,signer_name,signer_document,signature_svg').eq('company_id', widget.companyId).order('created_at', ascending: false).limit(200);
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
        _companySettings = Map<String, dynamic>.from(company?['contract_settings'] ?? {});
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
      'template_version': 2,
      'company': {'name': _companyName, ..._companySettings},
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


  Future<void> _editCompanyDetails() async {
    final name = TextEditingController(text: _companyName);
    final legal = TextEditingController(text: _companySettings['legal_name']?.toString() ?? '');
    final document = TextEditingController(text: _companySettings['document']?.toString() ?? '');
    final phone = TextEditingController(text: _companySettings['phone']?.toString() ?? '');
    final email = TextEditingController(text: _companySettings['email']?.toString() ?? '');
    final address = TextEditingController(text: _companySettings['address']?.toString() ?? '');
    final zip = TextEditingController(text: _companySettings['zip']?.toString() ?? '');
    final saved = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Dados da empresa no contrato'),
      content: SizedBox(width: 480, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        for (final entry in <(String, TextEditingController)>[('Nome da empresa',name),('Razão social',legal),('CNPJ / CPF',document),('Telefone',phone),('E-mail',email),('Endereço',address),('CEP',zip)])
          Padding(padding: const EdgeInsets.only(bottom: 10), child: TextField(controller: entry.$2, decoration: InputDecoration(labelText: entry.$1, border: const OutlineInputBorder()))),
      ]))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Salvar')),
      ],
    ));
    if (saved == true && mounted) {
      try {
        final settings = {'legal_name':legal.text.trim(),'document':document.text.trim(),'phone':phone.text.trim(),'email':email.text.trim(),'address':address.text.trim(),'zip':zip.text.trim()};
        await Supabase.instance.client.from('companies').update({'name':name.text.trim(),'contract_settings':settings}).eq('id',widget.companyId);
        setState(() {_companyName=name.text.trim();_companySettings=settings;_notice='Dados da empresa atualizados.';});
      } on PostgrestException catch (e) {setState(() => _error=e.message);}
    }
    for (final controller in [name,legal,document,phone,email,address,zip]) {controller.dispose();}
  }

  Future<void> _editContract(Map<String, dynamic> contract) async {
    if (contract['status'] == 'signed') return;
    final snapshot = Map<String, dynamic>.from(contract['contract_snapshot'] ?? {});
    final customer = Map<String, dynamic>.from(snapshot['customer'] ?? {});
    final rental = Map<String, dynamic>.from(snapshot['rental'] ?? {});
    final name = TextEditingController(text: customer['name']?.toString() ?? '');
    final cpf = TextEditingController(text: customer['cpf']?.toString() ?? '');
    final phone = TextEditingController(text: customer['phone']?.toString() ?? '');
    final email = TextEditingController(text: customer['email']?.toString() ?? '');
    final date = TextEditingController(text: _date(rental['start_date']));
    final start = TextEditingController(text: rental['start_time']?.toString() ?? '');
    final end = TextEditingController(text: rental['end_time']?.toString() ?? '');
    final address = TextEditingController(text: rental['delivery_address']?.toString() ?? '');
    final terms = TextEditingController(text: snapshot['terms']?.toString() ?? '');
    final itemLines = TextEditingController(text: ((snapshot['items'] as List<dynamic>? ?? []).map((item) {final value=Map<String,dynamic>.from(item);return '${value['name']} | ${value['quantity']} | ${value['unit_price']}';})).join('\n'));
    final deliveryFee = TextEditingController(text: rental['delivery_fee']?.toString() ?? '0');
    final discount = TextEditingController(text: rental['discount']?.toString() ?? '0');
    final saved = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: Text('Editar contrato #${contract['contract_number']}'),
      content: SizedBox(width: 480, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        for (final entry in <(String, TextEditingController)>[('Nome do cliente',name),('CPF / documento',cpf),('Telefone',phone),('E-mail',email),('Data do evento (AAAA-MM-DD)',date),('Horário inicial',start),('Horário final',end),('Endereço do evento',address),('Itens (descrição | quantidade | valor unitário)',itemLines),('Taxa de entrega',deliveryFee),('Desconto',discount),('Condições adicionais',terms)])
          Padding(padding: const EdgeInsets.only(bottom: 10), child: TextField(controller: entry.$2, maxLines: entry.$1=='Condições adicionais'||entry.$1.startsWith('Itens ')?4:1, decoration: InputDecoration(labelText: entry.$1, border: const OutlineInputBorder()))),
      ]))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Salvar alterações')),
      ],
    ));
    if (saved == true && mounted) {
      try {
        customer.addAll({'name':name.text.trim(),'cpf':cpf.text.trim(),'phone':phone.text.trim(),'email':email.text.trim()});
        num parseAmount(String raw) {final value=raw.trim();return num.tryParse(value.contains(',')?value.replaceAll('.', '').replaceAll(',', '.'):value) ?? 0;}
        final existingItems = (snapshot['items'] as List<dynamic>? ?? []).map((item)=>Map<String,dynamic>.from(item)).toList();
        final editedItems = <Map<String,dynamic>>[];
        for (final entry in itemLines.text.split('\\n').asMap().entries) {final parts=entry.value.split('|').map((part)=>part.trim()).toList();if(parts.isEmpty||parts[0].isEmpty)continue;final previous=entry.key<existingItems.length?existingItems[entry.key]:<String,dynamic>{'product_id':'manual'};final quantity=(parts.length>1?num.tryParse(parts[1]):null)??1;final unitPrice=parseAmount(parts.length>2?parts[2]:'0');editedItems.add({...previous,'name':parts[0],'quantity':quantity,'unit_price':unitPrice,'subtotal':quantity*unitPrice});}
        final fee=parseAmount(deliveryFee.text);final discountValue=parseAmount(discount.text);final total=editedItems.fold<num>(0,(sum,item)=>sum+(item['subtotal'] as num? ?? 0))+fee-discountValue;
        rental.addAll({'start_date':date.text.trim(),'end_date':date.text.trim(),'start_time':start.text.trim().isEmpty?null:start.text.trim(),'end_time':end.text.trim().isEmpty?null:end.text.trim(),'delivery_address':address.text.trim().isEmpty?null:address.text.trim(),'delivery_fee':fee,'discount':discountValue,'total_amount':total<0?0:total});
        snapshot.addAll({'company':{'name':_companyName,..._companySettings},'customer':customer,'rental':rental,'items':editedItems,'terms':terms.text.trim()});
        final invalidate = ['sent','viewed','expired'].contains(_contractStatus(contract));
        final patch = <String,dynamic>{'contract_snapshot':snapshot};
        if (invalidate) {patch.addAll({'status':'draft','token_hash':null,'token_expires_at':null});}
        await Supabase.instance.client.from('rental_contracts').update(patch).eq('id',contract['id']).eq('company_id',widget.companyId);
        setState(() => _notice='Contrato atualizado. Gere um novo link se o anterior já havia sido enviado.');
        await _load();
      } on PostgrestException catch (e) {setState(() => _error=e.message);}
    }
    for (final controller in [name,cpf,phone,email,date,start,end,address,terms,itemLines,deliveryFee,discount]) {controller.dispose();}
  }

  Future<void> _deleteContract(Map<String, dynamic> contract) async {
    if (contract['status'] == 'signed') return;
    final confirm = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Excluir contrato?'),
      content: Text('O contrato #${contract['contract_number']} será removido permanentemente.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Excluir')),
      ],
    ));
    if (confirm != true || !mounted) return;
    try {
      await Supabase.instance.client.from('rental_contracts').delete().eq('id',contract['id']).eq('company_id',widget.companyId).neq('status','signed');
      setState(() => _notice='Contrato excluído.');
      await _load();
    } on PostgrestException catch (e) {setState(() => _error=e.message);}
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
      company['legal_name']?.toString() ?? company['name']?.toString() ?? _companyName,
      'CNPJ / CPF: ${company['document'] ?? 'Não informado'}',
      'Telefone: ${company['phone'] ?? 'Não informado'}',
      'E-mail: ${company['email'] ?? 'Não informado'}',
      'Endereço: ${company['address'] ?? 'Não informado'} · CEP ${company['zip'] ?? 'Não informado'}',
      '',
      'LOCATÁRIO',
      customer['name']?.toString() ?? 'Não informado',
      if ((customer['cpf']?.toString() ?? '').isNotEmpty) 'CPF: ${customer['cpf']}',
      if ((customer['phone']?.toString() ?? '').isNotEmpty) 'Telefone: ${customer['phone']}',
      '',
      'DADOS DA LOCAÇÃO',
      'Data: ${_date(rental['start_date'])} a ${_date(rental['end_date'])}',
      'Horário: ${rental['start_time'] ?? '—'} a ${rental['end_time'] ?? '—'}',
      'Endereço do evento: ${rental['delivery_method'] == 'delivery' ? rental['delivery_address'] ?? 'Não informado' : 'Retirada pelo cliente'}',
      'Taxa de entrega: ${_money(rental['delivery_fee'])}',
      'Desconto: ${_money(rental['discount'])}',
      'Total: ${_money(rental['total_amount'])}',
      '',
      'ITENS',
      ...items.map((item) => '${item['quantity'] ?? 1}x ${item['name'] ?? 'Item'} · ${_money(item['subtotal'])}'),
      '',
      if (snapshot['template_version'] == 2) ...[
        'CLÁUSULA 1ª – DO OBJETO',
        'A LOCADORA disponibilizará os brinquedos, equipamentos e serviços descritos neste contrato para utilização no evento e período indicados.',
        '',
        'CLÁUSULA 2ª – DA DATA E DO LOCAL DO EVENTO',
        'A locação observará a data, os horários e o endereço informados. Alterações dependerão de comunicação prévia e confirmação entre as partes.',
        '',
        'CLÁUSULA 3ª – DO VALOR E DA FORMA DE PAGAMENTO',
        'O valor e sua composição estão discriminados neste contrato. Sinal, saldo, vencimentos e meios de pagamento seguirão o registro da locação ou o acordo escrito entre as partes.',
        '',
        'CLÁUSULA 4ª – DA ENTREGA, MONTAGEM E UTILIZAÇÃO',
        'A LOCADORA realizará entrega, montagem e retirada quando contratadas. O LOCATÁRIO deverá disponibilizar espaço adequado e seguro, informar restrições de acesso e observar as orientações de segurança. Equipamentos com operação específica deverão ser manuseados por pessoa orientada e autorizada; brinquedos deverão contar com supervisão de adulto responsável.',
        '',
        'CLÁUSULA 5ª – DAS RESPONSABILIDADES',
        'A LOCADORA disponibilizará os itens em condições adequadas e orientará sobre o uso seguro. O LOCATÁRIO deverá zelar pelos equipamentos e comunicar falhas, acidentes ou danos. Danos por uso inadequado poderão ser apurados mediante demonstração dos prejuízos, respeitada a legislação aplicável. Desgaste natural e defeitos não causados pelo LOCATÁRIO não serão atribuídos a ele.',
        '',
        'CLÁUSULA 6ª – DO CANCELAMENTO E DA ALTERAÇÃO DA DATA',
        'Cancelamentos e alterações deverão ser comunicados assim que possível. As partes buscarão solução de comum acordo, considerando antecedência, custos efetivamente realizados e possibilidade de remarcação, respeitada a legislação aplicável e os direitos do consumidor.',
        '',
        'CLÁUSULA 7ª – DAS DISPOSIÇÕES GERAIS',
        'Alterações deverão ser acordadas, preferencialmente por escrito. Este instrumento registra as condições da locação e produz efeitos após a aceitação das partes.',
        '',
        'CLÁUSULA 8ª – DA ASSINATURA',
        'A assinatura poderá ser física ou eletrônica, desde que seja possível identificar os signatários e preservar a integridade do documento. Cada parte deverá receber uma cópia do contrato assinado.',
      ] else ...[
        'CONDIÇÕES',
        snapshot['terms']?.toString() ?? 'Condições não informadas.',
      ],
      if ((snapshot['terms']?.toString() ?? '').trim().isNotEmpty) ...[
        '',
        'CONDIÇÕES ADICIONAIS ACORDADAS',
        snapshot['terms'].toString(),
      ],
      '',
      'Situação: $status',
      if (contract['signer_name'] != null) 'Assinado por: ${contract['signer_name']}',
      if (contract['signed_at'] != null) 'Data da assinatura: ${_date(contract['signed_at'])}',
      if (contract['signature_svg'] != null) 'Assinatura eletrônica do cliente: registrada no sistema.',
      '',
      'LOCADORA – ${company['name']?.toString() ?? _companyName}',
      'Assinatura: __________________________________',
      '',
      'LOCATÁRIO – ${customer['name']?.toString() ?? 'Cliente'}',
      'Assinatura: __________________________________',
      '',
      'TESTEMUNHA 1 – Nome: __________________ CPF: __________________',
      'TESTEMUNHA 2 – Nome: __________________ CPF: __________________',
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

  String _contractStatus(Map<String, dynamic> contract) {
    final expiry = DateTime.tryParse(contract['token_expires_at']?.toString() ?? '');
    if (expiry != null && expiry.isBefore(DateTime.now().toUtc()) &&
        ['sent', 'viewed'].contains(contract['status'])) return 'expired';
    return contract['status']?.toString() ?? '';
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
      final status = _contractStatus(contract);
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
                    Row(children: [Expanded(child: Text('Criar contrato a partir de uma locação', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold))), IconButton(tooltip: 'Editar dados da empresa', onPressed: _editCompanyDetails, icon: const Icon(Icons.business_outlined))]),
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
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Condições adicionais (opcional)',
                        hintText: 'Inclua condições específicas combinadas com o cliente, se houver.',
                        border: OutlineInputBorder(),
                        helperText: 'O contrato já inclui cláusulas gerais. Use este campo apenas para condições específicas.',
                      ),
                    ),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: _saving || _selectedRentalId == null ? null : _createDraft,
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
                        child: Padding(padding: const EdgeInsets.only(bottom: 10), child: Row(children: [
                          for (final filter in const [
                            ('all', 'Todos'),
                            ('draft', 'Rascunhos'),
                            ('sent', 'Enviados'),
                            ('viewed', 'Visualizados'),
                            ('signed', 'Assinados'),
                            ('expired', 'Expirados'),
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
                        ])),
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
                                Text(_contractStatus(contract) == 'expired' ? 'Link expirado' : _status(contract['status'].toString()), style: Theme.of(context).textTheme.labelMedium),
                              ]),
                              const SizedBox(height: 5),
                              Text('Locação em ${_date(rental['start_date'])} · ${_money(rental['total_amount'])}', style: Theme.of(context).textTheme.bodySmall),
                              if (contract['status'] == 'signed')
                                Padding(padding: const EdgeInsets.only(top: 6), child: Text('Assinado por ${contract['signer_name'] ?? 'cliente'}', style: const TextStyle(color: Colors.green))),
                              Wrap(alignment: WrapAlignment.end, spacing: 4, children: [
                                TextButton.icon(
                                  onPressed: () => _showContractDetails(contract),
                                  icon: const Icon(Icons.visibility_outlined),
                                  label: const Text('Visualizar contrato'),
                                ),
                                if (contract['status'] != 'signed')
                                  TextButton.icon(
                                    onPressed: () => _editContract(contract),
                                    icon: const Icon(Icons.edit_outlined),
                                    label: const Text('Editar'),
                                  ),
                                if (contract['status'] != 'signed')
                                  TextButton.icon(
                                    onPressed: () => _deleteContract(contract),
                                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                                    label: const Text('Excluir', style: TextStyle(color: Colors.red)),
                                  ),
                              ]),
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
