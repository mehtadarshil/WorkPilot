import 'package:flutter_test/flutter_test.dart';
import 'package:get_storage/get_storage.dart';
import 'package:mobile_app/app.dart';

void main() {
  testWidgets('Login screen shows WorkPilot branding', (WidgetTester tester) async {
    await GetStorage.init();
    await tester.pumpWidget(const App());
    await tester.pumpAndSettle();
    expect(find.textContaining('WorkPilot'), findsOneWidget);
    expect(find.textContaining('Welcome back'), findsOneWidget);
  });
}
