import '../network/api_exception.dart';

bool apiExceptionLooksLikeNoConnection(ApiException e) {
  final m = e.message.toLowerCase();
  return m.contains('no internet') ||
      m.contains('internet connection') ||
      m.contains('connection refused') ||
      m.contains('network is unreachable') ||
      m.contains('failed host lookup');
}
