import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/tenant_permissions.dart';
import '../../../core/values/app_colors.dart';
import '../../../data/repositories/customers_repository.dart';
import '../../home/controllers/home_controller.dart';
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
  int _historyKind = 0; // 0=All 1=Jobs 2=Invoices 3=Credits
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
      final inv = await _repo.listInvoicesForCustomer(
        id,
        invoiceWorkAddressId: wid,
        includeWorkAddressInvoices: wid == null,
      );
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

  Future<void> _openJobDetail(Map<String, dynamic> j) async {
    final id = (j['id'] as num?)?.toInt();
    if (id == null || id <= 0) {
      Get.snackbar('Job', 'Unable to open this job.');
      return;
    }
    await Get.toNamed(AppRoutes.jobDetail, arguments: id);
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
              TextField(controller: titleC, decoration: InputDecoration(labelText: 'Title *')),
              const SizedBox(height: 12),
              TextField(
                controller: descC,
                decoration: InputDecoration(labelText: 'Description *'),
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
      final notes = c['specific_notes'];
      final rawNotes = notes is List ? notes : const [];
      final wid = widget.controller.scopedWorkAddressId.value;
      final perms = Get.isRegistered<HomeController>()
          ? Get.find<HomeController>().home.value?.mobilePermissions ?? {}
          : <String, bool>{};
      final role = Get.isRegistered<HomeController>() ? Get.find<HomeController>().home.value?.role : null;
      final showInvoiceHistory =
          canViewInvoicesModule(perms, role: role) &&
          (wid == null || canViewCustomerTab(perms, 'customer_tab_invoices', role: role));
      if (!showInvoiceHistory && (_historyKind == 2 || _historyKind == 3)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _historyKind = 0);
        });
      }
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
        if (_historyKind == 3) {
          return [
            customerEmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'Credit notes',
              subtitle: 'Not available in the app yet — use the web dashboard.',
            ),
          ];
        }

        // History jobs: completed or closed
        final histJobs = _jobs.where((j) =>
          !jobIsOngoing(j) &&
          (match(ctStr(j, 'description_name').isEmpty ? ctStr(j, 'title') : ctStr(j, 'description_name')) ||
           match(ctStr(j, 'id')))
        ).toList();

        // History invoices filtered by search
        final histInvoices = _invoices.where((inv) =>
          match(ctStr(inv, 'invoice_number')) || match(ctStr(inv, 'job_title'))
        ).toList();

        // Build rows as typed maps for sorting
        final List<Map<String, dynamic>> merged = [];

        if (_historyKind == 0 || _historyKind == 1) {
          for (final j in histJobs) {
            merged.add({'_type': 'job', '_date': ctStr(j, 'created_at'), '_data': j});
          }
        }
        if (showInvoiceHistory && (_historyKind == 0 || _historyKind == 2)) {
          for (final inv in histInvoices) {
            merged.add({'_type': 'invoice', '_date': ctStr(inv, 'invoice_date'), '_data': inv});
          }
        }

        // Sort by date descending
        merged.sort((a, b) {
          final da = DateTime.tryParse(a['_date'] as String? ?? '') ?? DateTime(2000);
          final db = DateTime.tryParse(b['_date'] as String? ?? '') ?? DateTime(2000);
          return db.compareTo(da);
        });

        if (merged.isEmpty) {
          final icon = _historyKind == 1 ? Icons.history_rounded : Icons.receipt_outlined;
          final title = _historyKind == 1 ? 'No completed jobs in history' : 'No invoices in history';
          return [customerEmptyState(icon: icon, title: title, subtitle: null)];
        }

        return merged.map((entry) {
          if (entry['_type'] == 'job') {
            final j = entry['_data'] as Map<String, dynamic>;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: customerPanel(
                child: InkWell(
                  onTap: () => _openJobDetail(j),
                  borderRadius: BorderRadius.circular(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.whiteOverlay(0.1),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text('JOB', style: GoogleFonts.inter(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.primary, letterSpacing: 0.8)),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    ctStr(j, 'description_name').isEmpty ? ctStr(j, 'title') : ctStr(j, 'description_name'),
                                    style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${formatIsoDateWeekday(ctStr(j, 'created_at'))} · Job #${(j['id'] as num?)?.toInt() ?? 0}',
                              style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: AppColors.slate400),
                    ],
                  ),
                ),
              ),
            );
          } else {
            final inv = entry['_data'] as Map<String, dynamic>;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: customerPanel(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppColors.whiteOverlay(0.1),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text('INV', style: GoogleFonts.inter(fontSize: 9, fontWeight: FontWeight.w800, color: const Color(0xFFFBBF24), letterSpacing: 0.8)),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  ctStr(inv, 'invoice_number'),
                                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              invoiceStateBadge(ctStr(inv, 'state')),
                            ],
                          ),
                          if (ctStr(inv, 'job_title').isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                ctStr(inv, 'job_title'),
                                style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate600),
                              ),
                            ),
                          const SizedBox(height: 4),
                          Text(
                            '${formatIsoDateShort(ctStr(inv, 'invoice_date'))} · ${formatGbp(inv['total_amount'])}',
                            style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          }
        }).toList();
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
            if (wid == null)
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
                              style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500, height: 1.35),
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
            if (wid == null) ...[
            customerSectionHeader(
              'Ongoing works',
              trailing: FilledButton.icon(
                onPressed: _loading ? null : _openNewJobForm,
                style: FilledButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
                icon: Icon(Icons.add_rounded, size: 18),
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
                      onTap: () => _openJobDetail(j),
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
                                  style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
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
                            onPressed: () => _openJobDetail(j),
                            child: Text('View', style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.primary)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
            customerSectionHeader(
              'Technical notes',
              trailing: IconButton.filledTonal(
                visualDensity: VisualDensity.compact,
                onPressed: () => _noteDialog(),
                icon: Icon(Icons.add_rounded, size: 20),
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
                              icon: Icon(Icons.edit_outlined, size: 20),
                              color: AppColors.primary,
                              onPressed: () => _noteDialog(existing: n),
                            ),
                            IconButton(
                              icon: Icon(Icons.delete_outline_rounded, size: 20),
                              color: const Color(0xFFFCA5A5),
                              onPressed: () => _deleteNote(id),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(ctStr(n, 'description'), style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate600, height: 1.4)),
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
                      hintStyle: GoogleFonts.inter(color: AppColors.slate400),
                      prefixIcon: Icon(Icons.search_rounded, color: AppColors.slate400),
                      filled: true,
                      fillColor: AppColors.whiteOverlay(0.06),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: AppColors.slate200),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: AppColors.primary),
                      ),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SegmentedButton<int>(
                    segments: [
                      const ButtonSegment(value: 0, label: Text('All'), icon: Icon(Icons.history_rounded, size: 16)),
                      const ButtonSegment(value: 1, label: Text('Jobs'), icon: Icon(Icons.work_outline, size: 16)),
                      if (showInvoiceHistory) ...[
                        const ButtonSegment(value: 2, label: Text('Invoices'), icon: Icon(Icons.receipt_long_outlined, size: 16)),
                        const ButtonSegment(value: 3, label: Text('Credits'), icon: Icon(Icons.description_outlined, size: 16)),
                      ],
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
