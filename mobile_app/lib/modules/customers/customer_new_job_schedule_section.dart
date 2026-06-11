import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'customer_tabs/shell.dart';

class CustomerNewJobScheduleSection extends StatelessWidget {
  const CustomerNewJobScheduleSection({
    super.key,
    required this.saving,
    required this.expectedDate,
    required this.expectedTime,
    required this.priority,
    required this.userGroup,
    required this.businessUnit,
    required this.userGroupChoices,
    required this.businessUnitChoices,
    required this.bookIntoDiary,
    required this.onPickDate,
    required this.onPickTime,
    required this.onPriorityChanged,
    required this.onUserGroupChanged,
    required this.onBusinessUnitChanged,
    required this.onBookIntoDiaryChanged,
  });

  final bool saving;
  final DateTime? expectedDate;
  final TimeOfDay? expectedTime;
  final String priority;
  final String? userGroup;
  final String? businessUnit;
  final List<String> userGroupChoices;
  final List<String> businessUnitChoices;
  final bool bookIntoDiary;
  final VoidCallback onPickDate;
  final VoidCallback onPickTime;
  final ValueChanged<String?> onPriorityChanged;
  final ValueChanged<String?> onUserGroupChanged;
  final ValueChanged<String?> onBusinessUnitChanged;
  final ValueChanged<bool?> onBookIntoDiaryChanged;

  @override
  Widget build(BuildContext context) {
    final dateText = expectedDate == null
        ? 'Pick date'
        : '${expectedDate!.year}-${expectedDate!.month.toString().padLeft(2, '0')}-${expectedDate!.day.toString().padLeft(2, '0')}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Divider(color: AppColors.whiteOverlay(0.1)),
        const SizedBox(height: 12),
        Text('EXPECTED COMPLETION DATE', style: _labelStyle()),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: saving ? null : onPickDate,
                child: Text(dateText, style: GoogleFonts.inter(color: Colors.white)),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 110,
              child: OutlinedButton(
                onPressed: saving ? null : onPickTime,
                child: Text(
                  expectedTime == null ? 'Time' : expectedTime!.format(context),
                  style: GoogleFonts.inter(color: Colors.white),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text('PRIORITY', style: _labelStyle()),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          initialValue: priority,
          decoration: customerInputDecoration(''),
          items: const [
            DropdownMenuItem(value: 'low', child: Text('Low')),
            DropdownMenuItem(value: 'medium', child: Text('Medium')),
            DropdownMenuItem(value: 'high', child: Text('High')),
            DropdownMenuItem(value: 'critical', child: Text('Critical')),
          ],
          onChanged: saving ? null : onPriorityChanged,
        ),
        const SizedBox(height: 16),
        Text('USER GROUP', style: _labelStyle()),
        const SizedBox(height: 6),
        DropdownButtonFormField<String?>(
          initialValue: userGroup,
          decoration: customerInputDecoration(''),
          hint: const Text('-- Please choose --'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('-- Please choose --')),
            ...userGroupChoices.map((n) => DropdownMenuItem<String?>(value: n, child: Text(n))),
          ],
          onChanged: saving ? null : onUserGroupChanged,
        ),
        const SizedBox(height: 6),
        Text(
          'Assign this job to a specific team or user group.',
          style: GoogleFonts.inter(fontSize: 11, color: AppColors.whiteOverlay(0.45)),
        ),
        const SizedBox(height: 16),
        Text('BUSINESS UNIT', style: _labelStyle()),
        const SizedBox(height: 6),
        DropdownButtonFormField<String?>(
          initialValue: businessUnit,
          decoration: customerInputDecoration(''),
          hint: const Text('-- Please choose --'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('-- Please choose --')),
            ...businessUnitChoices.map((n) => DropdownMenuItem<String?>(value: n, child: Text(n))),
          ],
          onChanged: saving ? null : onBusinessUnitChanged,
        ),
        const SizedBox(height: 6),
        Text(
          'When this job is invoiced the system will automatically select this category.',
          style: GoogleFonts.inter(fontSize: 11, color: AppColors.primary, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        CheckboxListTile(
          value: bookIntoDiary,
          onChanged: saving ? null : onBookIntoDiaryChanged,
          title: Text('Book into diary after adding job', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
          subtitle: Text(
            'Same flag as web; scheduling still happens from the calendar on web.',
            style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.5)),
          ),
          activeColor: AppColors.primary,
          contentPadding: EdgeInsets.zero,
        ),
      ],
    );
  }

  TextStyle _labelStyle() => GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.6,
        color: AppColors.whiteOverlay(0.5),
      );
}
