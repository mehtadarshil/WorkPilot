import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../core/values/app_colors.dart';

/// White card with slate-200 border — matches web dashboard cards.
class WpSurfaceCard extends StatelessWidget {
  const WpSurfaceCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.margin,
    this.onTap,
    this.borderRadius = 16,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final card = DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(borderRadius),
        color: Colors.white,
        border: Border.all(color: AppColors.slate200, width: 0.8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Padding(
        padding: padding,
        child: SizedBox(width: double.infinity, child: child),
      ),
    );

    Widget wrapped = card;
    if (margin != null) {
      wrapped = Padding(padding: margin!, child: wrapped);
    }
    if (onTap != null) {
      wrapped = Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(borderRadius),
          splashColor: AppColors.primarySurface,
          highlightColor: AppColors.surfaceMuted(0.6),
          child: wrapped,
        ),
      );
    }
    return wrapped;
  }
}

/// Soft page background gradient used behind scroll views.
class WpPageBackground extends StatelessWidget {
  const WpPageBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.gradientStart,
            AppColors.gradientMid,
            AppColors.gradientEnd,
          ],
        ),
      ),
      child: child,
    );
  }
}

/// Section label with teal accent bar (web-style).
class WpSectionLabel extends StatelessWidget {
  const WpSectionLabel(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 3,
          height: 16,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(2),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.primary,
                AppColors.primary.withValues(alpha: 0.4),
              ],
            ),
          ),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.1,
            color: AppColors.slate600,
          ),
        ),
      ],
    );
  }
}

/// Colored icon badge for module tiles / list rows.
class WpAccentIconBadge extends StatelessWidget {
  const WpAccentIconBadge({
    super.key,
    required this.icon,
    required this.accent,
    this.size = 48,
  });

  final IconData icon;
  final Color accent;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: accent.withValues(alpha: 0.15),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Icon(icon, color: accent, size: size * 0.5),
    );
  }
}

/// Work-hub style accent palette for list rows and status chips.
abstract class WpAccents {
  WpAccents._();

  static const sky = Color(0xFF7DD3FC);
  static const mint = Color(0xFF6EE7B7);
  static const violet = Color(0xFFC4B5FD);
  static const amber = Color(0xFFFBBF24);
  static const coral = Color(0xFFFB923C);

  static ({Color color, IconData icon}) timesheetSegment(String? type) {
    switch (type) {
      case 'travelling':
        return (color: sky, icon: Icons.directions_car_rounded);
      case 'on_site':
        return (color: mint, icon: Icons.location_on_rounded);
      default:
        return (color: AppColors.primary, icon: Icons.schedule_rounded);
    }
  }
}

/// Compact colored label pill (segment type, status, etc.).
class WpStatusPill extends StatelessWidget {
  const WpStatusPill({
    super.key,
    required this.label,
    required this.accent,
  });

  final String label;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: accent,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}
