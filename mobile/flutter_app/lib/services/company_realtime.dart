import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

class CompanyRealtimeSubscription {
  CompanyRealtimeSubscription._(
    this._client,
    this._channel,
    this._companyId,
    this._onChange,
  );

  final SupabaseClient _client;
  final RealtimeChannel _channel;
  final String _companyId;
  final void Function() _onChange;
  Timer? _debounce;

  factory CompanyRealtimeSubscription.listen({
    required SupabaseClient client,
    required String companyId,
    required String channelName,
    required List<String> tables,
    required void Function() onChange,
  }) {
    final channel = client.channel(channelName);
    final subscription = CompanyRealtimeSubscription._(
      client,
      channel,
      companyId,
      onChange,
    );

    for (final table in tables) {
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: table,
        callback: (payload) {
          final newCompanyId = payload.newRecord['company_id']?.toString();
          final oldCompanyId = payload.oldRecord['company_id']?.toString();
          if (newCompanyId == companyId || oldCompanyId == companyId) {
            subscription._scheduleRefresh();
          }
        },
      );
    }

    channel.subscribe();
    return subscription;
  }

  void _scheduleRefresh() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), _onChange);
  }

  void dispose() {
    _debounce?.cancel();
    unawaited(_client.removeChannel(_channel));
  }
}
