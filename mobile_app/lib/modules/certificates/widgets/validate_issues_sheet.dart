import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/values/app_colors.dart';
import '../../../data/models/electrical_certificate_models.dart';
import '../certificate_editor_controller.dart';
import '../editors/board_circuits_editor_view.dart';

Future<void> showValidateIssuesSheet(CertificateEditorController controller) async {
  await Get.bottomSheet<void>(
    Obx(() {
      final issues = controller.validationIssues;
      return Container(
        constraints: BoxConstraints(maxHeight: Get.height * 0.7),
        decoration: const BoxDecoration(
          color: Color(0xFF0F172A),
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      issues.isEmpty ? 'Validation passed' : '${issues.length} validation issue(s)',
                      style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                  IconButton(
                    onPressed: Get.back,
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                ],
              ),
            ),
            Expanded(
              child: issues.isEmpty
                  ? Center(
                      child: Text(
                        'No issues found.',
                        style: GoogleFonts.inter(color: AppColors.slate400),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      itemCount: issues.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final issue = issues[index];
                        return ListTile(
                          tileColor: AppColors.whiteOverlay(0.06),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          title: Text(
                            issue.label,
                            style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                          ),
                          subtitle: Text(
                            issue.section,
                            style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 11),
                          ),
                          onTap: () {
                            Get.back();
                            _navigateToIssue(controller, issue);
                          },
                        );
                      },
                    ),
            ),
          ],
        ),
      );
    }),
    isScrollControlled: true,
  );
}

void _navigateToIssue(CertificateEditorController controller, ValidationIssue issue) {
  switch (issue.section) {
    case 'installation':
      controller.activeSectionKey.value = 'installation';
      break;
    case 'observations':
      controller.activeSectionKey.value = 'observations';
      break;
    case 'supply':
      controller.activeSectionKey.value = 'supply';
      break;
    case 'inspection':
      controller.activeSectionKey.value = 'inspection-schedule';
      break;
    case 'boards':
      controller.activeSectionKey.value = 'boards';
      if (issue.boardId != null && issue.boardId!.isNotEmpty) {
        final boards = controller.listAt('boards');
        final boardIndex = boards.indexWhere((b) => b['id']?.toString() == issue.boardId);
        if (boardIndex >= 0) {
          Get.to(() => BoardCircuitsEditorView(controller: controller, boardIndex: boardIndex));
        }
      }
      break;
    case 'appendix':
      controller.activeSectionKey.value = 'appendix';
      break;
    default:
      controller.activeSectionKey.value = controller.defaultSectionFor(
        controller.certificate.value?.typeSlug ?? '',
      );
  }
}
