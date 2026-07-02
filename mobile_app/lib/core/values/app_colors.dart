import 'package:flutter/material.dart';

/// WorkPilot web-aligned palette (teal primary, slate surfaces, white cards).
abstract class AppColors {
  AppColors._();

  static const Color primary = Color(0xFF14B8A6);
  static const Color primaryDark = Color(0xFF0D9488);

  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color slate100 = Color(0xFFF1F5F9);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate900 = Color(0xFF0F172A);

  static const Color surface = Color(0xFFF8FAFC);
  static const Color surfaceAlt = Color(0xFFF6F8F8);

  /// Page background gradient — matches web dashboard shell.
  static const Color gradientStart = slate50;
  static const Color gradientMid = slate100;
  static const Color gradientEnd = slate200;

  static Color get primarySurface => primary.withValues(alpha: 0.1);
  static Color get primaryBorder => primary.withValues(alpha: 0.25);

  static Color blackOverlay(double o) => Color.fromRGBO(0, 0, 0, o);

  /// Card / panel border (web `border-slate-200`).
  static Color borderLight([double opacity = 1.0]) =>
      slate200.withValues(alpha: opacity);

  /// Subtle fill for chips, inputs, nested rows.
  static Color surfaceMuted([double opacity = 1.0]) =>
      slate100.withValues(alpha: opacity);

  /// Secondary body text on light backgrounds.
  static Color mutedText([double opacity = 1.0]) =>
      slate500.withValues(alpha: opacity);

  /// Tertiary / hint text on light backgrounds.
  static Color subtleText([double opacity = 1.0]) =>
      slate400.withValues(alpha: opacity);

  /// Legacy helper — maps to light border in light theme (app is light-only).
  static Color whiteOverlay(double o) {
    if (o <= 0.15) return borderLight(o.clamp(0.0, 1.0));
    if (o <= 0.35) return subtleText(o.clamp(0.0, 1.0));
    if (o <= 0.55) return mutedText(o.clamp(0.0, 1.0));
    if (o <= 0.75) return slate600.withValues(alpha: o.clamp(0.0, 1.0));
    return slate700.withValues(alpha: o.clamp(0.0, 1.0));
  }
}
