import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/values/app_colors.dart';
import 'circuit_columns.dart';

Future<void> showCircuitFindReplaceSheet({
  required BuildContext context,
  required void Function(String column, String find, String replace) onApply,
}) async {
  var selectedColumn = 'description';
  final findController = TextEditingController();
  final replaceController = TextEditingController();

  final textColumns = CIRCUIT_COLUMNS_SPEC.where((col) {
    return col.key != 'actions' && col.key != 'circuitNumber';
  }).toList();

  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.slate50,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) {
      return Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: StatefulBuilder(
          builder: (context, setModalState) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Find & replace',
                  style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                Text(
                  'Replace text in all circuits on this board.',
                  style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedColumn,
                  dropdownColor: AppColors.slate50,
                  style: GoogleFonts.inter(color: AppColors.slate900),
                  decoration: _sheetDecoration('Column'),
                  items: textColumns
                      .map(
                        (col) => DropdownMenuItem(
                          value: col.key,
                          child: Text(col.label),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value == null) return;
                    setModalState(() => selectedColumn = value);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: findController,
                  style: GoogleFonts.inter(color: AppColors.slate900),
                  decoration: _sheetDecoration('Find'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: replaceController,
                  style: GoogleFonts.inter(color: AppColors.slate900),
                  decoration: _sheetDecoration('Replace with'),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
                        onPressed: findController.text.trim().isEmpty
                            ? null
                            : () {
                                onApply(
                                  selectedColumn,
                                  findController.text,
                                  replaceController.text,
                                );
                                Navigator.pop(context);
                              },
                        child: const Text('Replace all'),
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      );
    },
  );

  findController.dispose();
  replaceController.dispose();
}

InputDecoration _sheetDecoration(String label) {
  return InputDecoration(
    labelText: label,
    labelStyle: GoogleFonts.inter(color: AppColors.slate500),
    filled: true,
    fillColor: Colors.white,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
  );
}
