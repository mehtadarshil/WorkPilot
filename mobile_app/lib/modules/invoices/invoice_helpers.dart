import 'package:flutter/material.dart';

import '../../core/values/app_colors.dart';

/// Same states as web `INVOICE_STATES`.
const List<String> invoiceStatesOrdered = <String>[
  'draft',
  'issued',
  'pending_payment',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
];

class InvoiceHelpers {
  InvoiceHelpers._();

  static String stateLabel(String state) {
    switch (state) {
      case 'draft':
        return 'Draft';
      case 'issued':
        return 'Issued';
      case 'pending_payment':
        return 'Pending payment';
      case 'partially_paid':
        return 'Partially paid';
      case 'paid':
        return 'Paid';
      case 'overdue':
        return 'Overdue';
      case 'cancelled':
        return 'Cancelled';
      default:
        return state.replaceAll('_', ' ');
    }
  }

  static Color stateColor(String state) {
    switch (state) {
      case 'draft':
        return const Color(0xFF94A3B8);
      case 'issued':
        return const Color(0xFF3B82F6);
      case 'pending_payment':
        return const Color(0xFFF59E0B);
      case 'partially_paid':
        return const Color(0xFF8B5CF6);
      case 'paid':
        return const Color(0xFF10B981);
      case 'overdue':
        return const Color(0xFFF43F5E);
      case 'cancelled':
        return const Color(0xFF64748B);
      default:
        return AppColors.primary;
    }
  }

  static String formatMoney(double amount, String currency) {
    final sym = _currencySymbol(currency);
    return '$sym${amount.toStringAsFixed(2)}';
  }

  static String _currencySymbol(String c) {
    switch (c.toUpperCase()) {
      case 'GBP':
        return '£';
      case 'EUR':
        return '€';
      case 'USD':
        return r'$';
      default:
        return '$c ';
    }
  }

  static String formatDateIso(String? iso) {
    if (iso == null || iso.trim().isEmpty) return '—';
    if (iso.length >= 10) {
      final y = iso.substring(0, 4);
      final m = iso.substring(5, 7);
      final d = iso.substring(8, 10);
      return '$d/$m/$y';
    }
    return iso;
  }

  static String stripHtmlToPlain(String html) {
    var s = html.replaceAll(RegExp(r'<[^>]*>'), ' ');
    s = s.replaceAll('&nbsp;', ' ');
    s = s.replaceAll(RegExp(r'\s+'), ' ').trim();
    return s;
  }

  static const paymentMethods = <Map<String, String>>[
    {'value': 'bank_transfer', 'label': 'Bank transfer'},
    {'value': 'credit_card', 'label': 'Credit card'},
    {'value': 'cash', 'label': 'Cash'},
    {'value': 'digital_payment', 'label': 'Digital payment'},
    {'value': 'check', 'label': 'Check'},
    {'value': 'other', 'label': 'Other'},
  ];

  static String paymentMethodLabel(String? code) {
    if (code == null || code.isEmpty) return '—';
    for (final m in paymentMethods) {
      if (m['value'] == code) return m['label']!;
    }
    return code.replaceAll('_', ' ');
  }
}
