import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/services/calendar_sync_service.dart';
import '../../core/values/app_colors.dart';

/// Profile-tab row that lets a user turn device calendar sync on/off directly,
/// or tap through to the full Calendar Sync settings screen. Off by default.
class CalendarSyncProfileTile extends StatefulWidget {
  const CalendarSyncProfileTile({super.key});

  @override
  State<CalendarSyncProfileTile> createState() =>
      _CalendarSyncProfileTileState();
}

class _CalendarSyncProfileTileState extends State<CalendarSyncProfileTile> {
  CalendarSyncService get _svc => Get.find<CalendarSyncService>();
  bool _busy = false;

  Future<void> _openSettings() async {
    await Get.toNamed(AppRoutes.calendarSync);
    if (mounted) setState(() {});
  }

  Future<void> _onToggle(bool value) async {
    if (_busy) return;
    if (value) {
      setState(() => _busy = true);
      try {
        final granted = await _svc.ensurePermissions();
        if (!granted) {
          Get.snackbar('Calendar sync',
              'Calendar permission is needed to sync your events.');
          await _openSettings();
          return;
        }
        final cals = await _svc.writableCalendars();
        if (cals.isEmpty) {
          Get.snackbar('Calendar sync',
              'No writable calendar found on this device.');
          return;
        }
        if (_svc.calendarId == null) {
          final def = cals.firstWhereOrNull((c) => c.isDefault == true) ??
              cals.first;
          await _svc.setCalendarId(def.id);
        }
        await _svc.setEnabled(true);
        final res = await _svc.syncNow();
        Get.snackbar(
          'Calendar sync',
          res.ok
              ? 'On — synced ${res.total} event${res.total == 1 ? '' : 's'}.'
              : (res.error ?? 'Could not sync.'),
        );
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    } else {
      setState(() => _busy = true);
      try {
        await _svc.disableAndClear();
        Get.snackbar('Calendar sync',
            'Turned off — WorkPilot events removed from your calendar.');
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabled = _svc.enabled;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      onTap: _openSettings,
      leading: Icon(
        Icons.event_available_rounded,
        color: enabled ? AppColors.primary : AppColors.slate300,
        size: 22,
      ),
      title: Text(
        'Calendar Sync',
        style: GoogleFonts.inter(
          color: AppColors.slate500,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        enabled
            ? 'On · events sync to your phone calendar'
            : 'Off · sync events to your phone calendar',
        style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate500),
      ),
      trailing: _busy
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: AppColors.primary),
            )
          : Switch(
              value: enabled,
              activeColor: AppColors.primary,
              onChanged: _onToggle,
            ),
    );
  }
}
