import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'widgets/pagination_controls.dart';
import 'services/company_realtime.dart';

class AgendaPage extends StatefulWidget {
  const AgendaPage({super.key, required this.companyId});
  final String companyId;

  @override
  State<AgendaPage> createState() => _AgendaPageState();
}

class _AgendaPageState extends State<AgendaPage> {
  bool _loading = true;
  String? _error;
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime _selected = DateUtils.dateOnly(DateTime.now());
  int _page = 0;
  int _productPage = 0;
  List<Map<String, dynamic>> _rentals = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _rentalItems = [];
  Map<String, int> _availableUnits = {};
  Map<String, String> _customerNames = {};
  CompanyRealtimeSubscription? _realtime;

  @override
  void initState() {
    super.initState();
    _load();
    _realtime = CompanyRealtimeSubscription.listen(
      client: Supabase.instance.client,
      companyId: widget.companyId,
      channelName: 'kidsloc-mobile-agenda-${widget.companyId}',
      tables: const ['rentals', 'rental_events', 'rental_items', 'product_units'],
      onChange: () { if (mounted) _load(showLoading: false); },
    );
  }

  @override
  void dispose() {
    _realtime?.dispose();
    super.dispose();
  }

  DateTime _parse(dynamic value) => DateTime.parse(value.toString().split('T').first);
  String _label(DateTime value) => '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';

  Future<void> _load({bool showLoading = true}) async {
    if (showLoading) setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final client = Supabase.instance.client;
      final rentals = await client.from('rentals').select('id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,total_amount').eq('company_id', widget.companyId).neq('status', 'cancelled').order('start_date').limit(500);
      final customers = await client.from('customers').select('id,name').eq('company_id', widget.companyId);
      final products = await client.from('products').select('id,name,total_quantity,inventory_mode').eq('company_id', widget.companyId).eq('active', true).inFilter('item_type', ['toy', 'machine']).order('name');
      final rentalIds = rentals.map((e) => e['id'].toString()).toList();
      final rentalItems = rentalIds.isEmpty ? <dynamic>[] : await client.from('rental_items').select('rental_id,product_id,quantity').eq('company_id', widget.companyId).inFilter('rental_id', rentalIds);
      final individualIds = products.where((p) => p['inventory_mode'] == 'individual').map((p) => p['id'].toString()).toList();
      final units = individualIds.isEmpty ? <dynamic>[] : await client.from('product_units').select('product_id,status').eq('company_id', widget.companyId).inFilter('product_id', individualIds);
      if (!mounted) return;
      setState(() {
        _rentals = rentals.map((e) => Map<String, dynamic>.from(e)).toList();
        _products = products.map((e) => Map<String, dynamic>.from(e)).toList();
        _rentalItems = rentalItems.map((e) => Map<String, dynamic>.from(e)).toList();
        _availableUnits = {for (final unit in units.where((u) => u['status'] == 'available')) unit['product_id'].toString(): units.where((u) => u['status'] == 'available' && u['product_id'].toString() == unit['product_id'].toString()).length};
        _customerNames = {for (final e in customers) e['id'].toString(): e['name']?.toString() ?? 'Cliente'};
        _loading = false;
      });
    } on PostgrestException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'Não foi possível carregar a agenda.';
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> _onDay(DateTime day) {
    return _rentals.where((r) {
      final start = _parse(r['start_date']);
      final end = _parse(r['end_date']);
      return !day.isBefore(start) && !day.isAfter(end);
    }).toList();
  }

  void _shiftMonth(int amount) {
    setState(() {
      _month = DateTime(_month.year, _month.month + amount);
      _selected = DateTime(_month.year, _month.month, 1);
      _page = 0;
      _productPage = 0;
    });
  }

  String _status(String value) => switch (value) {
    'confirmed' => 'Confirmada',
    'ongoing' => 'Em andamento',
    'completed' => 'Concluída',
    'pending' => 'Pendente',
    _ => value,
  };

  @override
  Widget build(BuildContext context) {
    final days = DateUtils.getDaysInMonth(_month.year, _month.month);
    final firstWeekday = DateTime(_month.year, _month.month, 1).weekday % 7;
    final selectedRentals = _onDay(_selected);
    final activeRentalIds = _rentals.where((r) {
      final status = r['status']?.toString() ?? '';
      return ['pending', 'confirmed', 'ongoing'].contains(status) &&
          !_selected.isBefore(_parse(r['start_date'])) &&
          !_selected.isAfter(_parse(r['end_date']));
    }).map((r) => r['id'].toString()).toSet();
    final occupiedByProduct = <String, int>{};
    for (final item in _rentalItems) {
      final rentalId = item['rental_id'].toString();
      if (activeRentalIds.contains(rentalId)) {
        final productId = item['product_id'].toString();
        occupiedByProduct[productId] = (occupiedByProduct[productId] ?? 0) + (item['quantity'] as num).toInt();
      }
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Agenda e disponibilidade'),
        actions: [IconButton(tooltip: 'Atualizar', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))],
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
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(children: [
                            Row(children: [
                              IconButton(onPressed: () => _shiftMonth(-1), icon: const Icon(Icons.chevron_left)),
                              Expanded(child: Text(
                                '${_month.month.toString().padLeft(2, '0')}/${_month.year}',
                                textAlign: TextAlign.center,
                                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                              )),
                              IconButton(onPressed: () => _shiftMonth(1), icon: const Icon(Icons.chevron_right)),
                            ]),
                            const SizedBox(height: 8),
                            Row(
                              children: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
                                  .map((d) => Expanded(child: Center(child: Text(d, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)))))
                                  .toList(),
                            ),
                            const SizedBox(height: 8),
                            GridView.builder(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              itemCount: firstWeekday + days,
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, mainAxisSpacing: 4, crossAxisSpacing: 4, childAspectRatio: 0.92),
                              itemBuilder: (context, index) {
                                if (index < firstWeekday) return const SizedBox.shrink();
                                final day = index - firstWeekday + 1;
                                final date = DateTime(_month.year, _month.month, day);
                                final count = _onDay(date).length;
                                final active = DateUtils.isSameDay(date, _selected);
                                return InkWell(
                                  borderRadius: BorderRadius.circular(10),
                                  onTap: () => setState(() { _selected = date; _page = 0; _productPage = 0; }),
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: active ? Theme.of(context).colorScheme.primaryContainer : count > 0 ? Theme.of(context).colorScheme.surfaceContainerHighest : null,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: active ? Theme.of(context).colorScheme.primary : Colors.transparent),
                                    ),
                                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                                      Text(day.toString(), style: TextStyle(fontWeight: active || count > 0 ? FontWeight.bold : FontWeight.normal)),
                                      if (count > 0) Container(
                                        margin: const EdgeInsets.only(top: 3),
                                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                        decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, borderRadius: BorderRadius.circular(8)),
                                        child: Text(count.toString(), style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                                      ),
                                    ]),
                                  ),
                                );
                              },
                            ),
                            const SizedBox(height: 8),
                            Text('Os números indicam quantas locações estão ativas em cada dia.', style: Theme.of(context).textTheme.bodySmall),
                          ]),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('Disponibilidade dos brinquedos', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 4),
                            Text('Ocupação estimada para ${_label(_selected)}.', style: Theme.of(context).textTheme.bodySmall),
                            const SizedBox(height: 12),
                            if (_products.isEmpty)
                              const Text('Nenhum brinquedo ativo cadastrado.')
                            else
                              ..._products.skip(_productPage * 6).take(6).map((product) {
                                final used = occupiedByProduct[product['id'].toString()] ?? 0;
                                final total = product['inventory_mode'] == 'individual' ? (_availableUnits[product['id'].toString()] ?? 0) : (product['total_quantity'] as num? ?? 0).toInt();
                                final available = (total - used).clamp(0, total);
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: Row(children: [
                                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text(product['name']?.toString() ?? 'Brinquedo', style: const TextStyle(fontWeight: FontWeight.w600)),
                                      Text(product['inventory_mode'] == 'individual' ? 'Unidades cadastradas em condição de uso' : 'Controle por quantidade', style: Theme.of(context).textTheme.bodySmall),
                                    ])),
                                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                      Text('$available de $total disponíveis', style: const TextStyle(fontWeight: FontWeight.bold)),
                                      Text('$used reservado(s)', style: Theme.of(context).textTheme.bodySmall),
                                    ]),
                                  ]),
                                );
                              }),
                            const SizedBox(height: 4),
                            Text('A confirmação definitiva do estoque acontece ao salvar a locação.', style: Theme.of(context).textTheme.bodySmall),
                          ]),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text('Locações em ${_label(_selected)}', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      if (selectedRentals.isEmpty)
                        const Padding(padding: EdgeInsets.symmetric(vertical: 36), child: Center(child: Text('Nenhuma locação programada para este dia.')))
                      else
                        ...selectedRentals.skip(_page * 6).take(6).map((r) => Card(
                          child: ListTile(
                            leading: const CircleAvatar(child: Icon(Icons.celebration_outlined)),
                            title: Text('Locação #${r['rental_number']} · ${_customerNames[r['customer_id']?.toString()] ?? 'Cliente'}'),
                            subtitle: Text('${_label(_parse(r['start_date']))} a ${_label(_parse(r['end_date']))}\n${r['start_time']?.toString().substring(0, 5) ?? '—'} às ${r['end_time']?.toString().substring(0, 5) ?? '—'} · ${_status(r['status'].toString())}'),
                            isThreeLine: true,
                            trailing: Text('R\$ ${(r['total_amount'] as num? ?? 0).toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        )),
                       PaginationControls(totalCount: selectedRentals.length, page: _page, pageSize: 6, onPageChanged: (value) => setState(() => _page = value)),
                    ],
                  ),
                ),
    );
  }
}
