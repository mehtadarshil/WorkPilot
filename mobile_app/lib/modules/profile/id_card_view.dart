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

/// Dark shell behind the physical-badge card (independent of app-wide light gradient).
const _kIdCardShellGradient = <Color>[
  Color(0xFF050816),
  Color(0xFF050816),
  Color(0xFF022C22),
];

class IdCardView extends GetView<IdCardController> {
  const IdCardView({super.key});

  @override
  Widget build(BuildContext context) {
    final cache = Get.find<UserProfileCache>();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: _kIdCardShellGradient.first,
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          foregroundColor: Colors.white,
          iconTheme: const IconThemeData(color: Colors.white),
          title: Text(
            'ID card',
            style: GoogleFonts.inter(
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
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
              colors: _kIdCardShellGradient,
            ),
          ),
          child: SafeArea(
            child: Obx(() {
              final p = cache.profile.value;
              final bytes = cache.photoBytes.value;
              if (cache.loading.value && p == null) {
                return const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                );
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
                  _buildOfficerPicker(context),
                  const SizedBox(height: 16),
                  _buildSignatureCard(context, p),
                ],
              );
            }),
          ),
        ),
      ),
    );
  }

  Widget _buildOfficerPicker(BuildContext context) {
    if (!Get.isRegistered<HomeController>()) return const SizedBox.shrink();
    final home = Get.find<HomeController>().home.value;
    final isAdmin =
        home?.role.toUpperCase() == 'ADMIN' ||
        home?.role.toUpperCase() == 'SUPER_ADMIN';
    if (!isAdmin) return const SizedBox.shrink();

    return Obx(() {
      if (controller.fetchingOfficers.value) {
        return const Center(
          child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2),
        );
      }

      final selectedId = controller.selectedOfficerId.value;
      final selfRaw = home?.profile?.fullName ?? '';
      final selfName = selfRaw.trim().isEmpty ? 'My account' : selfRaw.trim();
      String label = 'Myself ($selfName)';
      if (selectedId != null) {
        final match = controller.signatureOfficers.firstWhereOrNull(
          (o) => o['id'] == selectedId,
        );
        if (match != null) {
          final name = (match['full_name'] as String?)?.trim() ?? '';
          final role = (match['role_position'] as String?)?.trim();
          label = role != null && role.isNotEmpty ? '$name ($role)' : name;
        }
      }

      return Material(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _showOfficerPickerSheet(context, home?.profile?.fullName),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                Icon(Icons.people_outline_rounded, color: AppColors.primary, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'View signature for',
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white.withValues(alpha: 0.65),
                          letterSpacing: 0.3,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        label,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Icon(Icons.unfold_more_rounded, color: Colors.white.withValues(alpha: 0.85)),
              ],
            ),
          ),
        ),
      );
    });
  }

  Future<void> _showOfficerPickerSheet(BuildContext context, String? selfName) async {
    final homeName = selfName?.trim();
    final selfLabel = homeName != null && homeName.isNotEmpty
        ? 'Myself ($homeName)'
        : 'Myself';

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF111827),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Text(
                  'Select officer',
                  style: GoogleFonts.inter(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
              const Divider(height: 1, color: Color(0xFF374151)),
              _OfficerPickerTile(
                label: selfLabel,
                selected: controller.selectedOfficerId.value == null,
                onTap: () {
                  controller.onOfficerChanged(null);
                  Navigator.pop(ctx);
                },
              ),
              ...controller.signatureOfficers.map((o) {
                final id = o['id'] as int?;
                final name = (o['full_name'] as String?)?.trim() ?? 'Officer';
                final role = (o['role_position'] as String?)?.trim();
                final label = role != null && role.isNotEmpty ? '$name ($role)' : name;
                return _OfficerPickerTile(
                  label: label,
                  selected: controller.selectedOfficerId.value == id,
                  onTap: () {
                    controller.onOfficerChanged(id);
                    Navigator.pop(ctx);
                  },
                );
              }),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSignatureCard(BuildContext context, MobileProfile? p) {
    if (p == null) return const SizedBox.shrink();

    return Obx(() {
      final isSelf = controller.selectedOfficerId.value == null;
      final signatureUrl = isSelf ? p.signatureDataUrl : controller.selectedOfficerSignature.value;
      final loadingSig = !isSelf && controller.loadingSignature.value;

      if (loadingSig) {
        return _shellPanel(
          child: const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(color: AppColors.primary),
            ),
          ),
        );
      }

      final hasSig = signatureUrl != null && signatureUrl.isNotEmpty;
      final title = isSelf ? 'Your digital signature' : 'Officer digital signature';

      return _shellPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                if (hasSig)
                  IconButton(
                    tooltip: 'Update signature',
                    icon: const Icon(Icons.edit_rounded, color: AppColors.primary, size: 20),
                    onPressed: () => _openSignatureDrawing(context),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (!hasSig) ...[
              Material(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: () => _openSignatureDrawing(context),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.draw_rounded, color: AppColors.primary, size: 36),
                        const SizedBox(height: 10),
                        Text(
                          'No signature present',
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Tap to draw a signature for certificates and reports',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            height: 1.4,
                            color: Colors.white.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                    ),
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
                  border: Border.all(color: AppColors.slate200),
                ),
                child: Center(child: _SignatureImage(url: signatureUrl)),
              ),
              const SizedBox(height: 10),
              Text(
                isSelf
                    ? 'Your signature is active. Tap edit to update.'
                    : 'This officer\'s signature is active. Tap edit to update.',
                style: GoogleFonts.inter(
                  fontSize: 11,
                  height: 1.35,
                  color: Colors.white.withValues(alpha: 0.7),
                ),
              ),
            ],
          ],
        ),
      );
    });
  }

  Widget _shellPanel({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
      ),
      padding: const EdgeInsets.all(16),
      child: child,
    );
  }

  void _openSignatureDrawing(BuildContext context) async {
    final selectedId = controller.selectedOfficerId.value;
    String? officerName;
    if (selectedId != null) {
      final selected = controller.signatureOfficers.firstWhereOrNull(
        (o) => o['id'] == selectedId,
      );
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

class _OfficerPickerTile extends StatelessWidget {
  const _OfficerPickerTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary.withValues(alpha: 0.18) : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
              ),
              if (selected)
                const Icon(Icons.check_rounded, color: AppColors.primary, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

class _SignatureImage extends StatelessWidget {
  const _SignatureImage({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    if (url.startsWith('data:')) {
      try {
        final bytes = Uri.parse(url).data?.contentAsBytes();
        if (bytes != null) {
          return Image.memory(bytes, fit: BoxFit.contain);
        }
      } catch (_) {}
    }
    return Image.network(
      url,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Icon(
        Icons.broken_image_outlined,
        color: AppColors.slate400,
      ),
    );
  }
}
