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
import '../diary_event/job_completion_context_panel.dart';
import '../site_reports/site_report_page_nav.dart';
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

class _JobReportPage {
  const _JobReportPage({
    required this.title,
    required this.questions,
  });

  final String title;
  final List<JobReportQuestion> questions;
}

List<_JobReportPage> _buildJobReportPages(List<JobReportQuestion> questions) {
  final pages = <_JobReportPage>[];
  var currentTitle = 'Page 1';
  var currentQuestions = <JobReportQuestion>[];

  for (final q in questions) {
    if (q.questionType == 'page_break') {
      pages.add(_JobReportPage(title: currentTitle, questions: currentQuestions));
      currentTitle = q.prompt.trim().isNotEmpty ? q.prompt.trim() : 'Page ${pages.length + 1}';
      currentQuestions = <JobReportQuestion>[];
      continue;
    }
    currentQuestions.add(q);
  }

  pages.add(_JobReportPage(title: currentTitle, questions: currentQuestions));
  return pages;
}

class JobReportView extends GetView<JobReportController> {
  const JobReportView({super.key});

  Future<void> _pickSource(BuildContext context, int questionId) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(Icons.photo_library_rounded, color: AppColors.slate900),
              title: Text('Gallery', style: GoogleFonts.inter(color: AppColors.slate900)),
              onTap: () {
                Navigator.pop(ctx);
                controller.pickPhoto(questionId, ImageSource.gallery);
              },
            ),
            ListTile(
              leading: Icon(Icons.photo_camera_rounded, color: AppColors.slate900),
              title: Text('Camera', style: GoogleFonts.inter(color: AppColors.slate900)),
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
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: AppColors.slate900,
          title: Obx(
            () => Text(
              controller.readonlyMode.value
                  ? 'Submitted job report'
                  : (controller.flowStep.value == 2
                      ? 'Job completed'
                      : (controller.flowStep.value == 1 ? 'Change job stage' : 'Job report')),
              style: GoogleFonts.inter(fontWeight: FontWeight.w700),
            ),
          ),
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: () {
              if (controller.readonlyMode.value) {
                Get.back();
                return;
              }
              if (controller.flowStep.value == 2) {
                controller.finishCompletionFlow();
              } else if (controller.flowStep.value == 1) {
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
                    style: GoogleFonts.inter(color: AppColors.slate600),
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
                    style: GoogleFonts.inter(color: AppColors.slate600, height: 1.4),
                  ),
                ),
              );
            }
            if (!controller.readonlyMode.value && controller.flowStep.value == 2) {
              return _CompletionActionsBody(controller: controller);
            }
            if (!controller.readonlyMode.value && controller.flowStep.value == 1) {
              return _ChangeJobStageBody(controller: controller);
            }
            final ro = controller.readonlyMode.value;
            final pages = _buildJobReportPages(controller.questions.toList());
            final pageCount = pages.length;
            final safePageIndex = controller.currentPage.value.clamp(0, pageCount - 1);
            final activePage = pages[safePageIndex];
            return Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      if (pageCount > 1) ...[
                        Text(
                          activePage.title,
                          style: GoogleFonts.inter(
                            color: AppColors.slate900,
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (activePage.questions.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            'No questions on this page yet.',
                            style: GoogleFonts.inter(color: AppColors.slate400),
                          ),
                        ),
                      for (final q in activePage.questions)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: _QuestionCard(
                            q: q,
                            controller: controller,
                            readonly: ro,
                            onPickImage: () => _pickSource(context, q.id),
                          ),
                        ),
                    ],
                  ),
                ),
                if (pageCount > 1)
                  SiteReportPageNav(
                    pageIndex: safePageIndex,
                    pageCount: pageCount,
                    pageLabels: pages.map((p) => p.title).toList(),
                    onSelectPage: (index) => controller.currentPage.value = index,
                    onBack: () => controller.currentPage.value = safePageIndex - 1,
                    onNext: () => controller.currentPage.value = safePageIndex + 1,
                    isFirstPage: safePageIndex == 0,
                    isLastPage: safePageIndex >= pageCount - 1,
                    onDone: ro ? null : controller.continueToJobStageStep,
                    saving: controller.submitting.value,
                  )
                else if (!ro)
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
        color: Colors.white,
        border: Border.all(color: AppColors.slate200),
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
                color: AppColors.slate900,
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
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.slate200),
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
          style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
          decoration: _fieldDecoration(),
        );
      case 'text':
        final tc = controller.textControllerFor(q.id);
        if (tc == null) return const SizedBox.shrink();
        return TextField(
          controller: tc,
          style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
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
                icon: Icon(Icons.add_a_photo_rounded, color: AppColors.primary, size: 20),
                label: Text(
                  bytes == null ? 'Add photo' : 'Replace photo',
                  style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w600),
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
          style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
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
          style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14, height: 1.4),
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
        return Text(text, style: GoogleFonts.inter(color: AppColors.slate700, fontSize: 14));
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
        borderRadius: BorderRadius.circular(16),
        color: Colors.white,
        border: Border.all(color: AppColors.slate200, width: 0.8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
        child: child,
      ),
    );
  }
}

class _CompletionActionsBody extends StatelessWidget {
  const _CompletionActionsBody({required this.controller});

  final JobReportController controller;

  Future<void> _pickSiteReportTemplate(BuildContext context) async {
    final templates = await controller.loadSiteReportTemplates();
    if (!context.mounted) return;
    if (templates.isEmpty) {
      Get.snackbar(
        'Site report',
        'No site report templates are available.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
        borderRadius: 12,
      );
      return;
    }
    int? selectedId = (templates.first['id'] as num?)?.toInt();
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setState) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Choose site report template',
                      style: GoogleFonts.inter(
                        color: AppColors.slate900,
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<int>(
                      value: selectedId,
                      dropdownColor: Colors.white,
                      style: GoogleFonts.inter(color: AppColors.slate900),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      items: templates.map((t) {
                        final id = (t['id'] as num).toInt();
                        final name = (t['name'] as String?) ?? 'Template';
                        return DropdownMenuItem(value: id, child: Text(name));
                      }).toList(),
                      onChanged: (v) => setState(() => selectedId = v),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: selectedId == null
                          ? null
                          : () async {
                              Navigator.pop(ctx);
                              await controller.createSiteReportWithTemplate(selectedId!);
                            },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: Text(
                        'Create site report',
                        style: GoogleFonts.inter(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final bundle = controller.reportBundle.value;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
              Text(
                'Job report submitted successfully. You can optionally generate linked documents for this job.',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.slate600,
                  height: 1.45,
                ),
              ),
              if (controller.submittedOffline.value) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.amber.withValues(alpha: 0.35)),
                  ),
                  child: Text(
                    'Your job report is queued offline. Sync when online before creating certificates or site reports.',
                    style: GoogleFonts.inter(color: Colors.amber.shade100, fontSize: 13, height: 1.4),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              _JobReportGlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      bundle?.jobNumber?.trim().isNotEmpty == true
                          ? 'Job ${bundle!.jobNumber}'
                          : 'Completed job',
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w800,
                        color: AppColors.slate900,
                        fontSize: 16,
                      ),
                    ),
                    if (bundle?.jobTitle?.trim().isNotEmpty == true) ...[
                      const SizedBox(height: 4),
                      Text(
                        bundle!.jobTitle!,
                        style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 13),
                      ),
                    ],
                    if (bundle?.customerFullName?.trim().isNotEmpty == true) ...[
                      const SizedBox(height: 8),
                      Text(
                        bundle!.customerFullName!,
                        style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _CompletionActionCard(
                icon: Icons.verified_outlined,
                title: 'Generate Certificate',
                subtitle: 'Create a certificate linked to this job',
                onTap: controller.submittedOffline.value ? null : controller.openCertificatePicker,
              ),
              const SizedBox(height: 12),
              _CompletionActionCard(
                icon: Icons.description_outlined,
                title: 'Generate Site Report',
                subtitle: 'Create a site report from a template linked to this job',
                onTap: controller.submittedOffline.value
                    ? null
                    : () => _pickSiteReportTemplate(context),
              ),
              const SizedBox(height: 12),
              _CompletionActionCard(
                icon: Icons.skip_next_rounded,
                title: 'Skip',
                subtitle: 'Return to the visit without creating documents',
                onTap: controller.finishCompletionFlow,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CompletionActionCard extends StatelessWidget {
  const _CompletionActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: _JobReportGlassPanel(
            child: Row(
              children: [
                Icon(icon, color: AppColors.primary, size: 28),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.inter(
                          fontWeight: FontWeight.w800,
                          color: AppColors.slate900,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: GoogleFonts.inter(
                          color: AppColors.slate400,
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: AppColors.slate400),
              ],
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
                'Choose what happens next for this job. Your choice is saved when you confirm — the job stage updates only after you complete your visit.',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.slate600,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 12),
              Obx(
                () => JobCompletionContextPanel(
                  context: controller.jobCompletionContext,
                  selectedNextJobState: controller.selectedNextJobState.value,
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
                                color: AppColors.slate900,
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
