import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/values/app_colors.dart';
import '../open_jobs/open_job_formatters.dart';
import 'job_detail_controller.dart';
import 'job_expense_dialog.dart';
import 'job_formatters.dart';
import 'job_states.dart';

String _str(Map<String, dynamic> m, String k) {
  final v = m[k];
  if (v is String) return v.trim();
  if (v != null) return v.toString().trim();
  return '';
}

String? _nonEmpty(String s) => s.isEmpty ? null : s;

String _formatIsoShort(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  final l = d.toLocal();
  return '${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year}';
}

String _formatMoney(dynamic raw) {
  final value = raw is num ? raw.toDouble() : double.tryParse(raw?.toString() ?? '') ?? 0;
  return '£${value.toStringAsFixed(2)}';
}

String _dateMilestones(Map<String, dynamic> j) {
  final parts = <String>[];
  final sd = j['start_date'] as String?;
  final dl = j['deadline'] as String?;
  final ex = j['expected_completion'] as String?;
  if (sd != null && sd.trim().isNotEmpty) parts.add('Start ${_formatIsoShort(sd)}');
  if (dl != null && dl.trim().isNotEmpty) parts.add('Due ${_formatIsoShort(dl)}');
  if (ex != null && ex.trim().isNotEmpty) parts.add('Expected ${_formatIsoShort(ex)}');
  return parts.isEmpty ? 'No start / due dates on file' : parts.join(' · ');
}

String _scheduleLine(Map<String, dynamic> j) {
  final iso = j['schedule_start'] as String?;
  if (iso == null || iso.isEmpty) return 'Not scheduled';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  final local = d.toLocal();
  return '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year} '
      '· ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

String _workSiteLine(Map<String, dynamic> wa) {
  final name = _nonEmpty(_str(wa, 'name')) ?? 'Work site';
  final parts = <String>[
    if (_nonEmpty(_str(wa, 'branch_name')) != null) _str(wa, 'branch_name'),
    if (_nonEmpty(_str(wa, 'address_line_1')) != null) _str(wa, 'address_line_1'),
    if (_nonEmpty(_str(wa, 'address_line_2')) != null) _str(wa, 'address_line_2'),
    if (_nonEmpty(_str(wa, 'address_line_3')) != null) _str(wa, 'address_line_3'),
    if (_nonEmpty(_str(wa, 'town')) != null) _str(wa, 'town'),
    if (_nonEmpty(_str(wa, 'county')) != null) _str(wa, 'county'),
    if (_nonEmpty(_str(wa, 'postcode')) != null) _str(wa, 'postcode'),
  ].where((e) => e.isNotEmpty).join(', ');
  return parts.isEmpty ? name : '$name · $parts';
}

Widget _ppmBanner(Map<String, dynamic> ppm) {
  final title = _nonEmpty(_str(ppm, 'contract_title')) ?? 'PPM contract';
  final task = _nonEmpty(_str(ppm, 'task_name'));
  final due = _nonEmpty(_str(ppm, 'task_next_due'));
  final breached = ppm['sla_breached'] == true;
  final bg = breached ? const Color(0xFF451a1a) : const Color(0xFF134e4a);
  final border = breached ? const Color(0xFFf87171) : AppColors.primary;
  return DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      color: bg.withValues(alpha: 0.35),
      border: Border.all(color: border.withValues(alpha: 0.5)),
    ),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.event_repeat_rounded, size: 18, color: border),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'PPM: $title${task != null ? ' — $task' : ''}',
                  style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.slate900),
                ),
              ),
            ],
          ),
          if (due != null) ...[
            const SizedBox(height: 4),
            Text('Task due: ${_formatIsoShort(due)}', style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate600)),
          ],
          if (breached)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('SLA breached', style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w700, color: const Color(0xFFfca5a5))),
            ),
        ],
      ),
    ),
  );
}

class JobTabDetails extends StatelessWidget {
  const JobTabDetails({super.key});

  @override
  Widget build(BuildContext context) {
    final c = Get.find<JobDetailController>();
    return Obx(() {
      final j = c.job.value;
      if (j == null) {
        return const Center(child: Text('—', style: TextStyle(color: Colors.black45)));
      }
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () {
                final cid = (j['customer_id'] as num?)?.toInt();
                if (cid != null) Get.toNamed(AppRoutes.customerDetail, arguments: cid);
              },
              icon: Icon(Icons.open_in_new_rounded, color: AppColors.primary, size: 20),
              label: Text('Customer workspace', style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w700)),
            ),
          ),
          Text(
            _nonEmpty(_str(j, 'title')) ?? 'Job',
            style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.slate900),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Chip(label: formatJobState(_str(j, 'state')), emphasized: true),
              if (_str(j, 'priority').isNotEmpty) _Chip(label: formatJobState(_str(j, 'priority')), emphasized: false),
            ],
          ),
          if (j['ppm'] is Map) ...[
            const SizedBox(height: 12),
            _ppmBanner(Map<String, dynamic>.from(j['ppm'] as Map)),
          ],
          const SizedBox(height: 8),
          Obx(() {
            return DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _str(j, 'state').isEmpty ? 'draft' : _str(j, 'state'),
              dropdownColor: Colors.white,
              style: GoogleFonts.inter(color: AppColors.slate900),
              decoration: InputDecoration(
                labelText: 'Status',
                labelStyle: TextStyle(color: Colors.black54),
              ),
              items: [
                for (final s in kJobStatesOrdered)
                  DropdownMenuItem(value: s, child: Text(jobStateLabelUi(s))),
              ],
              onChanged: c.patchingState.value
                  ? null
                  : (v) {
                      if (v != null) c.patchJobState(v);
                    },
            );
          }),
          const SizedBox(height: 16),
          _section(
            'Schedule',
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _row(Icons.event, _scheduleLine(j)),
                if (formatDurationMinutes((j['duration_minutes'] as num?)?.toInt()) != null) ...[
                  const SizedBox(height: 8),
                  _row(Icons.timer_outlined, formatDurationMinutes((j['duration_minutes'] as num?)?.toInt())!),
                ],
                const SizedBox(height: 8),
                _row(Icons.date_range, _dateMilestones(j)),
              ],
            ),
          ),
          if (_nonEmpty(_str(j, 'dispatched_at')) != null) ...[
            const SizedBox(height: 12),
            _section('Dispatched', _row(Icons.local_shipping, _str(j, 'dispatched_at'))),
          ],
          if (_nonEmpty(_str(j, 'customer_full_name')) != null) ...[
            const SizedBox(height: 12),
            _section(
              'Customer',
              InkWell(
                onTap: () {
                  final id = (j['customer_id'] as num?)?.toInt();
                  if (id != null) Get.toNamed(AppRoutes.customerDetail, arguments: id);
                },
                child: _row(Icons.person, _str(j, 'customer_full_name'), link: true),
              ),
            ),
          ],
          if (j['work_address'] is Map) ...[
            const SizedBox(height: 12),
            _section(
              'Work / site',
              _row(Icons.business, _workSiteLine(Map<String, dynamic>.from(j['work_address'] as Map))),
            ),
          ],
          ..._officersSection(j),
          if (_nonEmpty(_str(j, 'location')) != null) ...[
            const SizedBox(height: 12),
            _section('Location', _row(Icons.place, _str(j, 'location'))),
          ],
          if (_nonEmpty(_str(j, 'required_certifications')) != null) ...[
            const SizedBox(height: 12),
            _section('Certifications', Text(_str(j, 'required_certifications'), style: _bodyStyle)),
          ],
          if (_nonEmpty(_str(j, 'description_name')) != null) ...[
            const SizedBox(height: 12),
            _section('Job type', Text(_str(j, 'description_name'), style: _bodyStyle)),
          ],
          const SizedBox(height: 12),
          _section(
            'Completed services',
            Text(formatCompletedServicesForJobDetail(j['completed_service_items']), style: _bodyStyle),
          ),
          if (_nonEmpty(_str(j, 'job_notes')) != null) ...[
            const SizedBox(height: 12),
            _section('Notes', Text(_str(j, 'job_notes'), style: _bodyStyle)),
          ],
          if (_nonEmpty(_str(j, 'customer_reference')) != null) ...[
            const SizedBox(height: 12),
            _section('Customer reference', Text(_str(j, 'customer_reference'), style: _bodyStyle)),
          ],
          if (j['quoted_amount'] is num && (j['quoted_amount'] as num) != 0) ...[
            const SizedBox(height: 12),
            _section('Quoted amount', Text('${j['quoted_amount']}', style: _bodyStyle)),
          ],
          if (j['pricing_items'] is List && (j['pricing_items'] as List).isNotEmpty) ...[
            const SizedBox(height: 12),
            _section(
              'Items to invoice (pricing)',
              Column(
                children: [
                  for (final row in (j['pricing_items'] as List))
                    if (row is Map)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text(
                          '${row['item_name'] ?? ''} · qty ${row['quantity'] ?? ''} · ${row['unit_price'] ?? ''}',
                          style: _bodyStyle,
                        ),
                      ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          _section(
            'Required tools',
            Obx(() {
              final tools = c.jobTools;
              if (tools.isEmpty) {
                return Text('No required tools assigned to this job.', style: _bodyStyle);
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final t in tools)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Icon(Icons.build_rounded, size: 16, color: AppColors.primary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${t['name'] ?? ''} (${t['category'] ?? ''}) · Status: ${t['status'] ?? ''} · Loc: ${t['location'] ?? ''}',
                              style: _bodyStyle,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              );
            }),
          ),
          const SizedBox(height: 12),
          _section(
            'Expenses',
            Obx(() {
              final expenses = c.expenses;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (expenses.isEmpty)
                    Text('No job expenses added yet.', style: _bodyStyle)
                  else
                    ...expenses.map((e) {
                      final date = _str(e, 'expense_date');
                      final category = _str(e, 'category').isEmpty ? 'Expense' : _str(e, 'category');
                      final description = _str(e, 'description');
                      final status = _str(e, 'status').isEmpty ? 'submitted' : _str(e, 'status');
                      final claimer = _str(e, 'claimed_by_name').isNotEmpty
                          ? _str(e, 'claimed_by_name')
                          : (_str(e, 'officer_name').isNotEmpty ? _str(e, 'officer_name') : 'Unknown');
                      final proofCount = e['proof_files'] is List ? (e['proof_files'] as List).length : 0;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.receipt_long, size: 18, color: AppColors.slate400),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('$category · ${_formatMoney(e['amount'])}', style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate900, fontWeight: FontWeight.w700)),
                                  Text('Claimed by: $claimer', style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate600, fontWeight: FontWeight.w600)),
                                  Text('Status: $status', style: GoogleFonts.inter(fontSize: 12, color: status == 'approved' ? AppColors.primary : AppColors.slate400, fontWeight: FontWeight.w600)),
                                  if (proofCount > 0) Text('Receipt attached', style: GoogleFonts.inter(fontSize: 12, color: AppColors.primary)),
                                  if (description.isNotEmpty) Text(description, style: _bodyStyle),
                                  if (date.isNotEmpty) Text(date, style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => _showAddExpense(context, c),
                    icon: Icon(Icons.add_card),
                    label: const Text('Add expense'),
                  ),
                ],
              );
            }),
          ),
          const SizedBox(height: 20),
          Text('Diary events', style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: () => _showAddVisit(context, c),
            icon: Icon(Icons.add),
            label: const Text('Add diary visit'),
          ),
          const SizedBox(height: 12),
          ...c.diaryEvents.map((e) => _diaryRow(context, c, e, j)),
        ],
      );
    });
  }

  static TextStyle get _bodyStyle => GoogleFonts.inter(fontSize: 14, height: 1.45, color: AppColors.slate600);

  List<Widget> _officersSection(Map<String, dynamic> j) {
    final raw = j['officers'];
    final officers = <Map<String, dynamic>>[];
    if (raw is List) {
      for (final o in raw) {
        if (o is Map) officers.add(Map<String, dynamic>.from(o));
      }
    }
    if (officers.isEmpty) return [];
    final title = officers.length == 1 ? 'Assigned officer' : 'Assigned officers';
    return [
      const SizedBox(height: 12),
      _section(
        title,
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final o in officers)
              Padding(
                padding: EdgeInsets.only(bottom: o == officers.last ? 0 : 6),
                child: _row(
                  o['is_primary'] == true ? Icons.star : Icons.engineering,
                  '${o['full_name'] ?? ''}${o['is_primary'] == true ? ' (Primary)' : ''}',
                ),
              ),
          ],
        ),
      ),
    ];
  }

  Future<void> _showAddVisit(BuildContext context, JobDetailController c) async {
    final job = c.job.value;
    DateTime start = DateTime.now();
    TimeOfDay startTime = TimeOfDay.fromDateTime(start);
    final scheduleIso = job?['schedule_start'] as String? ?? job?['expected_completion'] as String?;
    if (scheduleIso != null && scheduleIso.isNotEmpty) {
      final parsed = DateTime.tryParse(scheduleIso)?.toLocal();
      if (parsed != null) {
        start = DateTime(parsed.year, parsed.month, parsed.day);
        startTime = TimeOfDay(hour: parsed.hour, minute: parsed.minute);
      }
    }
    final selectedOfficerIds = <int>{};
    final durationC = TextEditingController(
      text: '${(job?['duration_minutes'] as num?)?.toInt() ?? 60}',
    );
    final notesC = TextEditingController();
    final officers = <Map<String, dynamic>>[];
    final seenOfficerIds = <int>{};
    for (final o in c.officers) {
      final id = (o['id'] as num?)?.toInt();
      if (id == null || !seenOfficerIds.add(id)) continue;
      officers.add(o);
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('New visit'),
          content: StatefulBuilder(
            builder: (ctx, setS) {
              final existingVisits = c.diaryEvents.length;
              return SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (existingVisits > 0)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          'This job already has $existingVisits visit${existingVisits == 1 ? '' : 's'}. '
                          'Only add another if you need a second appointment.',
                          style: GoogleFonts.inter(fontSize: 13, color: Colors.orange.shade800),
                        ),
                      ),
                    ListTile(
                      title: const Text('Date'),
                      subtitle: Text(start.toIso8601String().split('T').first),
                      onTap: () async {
                        final d = await showDatePicker(
                          context: ctx,
                          initialDate: start,
                          firstDate: DateTime(2000),
                          lastDate: DateTime(2100),
                        );
                        if (d != null) setS(() => start = DateTime(d.year, d.month, d.day));
                      },
                    ),
                    ListTile(
                      title: const Text('Start time'),
                      subtitle: Text(startTime.format(ctx)),
                      onTap: () async {
                        final t = await showTimePicker(
                          context: ctx,
                          initialTime: startTime,
                        );
                        if (t != null) setS(() => startTime = t);
                      },
                    ),
                    TextField(
                      controller: durationC,
                      decoration: InputDecoration(labelText: 'Duration (minutes)'),
                      keyboardType: TextInputType.number,
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Officers',
                        style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.black54),
                      ),
                    ),
                    if (officers.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('No officers available', style: TextStyle(color: Colors.black45)),
                      )
                    else
                      ...officers.map((o) {
                        final id = (o['id'] as num?)?.toInt() ?? 0;
                        final name = (o['full_name'] as String?) ?? '';
                        return CheckboxListTile(
                          value: selectedOfficerIds.contains(id),
                          onChanged: (v) => setS(() {
                            if (v == true) {
                              selectedOfficerIds.add(id);
                            } else {
                              selectedOfficerIds.remove(id);
                            }
                          }),
                          title: Text(name, style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate900)),
                          activeColor: AppColors.primary,
                          dense: true,
                          visualDensity: VisualDensity.compact,
                        );
                      }),
                    TextField(controller: notesC, decoration: InputDecoration(labelText: 'Notes')),
                  ],
                ),
              );
            },
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
          ],
        );
      },
    );
    if (ok == true) {
      try {
        final duration = int.tryParse(durationC.text.trim()) ?? 60;
        final startDateTime = DateTime(
          start.year,
          start.month,
          start.day,
          startTime.hour,
          startTime.minute,
        );
        await c.postDiaryVisit(
          officerIds: selectedOfficerIds.isEmpty ? null : selectedOfficerIds.toList(),
          start: startDateTime,
          durationMinutes: duration.clamp(1, 1440),
          notes: notesC.text.trim().isEmpty ? null : notesC.text.trim(),
        );
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
        }
      }
    }
    durationC.dispose();
    notesC.dispose();
  }

  Future<void> _showAddExpense(BuildContext context, JobDetailController c) async {
    final data = await showAddJobExpenseDialog(context, requireProof: true);
    if (data == null) return;
    try {
      await c.postExpense(
        category: data.category,
        amount: data.amount,
        description: data.description,
        expenseDate: data.expenseDate,
        expenseType: data.expenseType,
        proofFiles: data.proofFiles,
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Widget _diaryRow(BuildContext context, JobDetailController c, Map<String, dynamic> e, Map<String, dynamic> job) {
    final id = (e['id'] as num?)?.toInt();
    final status = e['status'] as String?;
    final start = e['start_time'] as String?;
    final dur = (e['duration_minutes'] as num?)?.toInt() ?? 0;
    final rawOfficers = e['officers'];
    final officers = <Map<String, dynamic>>[];
    if (rawOfficers is List) {
      for (final o in rawOfficers) {
        if (o is Map) officers.add(Map<String, dynamic>.from(o));
      }
    }
    // Job allows only one primary — prefer job_officers over per-visit flags
    // (split visits often mark every engineer as primary on their own row).
    int? jobPrimaryOfficerId;
    final jobOfficersRaw = job['officers'];
    if (jobOfficersRaw is List) {
      for (final o in jobOfficersRaw) {
        if (o is! Map) continue;
        if (o['is_primary'] == true) {
          jobPrimaryOfficerId =
              (o['id'] as num?)?.toInt() ?? (o['officer_id'] as num?)?.toInt();
          break;
        }
      }
    }
    jobPrimaryOfficerId ??= (job['officer_id'] as num?)?.toInt();
    final officerLabel = officers.isEmpty
        ? ((e['officer_full_name'] as String?) ?? 'Unassigned')
        : officers.map((o) {
            final oid =
                (o['id'] as num?)?.toInt() ?? (o['officer_id'] as num?)?.toInt();
            final isPrimary = jobPrimaryOfficerId != null
                ? oid == jobPrimaryOfficerId
                : o['is_primary'] == true;
            return '${o['full_name'] ?? ''}${isPrimary ? ' ★' : ''}';
          }).join(', ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.slate100,
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
          title: Text(
            officerLabel,
            style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w600),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            '${start ?? ''} · $dur min · ${status ?? ''}',
            style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (id != null && diaryVisitAllowsDelete(status))
                IconButton(
                  icon: Icon(Icons.delete_outline, color: Colors.redAccent, size: 20),
                  onPressed: () async {
                    final ok = await Get.dialog<bool>(
                      AlertDialog(
                        title: const Text('Delete visit?'),
                        actions: [
                          TextButton(onPressed: () => Get.back(result: false), child: const Text('Cancel')),
                          FilledButton(onPressed: () => Get.back(result: true), child: const Text('Delete')),
                        ],
                      ),
                    );
                    if (ok == true) {
                      try {
                        await c.deleteDiaryVisit(id);
                      } catch (err) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$err')));
                        }
                      }
                    }
                  },
                ),
              if (id != null)
                TextButton(
                  onPressed: () => Get.toNamed(AppRoutes.diaryEventDetail, arguments: id),
                  child: Text('Open', style: GoogleFonts.inter(color: AppColors.primary)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _section(String title, Widget child) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.white,
        border: Border.all(color: AppColors.slate200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.slate400)),
            const SizedBox(height: 8),
            child,
          ],
        ),
      ),
    );
  }

  Widget _row(IconData icon, String text, {bool link = false}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: link ? AppColors.primary : AppColors.slate400),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: GoogleFonts.inter(fontSize: 14, color: link ? AppColors.primary : AppColors.slate600))),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.emphasized});

  final String label;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: emphasized ? AppColors.primary.withValues(alpha: 0.22) : AppColors.slate100,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: emphasized ? AppColors.primary.withValues(alpha: 0.45) : AppColors.slate200),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: emphasized ? AppColors.primary : AppColors.slate600,
        ),
      ),
    );
  }
}
