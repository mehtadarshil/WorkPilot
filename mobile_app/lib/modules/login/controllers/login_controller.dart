import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/services/storage_service.dart';
import '../../../data/repositories/auth_repository.dart';

class LoginController extends GetxController {
  LoginController({
    required AuthRepository authRepository,
    required StorageService storage,
  })  : _auth = authRepository,
        _storage = storage;

  final AuthRepository _auth;
  final StorageService _storage;

  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  final formKey = GlobalKey<FormState>();

  final obscurePassword = true.obs;
  final isLoading = false.obs;
  final errorMessage = RxnString();

  void togglePasswordVisibility() => obscurePassword.toggle();

  String? validateEmail(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return 'Email is required';
    if (!GetUtils.isEmail(v)) return 'Enter a valid email';
    return null;
  }

  String? validatePassword(String? value) {
    if (value == null || value.isEmpty) return 'Password is required';
    return null;
  }

  Future<void> submit() async {
    errorMessage.value = null;
    if (!(formKey.currentState?.validate() ?? false)) return;

    isLoading.value = true;
    try {
      final res = await _auth.login(
        email: emailController.text,
        password: passwordController.text,
      );
      await _storage.setAuthToken(res.token);
      await _storage.setUserJson(jsonEncode(res.user));
      Get.offAllNamed(AppRoutes.home);
    } on ApiException catch (e) {
      errorMessage.value = e.message;
    } catch (e) {
      errorMessage.value = e.toString().replaceFirst('Exception: ', '');
    } finally {
      isLoading.value = false;
    }
  }

  @override
  void onClose() {
    emailController.dispose();
    passwordController.dispose();
    super.onClose();
  }
}
