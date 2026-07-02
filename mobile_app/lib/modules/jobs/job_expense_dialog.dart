import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class JobExpenseFormData {
  const JobExpenseFormData({
    required this.category,
    required this.amount,
    required this.expenseDate,
    required this.expenseType,
    this.description,
    this.proofFiles,
  });

  final String category;
  final double amount;
  final String expenseDate;
  final String expenseType;
  final String? description;
  final List<Map<String, dynamic>>? proofFiles;
}

/// Shared add-expense dialog for job detail and diary visit screens.
Future<JobExpenseFormData?> showAddJobExpenseDialog(
  BuildContext context, {
  bool requireProof = false,
}) async {
  var expenseDate = DateTime.now();
  var expenseType = 'personal';
  XFile? proof;
  final picker = ImagePicker();
  final categoryC = TextEditingController(text: 'Parking');
  final amountC = TextEditingController();
  final descriptionC = TextEditingController();
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      return AlertDialog(
        title: const Text('Add expense'),
        content: StatefulBuilder(
          builder: (ctx, setS) {
            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    value: expenseType,
                    decoration: InputDecoration(labelText: 'Expense type'),
                    items: const [
                      DropdownMenuItem(value: 'personal', child: Text('Personal')),
                      DropdownMenuItem(value: 'company', child: Text('Company')),
                    ],
                    onChanged: (val) {
                      if (val != null) setS(() => expenseType = val);
                    },
                  ),
                  TextField(
                    controller: categoryC,
                    decoration: InputDecoration(labelText: 'Category'),
                    textCapitalization: TextCapitalization.sentences,
                  ),
                  TextField(
                    controller: amountC,
                    decoration: InputDecoration(labelText: 'Amount'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                  TextField(
                    controller: descriptionC,
                    decoration: InputDecoration(labelText: 'Notes'),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 8),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(requireProof ? 'Receipt photo' : 'Receipt photo (optional)'),
                    subtitle: Text(
                      proof?.name ??
                          (requireProof
                              ? 'Required — take or choose a photo'
                              : 'Optional — take or choose a photo'),
                    ),
                    trailing: proof == null
                        ? IconButton(
                            icon: Icon(Icons.photo_camera_outlined),
                            onPressed: () async {
                              final x = await picker.pickImage(
                                source: ImageSource.camera,
                                imageQuality: 85,
                              );
                              if (x != null) setS(() => proof = x);
                            },
                          )
                        : IconButton(
                            icon: Icon(Icons.close),
                            onPressed: () => setS(() => proof = null),
                          ),
                    onTap: () async {
                      final x = await picker.pickImage(
                        source: ImageSource.gallery,
                        imageQuality: 85,
                      );
                      if (x != null) setS(() => proof = x);
                    },
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Expense date'),
                    subtitle: Text(expenseDate.toIso8601String().split('T').first),
                    onTap: () async {
                      final d = await showDatePicker(
                        context: ctx,
                        initialDate: expenseDate,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2100),
                      );
                      if (d != null) {
                        setS(() => expenseDate = DateTime(d.year, d.month, d.day));
                      }
                    },
                  ),
                ],
              ),
            );
          },
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      );
    },
  );

  JobExpenseFormData? result;
  if (ok == true) {
    try {
      final amount = double.tryParse(amountC.text.trim().replaceAll(',', '')) ?? 0;
      if (amount <= 0) throw Exception('Enter an expense amount greater than zero.');
      if (requireProof && proof == null) {
        throw Exception('A receipt photo is required.');
      }
      List<Map<String, dynamic>>? proofFiles;
      if (proof != null) {
        final bytes = await proof!.readAsBytes();
        proofFiles = [
          {
            'filename': proof!.name.isNotEmpty ? proof!.name : 'expense-receipt.jpg',
            'content_type': 'image/jpeg',
            'content_base64': base64Encode(bytes),
          },
        ];
      }
      result = JobExpenseFormData(
        category: categoryC.text.trim().isEmpty ? 'Expense' : categoryC.text.trim(),
        amount: amount,
        description: descriptionC.text.trim().isEmpty ? null : descriptionC.text.trim(),
        expenseDate: expenseDate.toIso8601String().split('T').first,
        expenseType: expenseType,
        proofFiles: proofFiles,
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }
  categoryC.dispose();
  amountC.dispose();
  descriptionC.dispose();
  return result;
}
