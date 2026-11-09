import 'package:flutter_test/flutter_test.dart';
import 'package:kidsloc_app/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  testWidgets('renders KidsLoc brand foundation', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: KidsLocApp()));
    expect(find.text('KidsLoc App'), findsOneWidget);
    expect(find.textContaining('Sua locadora organizada'), findsOneWidget);
  });
}
