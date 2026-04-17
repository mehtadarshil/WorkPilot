import 'package:dio/dio.dart';

/// Maps [DioException] and generic errors into a single type for UI / logging.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.original});

  final String message;
  final int? statusCode;
  final Object? original;

  factory ApiException.fromDio(DioException e) {
    final response = e.response;
    final data = response?.data;
    String msg = e.message ?? 'Network error';

    if (data is Map && data['message'] is String) {
      msg = data['message'] as String;
    } else if (data is String && data.isNotEmpty) {
      msg = data;
    }

    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        msg = 'Request timed out. Please try again.';
        break;
      case DioExceptionType.connectionError:
        msg = 'No internet connection.';
        break;
      default:
        break;
    }

    return ApiException(
      msg,
      statusCode: response?.statusCode,
      original: e,
    );
  }

  @override
  String toString() => message;
}
