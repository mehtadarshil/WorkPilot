class LoginResponse {
  LoginResponse({required this.token, required this.user});

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    final rawUser = json['user'];
    if (rawUser is! Map) {
      throw FormatException('Invalid login response: user');
    }
    return LoginResponse(
      token: json['token'] as String,
      user: Map<String, dynamic>.from(rawUser),
    );
  }

  final String token;
  final Map<String, dynamic> user;
}
