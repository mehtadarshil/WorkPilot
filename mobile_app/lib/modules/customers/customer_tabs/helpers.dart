import 'package:flutter/material.dart';

import '../../../core/values/app_colors.dart';

String ctStr(Map<String, dynamic>? m, String k) {
  if (m == null) return '';
  final v = m[k];
  if (v == null) return '';
  return v.toString();
}

Widget ctCard({required Widget child}) {
  return Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: AppColors.whiteOverlay(0.08),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppColors.whiteOverlay(0.1)),
    ),
    child: child,
  );
}
