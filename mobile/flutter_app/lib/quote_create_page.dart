import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class QuoteCreatePage extends StatefulWidget {
  const QuoteCreatePage({super.key, required this.companyId});
  final String companyId;

  @override
  State<QuoteCreatePage> createState() => _QuoteCreatePageState();
}

class _QuoteCreatePageState extends State<QuoteCreatePage> {
  final _formKey = GlobalKey<FormState>();
  final _address = TextEditingController();
  final _deliveryFee = TextEditingController(text: '0');
  final _discount = TextEditingController(text: '0');
  final _notes = TextEditingController();
  final _startTime = TextEditingController(text: '09:00');
  final _endTime = TextEditingController(text: '18:00');
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _customerId;
  String? _productId;
  String _deliveryMethod = 'delivery';
  DateTime _eventDate = DateTime.now();
  DateTime _validUntil = DateTime.now().add(const Duration(days: 7));
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _products = [];
  final List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _loadOptions();
  }

  @override
  void dispose() {
    _address.dispose();
    _deliveryFee.dispose();
    _discount.dispose();
    _notes.dispose();
    _startTime.dispose();
    _endTime.dispose();
    super.dispose();
  }

  Future<void> _loadOptions() async {
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('customers').select('id,name').eq('company_id', widget.companyId).order('name'),
        client.from('products').select('id,name,event_price,daily_price').eq('company_id', widget.companyId).eq('active', true).order('name'),
      ]);
      if (!mounted) return;
      setState(() {
        _customers = results[0].map((e) => Map<String, dynamic>.from(e)).toList();
        _products = results[1].map((e) => Map<String, dynamic>.from(e)).toList();
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'Não foi possível carregar clientes e itens do catálogo.';
        _loading = false;
      });
    }
  }

  String _date(DateTime value) =>
      value.year.toString().padLeft(4, '0') + '-' +
      value.month.toString().padLeft(2, '0') + '-' +
      value.day.toString().padLeft(2, '0');

  int? _minutes(String value) {
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  Future<void> _pickDate(bool validity) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: validity ? _validUntil : _eventDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        if (validity) {
          _validUntil = picked;
        } else {
          _eventDate = picked;
        }
      });
    }
  }

  void _addProduct() {
    if (_productId == null || _items.any((item) => item['product_id'] == _productId)) return;
    final product = _products.firstWhere((p) => p['id'] == _productId);
    final price = (product['event_price'] ?? product['daily_price'] ?? 0) as num;
    setState(() {
      _items.add({
        'product_id': _productId,
        'name': product['name'],
        'quantity': 1,
        'unit_price': price.toDouble(),
      });
      _productId = null;
    });
  }

  double get _subtotal => _items.fold<double>(
    0,
    (sum, item) => sum + (item['quantity'] as int) * (item['unit_price'] as double),
  );

  double _number(TextEditingController controller) =>
      double.tryParse(controller.text.trim().replaceAll(',', '.')) ?? 0;

  double get _total =>
      (_subtotal + _number(_deliveryFee) - _number(_discount)).clamp(0, double.infinity).toDouble();

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _saving) return;
    if (_items.isEmpty) {
      setState(() => _error = 'Adicione pelo menos um item ao orçamento.');
      return;
    }
    final start = _minutes(_startTime.text.trim());
    final end = _minutes(_endTime.text.trim());
    if (start == null || end == null || end <= start) {
      setState(() => _error = 'Informe horários válidos e com término após o início.');
      return;
    }
    if (_items.any((item) => (item['quantity'] as int) < 1 || (item['unit_price'] as double) < 0)) {
      setState(() => _error = 'Confira as quantidades e os preços dos itens.');
      return;
    }
    if (_number(_deliveryFee) < 0 || _number(_discount) < 0) {
      setState(() => _error = 'Taxa de entrega e desconto não podem ser negativos.');
      return;
    }
    if (_validUntil.isBefore(DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day))) {
      setState(() => _error = 'A validade não pode estar no passado.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await Supabase.instance.client.rpc('create_rental_quote_with_items', params: {
        'p_company_id': widget.companyId,
        'p_customer_id': _customerId,
        'p_valid_until': _date(_validUntil),
        'p_event_date': _date(_eventDate),
        'p_start_time': _startTime.text.trim(),
        'p_end_time': _endTime.text.trim(),
        'p_delivery_method': _deliveryMethod,
        'p_delivery_address': _deliveryMethod == 'delivery' ? _address.text.trim() : null,
        'p_delivery_fee': _number(_deliveryFee),
        'p_discount': _number(_discount),
        'p_notes': _notes.text.trim(),
        'p_items': _items.map((item) => {
          'product_id': item['product_id'],
          'quantity': item['quantity'],
          'unit_price': item['unit_price'],
        }).toList(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Orçamento criado com sucesso.')),
      );
      Navigator.pop(context, true);
    } on PostgrestException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível salvar o orçamento. Tente novamente.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Novo orçamento')),
    body: _loading
      ? const Center(child: CircularProgressIndicator())
      : Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DropdownButtonFormField<String>(
                value: _customerId,
                decoration: const InputDecoration(labelText: 'Cliente (opcional)'),
                items: _customers.map((customer) => DropdownMenuItem(
                  value: customer['id'].toString(),
                  child: Text(customer['name'].toString(), overflow: TextOverflow.ellipsis),
                )).toList(),
                onChanged: (value) => setState(() => _customerId = value),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => _pickDate(false),
                icon: const Icon(Icons.event),
                label: Text('Data do evento: ' + _date(_eventDate)),
              ),
              OutlinedButton.icon(
                onPressed: () => _pickDate(true),
                icon: const Icon(Icons.event_available),
                label: Text('Orçamento válido até: ' + _date(_validUntil)),
              ),
              Row(children: [
                Expanded(child: TextFormField(
                  controller: _startTime,
                  decoration: const InputDecoration(labelText: 'Horário inicial (HH:MM)'),
                  validator: (value) => _minutes(value ?? '') == null ? 'Horário inválido.' : null,
                )),
                const SizedBox(width: 12),
                Expanded(child: TextFormField(
                  controller: _endTime,
                  decoration: const InputDecoration(labelText: 'Horário final (HH:MM)'),
                  validator: (value) => _minutes(value ?? '') == null ? 'Horário inválido.' : null,
                )),
              ]),
              const SizedBox(height: 16),
              Text('Itens do orçamento', style: Theme.of(context).textTheme.titleMedium),
              Row(children: [
                Expanded(child: DropdownButtonFormField<String>(
                  value: _productId,
                  decoration: const InputDecoration(labelText: 'Brinquedo ou serviço'),
                  items: _products.map((product) => DropdownMenuItem(
                    value: product['id'].toString(),
                    child: Text(product['name'].toString(), overflow: TextOverflow.ellipsis),
                  )).toList(),
                  onChanged: (value) => setState(() => _productId = value),
                )),
                IconButton(onPressed: _addProduct, icon: const Icon(Icons.add_circle_outline)),
              ]),
              ..._items.map((item) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(children: [
                    Row(children: [
                      Expanded(child: Text(item['name'].toString(), style: const TextStyle(fontWeight: FontWeight.w600))),
                      IconButton(onPressed: () => setState(() => _items.remove(item)), icon: const Icon(Icons.delete_outline)),
                    ]),
                    Row(children: [
                      Expanded(child: TextFormField(
                        initialValue: '1',
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Quantidade'),
                        onChanged: (value) => setState(() => item['quantity'] = int.tryParse(value) ?? 1),
                      )),
                      const SizedBox(width: 12),
                      Expanded(child: TextFormField(
                        initialValue: (item['unit_price'] as double).toStringAsFixed(2),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Preço unitário (R$)'),
                        onChanged: (value) => setState(() => item['unit_price'] = double.tryParse(value.replaceAll(',', '.')) ?? 0),
                      )),
                    ]),
                  ]),
                ),
              )),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _deliveryMethod,
                decoration: const InputDecoration(labelText: 'Entrega'),
                items: const [
                  DropdownMenuItem(value: 'delivery', child: Text('Entregar no endereço')),
                  DropdownMenuItem(value: 'customer_pickup', child: Text('Cliente retira')),
                ],
                onChanged: (value) => setState(() => _deliveryMethod = value ?? 'delivery'),
              ),
              if (_deliveryMethod == 'delivery')
                TextFormField(
                  controller: _address,
                  decoration: const InputDecoration(labelText: 'Endereço de entrega'),
                  validator: (value) => _deliveryMethod == 'delivery' && (value == null || value.trim().isEmpty) ? 'Informe o endereço.' : null,
                ),
              Row(children: [
                Expanded(child: TextFormField(
                  controller: _deliveryFee,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Taxa de entrega (R$)'),
                )),
                const SizedBox(width: 12),
                Expanded(child: TextFormField(
                  controller: _discount,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Desconto (R$)'),
                )),
              ]),
              TextFormField(
                controller: _notes,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Observações e condições'),
              ),
              const SizedBox(height: 12),
              Text('Subtotal: R$ ' + _subtotal.toStringAsFixed(2)),
              Text('Total: R$ ' + _total.toStringAsFixed(2), style: Theme.of(context).textTheme.titleLarge),
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
                label: Text(_saving ? 'Salvando...' : 'Salvar orçamento'),
              ),
            ],
          ),
        ),
  );
}
