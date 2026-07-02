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
    this.lightSurface = true,
  });

  final double radius;
  final String? fallbackInitial;
  final VoidCallback? onTap;
  final bool showEditHint;
  /// When true, avatar sits on a light card/header (dark initial text).
  final bool lightSurface;

  @override
  Widget build(BuildContext context) {
    final cache = Get.find<UserProfileCache>();
    final initial = fallbackInitial ?? cache.displayInitial;

    return Obx(() {
      final bytes = cache.photoBytes.value;
      final loading = cache.loading.value && bytes == null;
      final initialColor = lightSurface ? AppColors.slate700 : Colors.white;
      final bgColor = lightSurface
          ? AppColors.primary.withValues(alpha: 0.12)
          : AppColors.whiteOverlay(0.12);

      Widget avatar = CircleAvatar(
        radius: radius,
        backgroundColor: bgColor,
        backgroundImage: bytes != null ? MemoryImage(bytes) : null,
        child: bytes == null && !loading
            ? Text(
                initial,
                style: GoogleFonts.inter(
                  fontSize: radius * 0.65,
                  fontWeight: FontWeight.w800,
                  color: initialColor,
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
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: Icon(Icons.badge_rounded, size: 14, color: AppColors.slate900),
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
