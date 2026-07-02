import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../home/controllers/home_controller.dart';
import 'sheets/abort_reasons_sheet.dart';
import 'sheets/business_units_sheet.dart';
import 'sheets/company_settings_sheet.dart';
import 'sheets/customer_types_sheet.dart';
import 'sheets/email_settings_sheet.dart';
import 'sheets/import_sheet.dart';
import 'sheets/invoice_settings_sheet.dart';
import 'sheets/job_descriptions_sheet.dart';
import 'sheets/job_report_template_sheet.dart';
import 'sheets/price_books_sheet.dart';
import 'sheets/quotation_settings_sheet.dart';
import 'sheets/service_reminders_sheet.dart';
import 'sheets/site_report_templates_sheet.dart';
import 'sheets/user_groups_sheet.dart';
import 'sheets/users_sheet.dart';

class _SettingsTabMeta {
  const _SettingsTabMeta({
    required this.title,
    required this.subtitle,
    required this.permissionKey,
    required this.icon,
    required this.accent,
  });

  final String title;
  final String subtitle;
  final String permissionKey;
  final IconData icon;
  final Color accent;
}

class SettingsView extends StatelessWidget {
  const SettingsView({super.key});

  static const _tabs = <_SettingsTabMeta>[
    _SettingsTabMeta(
      title: 'Company',
      subtitle: 'Branding, address and document defaults',
      permissionKey: 'settings_company',
      icon: Icons.business_rounded,
      accent: Color(0xFF5EEAD4),
    ),
    _SettingsTabMeta(
      title: 'Invoice',
      subtitle: 'Invoice defaults, terms and numbering',
      permissionKey: 'settings_invoice',
      icon: Icons.receipt_long_rounded,
      accent: Color(0xFFC4B5FD),
    ),
    _SettingsTabMeta(
      title: 'Quotation',
      subtitle: 'Quote defaults, validity and terms',
      permissionKey: 'settings_quotation',
      icon: Icons.request_quote_rounded,
      accent: Color(0xFF7DD3FC),
    ),
    _SettingsTabMeta(
      title: 'Email',
      subtitle: 'Mailbox connection and templates',
      permissionKey: 'settings_email',
      icon: Icons.alternate_email_rounded,
      accent: Color(0xFFFDA4AF),
    ),
    _SettingsTabMeta(
      title: 'Service reminders',
      subtitle: 'Automated renewal reminder rules',
      permissionKey: 'settings_service_reminders',
      icon: Icons.notifications_active_rounded,
      accent: Color(0xFFFCD34D),
    ),
    _SettingsTabMeta(
      title: 'Customer types',
      subtitle: 'Customer type master list',
      permissionKey: 'settings_customer_types',
      icon: Icons.groups_2_rounded,
      accent: Color(0xFF86EFAC),
    ),
    _SettingsTabMeta(
      title: 'Price books',
      subtitle: 'Rates and configured price books',
      permissionKey: 'settings_price_books',
      icon: Icons.menu_book_rounded,
      accent: Color(0xFFA5B4FC),
    ),
    _SettingsTabMeta(
      title: 'Job descriptions',
      subtitle: 'Service lists and job description presets',
      permissionKey: 'settings_job_descriptions',
      icon: Icons.fact_check_rounded,
      accent: Color(0xFF67E8F9),
    ),
    _SettingsTabMeta(
      title: 'Job report template',
      subtitle: 'Default final job report format',
      permissionKey: 'settings_job_report_template',
      icon: Icons.description_rounded,
      accent: Color(0xFFF0ABFC),
    ),
    _SettingsTabMeta(
      title: 'Site report templates',
      subtitle: 'Site and FRA report templates',
      permissionKey: 'settings_site_report_templates',
      icon: Icons.assignment_rounded,
      accent: Color(0xFF93C5FD),
    ),
    _SettingsTabMeta(
      title: 'Visit abort reasons',
      subtitle: 'Diary visit cancellation reasons',
      permissionKey: 'settings_diary_abort_reasons',
      icon: Icons.event_busy_rounded,
      accent: Color(0xFFFBBF24),
    ),
    _SettingsTabMeta(
      title: 'Business units',
      subtitle: 'Business unit master list',
      permissionKey: 'settings_business_units',
      icon: Icons.account_tree_rounded,
      accent: Color(0xFF6EE7B7),
    ),
    _SettingsTabMeta(
      title: 'User groups',
      subtitle: 'User group master list',
      permissionKey: 'settings_user_groups',
      icon: Icons.group_work_rounded,
      accent: Color(0xFFDDD6FE),
    ),
    _SettingsTabMeta(
      title: 'Users',
      subtitle: 'Team users and field profiles',
      permissionKey: 'settings_users',
      icon: Icons.admin_panel_settings_rounded,
      accent: Color(0xFFBFDBFE),
    ),
    _SettingsTabMeta(
      title: 'Import',
      subtitle: 'CSV and setup import tools',
      permissionKey: 'settings_import',
      icon: Icons.upload_file_rounded,
      accent: Color(0xFFFCA5A5),
    ),
  ];

  Map<String, bool> get _permissions {
    if (!Get.isRegistered<HomeController>()) return const {};
    return Get.find<HomeController>().home.value?.mobilePermissions ?? const {};
  }

  bool _canOpen(_SettingsTabMeta tab, Map<String, bool> permissions) {
    if (permissions[tab.permissionKey] == true) return true;
    if ((tab.permissionKey == 'settings_invoice' ||
            tab.permissionKey == 'settings_quotation' ||
            tab.permissionKey == 'settings_email') &&
        permissions['settings_company'] == true) {
      return true;
    }

    const masterDataTabs = {
      'settings_customer_types',
      'settings_price_books',
      'settings_job_descriptions',
      'settings_job_report_template',
      'settings_site_report_templates',
      'settings_diary_abort_reasons',
      'settings_business_units',
      'settings_user_groups',
      'settings_import',
    };
    return permissions['settings_master_data'] == true &&
        masterDataTabs.contains(tab.permissionKey);
  }

  void _openTab(BuildContext context, _SettingsTabMeta tab, bool allowed) {
    if (!allowed) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Permission required: ${tab.title} settings')),
      );
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => _SettingsTabSheet(tab: tab),
    );
  }

  @override
  Widget build(BuildContext context) {
    final permissions = _permissions;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(
          title: Text(
            'Settings',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
        ),
        body: Container(
          decoration: BoxDecoration(
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
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 28),
            itemCount: _tabs.length + 1,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              if (index == 0) return const _SettingsHero();
              final tab = _tabs[index - 1];
              final allowed = _canOpen(tab, permissions);
              return _SettingsTile(
                tab: tab,
                allowed: allowed,
                onTap: () => _openTab(context, tab, allowed),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _SettingsHero extends StatelessWidget {
  const _SettingsHero();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.slate200),
        color: Colors.white,
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.primary.withValues(alpha: 0.22),
            ),
            child: Icon(Icons.tune_rounded, color: AppColors.slate900),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Settings module',
                  style: GoogleFonts.inter(
                    color: AppColors.slate900,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Each tab is controlled by its own permission.',
                  style: GoogleFonts.inter(
                    color: AppColors.slate500,
                    fontSize: 12.5,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.tab,
    required this.allowed,
    required this.onTap,
  });

  final _SettingsTabMeta tab;
  final bool allowed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: AppColors.slate200,
            ),
            color: allowed ? Colors.white : AppColors.slate100,
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: tab.accent.withValues(alpha: allowed ? 0.28 : 0.12),
                ),
                child: Icon(
                  tab.icon,
                  color: allowed ? tab.accent : AppColors.slate400,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tab.title,
                      style: GoogleFonts.inter(
                        color: allowed
                            ? AppColors.slate900
                            : AppColors.slate400,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      tab.subtitle,
                      style: GoogleFonts.inter(
                        color: AppColors.whiteOverlay(allowed ? 0.58 : 0.32),
                        fontSize: 12,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                allowed
                    ? Icons.chevron_right_rounded
                    : Icons.lock_outline_rounded,
                color: AppColors.whiteOverlay(allowed ? 0.55 : 0.35),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingsTabSheet extends StatelessWidget {
  const _SettingsTabSheet({required this.tab});

  final _SettingsTabMeta tab;

  double get _initialSize {
    switch (tab.permissionKey) {
      case 'settings_company':
      case 'settings_invoice':
      case 'settings_quotation':
      case 'settings_email':
      case 'settings_job_descriptions':
      case 'settings_users':
        return 0.88;
      default:
        return 0.75;
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: _initialSize,
      minChildSize: 0.35,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.slate300,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              CircleAvatar(
                radius: 28,
                backgroundColor: tab.accent.withValues(alpha: 0.2),
                child: Icon(tab.icon, color: AppColors.slate900),
              ),
              const SizedBox(height: 14),
              Text(
                tab.title,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  color: AppColors.slate900,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                tab.subtitle,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  color: AppColors.slate500,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 22),
              Expanded(
                child: _tabContent(),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _tabContent() {
    switch (tab.permissionKey) {
      case 'settings_company':
        return const CompanySettingsSheet();
      case 'settings_invoice':
        return const InvoiceSettingsSheet();
      case 'settings_quotation':
        return const QuotationSettingsSheet();
      case 'settings_email':
        return const EmailSettingsSheet();
      case 'settings_service_reminders':
        return const ServiceRemindersSheet();
      case 'settings_customer_types':
        return const CustomerTypesSheet();
      case 'settings_price_books':
        return const PriceBooksSheet();
      case 'settings_job_descriptions':
        return const JobDescriptionsSheet();
      case 'settings_job_report_template':
        return const JobReportTemplateSheet();
      case 'settings_site_report_templates':
        return const SiteReportTemplatesSheet();
      case 'settings_diary_abort_reasons':
        return const AbortReasonsSheet();
      case 'settings_business_units':
        return const BusinessUnitsSheet();
      case 'settings_user_groups':
        return const UserGroupsSheet();
      case 'settings_users':
        return const UsersSheet();
      case 'settings_import':
        return const ImportSheet();
      default:
        return Center(
          child: Text(
            'Not implemented yet.',
            style: GoogleFonts.inter(color: AppColors.slate500),
          ),
        );
    }
  }
}
