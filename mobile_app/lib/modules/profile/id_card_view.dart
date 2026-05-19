import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/services/user_profile_cache.dart';
import '../../core/values/app_colors.dart';
import '../../core/values/app_constants.dart';
import '../../data/models/mobile_profile.dart';
import '../home/controllers/home_controller.dart';
import 'id_card_controller.dart';

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
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              physics: const BouncingScrollPhysics(),
              children: [
                Text(
                  'Tap Edit to update your photo and details.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate400),
                ),
                const SizedBox(height: 20),
                Center(
                  child: _IdCardWidget(
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

class _IdCardWidget extends StatelessWidget {
  const _IdCardWidget({
    required this.profile,
    required this.photoBytes,
    required this.controller,
  });

  final MobileProfile? profile;
  final Uint8List? photoBytes;
  final IdCardController controller;

  @override
  Widget build(BuildContext context) {
    final name = profile?.fullName.trim();
    final displayName = name != null && name.isNotEmpty ? name : 'Team member';
    final role = profile?.rolePosition?.trim();
    final dept = profile?.department?.trim();
    final email = profile?.email?.trim();
    final mobile = profile?.mobilePhone?.trim() ?? profile?.phone?.trim();
    final landline = profile?.landlinePhone?.trim();
    final kin = profile?.nextOfKinName?.trim();
    final initial = displayName.isNotEmpty ? displayName[0].toUpperCase() : '?';

    return Container(
      constraints: const BoxConstraints(maxWidth: 360),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 32,
            offset: const Offset(0, 16),
          ),
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.15),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _IdCardHeader(company: controller.companyName),
            Container(
              width: double.infinity,
              color: const Color(0xFF0B1220),
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: [
                          AppColors.primary,
                          AppColors.primary.withValues(alpha: 0.4),
                        ],
                      ),
                    ),
                    child: CircleAvatar(
                      radius: 52,
                      backgroundColor: const Color(0xFF1E293B),
                      backgroundImage: photoBytes != null ? MemoryImage(photoBytes!) : null,
                      child: photoBytes == null
                          ? Text(
                              initial,
                              style: GoogleFonts.inter(
                                fontSize: 36,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            )
                          : null,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    displayName.toUpperCase(),
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                      color: Colors.white,
                      height: 1.2,
                    ),
                  ),
                  if (role != null && role.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      role,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                  if (dept != null && dept.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      dept,
                      style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
                    ),
                  ],
                  const SizedBox(height: 18),
                  const _IdCardDivider(),
                  const SizedBox(height: 14),
                  _IdRow(label: 'Employee ID', value: controller.idLabel),
                  if (mobile != null && mobile.isNotEmpty)
                    _IdRow(label: 'Mobile', value: mobile),
                  if (landline != null && landline.isNotEmpty)
                    _IdRow(label: 'Phone', value: landline),
                  if (email != null && email.isNotEmpty) _IdRow(label: 'Email', value: email),
                  if (kin != null && kin.isNotEmpty) _IdRow(label: 'Next of kin', value: kin),
                ],
              ),
            ),
            _IdCardFooter(status: controller.statusLabel),
          ],
        ),
      ),
    );
  }
}

class _IdCardHeader extends StatelessWidget {
  const _IdCardHeader({required this.company});

  final String company;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            AppColors.primary,
            AppColors.primary.withValues(alpha: 0.75),
          ],
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppConstants.appName.toUpperCase(),
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 2,
                    color: Colors.white.withValues(alpha: 0.9),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  company,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
            ),
            child: Text(
              'OFFICIAL ID',
              style: GoogleFonts.inter(
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IdCardFooter extends StatelessWidget {
  const _IdCardFooter({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF020617),
        border: Border(top: BorderSide(color: AppColors.whiteOverlay(0.08))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'FIELD OPERATIONS',
            style: GoogleFonts.inter(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
              color: AppColors.slate500,
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              status,
              style: GoogleFonts.inter(
                fontSize: 9,
                fontWeight: FontWeight.w800,
                color: AppColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IdCardDivider extends StatelessWidget {
  const _IdCardDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 1,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.transparent,
            AppColors.primary.withValues(alpha: 0.5),
            Colors.transparent,
          ],
        ),
      ),
    );
  }
}

class _IdRow extends StatelessWidget {
  const _IdRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.slate500,
                letterSpacing: 0.3,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.slate300,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
