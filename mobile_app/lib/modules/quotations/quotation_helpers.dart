import 'package:flutter/material.dart';

/// Shared labels and light formatting for quotation screens.
abstract class QuotationHelpers {
  static String stateLabel(String state) {
    switch (state) {
      case 'draft':
        return 'Draft';
      case 'sent':
        return 'Sent';
      case 'accepted':
        return 'Accepted';
      case 'rejected':
        return 'Rejected';
      case 'expired':
        return 'Expired';
      case 'on_hold':
        return 'On Hold';
      default:
        return state.isEmpty ? '—' : state;
    }
  }

  static Color stateColor(String state) {
    switch (state) {
      case 'draft':
        return const Color(0xFF94A3B8);
      case 'sent':
        return const Color(0xFF38BDF8);
      case 'accepted':
        return const Color(0xFF34D399);
      case 'rejected':
        return const Color(0xFFF87171);
      case 'expired':
        return const Color(0xFF64748B);
      case 'on_hold':
        return const Color(0xFFFBBF24);
      default:
        return const Color(0xFF94A3B8);
    }
  }

  static String formatDateIso(String? iso) {
    if (iso == null || iso.trim().isEmpty) return '—';
    final s = iso.trim();
    final d = DateTime.tryParse(s.length >= 10 ? s.substring(0, 10) : s);
    if (d == null) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[d.month - 1]} ${d.day}, ${d.year}';
  }

  static String formatMoney(double amount, String currency) {
    final a = amount.toStringAsFixed(2);
    return '$currency $a';
  }

  static String stripHtmlToPlain(String html) {
    var s = html.replaceAll(RegExp(r'<[^>]*>'), ' ');
    s = s.replaceAll('&nbsp;', ' ');
    s = s.replaceAll(RegExp(r'\s+'), ' ').trim();
    return s;
  }
}
