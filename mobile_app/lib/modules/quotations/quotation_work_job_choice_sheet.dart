import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';

/// After an accepted quotation visit quotation, choose same job vs new separate job.
Future<void> showQuotationWorkJobChoiceSheet(
  BuildContext context, {
  required int customerId,
  required int quotationId,
  required int visitJobId,
  int? workAddressId,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    builder: (ctx) {
      return Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 8,
          bottom: MediaQuery.paddingOf(ctx).bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Set up work job',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.slate900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Choose how this accepted quotation should become a work job.',
              style: GoogleFonts.inter(
                fontSize: 13,
                height: 1.4,
                color: AppColors.slate400,
              ),
            ),
            const SizedBox(height: 16),
            _ChoiceTile(
              icon: Icons.work_outline_rounded,
              iconColor: const Color(0xFFFBBF24),
              iconBg: const Color(0x33FBBF24),
              borderColor: const Color(0x66FBBF24),
              title: 'Continue on this visit job',
              subtitle:
                  'This visit becomes the work job. Diary history, site notes, and the visit record stay on the same job.',
              onTap: () {
                Navigator.of(ctx).pop();
                Get.toNamed(
                  AppRoutes.customerNewJob,
                  arguments: <String, dynamic>{
                    'customerId': customerId,
                    'from_quotation': quotationId,
                    'edit_visit_id': visitJobId,
                    'convert_visit': true,
                  },
                );
              },
            ),
            const SizedBox(height: 10),
            _ChoiceTile(
              icon: Icons.call_split_rounded,
              iconColor: const Color(0xFF6EE7B7),
              iconBg: const Color(0x336EE7B7),
              borderColor: const Color(0x666EE7B7),
              title: 'Create a new separate job',
              subtitle:
                  'A new work job is created and linked to this quotation. The quotation visit remains as its own record.',
              onTap: () {
                Navigator.of(ctx).pop();
                Get.toNamed(
                  AppRoutes.customerNewJob,
                  arguments: <String, dynamic>{
                    'customerId': customerId,
                    'from_quotation': quotationId,
                    if (workAddressId != null) 'work_address_id': workAddressId,
                  },
                );
              },
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(
                'Not now',
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w700,
                  color: AppColors.slate400,
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.borderColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final Color borderColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.slate100,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: borderColor),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        height: 1.4,
                        color: AppColors.slate600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
