import 'package:dio/dio.dart';
import 'package:get/get.dart' hide Response;

import '../../core/network/api_exception.dart';
import '../../core/network/dio_client.dart';

/// Thin access layer over [Dio]. Add typed methods (GET /users, POST /auth, …) here
/// or split per domain into `user_api.dart`, `auth_api.dart`, etc.
class ApiProvider extends GetxService {
  ApiProvider(this._dioClient);

  final DioClient _dioClient;

  Dio get _dio => _dioClient.dio;

  /// Example: generic GET — replace with real endpoints.
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.get<T>(
        path,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Example: generic POST
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.post<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<Response<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.patch<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.delete<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Authenticated binary GET (e.g. customer file content).
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      return await _dio.get<List<int>>(
        path,
        queryParameters: queryParameters,
        options: Options(responseType: ResponseType.bytes),
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}
