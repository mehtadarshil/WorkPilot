import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:glass_kit/glass_kit.dart';
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
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        body: Container(
          decoration: const BoxDecoration(
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
                        border: Border.all(color: AppColors.whiteOverlay(0.22)),
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            AppColors.primary.withValues(alpha: 0.35),
                            AppColors.whiteOverlay(0.08),
                            AppColors.blackOverlay(0.2),
                          ],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.primary.withValues(alpha: 0.25),
                            blurRadius: 24,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Icon(
                        Icons.lock_rounded,
                        color: Colors.white.withValues(alpha: 0.95),
                        size: 44,
                      ),
                    ),
                    const SizedBox(height: 28),
                    Text(
                      AppConstants.appName,
                      style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Unlock with biometrics or device PIN',
                      style: GoogleFonts.inter(
                        color: AppColors.whiteOverlay(0.6),
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
                            color: const Color(0xFFFCA5A5),
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
                        return GlassContainer.frostedGlass(
                          blur: 24,
                          frostedOpacity: 0.12,
                          borderRadius: BorderRadius.circular(16),
                          borderWidth: 1,
                          borderGradient: LinearGradient(
                            colors: [
                              AppColors.whiteOverlay(0.35),
                              AppColors.whiteOverlay(0.06),
                            ],
                          ),
                          gradient: LinearGradient(
                            colors: [
                              AppColors.whiteOverlay(0.14),
                              AppColors.blackOverlay(0.28),
                            ],
                          ),
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(16),
                              onTap: loading ? null : controller.retry,
                              child: Center(
                                child: loading
                                    ? SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          color: AppColors.primary,
                                        ),
                                      )
                                    : Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                            Icons.lock_open_rounded,
                                            color: Colors.white.withValues(alpha: 0.95),
                                            size: 22,
                                          ),
                                          const SizedBox(width: 10),
                                          Text(
                                            'Unlock',
                                            style: GoogleFonts.inter(
                                              color: Colors.white.withValues(alpha: 0.95),
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
                          color: AppColors.whiteOverlay(0.5),
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
