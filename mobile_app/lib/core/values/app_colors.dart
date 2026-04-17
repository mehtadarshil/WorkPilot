import 'package:flutter/material.dart';

/// WorkPilot web-aligned palette (login gradient, teal primary, slate text).
abstract class AppColors {
  AppColors._();

  /// Primary — matches web `--color-primary` / Tailwind teal-500
  static const Color primary = Color(0xFF14B8A6);
  static const Color primaryDark = Color(0xFF0D9488);

  /// Login gradient (from-[#050816] via-[#050816] to-[#022c22])
  static const Color gradientStart = Color(0xFF050816);
  static const Color gradientMid = Color(0xFF050816);
  static const Color gradientEnd = Color(0xFF022C22);

  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate900 = Color(0xFF0F172A);

  static Color whiteOverlay(double o) => Color.fromRGBO(255, 255, 255, o);
  static Color blackOverlay(double o) => Color.fromRGBO(0, 0, 0, o);
}
