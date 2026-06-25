import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:signature/signature.dart';

import '../../core/values/app_colors.dart';
import '../../data/repositories/mobile_profile_repository.dart';

class SignatureDrawingView extends StatefulWidget {
  const SignatureDrawingView({super.key});

  @override
  State<SignatureDrawingView> createState() => _SignatureDrawingViewState();
}

class _SignatureDrawingViewState extends State<SignatureDrawingView> {
  late final SignatureController _controller;
  bool _saving = false;
  String _errorMsg = '';

  @override
  void initState() {
    super.initState();
    _controller = SignatureController(
      penStrokeWidth: 3,
      penColor: Colors.black,
      exportBackgroundColor: Colors.white,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _saveSignature() async {
    if (_controller.isEmpty) {
      setState(() {
        _errorMsg = 'Please draw your signature first.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _errorMsg = '';
    });

    try {
      final bytes = await _controller.toPngBytes();
      if (bytes == null) {
        throw Exception('Failed to generate image bytes.');
      }

      final base64String = base64Encode(bytes);
      final dataUrl = 'data:image/png;base64,$base64String';

      final args = Get.arguments as Map<String, dynamic>?;
      final targetOfficerId = args?['officerId'] as int?;

      if (targetOfficerId != null) {
        await Get.find<MobileProfileRepository>().updateOfficerSignature(targetOfficerId, dataUrl);
      } else {
        await Get.find<MobileProfileRepository>().updateProfile({
          'signature_data_url': dataUrl,
        });
      }

      Get.back(result: true);
    } catch (e) {
      setState(() {
        _errorMsg = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      setState(() {
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final args = Get.arguments as Map<String, dynamic>?;
    final targetOfficerName = args?['officerName'] as String?;
    final titleText = targetOfficerName != null ? 'Signature: $targetOfficerName' : 'Draw Signature';
    final helpText = targetOfficerName != null
        ? 'Draw signature inside the box below for $targetOfficerName.'
        : 'Draw your signature inside the box below.';

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text(titleText, style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: () => Get.back(),
          ),
        ),
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.gradientStart, AppColors.gradientMid, AppColors.gradientEnd],
            ),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    helpText,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      color: Colors.white.withOpacity(0.8),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.1),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Signature(
                          controller: _controller,
                          backgroundColor: Colors.white,
                        ),
                      ),
                    ),
                  ),
                  if (_errorMsg.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      _errorMsg,
                      style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _saving ? null : () => _controller.clear(),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: const BorderSide(color: Colors.white24),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text('Clear'),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _saving ? null : _saveSignature,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: _saving
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text('Save Signature'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
