import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import 'customer_detail_controller.dart';
import 'customer_tab_widgets.dart';
import 'customer_tabs/helpers.dart';

String _workAddressTabLabel(Map<String, dynamic>? cust) {
  if (cust == null) return 'Work address';
  final s = '${cust['customer_type_work_address_name'] ?? 'Work address'}'.trim();
  return s.isEmpty ? 'Work address' : s;
}

/// Internal tab keys (aligned with web tab routing).
List<String> _detailTabKeys(CustomerDetailController c) {
  final cust = c.customer.value;
  final wid = c.scopedWorkAddressId.value;
  final allowBranches = cust == null || cust['customer_type_allow_branches'] != false;
  final keys = <String>['all_works', 'communications', 'contacts'];
  if (wid != null) {
    keys.add('invoices');
  }
  if (allowBranches) {
    keys.add('branches');
  }
  if (wid == null) {
    keys.add('work_address');
  }
  keys.addAll(['assets', 'files']);
  return keys;
}

String _tabChipLabel(String key, Map<String, dynamic>? cust) {
  switch (key) {
    case 'all_works':
      return 'All works';
    case 'communications':
      return 'Communications';
    case 'contacts':
      return 'Contacts';
    case 'invoices':
      return 'Invoices';
    case 'branches':
      return 'Branches';
    case 'work_address':
      return _workAddressTabLabel(cust);
    case 'assets':
      return 'Assets';
    case 'files':
      return 'Files';
    default:
      return key;
  }
}

class CustomerDetailView extends GetView<CustomerDetailController> {
  const CustomerDetailView({super.key});

  @override
  Widget build(BuildContext context) {
    return const _CustomerDetailShell();
  }
}

class _CustomerDetailShell extends StatefulWidget {
  const _CustomerDetailShell();

  @override
  State<_CustomerDetailShell> createState() => _CustomerDetailShellState();
}

class _CustomerDetailShellState extends State<_CustomerDetailShell> {
  CustomerDetailController get _c => Get.find<CustomerDetailController>();

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final keys = _detailTabKeys(_c);
      _c.clampTabIndex(keys.length);
      final cust = _c.customer.value;
      if (cust != null && keys.isNotEmpty) {
        _c.applyInitialTabIfNeeded(keys);
      }
      final idx = _c.selectedTabIndex.value.clamp(0, keys.isEmpty ? 0 : keys.length - 1);
      final scoped = _c.scopedWorkAddressId.value;
      final preview = _c.workAddressPreview.value;

      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light.copyWith(
          statusBarColor: Colors.transparent,
          systemNavigationBarColor: AppColors.gradientStart,
          systemNavigationBarIconBrightness: Brightness.light,
        ),
        child: Scaffold(
          backgroundColor: AppColors.gradientStart,
          appBar: AppBar(
            title: Obx(() {
              final n = _c.customer.value?['full_name'];
              return Text(
                n is String && n.isNotEmpty ? n : 'Customer',
                style: GoogleFonts.inter(fontWeight: FontWeight.w700),
                overflow: TextOverflow.ellipsis,
              );
            }),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_ios_new_rounded),
              onPressed: Get.back,
            ),
            actions: [
              IconButton(
                tooltip: 'Edit',
                icon: const Icon(Icons.edit_outlined),
                onPressed: () async {
                  final id = _c.customerId;
                  final r = await Get.toNamed(AppRoutes.customerForm, arguments: id);
                  if (r == true) await _c.refreshCustomer();
                },
              ),
            ],
            bottom: _c.loading.value && cust == null
                ? null
                : PreferredSize(
                    preferredSize: const Size.fromHeight(46),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                        child: Row(
                          children: List.generate(keys.length, (i) {
                            final sel = i == idx;
                            return Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: ChoiceChip(
                                label: Text(
                                  _tabChipLabel(keys[i], cust),
                                  style: GoogleFonts.inter(
                                    fontSize: 11,
                                    fontWeight: sel ? FontWeight.w800 : FontWeight.w600,
                                    color: sel ? AppColors.gradientStart : AppColors.whiteOverlay(0.75),
                                  ),
                                ),
                                selected: sel,
                                onSelected: (_) => _c.selectedTabIndex.value = i,
                                selectedColor: AppColors.primary,
                                backgroundColor: AppColors.whiteOverlay(0.08),
                                side: BorderSide(color: sel ? AppColors.primary : AppColors.whiteOverlay(0.15)),
                                visualDensity: VisualDensity.compact,
                                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                            );
                          }),
                        ),
                      ),
                    ),
                  ),
          ),
          body: _buildMainBody(keys, idx, scoped, preview),
        ),
      );
    });
  }

  Widget _buildMainBody(List<String> keys, int idx, int? scoped, Map<String, dynamic>? preview) {
    if (_c.loading.value && _c.customer.value == null) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_c.error.value.isNotEmpty && _c.customer.value == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_c.error.value, textAlign: TextAlign.center, style: GoogleFonts.inter(color: AppColors.slate400)),
              const SizedBox(height: 16),
              FilledButton(onPressed: _c.refreshCustomer, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    if (keys.isEmpty) {
      return const Center(child: Text('No tabs'));
    }
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.gradientStart,
            AppColors.gradientMid,
            AppColors.gradientEnd,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (scoped != null)
            Material(
              color: const Color(0x33F59E0B),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
                child: Row(
                  children: [
                    Icon(Icons.location_on_outlined, color: AppColors.whiteOverlay(0.9), size: 22),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Work site',
                            style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: const Color(0xFFFBBF24)),
                          ),
                          Text(
                            preview != null && ctStr(preview, 'name').isNotEmpty ? ctStr(preview, 'name') : 'Work address #$scoped',
                            style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                          if (preview != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              [ctStr(preview, 'address_line_1'), ctStr(preview, 'town'), ctStr(preview, 'postcode')].where((e) => e.isNotEmpty).join(', '),
                              style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.7)),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => _c.exitWorkAddressScope(),
                      child: Text('All sites', style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.primary)),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(child: _tabBody(keys[idx])),
        ],
      ),
    );
  }

  Widget _tabBody(String key) {
    final id = _c.customerId;
    final wid = _c.scopedWorkAddressId.value;
    switch (key) {
      case 'all_works':
        return CustomerAllWorksTab(controller: _c);
      case 'communications':
        return CustomerCommsTab(customerId: id, workAddressId: wid);
      case 'contacts':
        return CustomerContactsTab(customerId: id, workAddressId: wid);
      case 'invoices':
        return CustomerInvoicesTab(customerId: id, workAddressId: wid);
      case 'branches':
        return CustomerBranchesTab(customerId: id);
      case 'work_address':
        return CustomerSitesTab(customerId: id);
      case 'assets':
        return CustomerAssetsTab(customerId: id, workAddressId: wid);
      case 'files':
        return CustomerFilesTab(customerId: id, workAddressId: wid);
      default:
        return const SizedBox.shrink();
    }
  }
}
