import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/services/user_profile_cache.dart';
import '../../core/values/app_colors.dart';
import '../../data/models/mobile_profile.dart';
import '../home/controllers/home_controller.dart';
import 'id_card_controller.dart';
import 'signature_drawing_view.dart';
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
                const SizedBox(height: 24),
                _buildOfficerDropdown(context),
                const SizedBox(height: 16),
                _buildSignatureCard(context, p),
              ],
            );
          }),
        ),
      ),
    );
  }

  Widget _buildOfficerDropdown(BuildContext context) {
    if (!Get.isRegistered<HomeController>()) return const SizedBox.shrink();
    final home = Get.find<HomeController>().home.value;
    final isAdmin = home?.role.toUpperCase() == 'ADMIN' || home?.role.toUpperCase() == 'SUPER_ADMIN';
    if (!isAdmin) return const SizedBox.shrink();

    return Obx(() {
      if (controller.fetchingOfficers.value) {
        return const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2));
      }
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withOpacity(0.15)),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<int?>(
            dropdownColor: AppColors.gradientStart,
            value: controller.selectedOfficerId.value,
            hint: Text(
              'Select Officer/User Signature',
              style: GoogleFonts.inter(color: Colors.white70, fontSize: 14),
            ),
            icon: const Icon(Icons.arrow_drop_down_rounded, color: Colors.white),
            items: [
              DropdownMenuItem<int?>(
                value: null,
                child: Text('Myself (${home?.profile?.fullName ?? ''})', style: GoogleFonts.inter(color: Colors.white, fontSize: 14)),
              ),
              ...controller.signatureOfficers.map((o) {
                final int? id = o['id'] as int?;
                final String name = (o['full_name'] as String?) ?? '';
                final String? role = o['role_position'] as String?;
                final String label = role != null && role.isNotEmpty ? '$name ($role)' : name;
                return DropdownMenuItem<int?>(
                  value: id,
                  child: Text(label, style: GoogleFonts.inter(color: Colors.white, fontSize: 14)),
                );
              }),
            ],
            onChanged: (val) => controller.onOfficerChanged(val),
          ),
        ),
      );
    });
  }

  Widget _buildSignatureCard(BuildContext context, MobileProfile? p) {
    if (p == null) return const SizedBox.shrink();
    
    return Obx(() {
      final isSelf = controller.selectedOfficerId.value == null;
      final signatureUrl = isSelf ? p.signatureDataUrl : controller.selectedOfficerSignature.value;
      final loadingSig = !isSelf && controller.loadingSignature.value;
      
      if (loadingSig) {
        return Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.12),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(0.15)),
          ),
          padding: const EdgeInsets.all(32),
          child: const Center(child: CircularProgressIndicator(color: Colors.white)),
        );
      }
      
      final hasSig = signatureUrl != null && signatureUrl.isNotEmpty;
      final title = isSelf ? 'Your Digital Signature' : 'Officer Digital Signature';
      
      return Container(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.12),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.15)),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  title,
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withOpacity(0.9),
                  ),
                ),
                if (hasSig)
                  IconButton(
                    tooltip: 'Update signature',
                    icon: const Icon(Icons.edit_rounded, color: Colors.white, size: 20),
                    onPressed: () => _openSignatureDrawing(context),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (!hasSig) ...[
              GestureDetector(
                onTap: () => _openSignatureDrawing(context),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withOpacity(0.1)),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.draw_rounded, color: Colors.amber, size: 36),
                      const SizedBox(height: 10),
                      Text(
                        'No signature present',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.amber,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Tap to draw signature required for signing certificates/reports',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          color: Colors.white.withOpacity(0.6),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ] else ...[
              Container(
                width: double.infinity,
                height: 100,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Image.network(
                    signatureUrl,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) {
                      if (signatureUrl.startsWith('data:')) {
                        try {
                          final uri = Uri.parse(signatureUrl);
                          final bytes = uri.data!.contentAsBytes();
                          return Image.memory(bytes, fit: BoxFit.contain);
                        } catch (_) {}
                      }
                      return const Icon(Icons.broken_image_rounded, color: Colors.grey);
                    },
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                isSelf
                    ? 'Your digital signature is active and synced. Tap edit to update.'
                    : 'This officer\'s signature is active and synced. Tap edit to update.',
                style: GoogleFonts.inter(
                  fontSize: 11,
                  color: Colors.white.withOpacity(0.6),
                ),
              ),
            ]
          ],
        ),
      );
    });
  }

  void _openSignatureDrawing(BuildContext context) async {
    final int? selectedId = controller.selectedOfficerId.value;
    String? officerName;
    if (selectedId != null) {
      final selected = controller.signatureOfficers.firstWhereOrNull((o) => o['id'] == selectedId);
      officerName = selected?['full_name'] as String?;
    }
    
    final updated = await Get.to(
      () => const SignatureDrawingView(),
      arguments: selectedId != null
          ? <String, dynamic>{
              'officerId': selectedId,
              'officerName': officerName,
            }
          : null,
    );
    if (updated == true) {
      controller.reload();
      if (Get.isRegistered<HomeController>()) {
        Get.find<HomeController>().bumpProfileRevision();
      }
    }
  }
}
