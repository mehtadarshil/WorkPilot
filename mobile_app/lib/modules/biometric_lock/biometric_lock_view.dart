import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../core/values/app_constants.dart';
import 'biometric_lock_controller.dart';

class BiometricLockView extends GetView<BiometricLockController> {
  const BiometricLockView({super.key});

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        body: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.gradientStart,
                AppColors.gradientMid,
                AppColors.gradientEnd,
              ],
            ),
          ),
          child: SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Lock orb
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.primary.withValues(alpha: 0.18),
                            blurRadius: 24,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Icon(
                        Icons.lock_rounded,
                        color: AppColors.primary,
                        size: 44,
                      ),
                    ),
                    const SizedBox(height: 28),
                    Text(
                      AppConstants.appName,
                      style: GoogleFonts.inter(
                        color: AppColors.slate900,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Unlock with biometrics or device PIN',
                      style: GoogleFonts.inter(
                        color: AppColors.slate500,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 36),
                    Obx(() {
                      final err = controller.errorMessage.value;
                      if (err == null || err.isEmpty) {
                        return const SizedBox.shrink();
                      }
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 20),
                        child: Text(
                          err,
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            color: const Color(0xFFDC2626),
                            fontSize: 14,
                          ),
                        ),
                      );
                    }),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: Obx(() {
                        final loading = controller.isAuthenticating.value;
                        return DecoratedBox(
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.primary.withValues(alpha: 0.25),
                                blurRadius: 16,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(16),
                              onTap: loading ? null : controller.retry,
                              child: Center(
                                child: loading
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          color: Colors.white,
                                        ),
                                      )
                                    : Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          const Icon(
                                            Icons.lock_open_rounded,
                                            color: Colors.white,
                                            size: 22,
                                          ),
                                          const SizedBox(width: 10),
                                          Text(
                                            'Unlock',
                                            style: GoogleFonts.inter(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 15,
                                            ),
                                          ),
                                        ],
                                      ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: controller.logout,
                      child: Text(
                        'Log out',
                        style: GoogleFonts.inter(
                          color: AppColors.slate500,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      ),
    );
  }
}
