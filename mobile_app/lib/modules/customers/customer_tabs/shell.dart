import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';

bool jobIsOngoing(Map<String, dynamic> j) {
  final st = '${j['state'] ?? ''}'.toLowerCase();
  return st != 'completed' && st != 'closed';
}

String formatIsoDateShort(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  try {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    return '$dd/$mm/${d.year}';
  } catch (_) {
    return iso;
  }
}

String formatIsoDateWeekday(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  const w = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  final wd = w[(d.weekday - 1) % 7];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '$wd ${d.day} ${months[d.month - 1]} ${d.year}';
}

String formatGbp(dynamic n) {
  final v = n is num ? n.toDouble() : double.tryParse('$n') ?? 0;
  return '£${v.toStringAsFixed(2)}';
}

Color invoiceStateColor(String state) {
  switch (state.toLowerCase()) {
    case 'paid':
      return const Color(0xFF059669);
    case 'cancelled':
      return AppColors.slate400;
    case 'sent':
    case 'issued':
      return const Color(0xFFD97706);
    default:
      return AppColors.whiteOverlay(0.65);
  }
}

Widget customerPanel({
  required Widget child,
  EdgeInsetsGeometry padding = const EdgeInsets.all(14),
}) {
  return Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 12),
    padding: padding,
    decoration: BoxDecoration(
      color: AppColors.whiteOverlay(0.09),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.whiteOverlay(0.12)),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.12),
          blurRadius: 12,
          offset: const Offset(0, 4),
        ),
      ],
    ),
    child: child,
  );
}

Widget customerSectionHeader(String title, {Widget? trailing}) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 10, top: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          title.toUpperCase(),
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.1,
            color: AppColors.whiteOverlay(0.5),
          ),
        ),
        const Spacer(),
        if (trailing != null) trailing,
      ],
    ),
  );
}

Widget customerEmptyState({
  required IconData icon,
  required String title,
  String? subtitle,
}) {
  return customerPanel(
    padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
    child: Column(
      children: [
        Icon(icon, size: 40, color: AppColors.whiteOverlay(0.2)),
        const SizedBox(height: 12),
        Text(title, style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.85), fontWeight: FontWeight.w600)),
        if (subtitle != null && subtitle.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45)),
          ),
        ],
      ],
    ),
  );
}

Widget metaChip(String label) {
  if (label.isEmpty) return const SizedBox.shrink();
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      border: Border.all(color: AppColors.whiteOverlay(0.22)),
      borderRadius: BorderRadius.circular(8),
      color: AppColors.whiteOverlay(0.05),
    ),
    child: Text(
      label,
      style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.whiteOverlay(0.85)),
    ),
  );
}

Widget invoiceStateBadge(String state) {
  final s = state.isEmpty ? '—' : state;
  final c = invoiceStateColor(s);
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: c.withValues(alpha: 0.2),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      s.toUpperCase(),
      style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: c),
    ),
  );
}

Widget statusPill(String label, {bool compact = false}) {
  final up = label.toUpperCase();
  Color bg;
  Color fg = Colors.white;
  if (up == 'ACTIVE') {
    bg = const Color(0xFF0D9488);
  } else if (up == 'LEAD') {
    bg = const Color(0xFFD97706);
  } else if (up == 'INACTIVE') {
    bg = AppColors.slate400;
  } else {
    bg = AppColors.whiteOverlay(0.22);
  }
  return Container(
    padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: compact ? 3 : 4),
    decoration: BoxDecoration(
      color: bg.withValues(alpha: 0.9),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      up,
      style: GoogleFonts.inter(
        color: fg,
        fontSize: compact ? 10 : 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.4,
      ),
    ),
  );
}

InputDecoration customerInputDecoration(String label) {
  return InputDecoration(
    labelText: label,
    labelStyle: GoogleFonts.inter(color: AppColors.whiteOverlay(0.55)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: AppColors.whiteOverlay(0.15)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: AppColors.primary),
    ),
  );
}

Widget infoRow(String label, String value, {IconData? icon}) {
  if (value.isEmpty) return const SizedBox.shrink();
  return Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 18, color: AppColors.whiteOverlay(0.45)),
          const SizedBox(width: 10),
        ],
        Expanded(
          flex: 2,
          child: Text(
            label,
            style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45), fontWeight: FontWeight.w500),
          ),
        ),
        Expanded(
          flex: 3,
          child: Text(
            value,
            style: GoogleFonts.inter(fontSize: 13, color: Colors.white, fontWeight: FontWeight.w500, height: 1.25),
          ),
        ),
      ],
    ),
  );
}
