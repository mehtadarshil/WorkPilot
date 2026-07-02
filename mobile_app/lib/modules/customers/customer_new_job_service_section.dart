import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'customer_tabs/helpers.dart';
import 'customer_tabs/shell.dart';

class CustomerNewJobServiceSection extends StatelessWidget {
  const CustomerNewJobServiceSection({
    super.key,
    required this.isServiceJob,
    required this.saving,
    required this.reminderFrequency,
    required this.reminderUnit,
    required this.reminderUnits,
    required this.activeChecklist,
    required this.completedServiceItems,
    required this.onServiceJobChanged,
    required this.onReminderUnitChanged,
    required this.onServiceItemChanged,
  });

  final bool isServiceJob;
  final bool saving;
  final TextEditingController reminderFrequency;
  final String reminderUnit;
  final List<String> reminderUnits;
  final List<Map<String, dynamic>> activeChecklist;
  final Set<String> completedServiceItems;
  final ValueChanged<bool> onServiceJobChanged;
  final ValueChanged<String?> onReminderUnitChanged;
  final void Function(String name, bool selected) onServiceItemChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CheckboxListTile(
          value: isServiceJob,
          onChanged: saving ? null : (v) => onServiceJobChanged(v ?? false),
          title: Text('Service job', style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w600)),
          subtitle: Text(
            'Enable automatic service reminder scheduling for this job type.',
            style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.5)),
          ),
          activeColor: AppColors.primary,
          contentPadding: EdgeInsets.zero,
        ),
        if (isServiceJob) ...[
          const SizedBox(height: 12),
          customerPanel(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Service reminder frequency', style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: reminderFrequency,
                        enabled: !saving,
                        keyboardType: TextInputType.number,
                        style: GoogleFonts.inter(color: AppColors.slate900),
                        decoration: customerInputDecoration('e.g. 1'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: reminderUnit,
                        decoration: customerInputDecoration('Unit'),
                        items: reminderUnits
                            .map((u) => DropdownMenuItem(value: u, child: Text(u[0].toUpperCase() + u.substring(1))))
                            .toList(),
                        onChanged: saving ? null : onReminderUnitChanged,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'How often should a reminder be triggered for this service job?',
                  style: GoogleFonts.inter(fontSize: 11, color: AppColors.slate400),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text('COMPLETED SERVICES IN THIS JOB', style: _labelStyle()),
          const SizedBox(height: 8),
          customerPanel(
            padding: const EdgeInsets.all(12),
            child: activeChecklist.isEmpty
                ? Text(
                    'No service checklist options configured yet. Add them in Settings -> Job Descriptions.',
                    style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
                  )
                : Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: activeChecklist.map((item) {
                      final name = ctStr(item, 'name');
                      final selected = completedServiceItems.contains(name);
                      return FilterChip(
                        label: Text(name, style: GoogleFonts.inter(fontSize: 12)),
                        selected: selected,
                        onSelected: saving ? null : (on) => onServiceItemChanged(name, on),
                        selectedColor: AppColors.primary.withValues(alpha: 0.35),
                        checkmarkColor: AppColors.primaryDark,
                      );
                    }).toList(),
                  ),
          ),
        ],
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
