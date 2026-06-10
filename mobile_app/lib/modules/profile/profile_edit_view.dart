import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/utils/text_formatters.dart';
import '../../core/values/app_colors.dart';
import 'profile_edit_controller.dart';
import 'widgets/profile_avatar_button.dart';

class ProfileEditView extends GetView<ProfileEditController> {
  const ProfileEditView({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text('Edit profile', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
          actions: [
            IconButton(
              tooltip: 'ID card',
              icon: const Icon(Icons.badge_outlined),
              onPressed: openIdCard,
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
            if (controller.loading.value) {
              return const Center(child: CircularProgressIndicator(color: AppColors.primary));
            }
            if (controller.error.value.isNotEmpty && controller.profile.value == null) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(controller.error.value, textAlign: TextAlign.center, style: GoogleFonts.inter(color: AppColors.slate400)),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: controller.load, child: const Text('Retry')),
                    ],
                  ),
                ),
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text(
                  'All fields are optional — leave blank if not needed.',
                  style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate400, height: 1.4),
                ),
                const SizedBox(height: 20),
                _photoSection(),
                const SizedBox(height: 24),
                _sectionTitle('Contact'),
                _field(controller.fullNameC, 'Display name', capitalizeWords: true),
                _field(controller.emailC, 'Email', keyboard: TextInputType.emailAddress),
                _field(controller.mobileC, 'Mobile number', keyboard: TextInputType.phone),
                _field(controller.phoneC, 'Work phone', keyboard: TextInputType.phone),
                _field(controller.landlineC, 'Other phone', keyboard: TextInputType.phone),
                Obx(() {
                  if (controller.profile.value?.isOfficer != true) return const SizedBox.shrink();
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 16),
                      _sectionTitle('Work'),
                      _field(controller.departmentC, 'Department'),
                      _field(controller.roleC, 'Role / position'),
                    ],
                  );
                }),
                const SizedBox(height: 16),
                _sectionTitle('Address & notes'),
                _field(controller.addressC, 'Address', maxLines: 3, capitalizeWords: true),
                _field(controller.notesC, 'Notes', maxLines: 4),
                const SizedBox(height: 16),
                _sectionTitle('Next of kin'),
                _field(controller.kinNameC, 'Name', capitalizeWords: true),
                _field(controller.kinPhoneC, 'Phone', keyboard: TextInputType.phone),
                _field(controller.kinRelC, 'Relationship'),
                if (controller.error.value.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(controller.error.value, style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 13)),
                ],
                const SizedBox(height: 24),
                Obx(() {
                  final busy = controller.saving.value;
                  return FilledButton(
                    onPressed: busy
                        ? null
                        : () async {
                            final ok = await controller.save();
                            if (ok) {
                              Get.back(result: true);
                              Get.snackbar('Saved', 'Profile updated');
                            }
                          },
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      backgroundColor: AppColors.primary,
                    ),
                    child: busy
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text('Save', style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16)),
                  );
                }),
              ],
            );
          }),
        ),
      ),
    );
  }

  Widget _photoSection() {
    return Obx(() {
      final bytes = controller.photoBytes.value;
      final loading = controller.photoLoading.value;
      final initial = (controller.fullNameC.text.isNotEmpty ? controller.fullNameC.text[0] : '?').toUpperCase();
      return Center(
        child: Column(
          children: [
            Stack(
              children: [
                CircleAvatar(
                  radius: 48,
                  backgroundColor: AppColors.whiteOverlay(0.12),
                  backgroundImage: bytes != null ? MemoryImage(bytes) : null,
                  child: bytes == null && !loading
                      ? Text(initial, style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white))
                      : null,
                ),
                if (loading)
                  const Positioned.fill(
                    child: Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              alignment: WrapAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: controller.saving.value ? null : () => controller.pickPhoto(ImageSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                  label: const Text('Gallery'),
                ),
                OutlinedButton.icon(
                  onPressed: controller.saving.value ? null : () => controller.pickPhoto(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: const Text('Camera'),
                ),
                if (bytes != null || controller.profile.value?.hasProfilePhoto == true)
                  TextButton(
                    onPressed: controller.saving.value ? null : controller.removePhoto,
                    child: Text('Remove photo', style: GoogleFonts.inter(color: Colors.redAccent)),
                  ),
              ],
            ),
          ],
        ),
      );
    });
  }

  Widget _sectionTitle(String t) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(t, style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.primary)),
    );
  }

  Widget _field(
    TextEditingController c,
    String label, {
    int maxLines = 1,
    TextInputType? keyboard,
    bool capitalizeWords = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        maxLines: maxLines,
        keyboardType: keyboard,
        textCapitalization:
            capitalizeWords ? TextCapitalization.words : TextCapitalization.none,
        inputFormatters: capitalizeWords ? const [capitalizeWordsFormatter] : null,
        style: GoogleFonts.inter(color: Colors.white),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: GoogleFonts.inter(color: AppColors.slate400),
          filled: true,
          fillColor: AppColors.whiteOverlay(0.06),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}
