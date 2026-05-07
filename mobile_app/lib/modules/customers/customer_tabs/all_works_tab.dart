import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/values/app_colors.dart';
import '../../../data/repositories/customers_repository.dart';
import '../customer_detail_controller.dart';
import 'helpers.dart';
import 'shell.dart';

/// Matches web **All works**: profile strip, ongoing jobs, technical notes, history (jobs / invoices).
class CustomerAllWorksTab extends StatefulWidget {
  const CustomerAllWorksTab({super.key, required this.controller});

  final CustomerDetailController controller;

  @override
  State<CustomerAllWorksTab> createState() => _CustomerAllWorksTabState();
}

class _CustomerAllWorksTabState extends State<CustomerAllWorksTab> {
  final _repo = Get.find<CustomersRepository>();
  List<Map<String, dynamic>> _jobs = [];
  List<Map<String, dynamic>> _invoices = [];
  bool _loading = true;
  int _historyKind = 0; // 0 jobs 1 invoices 2 credit notes
  final _historySearch = TextEditingController();
  Worker? _scopeWorker;

  @override
  void initState() {
    super.initState();
    _historySearch.addListener(() => setState(() {}));
    _scopeWorker = ever(widget.controller.scopedWorkAddressId, (_) => _reloadLists());
    _reloadLists();
  }

  @override
  void dispose() {
    _scopeWorker?.dispose();
    _historySearch.dispose();
    super.dispose();
  }

  Future<void> _reloadLists() async {
    setState(() => _loading = true);
    try {
      final id = widget.controller.customerId;
      final wid = widget.controller.scopedWorkAddressId.value;
      _jobs = await _repo.getCustomerJobs(id, workAddressId: wid);
      final inv = await _repo.listInvoicesForCustomer(id, invoiceWorkAddressId: wid);
      final raw = inv['invoices'];
      _invoices = raw is List
          ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : [];
    } catch (_) {
      _jobs = [];
      _invoices = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openNewJobForm() async {
    final id = widget.controller.customerId;
    final wid = widget.controller.scopedWorkAddressId.value;
    final result = await Get.toNamed<dynamic>(
      AppRoutes.customerNewJob,
      arguments: wid == null ? id : <String, dynamic>{'customerId': id, 'work_address_id': wid},
    );
    if (result == true && mounted) await _reloadLists();
  }

  Future<void> _showJobSheet(Map<String, dynamic> j) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0f172a),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              ctStr(j, 'title'),
              style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                statusPill(ctStr(j, 'state'), compact: true),
                metaChip(ctStr(j, 'priority').isEmpty ? 'Priority' : ctStr(j, 'priority')),
              ],
            ),
            const SizedBox(height: 16),
            infoRow(
              'Record',
              '#${((j['id'] as num?)?.toInt() ?? 0).toString().padLeft(4, '0')}',
              icon: Icons.tag_rounded,
            ),
            infoRow('Created', formatIsoDateShort(ctStr(j, 'created_at')), icon: Icons.calendar_today_outlined),
            if (ctStr(j, 'expected_completion').isNotEmpty)
              infoRow('Next visit', formatIsoDateShort(ctStr(j, 'expected_completion')), icon: Icons.event_available_outlined),
            const SizedBox(height: 12),
            Text(
              'Full job workflow is on the web dashboard.',
              style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45)),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _noteDialog({Map<String, dynamic>? existing}) async {
    final titleC = TextEditingController(text: existing != null ? ctStr(existing, 'title') : '');
    final descC = TextEditingController(text: existing != null ? ctStr(existing, 'description') : '');
    final noteId = (existing?['id'] as num?)?.toInt();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(existing == null ? 'Technical note' : 'Edit note'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: titleC, decoration: const InputDecoration(labelText: 'Title *')),
              const SizedBox(height: 12),
              TextField(
                controller: descC,
                decoration: const InputDecoration(labelText: 'Description *'),
                maxLines: 4,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;
    final t = titleC.text.trim();
    final d = descC.text.trim();
    if (t.isEmpty || d.isEmpty) {
      Get.snackbar('Validation', 'Title and description are required');
      return;
    }
    try {
      final wid = widget.controller.scopedWorkAddressId.value;
      if (noteId == null) {
        await _repo.createSpecificNote(widget.controller.customerId, {
          'title': t,
          'description': d,
          if (wid != null) 'work_address_id': wid,
        });
      } else {
        await _repo.updateSpecificNote(widget.controller.customerId, noteId, {'title': t, 'description': d});
      }
      await widget.controller.refreshCustomer();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  Future<void> _deleteNote(int id) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete note?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (go != true) return;
    try {
      await _repo.deleteSpecificNote(widget.controller.customerId, id);
      await widget.controller.refreshCustomer();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      widget.controller.scopedWorkAddressId.value;
      final c = widget.controller.customer.value;
      if (c == null) return const SizedBox.shrink();

      final ongoing = _jobs.where(jobIsOngoing).toList();
      final completedJobs = _jobs.where((j) => !jobIsOngoing(j)).toList();
      final notes = c['specific_notes'];
      final rawNotes = notes is List ? notes : const [];
      final wid = widget.controller.scopedWorkAddressId.value;
      final noteList = rawNotes.where((raw) {
        if (raw is! Map) return false;
        final n = Map<String, dynamic>.from(raw);
        final nw = n['work_address_id'];
        if (wid == null) return nw == null;
        return nw != null && (nw as num).toInt() == wid;
      }).toList();

      final q = _historySearch.text.trim().toLowerCase();
      bool match(String a) => q.isEmpty || a.toLowerCase().contains(q);

      List<Widget> historyRows() {
        if (_historyKind == 2) {
          return [
            customerEmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'Credit notes',
              subtitle: 'Not available in the app yet — use the web dashboard.',
            ),
          ];
        }
        if (_historyKind == 0) {
          final rows = completedJobs.where((j) {
            final desc = ctStr(j, 'description_name').isEmpty ? ctStr(j, 'title') : ctStr(j, 'description_name');
            return match(desc) || match(ctStr(j, 'id'));
          }).toList();
          if (rows.isEmpty) {
            return [customerEmptyState(icon: Icons.history_rounded, title: 'No completed jobs in history', subtitle: null)];
          }
          return rows
              .map(
                (j) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: customerPanel(
                    child: InkWell(
                      onTap: () => _showJobSheet(j),
                      borderRadius: BorderRadius.circular(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  ctStr(j, 'description_name').isEmpty ? ctStr(j, 'title') : ctStr(j, 'description_name'),
                                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${formatIsoDateWeekday(ctStr(j, 'created_at'))} · Job #${(j['id'] as num?)?.toInt() ?? 0}',
                                  style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45)),
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right_rounded, color: AppColors.whiteOverlay(0.35)),
                        ],
                      ),
                    ),
                  ),
                ),
              )
              .toList();
        }
        final invRows = _invoices.where((inv) {
          return match(ctStr(inv, 'invoice_number')) || match(ctStr(inv, 'job_title'));
        }).toList();
        if (invRows.isEmpty) {
          return [customerEmptyState(icon: Icons.receipt_outlined, title: 'No invoices in history', subtitle: null)];
        }
        return invRows
            .map(
              (inv) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: customerPanel(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              ctStr(inv, 'invoice_number'),
                              style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              ctStr(inv, 'job_title').isEmpty ? 'Invoice' : ctStr(inv, 'job_title'),
                              style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.75)),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${formatIsoDateShort(ctStr(inv, 'invoice_date'))} · ${formatGbp(inv['total_amount'])}',
                              style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45)),
                            ),
                          ],
                        ),
                      ),
                      invoiceStateBadge(ctStr(inv, 'state')),
                    ],
                  ),
                ),
              ),
            )
            .toList();
      }

      return RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () async {
          await widget.controller.refreshCustomer();
          await _reloadLists();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            customerPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              ctStr(c, 'full_name').isEmpty ? 'Customer' : ctStr(c, 'full_name'),
                              style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white, height: 1.15),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              [
                                ctStr(c, 'address_line_1'),
                                ctStr(c, 'town'),
                                ctStr(c, 'postcode'),
                              ].where((e) => e.isNotEmpty).join(', ').trim(),
                              style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.65), height: 1.35),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      statusPill(ctStr(c, 'status')),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Divider(color: AppColors.whiteOverlay(0.08)),
                  const SizedBox(height: 8),
                  infoRow('Account', 'ACC-${widget.controller.customerId.toString().padLeft(4, '0')}'),
                  infoRow('Phone', ctStr(c, 'contact_mobile').isNotEmpty ? ctStr(c, 'contact_mobile') : ctStr(c, 'phone'), icon: Icons.phone_outlined),
                  infoRow('Email', ctStr(c, 'contact_email').isNotEmpty ? ctStr(c, 'contact_email') : ctStr(c, 'email'), icon: Icons.email_outlined),
                ],
              ),
            ),
            customerSectionHeader(
              'Ongoing works',
              trailing: FilledButton.icon(
                onPressed: _loading ? null : _openNewJobForm,
                style: FilledButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: Text('Add new job', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12)),
              ),
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
              )
            else if (ongoing.isEmpty)
              customerEmptyState(
                icon: Icons.handyman_outlined,
                title: 'No ongoing works',
                subtitle: 'Create a job to track work for this customer.',
              )
            else
              ...ongoing.map(
                (j) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: customerPanel(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    child: InkWell(
                      onTap: () => _showJobSheet(j),
                      borderRadius: BorderRadius.circular(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  ctStr(j, 'description_name').isEmpty ? ctStr(j, 'title') : ctStr(j, 'description_name'),
                                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  '${formatIsoDateWeekday(ctStr(j, 'created_at'))} · #${(j['id'] as num?)?.toInt() ?? 0}',
                                  style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45)),
                                ),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 6,
                                  children: [
                                    statusPill(ctStr(j, 'state'), compact: true),
                                    metaChip(ctStr(j, 'priority').isEmpty ? '—' : ctStr(j, 'priority')),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          TextButton(
                            onPressed: () => _showJobSheet(j),
                            child: Text('View', style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.primary)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            customerSectionHeader(
              'Technical notes',
              trailing: IconButton.filledTonal(
                visualDensity: VisualDensity.compact,
                onPressed: () => _noteDialog(),
                icon: const Icon(Icons.add_rounded, size: 20),
              ),
            ),
            if (noteList.isEmpty)
              customerEmptyState(icon: Icons.note_alt_outlined, title: 'No technical notes', subtitle: 'Add installation notes, access codes, or caveats.')
            else
              ...noteList.map<Widget>((raw) {
                final n = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
                final id = (n['id'] as num?)?.toInt() ?? 0;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: customerPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(ctStr(n, 'title'), style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800)),
                            ),
                            IconButton(
                              icon: const Icon(Icons.edit_outlined, size: 20),
                              color: AppColors.primary,
                              onPressed: () => _noteDialog(existing: n),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline_rounded, size: 20),
                              color: const Color(0xFFFCA5A5),
                              onPressed: () => _deleteNote(id),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(ctStr(n, 'description'), style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.78), height: 1.4)),
                      ],
                    ),
                  ),
                );
              }),
            customerSectionHeader('History'),
            customerPanel(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _historySearch,
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(
                      hintText: 'Search history…',
                      hintStyle: GoogleFonts.inter(color: AppColors.whiteOverlay(0.35)),
                      prefixIcon: Icon(Icons.search_rounded, color: AppColors.whiteOverlay(0.45)),
                      filled: true,
                      fillColor: AppColors.whiteOverlay(0.06),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: AppColors.whiteOverlay(0.12)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: AppColors.primary),
                      ),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SegmentedButton<int>(
                    segments: const [
                      ButtonSegment(value: 0, label: Text('Jobs'), icon: Icon(Icons.work_outline, size: 16)),
                      ButtonSegment(value: 1, label: Text('Invoices'), icon: Icon(Icons.receipt_long_outlined, size: 16)),
                      ButtonSegment(value: 2, label: Text('Credits'), icon: Icon(Icons.description_outlined, size: 16)),
                    ],
                    selected: {_historyKind},
                    onSelectionChanged: (s) => setState(() => _historyKind = s.first),
                    style: ButtonStyle(
                      visualDensity: VisualDensity.compact,
                      foregroundColor: WidgetStateProperty.resolveWith((st) {
                        if (st.contains(WidgetState.selected)) return AppColors.gradientStart;
                        return AppColors.whiteOverlay(0.75);
                      }),
                    ),
                  ),
                ],
              ),
            ),
            ...historyRows(),
          ],
        ),
      );
    });
  }
}
