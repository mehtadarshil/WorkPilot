/// Optional wrapper for APIs that return `{ "data": ..., "message": ... }`.
class BaseResponse<T> {
  BaseResponse({this.data, this.message, this.success});

  factory BaseResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object? json)? fromJsonT,
  ) {
    return BaseResponse<T>(
      data: json['data'] != null && fromJsonT != null
          ? fromJsonT(json['data'])
          : json['data'] as T?,
      message: json['message'] as String?,
      success: json['success'] as bool?,
    );
  }

  final T? data;
  final String? message;
  final bool? success;
}
