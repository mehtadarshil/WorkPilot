import 'dart:convert';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';

import '../../core/values/app_colors.dart';
import '../../data/models/job_report_models.dart';
import '../../data/post_report_job_stages.dart';
import 'job_report_controller.dart';

Uint8List? _bytesFromDataUrl(String? s) {
  if (s == null || !s.startsWith('data:image')) return null;
  final i = s.indexOf(',');
  if (i < 0) return null;
  try {
    return base64Decode(s.substring(i + 1));
  } catch (_) {
    return null;
  }
}

class JobReportView extends GetView<JobReportController> {
  const JobReportView({super.key});

  Future<void> _pickSource(BuildContext context, int questionId) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xF21E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_rounded, color: Colors.white),
              title: Text('Gallery', style: GoogleFonts.inter(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                controller.pickPhoto(questionId, ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_rounded, color: Colors.white),
              title: Text('Camera', style: GoogleFonts.inter(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                controller.pickPhoto(questionId, ImageSource.camera);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: Colors.white,
          title: Obx(
            () => Text(
              controller.readonlyMode.value
                  ? 'Submitted job report'
                  : (controller.flowStep.value == 1 ? 'Change job stage' : 'Job report'),
              style: GoogleFonts.inter(fontWeight: FontWeight.w700),
            ),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: () {
              if (controller.readonlyMode.value) {
                Get.back();
                return;
              }
              if (controller.flowStep.value == 1) {
                controller.flowStep.value = 0;
              } else {
                Get.back();
              }
            },
          ),
        ),
        body: Container(
          width: double.infinity,
          height: double.infinity,
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
          child: Obx(() {
            if (controller.loading.value) {
              return const Center(child: CircularProgressIndicator(color: AppColors.primary));
            }
            if (controller.errorMessage.value.isNotEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    controller.errorMessage.value,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(color: AppColors.slate300),
                  ),
                ),
              );
            }
            if (controller.questions.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    controller.readonlyMode.value
                        ? 'No job report answers are stored for this visit (the checklist may have been removed from the job after completion).'
                        : 'No job report questions are configured for this job. Ask your office to add them on the job’s Job report tab.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(color: AppColors.slate300, height: 1.4),
                  ),
                ),
              );
            }
            if (!controller.readonlyMode.value && controller.flowStep.value == 1) {
              return _ChangeJobStageBody(controller: controller);
            }
            final ro = controller.readonlyMode.value;
            return Column(
              children: [
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    itemCount: controller.questions.length,
                    itemBuilder: (context, index) {
                      final q = controller.questions[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: _QuestionCard(
                          q: q,
                          controller: controller,
                          readonly: ro,
                          onPickImage: () => _pickSource(context, q.id),
                        ),
                      );
                    },
                  ),
                ),
                if (!ro)
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                      child: SizedBox(
                        width: double.infinity,
                        child: Obx(
                          () => ElevatedButton(
                            onPressed: controller.submitting.value ? null : controller.continueToJobStageStep,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                            child: Text(
                              'Continue',
                              style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 15),
                            ),
                          ),
                        ),
                      ),
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

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({
    required this.q,
    required this.controller,
    required this.readonly,
    required this.onPickImage,
  });

  final JobReportQuestion q;
  final JobReportController controller;
  final bool readonly;
  final VoidCallback onPickImage;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: const Color(0xB30F172A),
        border: Border.all(color: AppColors.whiteOverlay(0.12)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              q.prompt,
              style: GoogleFonts.inter(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            if (q.required)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'Required',
                  style: GoogleFonts.inter(fontSize: 11, color: AppColors.primary),
                ),
              ),
            if (q.helperText != null && q.helperText!.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                q.helperText!,
                style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400, height: 1.35),
              ),
            ],
            const SizedBox(height: 12),
            _buildField(context),
          ],
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration() {
    return InputDecoration(
      filled: true,
      fillColor: AppColors.whiteOverlay(0.06),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.whiteOverlay(0.12)),
      ),
    );
  }

  Widget _buildField(BuildContext context) {
    if (readonly) {
      return _readonlyField(context);
    }
    switch (q.questionType) {
      case 'textarea':
        final tc = controller.textControllerFor(q.id);
        if (tc == null) return const SizedBox.shrink();
        return TextField(
          controller: tc,
          maxLines: 5,
          style: GoogleFonts.inter(color: AppColors.slate50, fontSize: 14),
          decoration: _fieldDecoration(),
        );
      case 'text':
        final tc = controller.textControllerFor(q.id);
        if (tc == null) return const SizedBox.shrink();
        return TextField(
          controller: tc,
          style: GoogleFonts.inter(color: AppColors.slate50, fontSize: 14),
          decoration: _fieldDecoration(),
        );
      case 'customer_signature':
      case 'officer_signature':
        final sig = controller.signatureFor(q.id);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Signature(
                controller: sig,
                height: 180,
                backgroundColor: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: sig.clear,
              child: Text('Clear', style: GoogleFonts.inter(color: AppColors.primary)),
            ),
          ],
        );
      case 'before_photo':
      case 'after_photo':
        return Obx(() {
          final url = controller.imageByQuestionId[q.id];
          final bytes = _bytesFromDataUrl(url);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (bytes != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.memory(
                    bytes,
                    height: 160,
                    width: MediaQuery.sizeOf(context).width - 72,
                    fit: BoxFit.cover,
                  ),
                ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: onPickImage,
                icon: const Icon(Icons.add_a_photo_rounded, color: Colors.white, size: 20),
                label: Text(
                  bytes == null ? 'Add photo' : 'Replace photo',
                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                ),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: AppColors.whiteOverlay(0.25)),
                ),
              ),
            ],
          );
        });
      default:
        final tc = controller.textControllerFor(q.id);
        if (tc == null) return const SizedBox.shrink();
        return TextField(
          controller: tc,
          style: GoogleFonts.inter(color: AppColors.slate50, fontSize: 14),
          decoration: _fieldDecoration(),
        );
    }
  }

  Widget _readonlyField(BuildContext context) {
    switch (q.questionType) {
      case 'textarea':
      case 'text':
        final text = controller.textControllerFor(q.id)?.text ?? controller.textByQuestionId[q.id] ?? '';
        if (text.trim().isEmpty) {
          return Text('—', style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 14));
        }
        return Text(
          text,
          style: GoogleFonts.inter(color: AppColors.slate50, fontSize: 14, height: 1.4),
        );
      case 'customer_signature':
      case 'officer_signature':
      case 'before_photo':
      case 'after_photo':
        return Obx(() {
          final url = controller.imageByQuestionId[q.id];
          final bytes = _bytesFromDataUrl(url);
          if (bytes == null) {
            return Text('—', style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 14));
          }
          return ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.memory(
              bytes,
              height: q.questionType == 'before_photo' || q.questionType == 'after_photo' ? 160 : 120,
              width: MediaQuery.sizeOf(context).width - 72,
              fit: BoxFit.contain,
            ),
          );
        });
      default:
        final text = controller.textControllerFor(q.id)?.text ?? controller.textByQuestionId[q.id] ?? '';
        if (text.trim().isEmpty) {
          return Text('—', style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 14));
        }
        return Text(text, style: GoogleFonts.inter(color: AppColors.slate50, fontSize: 14));
    }
  }
}

class _JobReportGlassPanel extends StatelessWidget {
  const _JobReportGlassPanel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.whiteOverlay(0.45),
            AppColors.whiteOverlay(0.06),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.blackOverlay(0.4),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(1.15),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20.85),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20.85),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.whiteOverlay(0.1),
                    const Color(0x661e293b),
                    const Color(0x990f172a),
                  ],
                ),
                border: Border.all(color: AppColors.whiteOverlay(0.14)),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ChangeJobStageBody extends StatelessWidget {
  const _ChangeJobStageBody({required this.controller});

  final JobReportController controller;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
              Text(
                'Choose what happens next for this job. Your visit is completed when you confirm.',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.slate300,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 16),
              _JobReportGlassPanel(
                child: Theme(
                  data: Theme.of(context).copyWith(
                    radioTheme: RadioThemeData(
                      fillColor: WidgetStateProperty.resolveWith((states) {
                        if (states.contains(WidgetState.selected)) {
                          return AppColors.primary;
                        }
                        return AppColors.slate400;
                      }),
                    ),
                  ),
                  child: Obx(
                    () => Column(
                      children: [
                        for (final opt in kPostReportJobStages)
                          RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            value: opt.state,
                            groupValue: controller.selectedNextJobState.value,
                            onChanged: controller.submitting.value
                                ? null
                                : (v) {
                                    if (v != null) {
                                      controller.selectedNextJobState.value = v;
                                    }
                                  },
                            title: Text(
                              opt.label,
                              style: GoogleFonts.inter(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                opt.description,
                                style: GoogleFonts.inter(
                                  fontSize: 12,
                                  color: AppColors.slate400,
                                  height: 1.35,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: SizedBox(
              width: double.infinity,
              child: Obx(
                () => ElevatedButton(
                  onPressed: controller.submitting.value
                      ? null
                      : () => controller.submitWithSelectedJobState(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
                    controller.submitting.value ? 'Submitting…' : 'Confirm',
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
