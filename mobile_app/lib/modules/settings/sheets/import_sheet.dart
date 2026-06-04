import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';

class ImportSheet extends StatelessWidget {
  const ImportSheet({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        Text(
          'Data Import',
          style: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.slate900),
        ),
        const SizedBox(height: 8),
        Text(
          'CSV import tools are available in the web CRM for the best experience. Open WorkPilot in your browser to import:',
          style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
        ),
        const SizedBox(height: 16),
        _tile(Icons.people_outline, 'Customers & Sites', 'Import customer_export.csv and site_export.csv'),
        _tile(Icons.receipt_long_outlined, 'Invoices', 'Import invoice_export.csv with line items'),
        _tile(Icons.request_quote_outlined, 'Quotations', 'Import quote_export.csv with line items'),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF3E0),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFFFCC80)),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline, color: Color(0xFFE65100)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'For bulk data migration, use the web dashboard Settings → Import CSV section. Mobile import is not supported yet.',
                  style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFFE65100)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tile(IconData icon, String title, String subtitle) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.slate50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.slate300),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.slate900)),
                Text(subtitle, style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate500)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
