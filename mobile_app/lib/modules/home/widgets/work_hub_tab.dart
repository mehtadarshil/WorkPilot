import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:glass_kit/glass_kit.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/values/app_colors.dart';
import '../controllers/home_controller.dart';

class _HubTile {
  const _HubTile({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.module,
    required this.accent,
  });

  final String label;
  final String subtitle;
  final IconData icon;
  final String module;
  final Color accent;
}

class WorkHubTab extends StatelessWidget {
  const WorkHubTab({super.key, required this.controller});

  final HomeController controller;

  void _open(String module) {
    if (module == 'customers') {
      Get.toNamed(AppRoutes.customersList);
      return;
    }
    Get.toNamed(AppRoutes.crmList, arguments: module);
  }

  static const _tilesMeta = <String, ({String label, String subtitle, IconData icon, Color accent})>{
    'customers': (
      label: 'Customers',
      subtitle: 'Accounts & contacts',
      icon: Icons.people_alt_rounded,
      accent: Color(0xFF5EEAD4),
    ),
    'quotations': (
      label: 'Quotations',
      subtitle: 'Quotes & pipeline',
      icon: Icons.request_quote_rounded,
      accent: Color(0xFF7DD3FC),
    ),
    'invoices': (
      label: 'Invoices',
      subtitle: 'Billing & payments',
      icon: Icons.receipt_long_rounded,
      accent: Color(0xFFC4B5FD),
    ),
    'parts_catalog': (
      label: 'Part catalog',
      subtitle: 'Parts & kits',
      icon: Icons.inventory_2_rounded,
      accent: Color(0xFF94A3B8),
    ),
    'certifications': (
      label: 'Certifications',
      subtitle: 'Types & compliance',
      icon: Icons.verified_rounded,
      accent: Color(0xFFFCD34D),
    ),
    'jobs': (
      label: 'Jobs',
      subtitle: 'Team job board',
      icon: Icons.work_history_rounded,
      accent: Color(0xFF6EE7B7),
    ),
  };

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final h = controller.home.value;
      if (h == null) {
        return const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        );
      }
      bool p(String k) => h.mobilePermissions[k] == true;
      final roleUp = h.role.toUpperCase();
      final tiles = <_HubTile>[];
      void add(String key) {
        final m = _tilesMeta[key];
        if (m == null) return;
        tiles.add(
          _HubTile(
            label: m.label,
            subtitle: m.subtitle,
            icon: m.icon,
            module: key,
            accent: m.accent,
          ),
        );
      }

      if (p('customers')) add('customers');
      if (p('quotations')) add('quotations');
      if (p('invoices')) add('invoices');
      if (p('parts_catalog')) add('parts_catalog');
      if (p('certifications')) add('certifications');
      if (p('jobs') && roleUp != 'OFFICER') add('jobs');

      return CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
              child: LayoutBuilder(
                builder: (context, c) {
                  return GlassContainer.frostedGlass(
                    height: 172,
                    width: c.maxWidth,
                    blur: 28,
                    frostedOpacity: 0.11,
                    borderRadius: BorderRadius.circular(26),
                    borderWidth: 1,
                    borderGradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.whiteOverlay(0.55),
                        AppColors.whiteOverlay(0.07),
                      ],
                    ),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.whiteOverlay(0.12),
                        const Color(0x55101828),
                        const Color(0x880a1220),
                      ],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.blackOverlay(0.35),
                        blurRadius: 32,
                        offset: const Offset(0, 16),
                      ),
                    ],
                    padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Positioned(
                          right: -24,
                          top: -28,
                          child: IgnorePointer(
                            child: Container(
                              width: 100,
                              height: 100,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: RadialGradient(
                                  colors: [
                                    AppColors.primary.withValues(alpha: 0.22),
                                    Colors.transparent,
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: AppColors.whiteOverlay(0.2)),
                                color: AppColors.whiteOverlay(0.06),
                              ),
                              child: Text(
                                'CRM · native',
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.6,
                                  color: AppColors.whiteOverlay(0.78),
                                ),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'Work',
                              style: GoogleFonts.inter(
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                                height: 1.05,
                                letterSpacing: -0.8,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Customers run fully in the app. Other modules use the same lists as the web until their native screens ship.',
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.inter(
                                fontSize: 12.5,
                                height: 1.3,
                                color: AppColors.whiteOverlay(0.68),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 10),
              child: Row(
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
                    'Modules',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                      color: AppColors.whiteOverlay(0.5),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (tiles.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
                child: LayoutBuilder(
                  builder: (context, c) {
                    return GlassContainer.frostedGlass(
                      height: 100,
                      width: c.maxWidth,
                      blur: 22,
                      frostedOpacity: 0.08,
                      borderRadius: BorderRadius.circular(22),
                      borderWidth: 1,
                      borderGradient: LinearGradient(
                        colors: [
                          AppColors.whiteOverlay(0.25),
                          AppColors.whiteOverlay(0.05),
                        ],
                      ),
                      gradient: LinearGradient(
                        colors: [
                          AppColors.whiteOverlay(0.06),
                          AppColors.blackOverlay(0.15),
                        ],
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Center(
                        child: Text(
                          'No CRM modules are enabled for this profile.',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            color: AppColors.whiteOverlay(0.65),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(14, 4, 14, 28),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 14,
                  crossAxisSpacing: 14,
                  childAspectRatio: 0.92,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, i) {
                    final t = tiles[i];
                    return LayoutBuilder(
                      builder: (context, constraints) {
                        return GlassContainer.frostedGlass(
                          height: constraints.maxHeight,
                          width: constraints.maxWidth,
                          blur: 24,
                          frostedOpacity: 0.1,
                          borderRadius: BorderRadius.circular(22),
                          borderWidth: 1,
                          borderGradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Color.lerp(Colors.white, t.accent, 0.35)!.withValues(alpha: 0.45),
                              AppColors.whiteOverlay(0.06),
                            ],
                          ),
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              AppColors.whiteOverlay(0.14),
                              AppColors.blackOverlay(0.28),
                              Color.lerp(const Color(0xFF0f172a), t.accent, 0.12)!,
                            ],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.blackOverlay(0.4),
                              blurRadius: 20,
                              offset: const Offset(0, 10),
                            ),
                            BoxShadow(
                              color: t.accent.withValues(alpha: 0.08),
                              blurRadius: 24,
                              offset: const Offset(0, 8),
                            ),
                          ],
                          padding: EdgeInsets.zero,
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(22),
                              onTap: () => _open(t.module),
                              splashColor: t.accent.withValues(alpha: 0.12),
                              highlightColor: t.accent.withValues(alpha: 0.06),
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        _GlassIconOrb(icon: t.icon, accent: t.accent),
                                        const Spacer(),
                                        Icon(
                                          Icons.arrow_outward_rounded,
                                          size: 18,
                                          color: AppColors.whiteOverlay(0.35),
                                        ),
                                      ],
                                    ),
                                    const Spacer(),
                                    Text(
                                      t.label,
                                      style: GoogleFonts.inter(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 16,
                                        letterSpacing: -0.2,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      t.subtitle,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: GoogleFonts.inter(
                                        color: AppColors.whiteOverlay(0.52),
                                        fontSize: 12,
                                        height: 1.25,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    );
                  },
                  childCount: tiles.length,
                ),
              ),
            ),
        ],
      );
    });
  }
}

class _GlassIconOrb extends StatelessWidget {
  const _GlassIconOrb({required this.icon, required this.accent});

  final IconData icon;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.whiteOverlay(0.22)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accent.withValues(alpha: 0.35),
            AppColors.whiteOverlay(0.08),
            AppColors.blackOverlay(0.2),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: 0.25),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Icon(icon, color: Colors.white.withValues(alpha: 0.95), size: 24),
    );
  }
}
