import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/services/user_profile_cache.dart';
import '../../core/values/app_colors.dart';
import '../home/controllers/home_controller.dart';
import 'id_card_controller.dart';
import 'widgets/flippable_id_badge.dart';

class IdCardView extends GetView<IdCardController> {
  const IdCardView({super.key});

  @override
  Widget build(BuildContext context) {
    final cache = Get.find<UserProfileCache>();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text('ID card', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
          leading: IconButton(
            icon: const Icon(Icons.close_rounded),
            onPressed: Get.back,
          ),
          actions: [
            IconButton(
              tooltip: 'Refresh',
              onPressed: () => controller.reload(),
              icon: const Icon(Icons.refresh_rounded),
            ),
            IconButton(
              tooltip: 'Edit profile',
              onPressed: () async {
                final ok = await Get.toNamed(AppRoutes.profileEdit);
                if (ok == true) {
                  await controller.reload();
                  if (Get.isRegistered<HomeController>()) {
                    Get.find<HomeController>().bumpProfileRevision();
                  }
                }
              },
              icon: const Icon(Icons.edit_rounded),
            ),
          ],
        ),
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.gradientStart, AppColors.gradientMid, AppColors.gradientEnd],
            ),
          ),
          child: Obx(() {
            final p = cache.profile.value;
            final bytes = cache.photoBytes.value;
            if (cache.loading.value && p == null) {
              return const Center(child: CircularProgressIndicator(color: AppColors.primary));
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              physics: const BouncingScrollPhysics(),
              children: [
                Center(
                  child: FlippableIdBadge(
                    profile: p,
                    photoBytes: bytes,
                    controller: controller,
                  ),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }
}
