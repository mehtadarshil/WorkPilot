import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';

class JobTabCosts extends StatefulWidget {
  const JobTabCosts({super.key});

  @override
  State<JobTabCosts> createState() => _JobTabCostsState();
}

class _JobTabCostsState extends State<JobTabCosts> {
  final _repo = Get.find<JobsRepository>();
  final _picker = ImagePicker();
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  final _desc = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  XFile? _proof;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _desc.dispose();
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final jobId = Get.find<JobDetailController>().jobId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _data = await _repo.getJobCosts(jobId);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (e) {
      _error = '$e';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  double _num(dynamic v) {
    if (v is num) return v.toDouble();
    return double.tryParse('$v') ?? 0;
  }

  String _money(dynamic v) => '£${_num(v).toStringAsFixed(2)}';

  Future<void> _pickProof() async {
    final x = await _picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    if (x == null) return;
    setState(() => _proof = x);
  }

  Future<void> _submitCost() async {
    final jobId = Get.find<JobDetailController>().jobId;
    final amount = double.tryParse(_amount.text.trim()) ?? 0;
    if (_desc.text.trim().isEmpty || amount <= 0 || _proof == null) {
      Get.snackbar('Costs', 'Description, amount and proof photo are required.');
      return;
    }
    setState(() => _saving = true);
    try {
      final bytes = await _proof!.readAsBytes();
      await _repo.postJobCost(jobId, <String, dynamic>{
        'cost_type': 'site_cost',
        'description': _desc.text.trim(),
        'amount': amount,
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        'proof_files': [
          {
            'filename': _proof!.name.isNotEmpty ? _proof!.name : 'site-cost-proof.jpg',
            'content_type': 'image/jpeg',
            'content_base64': base64Encode(bytes),
          }
        ],
      });
      _desc.clear();
      _amount.clear();
      _notes.clear();
      _proof = null;
      await _load();
      Get.snackbar('Costs', 'Cost saved.');
    } on ApiException catch (e) {
      Get.snackbar('Costs', e.message);
    } catch (e) {
      Get.snackbar('Costs', '$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_error != null) {
      return Center(child: Text(_error!, style: GoogleFonts.inter(color: AppColors.slate300)));
    }

    final summary = (_data?['summary'] is Map) ? Map<String, dynamic>.from(_data!['summary'] as Map) : <String, dynamic>{};
    final rawLines = _data?['lines'];
    final lines = rawLines is List
        ? rawLines.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
        : <Map<String, dynamic>>[];

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Job costs', style: GoogleFonts.inter(color: AppColors.slate50, fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _pill('Total', _money(summary['total'])),
                    _pill('Site', _money(summary['manual_total'])),
                    _pill('Timesheet', _money(summary['timesheet_total'])),
                    _pill('Pricing', _money(summary['job_pricing_total'])),
                    _pill('Quotes', _money(summary['quotation_total'])),
                    _pill('Parts', _money(summary['parts_total'])),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Add site cost', style: GoogleFonts.inter(color: AppColors.slate50, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                _field(_desc, 'Description'),
                const SizedBox(height: 8),
                _field(_amount, 'Amount', keyboardType: const TextInputType.numberWithOptions(decimal: true)),
                const SizedBox(height: 8),
                _field(_notes, 'Notes', maxLines: 3),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: _pickProof,
                  icon: const Icon(Icons.add_a_photo_rounded, color: AppColors.primary),
                  label: Text(
                    _proof == null ? 'Take proof photo (required)' : 'Proof: ${_proof!.name}',
                    style: GoogleFonts.inter(color: AppColors.slate50, fontWeight: FontWeight.w700),
                  ),
                  style: OutlinedButton.styleFrom(side: BorderSide(color: AppColors.whiteOverlay(0.25))),
                ),
                const SizedBox(height: 10),
                FilledButton.icon(
                  onPressed: _saving ? null : _submitCost,
                  icon: _saving
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.save_rounded),
                  label: const Text('Save cost'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          for (final line in lines) _lineCard(line),
        ],
      ),
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.whiteOverlay(0.08),
        border: Border.all(color: AppColors.whiteOverlay(0.12)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: child,
    );
  }

  Widget _pill(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(color: AppColors.blackOverlay(0.18), borderRadius: BorderRadius.circular(999)),
      child: Text('$label: $value', style: GoogleFonts.inter(color: AppColors.slate50, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }

  Widget _field(TextEditingController c, String label, {TextInputType? keyboardType, int maxLines = 1}) {
    return TextField(
      controller: c,
      keyboardType: keyboardType,
      maxLines: maxLines,
      style: GoogleFonts.inter(color: AppColors.slate50),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.inter(color: AppColors.slate400),
        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: AppColors.whiteOverlay(0.16)), borderRadius: BorderRadius.circular(12)),
        focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.primary), borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Widget _lineCard(Map<String, dynamic> line) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${line['label'] ?? 'Cost'}', style: GoogleFonts.inter(color: AppColors.slate50, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('${line['source'] ?? ''} · ${_money(line['amount'])}', style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w800)),
            if ((line['description'] as String?)?.trim().isNotEmpty == true) ...[
              const SizedBox(height: 6),
              Text(line['description'] as String, style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 12)),
            ],
          ],
        ),
      ),
    );
  }
}
