import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';

import '../services/storage_service.dart';
import '../values/app_constants.dart';
import 'auth_interceptor.dart';

/// Global HTTP client. Registered in [InitialBinding] as a permanent singleton.
class DioClient extends GetxService {
  late final Dio dio;

  @override
  void onInit() {
    super.onInit();
    dio = Dio(
      BaseOptions(
        baseUrl: AppConstants.apiBaseUrl,
        connectTimeout: AppConstants.connectTimeout,
        receiveTimeout: AppConstants.receiveTimeout,
        headers: <String, dynamic>{
          Headers.acceptHeader: Headers.jsonContentType,
          Headers.contentTypeHeader: Headers.jsonContentType,
        },
      ),
    );

    // Lets GET /api/diary-events?from&to (legacy) resolve calendar days in the device’s zone.
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (RequestOptions o, RequestInterceptorHandler h) {
          o.headers['X-Client-UTC-Offset-Minutes'] =
              DateTime.now().timeZoneOffset.inMinutes.toString();
          h.next(o);
        },
      ),
    );

    dio.interceptors.add(AuthInterceptor(Get.find<StorageService>()));

    if (kDebugMode) {
      dio.interceptors.add(
        PrettyDioLogger(
          requestHeader: true,
          requestBody: true,
          responseBody: true,
        ),
      );
    }
  }
}
