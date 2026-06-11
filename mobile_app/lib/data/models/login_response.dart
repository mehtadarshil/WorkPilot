class LoginResponse {
  LoginResponse({required this.token, this.refreshToken, required this.user});

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    final rawUser = json['user'];
    if (rawUser is! Map) {
      throw FormatException('Invalid login response: user');
    }
    return LoginResponse(
      token: json['token'] as String,
      refreshToken: json['refreshToken'] as String?,
      user: Map<String, dynamic>.from(rawUser),
    );
  }

  final String token;
  final String? refreshToken;
  final Map<String, dynamic> user;
}
