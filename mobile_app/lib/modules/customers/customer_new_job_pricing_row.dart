import 'package:flutter/material.dart';

/// One editable pricing line for [CustomerNewJobView].
class CustomerNewJobPricingRow {
  CustomerNewJobPricingRow({
    required this.key,
    required String itemName,
    required double timeIncluded,
    required double unitPrice,
    required double vatRate,
    required int quantity,
  })  : itemNameC = TextEditingController(text: itemName),
        timeC = TextEditingController(text: '$timeIncluded'),
        unitC = TextEditingController(text: '$unitPrice'),
        vatC = TextEditingController(text: '$vatRate'),
        qtyC = TextEditingController(text: '$quantity');

  void dispose() {
    itemNameC.dispose();
    timeC.dispose();
    unitC.dispose();
    vatC.dispose();
    qtyC.dispose();
  }

  final String key;
  final TextEditingController itemNameC;
  final TextEditingController timeC;
  final TextEditingController unitC;
  final TextEditingController vatC;
  final TextEditingController qtyC;

  String get itemName => itemNameC.text;

  double get timeIncluded => double.tryParse(timeC.text) ?? 0;
  double get unitPrice => double.tryParse(unitC.text) ?? 0;
  double get vatRate => double.tryParse(vatC.text) ?? 0;
  int get quantity => int.tryParse(qtyC.text) ?? 1;

  double get lineTotal => unitPrice * quantity;
}
