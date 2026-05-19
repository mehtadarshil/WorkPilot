import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/services/user_profile_cache.dart';
import '../../../core/values/app_colors.dart';

/// Tappable profile photo (or initial) backed by [UserProfileCache].
class ProfileAvatarButton extends StatelessWidget {
  const ProfileAvatarButton({
    super.key,
    required this.radius,
    this.fallbackInitial,
    this.onTap,
    this.showEditHint = false,
  });

  final double radius;
  final String? fallbackInitial;
  final VoidCallback? onTap;
  final bool showEditHint;

  @override
  Widget build(BuildContext context) {
    final cache = Get.find<UserProfileCache>();
    final initial = fallbackInitial ?? cache.displayInitial;

    return Obx(() {
      final bytes = cache.photoBytes.value;
      final loading = cache.loading.value && bytes == null;

      Widget avatar = CircleAvatar(
        radius: radius,
        backgroundColor: AppColors.whiteOverlay(0.12),
        backgroundImage: bytes != null ? MemoryImage(bytes) : null,
        child: bytes == null && !loading
            ? Text(
                initial,
                style: GoogleFonts.inter(
                  fontSize: radius * 0.65,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              )
            : loading
                ? Padding(
                    padding: EdgeInsets.all(radius * 0.35),
                    child: const CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.primary,
                    ),
                  )
                : null,
      );

      if (showEditHint && onTap != null) {
        avatar = Stack(
          clipBehavior: Clip.none,
          children: [
            avatar,
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.gradientStart, width: 2),
                ),
                child: const Icon(Icons.badge_rounded, size: 14, color: Colors.white),
              ),
            ),
          ],
        );
      }

      if (onTap == null) return avatar;

      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          customBorder: CircleBorder(),
          child: avatar,
        ),
      );
    });
  }
}

void openIdCard() => Get.toNamed(AppRoutes.idCard);
