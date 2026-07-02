import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';

/// In-app legal / policy text (no external browser).
class LegalDocumentView extends StatelessWidget {
  const LegalDocumentView({super.key, required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: AppColors.slate900,
        title: Text(
          title,
          style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.slate900),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: AppColors.slate700),
          onPressed: Get.back,
        ),
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.gradientStart, AppColors.gradientMid, AppColors.gradientEnd],
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            child: SelectableText(
              body,
              style: GoogleFonts.inter(fontSize: 14, height: 1.5, color: AppColors.slate700),
            ),
          ),
        ),
      ),
    );
  }
}
