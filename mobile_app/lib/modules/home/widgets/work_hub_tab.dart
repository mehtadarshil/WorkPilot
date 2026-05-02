import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/values/app_colors.dart';
import '../controllers/home_controller.dart';

class _HubTile {
  const _HubTile({
    required this.label,
    required this.icon,
    required this.module,
  });

  final String label;
  final IconData icon;
  final String module;
}

class WorkHubTab extends StatelessWidget {
  const WorkHubTab({super.key, required this.controller});

  final HomeController controller;

  void _open(String module) {
    Get.toNamed(AppRoutes.crmList, arguments: module);
  }

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
      if (p('customers')) {
        tiles.add(const _HubTile(label: 'Customers', icon: Icons.people_outline_rounded, module: 'customers'));
      }
      if (p('quotations')) {
        tiles.add(
          const _HubTile(label: 'Quotations', icon: Icons.request_quote_outlined, module: 'quotations'),
        );
      }
      if (p('invoices')) {
        tiles.add(const _HubTile(label: 'Invoices', icon: Icons.receipt_long_outlined, module: 'invoices'));
      }
      if (p('parts_catalog')) {
        tiles.add(
          const _HubTile(label: 'Part catalog', icon: Icons.inventory_2_outlined, module: 'parts_catalog'),
        );
      }
      if (p('certifications')) {
        tiles.add(
          const _HubTile(label: 'Certifications', icon: Icons.verified_outlined, module: 'certifications'),
        );
      }
      if (p('jobs') && roleUp != 'OFFICER') {
        tiles.add(const _HubTile(label: 'Jobs', icon: Icons.work_outline_rounded, module: 'jobs'));
      }

      return CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: Text(
                'Work',
                style: GoogleFonts.inter(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                'Read-only lists from your company account. Editing stays on the web dashboard.',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.35,
                  color: AppColors.whiteOverlay(0.72),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.05,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, i) {
                  final t = tiles[i];
                  return Material(
                    color: AppColors.whiteOverlay(0.1),
                    borderRadius: BorderRadius.circular(20),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: () => _open(t.module),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(t.icon, color: AppColors.primary, size: 28),
                            const Spacer(),
                            Text(
                              t.label,
                              style: GoogleFonts.inter(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
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
