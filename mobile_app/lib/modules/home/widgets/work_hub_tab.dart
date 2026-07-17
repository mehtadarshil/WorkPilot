import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../widgets/wp_surface.dart';

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
    this.count,
  });

  final String label;
  final String subtitle;
  final IconData icon;
  final String module;
  final Color accent;
  final int? count;
}

class WorkHubTab extends StatelessWidget {
  const WorkHubTab({super.key, required this.controller});

  final HomeController controller;

  void _open(String module) {
    if (module == 'jobs') {
      Get.toNamed(AppRoutes.crmList, arguments: 'jobs');
      return;
    }
    if (module == 'customers') {
      Get.toNamed(AppRoutes.customersList);
      return;
    }
    if (module == 'quotations') {
      Get.toNamed(AppRoutes.quotations);
      return;
    }
    if (module == 'invoices') {
      Get.toNamed(AppRoutes.invoices);
      return;
    }
    if (module == 'settings') {
      Get.toNamed(AppRoutes.settings);
      return;
    }
    if (module == 'sites') {
      Get.toNamed(AppRoutes.sitesList);
      return;
    }
    if (module == 'site_reports') {
      Get.toNamed(AppRoutes.siteReportsList);
      return;
    }
    if (module == 'holidays') {
      Get.toNamed(AppRoutes.holidays);
      return;
    }
    if (module == 'stock_tools') {
      Get.toNamed(AppRoutes.stockTools);
      return;
    }
    if (module == 'docu_center') {
      Get.toNamed(AppRoutes.docuCenter);
      return;
    }
    Get.toNamed(AppRoutes.crmList, arguments: module);
  }

  static const _tilesMeta =
      <String, ({String label, String subtitle, IconData icon, Color accent})>{
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
        'jobs': (
          label: 'Jobs',
          subtitle: 'Team job board',
          icon: Icons.work_history_rounded,
          accent: Color(0xFF6EE7B7),
        ),
        'settings': (
          label: 'Settings',
          subtitle: 'Company, users & templates',
          icon: Icons.tune_rounded,
          accent: Color(0xFFFCD34D),
        ),
        'holidays': (
          label: 'Holidays',
          subtitle: 'Time off & requests',
          icon: Icons.event_rounded,
          accent: Color(0xFF86EFAC),
        ),
        'sites': (
          label: 'Sites',
          subtitle: 'All addresses & properties',
          icon: Icons.location_on_rounded,
          accent: Color(0xFFFB923C),
        ),
        'site_reports': (
          label: 'Site Reports',
          subtitle: 'FRA & site condition reports',
          icon: Icons.description_rounded,
          accent: Color(0xFF34D399),
        ),
        'certifications': (
          label: 'Certificates',
          subtitle: 'Safety & compliance',
          icon: Icons.verified_outlined,
          accent: Color(0xFFC4B5FD),
        ),
        'quotation_visits': (
          label: 'Quotation Visits',
          subtitle: 'Quotes surveys & visits',
          icon: Icons.assignment_turned_in_rounded,
          accent: Color(0xFFFBBF24),
        ),
        'stock_tools': (
          label: 'Stock & Tools',
          subtitle: 'Inventory, tools & uniforms',
          icon: Icons.inventory_2_rounded,
          accent: Color(0xFFFCD34D),
        ),
        'docu_center': (
          label: 'Docu Center',
          subtitle: 'Guides & reference docs',
          icon: Icons.folder_open_rounded,
          accent: Color(0xFF5EEAD4),
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
      void add(String key, {int? count}) {
        final m = _tilesMeta[key];
        if (m == null) return;
        tiles.add(
          _HubTile(
            label: m.label,
            subtitle: m.subtitle,
            icon: m.icon,
            module: key,
            accent: m.accent,
            count: count,
          ),
        );
      }

      final s = h.stats;

      final hasSettings = h.mobilePermissions.entries.any(
        (e) => e.key.startsWith('settings_') && e.value,
      );

      if (p('customers')) {
        add('customers', count: s.customersTotal);
        add('sites', count: s.sitesTotal);
        add('site_reports');
      }
      if (p('certifications') && roleUp != 'OFFICER') {
        add('certifications');
      }
      if (p('quotations')) {
        add('quotations', count: s.quotationsPending);
        add('quotation_visits');
      }
      if (p('invoices')) add('invoices', count: s.invoicesUnpaid);
      if (p('jobs') && roleUp != 'OFFICER') add('jobs', count: s.jobsOpen);
      if (hasSettings && roleUp != 'OFFICER') add('settings');
      if (p('field_users') && roleUp != 'OFFICER') add('holidays');
      add('stock_tools');
      if (p('docu_center') || roleUp == 'ADMIN' || roleUp == 'SUPER_ADMIN') {
        add('docu_center');
      }

      return CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
              child: LayoutBuilder(
                builder: (context, c) {
                  return Container(
                    height: 172,
                    width: c.maxWidth,
                    padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
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
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: AppColors.slate200),
                                color: AppColors.slate100,
                              ),
                              child: Text(
                                'CRM · native',
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.6,
                                  color: AppColors.slate600,
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
                                color: AppColors.slate900,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Customers and quotations run natively in the app. Other CRM tiles still use compact lists until their full screens ship.',
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.inter(
                                fontSize: 12.5,
                                height: 1.3,
                                color: AppColors.slate500,
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
              child: const WpSectionLabel('Modules'),
            ),
          ),
          if (tiles.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 24,
                ),
                child: LayoutBuilder(
                  builder: (context, c) {
                    return Container(
                      height: 100,
                      width: c.maxWidth,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        color: Colors.white,
                        border: Border.all(
                          color: AppColors.slate200,
                          width: 0.8,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          'No CRM modules are enabled for this profile.',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            color: AppColors.slate500,
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
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 200,
                  mainAxisSpacing: 14,
                  crossAxisSpacing: 14,
                  mainAxisExtent: 148,
                ),
                delegate: SliverChildBuilderDelegate((context, i) {
                  final t = tiles[i];
                  return LayoutBuilder(
                    builder: (context, constraints) {
                      return Container(
                        height: constraints.maxHeight,
                        width: constraints.maxWidth,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          color: Colors.white,
                          border: Border.all(color: AppColors.slate200, width: 0.8),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.05),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () => _open(t.module),
                            splashColor: t.accent.withValues(alpha: 0.12),
                            highlightColor: t.accent.withValues(alpha: 0.06),
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(
                                14,
                                14,
                                12,
                                14,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      WpAccentIconBadge(icon: t.icon, accent: t.accent),
                                      const Spacer(),
                                      Icon(
                                        Icons.arrow_outward_rounded,
                                        size: 18,
                                        color: AppColors.slate400,
                                      ),
                                    ],
                                  ),
                                  const Spacer(),
                                  if (t.count != null && t.count! > 0) ...[
                                    Text(
                                      '${t.count}',
                                      style: GoogleFonts.inter(
                                        color: t.accent,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 28,
                                        height: 1.0,
                                        letterSpacing: -1,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                  ],
                                  Text(
                                    t.label,
                                    style: GoogleFonts.inter(
                                      color: AppColors.slate900,
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
                                      color: AppColors.slate500,
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
                }, childCount: tiles.length),
              ),
            ),
        ],
      );
    });
  }
}
