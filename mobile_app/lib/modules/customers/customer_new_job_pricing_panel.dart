import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'customer_new_job_pricing_row.dart';
import 'customer_tabs/shell.dart';

class CustomerNewJobPricingPanel extends StatelessWidget {
  const CustomerNewJobPricingPanel({
    super.key,
    required this.rows,
    required this.saving,
    required this.grandTotal,
    required this.onAddRow,
    required this.onRemoveRow,
    required this.onAnyFieldChanged,
  });

  final List<CustomerNewJobPricingRow> rows;
  final bool saving;
  final double grandTotal;
  final VoidCallback onAddRow;
  final void Function(String rowKey) onRemoveRow;
  final VoidCallback onAnyFieldChanged;

  @override
  Widget build(BuildContext context) {
    return customerPanel(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: saving ? null : onAddRow,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Add row'),
            ),
          ),
          const SizedBox(height: 12),
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(
                'No pricing items. Select a description to auto-fill or add manually.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.45)),
              ),
            )
          else
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(AppColors.whiteOverlay(0.06)),
                columns: const [
                  DataColumn(label: Text('#')),
                  DataColumn(label: Text('Pricing item')),
                  DataColumn(label: Text('Time incl.')),
                  DataColumn(label: Text('Unit price')),
                  DataColumn(label: Text('VAT %')),
                  DataColumn(label: Text('Qty')),
                  DataColumn(label: Text('Total'), numeric: true),
                  DataColumn(label: Text('')),
                ],
                rows: [
                  ...rows.asMap().entries.map((e) {
                    final idx = e.key;
                    final r = e.value;
                    return DataRow(
                      cells: [
                        DataCell(Text('${idx + 1}', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.55)))),
                        DataCell(
                          SizedBox(
                            width: 140,
                            child: TextField(
                              controller: r.itemNameC,
                              enabled: !saving,
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
                              onChanged: (_) => onAnyFieldChanged(),
                            ),
                          ),
                        ),
                        DataCell(
                          SizedBox(
                            width: 72,
                            child: TextField(
                              controller: r.timeC,
                              enabled: !saving,
                              keyboardType: TextInputType.number,
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
                              onChanged: (_) => onAnyFieldChanged(),
                            ),
                          ),
                        ),
                        DataCell(
                          SizedBox(
                            width: 80,
                            child: TextField(
                              controller: r.unitC,
                              enabled: !saving,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
                              onChanged: (_) => onAnyFieldChanged(),
                            ),
                          ),
                        ),
                        DataCell(
                          SizedBox(
                            width: 64,
                            child: TextField(
                              controller: r.vatC,
                              enabled: !saving,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
                              onChanged: (_) => onAnyFieldChanged(),
                            ),
                          ),
                        ),
                        DataCell(
                          SizedBox(
                            width: 48,
                            child: TextField(
                              controller: r.qtyC,
                              enabled: !saving,
                              keyboardType: TextInputType.number,
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
                              onChanged: (_) => onAnyFieldChanged(),
                            ),
                          ),
                        ),
                        DataCell(
                          Text(
                            r.lineTotal.toStringAsFixed(2),
                            style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700),
                          ),
                        ),
                        DataCell(
                          IconButton(
                            icon: const Icon(Icons.delete_outline_rounded, color: Color(0xFFFCA5A5)),
                            onPressed: saving ? null : () => onRemoveRow(r.key),
                          ),
                        ),
                      ],
                    );
                  }),
                  DataRow(
                    cells: [
                      const DataCell(SizedBox()),
                      const DataCell(SizedBox()),
                      const DataCell(SizedBox()),
                      const DataCell(SizedBox()),
                      const DataCell(SizedBox()),
                      DataCell(
                        Text(
                          'Grand total',
                          style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.whiteOverlay(0.7)),
                        ),
                      ),
                      DataCell(
                        Text(
                          grandTotal.toStringAsFixed(2),
                          style: GoogleFonts.inter(fontWeight: FontWeight.w800, color: Colors.white),
                        ),
                      ),
                      const DataCell(SizedBox()),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
