import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';

class JobTabOfficeTasks extends StatefulWidget {
  const JobTabOfficeTasks({super.key});

  @override
  State<JobTabOfficeTasks> createState() => _JobTabOfficeTasksState();
}

class _JobTabOfficeTasksState extends State<JobTabOfficeTasks> {
  final _newDesc = TextEditingController();
  int? _assigneeId;
  String? _err;
  bool _saving = false;

  @override
  void dispose() {
    _newDesc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    return Obx(() {
      final open = c.officeTasks.where((t) => t['completed'] != true).toList();
      final done = c.officeTasks.where((t) => t['completed'] == true).toList();
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text('Office reminders', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Material(
            color: AppColors.whiteOverlay(0.08),
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _newDesc,
                    style: GoogleFonts.inter(color: AppColors.slate900),
                    decoration: InputDecoration(
                      labelText: 'New reminder',
                      labelStyle: TextStyle(color: AppColors.slate500),
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int?>(
                    isExpanded: true,
                    initialValue: _assigneeId,
                    dropdownColor: const Color(0xFF1e293b),
                    style: GoogleFonts.inter(color: AppColors.slate900),
                    decoration: InputDecoration(
                      labelText: 'Assignee (optional)',
                      labelStyle: TextStyle(color: AppColors.slate500),
                      border: const OutlineInputBorder(),
                    ),
                    items: [
                      const DropdownMenuItem<int?>(value: null, child: Text('—')),
                      for (final o in c.officers)
                        DropdownMenuItem<int?>(
                          value: (o['id'] as num?)?.toInt(),
                          child: Text(
                            (o['full_name'] as String?) ?? 'Officer',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: (v) => setState(() => _assigneeId = v),
                  ),
                  if (_err != null) ...[
                    const SizedBox(height: 8),
                    Text(_err!, style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 12)),
                  ],
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _saving
                        ? null
                        : () async {
                            final d = _newDesc.text.trim();
                            if (d.isEmpty) return;
                            setState(() {
                              _saving = true;
                              _err = null;
                            });
                            try {
                              await jobs.postOfficeTask(
                                c.jobId,
                                description: d,
                                assigneeOfficerId: _assigneeId,
                              );
                              _newDesc.clear();
                              await c.refreshAll();
                            } on ApiException catch (e) {
                              setState(() => _err = e.message);
                            } catch (e) {
                              setState(() => _err = '$e');
                            } finally {
                              if (mounted) setState(() => _saving = false);
                            }
                          },
                    child: _saving ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Add'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text('Open', style: GoogleFonts.inter(color: AppColors.slate300, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (open.isEmpty)
            Text('No open reminders.', style: GoogleFonts.inter(color: AppColors.slate500))
          else
            ...open.map((t) => _taskTile(jobs, c, t, open: true)),
          const SizedBox(height: 20),
          Text('Completed', style: GoogleFonts.inter(color: AppColors.slate400, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...done.map((t) => _taskTile(jobs, c, t, open: false)),
        ],
      );
    });
  }

  Widget _taskTile(JobsRepository jobs, JobDetailController c, Map<String, dynamic> t, {required bool open}) {
    final id = (t['id'] as num?)?.toInt();
    final desc = (t['description'] as String?) ?? '';
    final assignee = (t['assignee_name'] as String?) ?? '—';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.whiteOverlay(0.06),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(desc, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text('Assignee: $assignee', style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12)),
              if (open && id != null)
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () async {
                        await jobs.patchOfficeTask(c.jobId, id, <String, dynamic>{'completed': true});
                        await c.refreshAll();
                      },
                      child: Text('Complete', style: GoogleFonts.inter(color: AppColors.primary)),
                    ),
                    TextButton(
                      onPressed: () async {
                        final ok = await Get.dialog<bool>(
                          AlertDialog(
                            title: const Text('Delete reminder?'),
                            actions: [
                              TextButton(onPressed: () => Get.back(result: false), child: const Text('Cancel')),
                              FilledButton(onPressed: () => Get.back(result: true), child: const Text('Delete')),
                            ],
                          ),
                        );
                        if (ok == true) {
                          await jobs.deleteOfficeTask(c.jobId, id);
                          await c.refreshAll();
                        }
                      },
                      child: Text('Delete', style: GoogleFonts.inter(color: Colors.redAccent)),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
