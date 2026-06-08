import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';


import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';

class JobTabDynamicReports extends StatefulWidget {
  const JobTabDynamicReports({super.key});

  @override
  State<JobTabDynamicReports> createState() => _JobTabDynamicReportsState();
}

class _JobTabDynamicReportsState extends State<JobTabDynamicReports> {
  final _repo = Get.find<JobsRepository>();
  List<Map<String, dynamic>> _reports = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final jobId = Get.find<JobDetailController>().jobId;
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      _reports = await _repo.getJobReports(jobId);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  double _num(dynamic v) {
    if (v is num) return v.toDouble();
    return double.tryParse('$v') ?? 0;
  }

  String _money(dynamic v) => '£${_num(v).toStringAsFixed(2)}';

  String _formatDate(DateTime d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day.toString().padLeft(2, '0')} ${months[d.month - 1]} ${d.year}';
  }

  Future<void> _deleteReport(int reportId, String title) async {
    final jobId = Get.find<JobDetailController>().jobId;
    final ok = await Get.dialog<bool>(
      AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text('Delete report?', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700)),
        content: Text('"$title" will be permanently deleted.', style: GoogleFonts.inter(color: AppColors.slate300)),
        actions: [
          TextButton(onPressed: () => Get.back(result: false), child: Text('Cancel', style: GoogleFonts.inter(color: AppColors.slate400))),
          TextButton(onPressed: () => Get.back(result: true), child: Text('Delete', style: GoogleFonts.inter(color: Colors.redAccent))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _repo.deleteJobReport(jobId, reportId);
      Get.snackbar('Deleted', 'Report removed', backgroundColor: AppColors.blackOverlay(0.7), colorText: Colors.white);
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  void _openEditor({Map<String, dynamic>? report}) {
    Get.bottomSheet(
      _ReportEditorSheet(
        repo: _repo,
        report: report,
        onSaved: () async {
          Get.back();
          await _load();
        },
      ),
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_error!, textAlign: TextAlign.center, style: GoogleFonts.inter(color: AppColors.slate400)),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Job Reports',
                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                ),
              ),
              FilledButton.tonal(
                onPressed: () => _openEditor(),
                child: const Text('Add'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_reports.isEmpty)
            _card(
              child: Column(
                children: [
                  Text(
                    'No reports yet',
                    style: GoogleFonts.inter(color: AppColors.slate300, fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Add reports to track materials, tools, costs, or notes.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.tonal(
                    onPressed: () => _openEditor(),
                    child: const Text('Create first report'),
                  ),
                ],
              ),
            )
          else
            for (final r in _reports) _reportCard(r),
        ],
      ),
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.whiteOverlay(0.08),
        border: Border.all(color: AppColors.whiteOverlay(0.12)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: child,
    );
  }

  Widget _reportCard(Map<String, dynamic> r) {
    final title = (r['title'] as String?) ?? 'Untitled';
    final notes = (r['notes'] as String?) ?? '';
    final dateStr = (r['report_date'] as String?) ?? '';
    final author = (r['created_by_name'] as String?) ?? '';
    final rawItems = r['items'];
    final items = rawItems is List
        ? rawItems.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
        : <Map<String, dynamic>>[];
    final total = items.fold<double>(0, (s, it) => s + _num(it['total_cost']));

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Text(
                          dateStr.isNotEmpty ? _formatDate(DateTime.parse(dateStr)) : '',
                          style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                        ),
                        if (author.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Text('· $author', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12)),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => _openEditor(report: r),
                icon: const Icon(Icons.edit_rounded, color: AppColors.slate400, size: 20),
              ),
              IconButton(
                onPressed: () => _deleteReport((r['id'] as num).toInt(), title),
                icon: const Icon(Icons.delete_outline_rounded, color: AppColors.slate400, size: 20),
              ),
            ],
          ),
          if (notes.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(notes, style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 13)),
          ],
          if (items.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                color: AppColors.blackOverlay(0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  for (int i = 0; i < items.length; i++) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 3,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  (items[i]['item_name'] as String?) ?? '',
                                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
                                ),
                                if ((items[i]['description'] as String?)?.trim().isNotEmpty == true)
                                  Text(
                                    items[i]['description'] as String,
                                    style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 11),
                                  ),
                              ],
                            ),
                          ),
                          Expanded(
                            flex: 1,
                            child: Text(
                              '${items[i]['quantity']}',
                              textAlign: TextAlign.right,
                              style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 13),
                            ),
                          ),
                          Expanded(
                            flex: 2,
                            child: Text(
                              _money(items[i]['unit_cost']),
                              textAlign: TextAlign.right,
                              style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 13),
                            ),
                          ),
                          Expanded(
                            flex: 2,
                            child: Text(
                              _money(items[i]['total_cost']),
                              textAlign: TextAlign.right,
                              style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (i < items.length - 1)
                      Divider(height: 1, color: AppColors.whiteOverlay(0.08)),
                  ],
                ],
              ),
            ),
          ],
          if (total > 0) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                'Total: ${_money(total)}',
                style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 15),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/* ---------- Editor bottom sheet ---------- */

class _ReportEditorSheet extends StatefulWidget {
  final JobsRepository repo;
  final Map<String, dynamic>? report;
  final VoidCallback onSaved;

  const _ReportEditorSheet({required this.repo, this.report, required this.onSaved});

  @override
  State<_ReportEditorSheet> createState() => _ReportEditorSheetState();
}

class _ReportEditorSheetState extends State<_ReportEditorSheet> {
  final _title = TextEditingController();
  final _notes = TextEditingController();
  DateTime _date = DateTime.now();
  final List<_ItemDraft> _items = [];
  bool _saving = false;

  String _money(dynamic v) {
    final n = v is num ? v.toDouble() : (double.tryParse('$v') ?? 0);
    return '£${n.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day.toString().padLeft(2, '0')} ${months[d.month - 1]} ${d.year}';
  }

  @override
  void initState() {
    super.initState();
    final r = widget.report;
    if (r != null) {
      _title.text = (r['title'] as String?) ?? '';
      _notes.text = (r['notes'] as String?) ?? '';
      final d = r['report_date'] as String?;
      if (d != null && d.isNotEmpty) _date = DateTime.parse(d);
      final raw = r['items'];
      if (raw is List) {
        for (final e in raw) {
          if (e is! Map) continue;
          _items.add(_ItemDraft(
            name: (e['item_name'] as String?) ?? '',
            desc: (e['description'] as String?) ?? '',
            qty: (e['quantity'] as num?)?.toDouble() ?? 1,
            cost: (e['unit_cost'] as num?)?.toDouble() ?? 0,
          ));
        }
      }
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _addItem() {
    setState(() => _items.add(_ItemDraft(name: '', desc: '', qty: 1, cost: 0)));
  }

  void _removeItem(int i) => setState(() => _items.removeAt(i));

  double get _total => _items.fold(0, (s, it) => s + (it.qty * it.cost));

  Future<void> _save() async {
    final jobId = Get.find<JobDetailController>().jobId;
    final title = _title.text.trim();
    if (title.isEmpty) {
      Get.snackbar('Required', 'Title is required');
      return;
    }
    setState(() => _saving = true);
    try {
      int reportId;
      if (widget.report != null) {
        reportId = (widget.report!['id'] as num).toInt();
        await widget.repo.patchJobReport(jobId, reportId, <String, dynamic>{
          'title': title,
          'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          'report_date': _date.toIso8601String().substring(0, 10),
        });
        // Delete existing items
        final rawOld = widget.report!['items'];
        if (rawOld is List) {
          for (final e in rawOld) {
            if (e is! Map) continue;
            final id = (e['id'] as num?)?.toInt();
            if (id != null) {
              await widget.repo.deleteJobReportItem(jobId, reportId, id);
            }
          }
        }
      } else {
        final res = await widget.repo.postJobReport(jobId, <String, dynamic>{
          'title': title,
          'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          'report_date': _date.toIso8601String().substring(0, 10),
        });
        reportId = (res['id'] as num?)?.toInt() ?? 0;
      }

      // Create new items
      for (int i = 0; i < _items.length; i++) {
        final it = _items[i];
        if (it.name.trim().isEmpty) continue;
        await widget.repo.postJobReportItem(jobId, reportId, <String, dynamic>{
          'item_name': it.name.trim(),
          'description': it.desc.trim().isEmpty ? null : it.desc.trim(),
          'quantity': it.qty,
          'unit_cost': it.cost,
          'sort_order': i,
        });
      }

      widget.onSaved();
      Get.snackbar('Saved', widget.report != null ? 'Report updated' : 'Report created',
          backgroundColor: AppColors.blackOverlay(0.7), colorText: Colors.white);
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.dark(primary: AppColors.primary, surface: Color(0xFF1E293B)),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.of(context).size.height * 0.85;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 6),
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: AppColors.slate500, borderRadius: BorderRadius.circular(2)),
            ),
            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.report != null ? 'Edit Report' : 'New Report',
                      style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Get.back(),
                    icon: const Icon(Icons.close_rounded, color: AppColors.slate400),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFF334155)),
            // Body
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _field(_title, 'Title'),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: _pickDate,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.whiteOverlay(0.16)),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.calendar_today_rounded, color: AppColors.slate400, size: 18),
                            const SizedBox(width: 10),
                            Text(
                              _formatDate(_date),
                              style: GoogleFonts.inter(color: AppColors.slate50, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _field(_notes, 'Notes', maxLines: 3),
                    const SizedBox(height: 18),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Line items', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                        Text('Total: ${_money(_total)}', style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w800)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (_items.isEmpty)
                      Text('No items yet. Tap + to add.', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12))
                    else
                      for (int i = 0; i < _items.length; i++) ...[
                        _itemRow(i),
                        const SizedBox(height: 8),
                      ],
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _addItem,
                      icon: const Icon(Icons.add_rounded, color: AppColors.primary, size: 18),
                      label: Text('Add item', style: GoogleFonts.inter(color: AppColors.slate50, fontWeight: FontWeight.w700)),
                      style: OutlinedButton.styleFrom(side: BorderSide(color: AppColors.whiteOverlay(0.25))),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _saving ? null : _save,
                        child: _saving
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : Text(widget.report != null ? 'Update report' : 'Save report'),
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String label, {int maxLines = 1}) {
    return TextField(
      controller: c,
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

  Widget _itemRow(int idx) {
    final it = _items[idx];
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.blackOverlay(0.15),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.whiteOverlay(0.1)),
      ),
      child: Column(
        children: [
          TextField(
            controller: TextEditingController(text: it.name)..selection = TextSelection.collapsed(offset: it.name.length),
            onChanged: (v) => it.name = v,
            style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
            decoration: InputDecoration(
              hintText: 'Item name',
              hintStyle: GoogleFonts.inter(color: AppColors.slate500),
              border: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
          ),
          const SizedBox(height: 6),
          TextField(
            controller: TextEditingController(text: it.desc)..selection = TextSelection.collapsed(offset: it.desc.length),
            onChanged: (v) => it.desc = v,
            style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 12),
            decoration: InputDecoration(
              hintText: 'Description (optional)',
              hintStyle: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12),
              border: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _numField(
                  value: it.qty,
                  label: 'Qty',
                  onChanged: (v) => setState(() => it.qty = v),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _numField(
                  value: it.cost,
                  label: 'Unit cost',
                  onChanged: (v) => setState(() => it.cost = v),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
                  decoration: BoxDecoration(
                    color: AppColors.blackOverlay(0.2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _money(it.qty * it.cost),
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              IconButton(
                onPressed: () => _removeItem(idx),
                icon: const Icon(Icons.delete_outline_rounded, color: AppColors.slate400, size: 20),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _numField({required double value, required String label, required ValueChanged<double> onChanged}) {
    return TextField(
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      controller: TextEditingController(text: value == 0 ? '' : value.toString())
        ..selection = TextSelection.collapsed(offset: (value == 0 ? '' : value.toString()).length),
      onChanged: (v) {
        final n = double.tryParse(v) ?? 0;
        onChanged(n);
      },
      style: GoogleFonts.inter(color: AppColors.slate50),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: AppColors.whiteOverlay(0.16)), borderRadius: BorderRadius.circular(10)),
        focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.primary), borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}

class _ItemDraft {
  String name;
  String desc;
  double qty;
  double cost;
  _ItemDraft({required this.name, required this.desc, required this.qty, required this.cost});
}
