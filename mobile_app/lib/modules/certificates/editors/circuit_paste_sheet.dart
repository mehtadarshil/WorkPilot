import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/values/app_colors.dart';
import 'circuit_helpers.dart';

Future<void> showCircuitPasteSheet({
  required BuildContext context,
  required void Function(String text, int startRow, int startColIndex) onApply,
}) async {
  final textController = TextEditingController();
  var startRow = 0;
  var startColIndex = 0;
  final fillable = fillableCircuitColumns();

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
                  'Paste from Excel',
                  style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                Text(
                  'Paste tab-separated values. Spare/Unknown rows only accept description.',
                  style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: TextEditingController(text: startRow.toString()),
                        keyboardType: TextInputType.number,
                        style: GoogleFonts.inter(color: AppColors.slate900),
                        decoration: InputDecoration(labelText: 'Start row (0-based)'),
                        onChanged: (v) => setModalState(() => startRow = int.tryParse(v) ?? 0),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<int>(
                        value: startColIndex,
                        dropdownColor: AppColors.slate50,
                        style: GoogleFonts.inter(color: AppColors.slate900),
                        decoration: InputDecoration(labelText: 'Start column'),
                        items: fillable.asMap().entries
                            .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value.label)))
                            .toList(),
                        onChanged: (v) {
                          if (v != null) setModalState(() => startColIndex = v);
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: textController,
                  maxLines: 6,
                  style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 12),
                  decoration: InputDecoration(
                    labelText: 'Clipboard data',
                    border: OutlineInputBorder(),
                  ),
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
                        onPressed: textController.text.trim().isEmpty
                            ? null
                            : () {
                                onApply(textController.text, startRow, startColIndex);
                                Navigator.pop(context);
                              },
                        child: const Text('Paste into grid'),
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

  textController.dispose();
}
