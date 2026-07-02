import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../widgets/wp_surface.dart';
import 'calendar_sync_controller.dart';

class CalendarSyncView extends GetView<CalendarSyncController> {
  const CalendarSyncView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.slate900),
        title: Text(
          'Calendar Sync',
          style: GoogleFonts.inter(
            color: AppColors.slate900,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: Obx(() {
        if (controller.loading.value && controller.calendars.isEmpty) {
          return const Center(
            child: CircularProgressIndicator(color: AppColors.primary),
          );
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            _intro(),
            const SizedBox(height: 16),
            if (controller.permissionDenied.value) _permissionCard(),
            _masterToggleCard(),
            const SizedBox(height: 16),
            _calendarPickerCard(),
            const SizedBox(height: 16),
            _whatToSyncCard(),
            const SizedBox(height: 16),
            _reminderCard(),
            const SizedBox(height: 16),
            _syncActionsCard(),
          ],
        );
      }),
    );
  }

  Widget _intro() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const WpAccentIconBadge(
          icon: Icons.event_available_rounded,
          accent: AppColors.primary,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            'Add your diary events, visits and holidays to the calendar app on '
            'this device (Apple, Google, Outlook…) so you get native reminders.',
            style: GoogleFonts.inter(
              fontSize: 13,
              height: 1.4,
              color: AppColors.slate600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _permissionCard() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: WpSurfaceCard(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.lock_outline_rounded, color: Color(0xFFF59E0B)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Calendar permission is required. Enable it in your device '
                'settings, then tap retry.',
                style: GoogleFonts.inter(
                    fontSize: 12.5, color: AppColors.slate600, height: 1.35),
              ),
            ),
            TextButton(
              onPressed: controller.loadCalendars,
              child: Text('Retry',
                  style: GoogleFonts.inter(
                      color: AppColors.primary, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _masterToggleCard() {
    return WpSurfaceCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Obx(
        () => SwitchListTile(
          contentPadding: EdgeInsets.zero,
          activeColor: AppColors.primary,
          value: controller.enabled.value,
          onChanged: controller.syncing.value
              ? null
              : (v) => controller.setEnabled(v),
          title: Text(
            'Sync to device calendar',
            style: GoogleFonts.inter(
                fontWeight: FontWeight.w700, color: AppColors.slate900),
          ),
          subtitle: Text(
            controller.enabled.value ? 'On' : 'Off',
            style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate500),
          ),
        ),
      ),
    );
  }

  Widget _calendarPickerCard() {
    return WpSurfaceCard(
      child: Obx(() {
        final cals = controller.calendars;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const WpSectionLabel('TARGET CALENDAR'),
            const SizedBox(height: 12),
            if (cals.isEmpty)
              Text(
                'No writable calendars found on this device.',
                style: GoogleFonts.inter(
                    fontSize: 13, color: AppColors.slate500),
              )
            else
              Container(
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.slate200),
                  borderRadius: BorderRadius.circular(10),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    isExpanded: true,
                    value: controller.calendarId.value,
                    dropdownColor: Colors.white,
                    style: GoogleFonts.inter(
                        color: AppColors.slate900, fontSize: 14),
                    items: cals
                        .map(
                          (c) => DropdownMenuItem(
                            value: c.id,
                            child: Text(
                              controller.calendarLabel(c),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => controller.selectCalendar(v),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            Text(
              'Pick the calendar that syncs to your account (e.g. Google or '
              'iCloud) so events appear on all your devices.',
              style: GoogleFonts.inter(
                  fontSize: 11.5, color: AppColors.slate500, height: 1.35),
            ),
          ],
        );
      }),
    );
  }

  Widget _whatToSyncCard() {
    return WpSurfaceCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Column(
        children: [
          Obx(
            () => SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeColor: AppColors.primary,
              value: controller.syncDiary.value,
              onChanged: (v) => controller.setSyncDiary(v),
              title: Text('Diary events & visits',
                  style: GoogleFonts.inter(
                      fontWeight: FontWeight.w600, color: AppColors.slate900)),
              subtitle: Text('Your scheduled jobs and quotation visits',
                  style: GoogleFonts.inter(
                      fontSize: 12, color: AppColors.slate500)),
            ),
          ),
          Divider(height: 1, color: AppColors.slate100),
          Obx(
            () => SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeColor: AppColors.primary,
              value: controller.syncHolidays.value,
              onChanged: (v) => controller.setSyncHolidays(v),
              title: Text('Holidays & leave',
                  style: GoogleFonts.inter(
                      fontWeight: FontWeight.w600, color: AppColors.slate900)),
              subtitle: Text('Your leave requests and company holidays',
                  style: GoogleFonts.inter(
                      fontSize: 12, color: AppColors.slate500)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _reminderCard() {
    String label(int m) {
      if (m == 0) return 'At time of event';
      if (m < 60) return '$m minutes before';
      if (m == 60) return '1 hour before';
      if (m < 1440) return '${m ~/ 60} hours before';
      return '1 day before';
    }

    return WpSurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const WpSectionLabel('REMINDER'),
          const SizedBox(height: 12),
          Obx(
            () => Container(
              decoration: BoxDecoration(
                border: Border.all(color: AppColors.slate200),
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<int>(
                  isExpanded: true,
                  value: controller.reminderMinutes.value,
                  dropdownColor: Colors.white,
                  style: GoogleFonts.inter(
                      color: AppColors.slate900, fontSize: 14),
                  items: CalendarSyncController.reminderOptions
                      .map((m) =>
                          DropdownMenuItem(value: m, child: Text(label(m))))
                      .toList(),
                  onChanged: (v) =>
                      v == null ? null : controller.setReminderMinutes(v),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _syncActionsCard() {
    return WpSurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Obx(() {
            final last = controller.lastSyncedAt.value;
            return Text(
              last == null
                  ? 'Not synced yet.'
                  : 'Last synced ${_fmt(last)}.',
              style:
                  GoogleFonts.inter(fontSize: 12.5, color: AppColors.slate500),
            );
          }),
          const SizedBox(height: 12),
          Obx(
            () => SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: (controller.syncing.value ||
                        controller.calendarId.value == null)
                    ? null
                    : controller.runSync,
                icon: controller.syncing.value
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.sync_rounded, size: 18),
                label: Text(
                  controller.syncing.value ? 'Syncing…' : 'Sync now',
                  style: GoogleFonts.inter(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
          Obx(() {
            final s = controller.status.value;
            if (s.isEmpty) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                s,
                style: GoogleFonts.inter(
                    fontSize: 12.5, color: AppColors.slate600),
              ),
            );
          }),
        ],
      ),
    );
  }

  String _fmt(DateTime dt) {
    final l = dt.toLocal();
    final h = l.hour % 12 == 0 ? 12 : l.hour % 12;
    final ampm = l.hour < 12 ? 'AM' : 'PM';
    final mm = l.minute.toString().padLeft(2, '0');
    return '${l.day}/${l.month}/${l.year} $h:$mm $ampm';
  }
}
