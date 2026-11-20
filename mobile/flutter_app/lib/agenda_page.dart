import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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
  List<Map<String, dynamic>> _rentals = [];
  Map<String, String> _customerNames = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  DateTime _parse(dynamic value) => DateTime.parse(value.toString().split('T').first);
  String _key(DateTime value) => '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  String _label(DateTime value) => '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final client = Supabase.instance.client;
      final rentals = await client.from('rentals').select('id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,total_amount').eq('company_id', widget.companyId).neq('status', 'cancelled').order('start_date').limit(500);
      final customers = await client.from('customers').select('id,name').eq('company_id', widget.companyId);
      if (!mounted) return;
      setState(() {
        _rentals = rentals.map((e) => Map<String, dynamic>.from(e)).toList();
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
                            const Row(
                              children: [
                                'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'
                              ].map((d) => Expanded(child: Center(child: Text(d, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold))))).toList(),
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
                                  onTap: () => setState(() => _selected = date),
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
                      Text('Locações em ${_label(_selected)}', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      if (selectedRentals.isEmpty)
                        const Padding(padding: EdgeInsets.symmetric(vertical: 36), child: Center(child: Text('Nenhuma locação programada para este dia.')))
                      else
                        ...selectedRentals.map((r) => Card(
                          child: ListTile(
                            leading: const CircleAvatar(child: Icon(Icons.celebration_outlined)),
                            title: Text('Locação #${r['rental_number']} · ${_customerNames[r['customer_id']?.toString()] ?? 'Cliente'}'),
                            subtitle: Text('${_label(_parse(r['start_date']))} a ${_label(_parse(r['end_date']))}\n${r['start_time']?.toString().substring(0, 5) ?? '—'} às ${r['end_time']?.toString().substring(0, 5) ?? '—'} · ${_status(r['status'].toString())}'),
                            isThreeLine: true,
                            trailing: Text('R\$ ${(r['total_amount'] as num? ?? 0).toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        )),
                    ],
                  ),
                ),
    );
  }
}
