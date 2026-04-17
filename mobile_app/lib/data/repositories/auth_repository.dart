import '../models/login_response.dart';
import 'base_repository.dart';

class AuthRepository extends BaseRepository {
  AuthRepository(super.api);

  Future<LoginResponse> login({
    required String email,
    required String password,
  }) async {
    final res = await api.post<Map<String, dynamic>>(
      '/auth/login',
      data: <String, dynamic>{
        'email': email.trim(),
        'password': password,
      },
    );
    final data = res.data;
    if (data == null) {
      throw Exception('Empty response from server');
    }
    return LoginResponse.fromJson(data);
  }
}
