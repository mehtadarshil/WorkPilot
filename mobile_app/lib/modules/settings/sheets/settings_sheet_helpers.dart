import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/utils/text_formatters.dart';
import '../../../core/values/app_colors.dart';

InputDecoration sheetInputDeco({String hint = ''}) {
  return InputDecoration(
    hintText: hint.isEmpty ? null : hint,
    hintStyle: GoogleFonts.inter(color: AppColors.slate400, fontSize: 14),
    filled: true,
    fillColor: AppColors.slate50,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: AppColors.slate300),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: AppColors.primary),
    ),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
  );
}

Widget sheetFieldLabel(String t) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 6, top: 12),
    child: Text(
      t,
      style: GoogleFonts.inter(
        color: AppColors.slate500,
        fontWeight: FontWeight.w600,
        fontSize: 12,
      ),
    ),
  );
}

Widget sheetTextField(
  TextEditingController c, {
  String hint = '',
  int maxLines = 1,
  TextInputType keyboard = TextInputType.text,
  bool enabled = true,
  bool capitalizeWords = false,
}) {
  return TextField(
    controller: c,
    maxLines: maxLines,
    keyboardType: keyboard,
    enabled: enabled,
    textCapitalization:
        capitalizeWords ? TextCapitalization.words : TextCapitalization.none,
    inputFormatters: capitalizeWords ? const [capitalizeWordsFormatter] : null,
    style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
    decoration: sheetInputDeco(hint: hint),
  );
}

Widget sheetErrorBox(String msg) {
  return Container(
    padding: const EdgeInsets.all(12),
    margin: const EdgeInsets.only(bottom: 12),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF5F5),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFFEB2B2)),
    ),
    child: Text(
      msg,
      style: GoogleFonts.inter(color: const Color(0xFFC53030), fontSize: 13),
    ),
  );
}

Widget sheetSuccessBox(String msg) {
  return Container(
    padding: const EdgeInsets.all(12),
    margin: const EdgeInsets.only(bottom: 12),
    decoration: BoxDecoration(
      color: const Color(0xFFF0FFF4),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFF9AE6B4)),
    ),
    child: Text(
      msg,
      style: GoogleFonts.inter(color: const Color(0xFF276749), fontSize: 13),
    ),
  );
}

Widget sheetSaveButton({required VoidCallback? onPressed, required bool saving, required String label}) {
  return SizedBox(
    width: double.infinity,
    child: FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      onPressed: onPressed,
      child: saving
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900),
            )
          : Text(
              label,
              style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16),
            ),
    ),
  );
}
