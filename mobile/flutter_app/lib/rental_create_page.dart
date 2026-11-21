import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class RentalCreatePage extends StatefulWidget {
  const RentalCreatePage({super.key, required this.companyId, this.rentalId});
  final String companyId;
  final String? rentalId;

  bool get isEditing => rentalId != null;

  @override
  State<RentalCreatePage> createState() => _RentalCreatePageState();
}

class _RentalCreatePageState extends State<RentalCreatePage> {
  final _formKey = GlobalKey<FormState>();
  final _address = TextEditingController();
  final _total = TextEditingController(text: '0');
  final _startTime = TextEditingController(text: '09:00');
  final _endTime = TextEditingController(text: '18:00');
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _customerId;
  String? _productId;
  String _status = 'pending';
  String _delivery = 'delivery';
  DateTime _startDate = DateTime.now();
  DateTime _endDate = DateTime.now();
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _members = [];
  final Set<String> _responsibles = {};
  final List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId != null) _responsibles.add(userId);
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
        client.from('customers').select('id,name').eq('company_id', widget.companyId).order('name'),
        client.from('products').select('id,name,daily_price,event_price').eq('company_id', widget.companyId).eq('active', true).order('name'),
        client.from('company_members').select('user_id,role').eq('company_id', widget.companyId),
      ]);
      final members = results[2].map((e) => Map<String, dynamic>.from(e)).toList();
      final ids = members.map((e) => e['user_id'].toString()).toList();
      final profiles = ids.isEmpty
          ? <Map<String, dynamic>>[]
          : (await client.from('profiles').select('id,full_name').inFilter('id', ids))
              .map((e) => Map<String, dynamic>.from(e)).toList();
      final names = {for (final p in profiles) p['id'].toString(): p['full_name']?.toString()};
      if (!mounted) return;
      setState(() {
        _customers = results[0].map((e) => Map<String, dynamic>.from(e)).toList();
        _products = results[1].map((e) => Map<String, dynamic>.from(e)).toList();
        _members = members.map((m) => {
          ...m,
          'name': names[m['user_id'].toString()] ?? 'Funcionário',
        }).toList();
      });
      if (widget.rentalId != null) await _loadExistingRental();
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() {
        _error = 'Não foi possível carregar clientes, brinquedos e equipe.';
        _loading = false;
      });
    }
  }

  Future<void> _loadExistingRental() async {
    final client = Supabase.instance.client;
    final rental = await client.from('rentals').select('*')
        .eq('id', widget.rentalId!).eq('company_id', widget.companyId).single();
    final results = await Future.wait([
      client.from('rental_items').select('product_id,quantity,unit_price')
          .eq('rental_id', widget.rentalId!).eq('company_id', widget.companyId),
      client.from('rental_responsibles').select('user_id')
          .eq('rental_id', widget.rentalId!).eq('company_id', widget.companyId),
    ]);
    final items = results[0].map((row) {
      final item = Map<String, dynamic>.from(row);
      final matchingProducts = _products.where((p) => p['id'].toString() == item['product_id'].toString());
      final product = matchingProducts.isEmpty ? null : matchingProducts.first;
      return <String, dynamic>{
        'product_id': item['product_id'].toString(),
        'name': product?['name']?.toString() ?? 'Item do catálogo',
        'quantity': (item['quantity'] as num).toInt(),
        'unit_price': (item['unit_price'] as num).toDouble(),
      };
    }).toList();
    if (!mounted) return;
    setState(() {
      _customerId = rental['customer_id']?.toString();
      _startDate = DateTime.parse(rental['start_date'].toString());
      _endDate = DateTime.parse(rental['end_date'].toString());
      _startTime.text = (rental['start_time'] ?? '09:00').toString().substring(0, 5);
      _endTime.text = (rental['end_time'] ?? '18:00').toString().substring(0, 5);
      _status = rental['status']?.toString() ?? 'pending';
      _delivery = rental['delivery_method']?.toString() ?? 'delivery';
      _address.text = rental['delivery_address']?.toString() ?? '';
      _total.text = ((rental['total_amount'] ?? 0) as num).toStringAsFixed(2);
      _items
        ..clear()
        ..addAll(items);
      _responsibles
        ..clear()
        ..addAll(results[1].map((r) => r['user_id'].toString()));
    });
  }

  String _date(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  int? _minutes(String value) {
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  Future<void> _pickDate(bool end) async {
    final current = end ? _endDate : _startDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        if (end) {
          _endDate = picked;
        } else {
          _startDate = picked;
          if (_endDate.isBefore(picked)) _endDate = picked;
        }
      });
    }
  }

  void _addProduct() {
    if (_productId == null || _items.any((e) => e['product_id'] == _productId)) return;
    final product = _products.firstWhere((e) => e['id'].toString() == _productId);
    final price = (product['event_price'] ?? product['daily_price'] ?? 0) as num;
    setState(() {
      _items.add({
        'product_id': _productId,
        'name': product['name'].toString(),
        'quantity': 1,
        'unit_price': price.toDouble(),
      });
      _productId = null;
      _updateTotal();
    });
  }

  double get _calculatedTotal => _items.fold<double>(
    0,
    (sum, item) => sum + (item['quantity'] as int) * (item['unit_price'] as double),
  );

  void _updateTotal() {
    _total.text = _calculatedTotal.toStringAsFixed(2);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _saving) return;
    if (_customerId == null) {
      setState(() => _error = 'Selecione o cliente da locação.');
      return;
    }
    if (_items.isEmpty) {
      setState(() => _error = 'Adicione pelo menos um brinquedo ou serviço.');
      return;
    }
    final start = _minutes(_startTime.text.trim());
    final end = _minutes(_endTime.text.trim());
    if (start == null || end == null || (_date(_startDate) == _date(_endDate) && end <= start)) {
      setState(() => _error = 'Confira os horários. O término deve ser após o início.');
      return;
    }
    final total = double.tryParse(_total.text.trim().replaceAll(',', '.'));
    if (total == null || total < 0) {
      setState(() => _error = 'Informe um valor total válido.');
      return;
    }
    if (_items.any((e) => (e['quantity'] as int) < 1 || (e['unit_price'] as double) < 0)) {
      setState(() => _error = 'Confira quantidades e preços dos itens.');
      return;
    }
    if (_delivery == 'delivery' && _address.text.trim().isEmpty) {
      setState(() => _error = 'Informe o endereço de entrega.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final params = {
        'p_company_id': widget.companyId,
        'p_customer_id': _customerId,
        'p_start_date': _date(_startDate),
        'p_end_date': _date(_endDate),
        'p_status': _status,
        'p_delivery_method': _delivery,
        'p_total_amount': total,
        'p_items': _items.map((e) => {
          'product_id': e['product_id'],
          'quantity': e['quantity'],
          'unit_price': e['unit_price'],
        }).toList(),
        'p_delivery_address': _delivery == 'delivery' ? _address.text.trim() : null,
        'p_responsible_user_ids': _responsibles.toList(),
        'p_start_time': _startTime.text.trim(),
        'p_end_time': _endTime.text.trim(),
      };
      if (widget.rentalId == null) {
        await Supabase.instance.client.rpc('create_rental_with_items', params: params);
      } else {
        params['p_rental_id'] = widget.rentalId;
        await Supabase.instance.client.rpc('update_rental_with_items', params: params);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(widget.isEditing ? 'Locação atualizada com sucesso.' : 'Locação criada com sucesso.')),
      );
      Navigator.pop(context, true);
    } on PostgrestException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível salvar a locação. Tente novamente.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.isEditing ? 'Editar locação' : 'Nova locação')),
    body: _loading
      ? const Center(child: CircularProgressIndicator())
      : Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DropdownButtonFormField<String>(
                value: _customerId,
                decoration: const InputDecoration(labelText: 'Cliente'),
                items: _customers.map((e) => DropdownMenuItem(
                  value: e['id'].toString(),
                  child: Text(e['name'].toString(), overflow: TextOverflow.ellipsis),
                )).toList(),
                onChanged: (v) => setState(() => _customerId = v),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => _pickDate(false),
                icon: const Icon(Icons.event),
                label: Text('Início: ${_date(_startDate)}'),
              ),
              OutlinedButton.icon(
                onPressed: () => _pickDate(true),
                icon: const Icon(Icons.event_available),
                label: Text('Término: ${_date(_endDate)}'),
              ),
              Row(children: [
                Expanded(child: TextFormField(
                  controller: _startTime,
                  decoration: const InputDecoration(labelText: 'Horário inicial'),
                  validator: (v) => _minutes(v ?? '') == null ? 'Horário inválido' : null,
                )),
                const SizedBox(width: 12),
                Expanded(child: TextFormField(
                  controller: _endTime,
                  decoration: const InputDecoration(labelText: 'Horário final'),
                  validator: (v) => _minutes(v ?? '') == null ? 'Horário inválido' : null,
                )),
              ]),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _status,
                decoration: const InputDecoration(labelText: 'Situação'),
                items: [
                  const DropdownMenuItem(value: 'pending', child: Text('Pendente')),
                  const DropdownMenuItem(value: 'confirmed', child: Text('Confirmada')),
                  const DropdownMenuItem(value: 'ongoing', child: Text('Em andamento')),
                  if (widget.isEditing) const DropdownMenuItem(value: 'completed', child: Text('Concluída')),
                  if (widget.isEditing) const DropdownMenuItem(value: 'cancelled', child: Text('Cancelada')),
                ],
                onChanged: (v) => setState(() => _status = v ?? 'pending'),
              ),
              const SizedBox(height: 12),
              Text('Brinquedos e serviços', style: Theme.of(context).textTheme.titleMedium),
              Row(children: [
                Expanded(child: DropdownButtonFormField<String>(
                  value: _productId,
                  decoration: const InputDecoration(labelText: 'Item do catálogo'),
                  items: _products.map((e) => DropdownMenuItem(
                    value: e['id'].toString(),
                    child: Text(e['name'].toString(), overflow: TextOverflow.ellipsis),
                  )).toList(),
                  onChanged: (v) => setState(() => _productId = v),
                )),
                IconButton(onPressed: _addProduct, icon: const Icon(Icons.add_circle_outline)),
              ]),
              ..._items.map((item) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(children: [
                    Row(children: [
                      Expanded(child: Text(item['name'].toString(), style: const TextStyle(fontWeight: FontWeight.w600))),
                      IconButton(onPressed: () => setState(() {
                        _items.remove(item);
                        _updateTotal();
                      }), icon: const Icon(Icons.delete_outline)),
                    ]),
                    Row(children: [
                      Expanded(child: TextFormField(
                        initialValue: '1',
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Quantidade'),
                        onChanged: (v) => setState(() {
                          item['quantity'] = int.tryParse(v) ?? 1;
                          _updateTotal();
                        }),
                      )),
                      const SizedBox(width: 12),
                      Expanded(child: TextFormField(
                        initialValue: (item['unit_price'] as double).toStringAsFixed(2),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Preço unitário (R\$)'),
                        onChanged: (v) => setState(() {
                          item['unit_price'] = double.tryParse(v.replaceAll(',', '.')) ?? 0;
                          _updateTotal();
                        }),
                      )),
                    ]),
                  ]),
                ),
              )),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _delivery,
                decoration: const InputDecoration(labelText: 'Entrega'),
                items: const [
                  DropdownMenuItem(value: 'delivery', child: Text('Entregar no endereço')),
                  DropdownMenuItem(value: 'customer_pickup', child: Text('Cliente retira')),
                ],
                onChanged: (v) => setState(() => _delivery = v ?? 'delivery'),
              ),
              if (_delivery == 'delivery')
                TextFormField(
                  controller: _address,
                  decoration: const InputDecoration(labelText: 'Endereço de entrega'),
                  validator: (v) => _delivery == 'delivery' && (v == null || v.trim().isEmpty) ? 'Informe o endereço' : null,
                ),
              TextFormField(
                controller: _total,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Valor total (R\$)'),
              ),
              const SizedBox(height: 12),
              Text('Funcionários responsáveis', style: Theme.of(context).textTheme.titleMedium),
              ..._members.map((member) {
                final id = member['user_id'].toString();
                return CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _responsibles.contains(id),
                  title: Text(member['name'].toString()),
                  subtitle: Text(member['role'].toString()),
                  onChanged: (checked) => setState(() {
                    if (checked == true) {
                      _responsibles.add(id);
                    } else {
                      _responsibles.remove(id);
                    }
                  }),
                );
              }),
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
                label: Text(_saving ? 'Salvando...' : widget.isEditing ? 'Salvar alterações' : 'Salvar locação'),
              ),
            ],
          ),
        ),
  );
}
