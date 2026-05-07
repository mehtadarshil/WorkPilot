import 'dart:async';

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

// ─── Work sites ──────────────────────────────────────────────────────────

class CustomerSitesTab extends StatefulWidget {
  const CustomerSitesTab({super.key, required this.customerId});

  final int customerId;

  @override
  State<CustomerSitesTab> createState() => _CustomerSitesTabState();
}

class _CustomerSitesTabState extends State<CustomerSitesTab> {
  final _repo = Get.find<CustomersRepository>();
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  int _segment = 0; // 0 active 1 dormant

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final status = _segment == 0 ? 'active' : 'dormant';
      final q = _search.text.trim();
      _rows = await _repo.getWorkAddresses(
        widget.customerId,
        status: status,
        search: q.isEmpty ? null : q,
      );
    } catch (_) {
      _rows = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _enterWorkAddressScope(int workAddressId) async {
    try {
      final ctl = Get.find<CustomerDetailController>();
      if (ctl.customerId == widget.customerId) {
        await ctl.enterWorkAddressScope(workAddressId);
        return;
      }
    } catch (_) {}
    await Get.toNamed(
      AppRoutes.customerDetail,
      arguments: <String, dynamic>{'id': widget.customerId, 'work_address_id': workAddressId},
    );
  }

  Future<void> _openWorkAddressForm({Map<String, dynamic>? existing}) async {
    final result = await Get.toNamed<dynamic>(
      AppRoutes.customerWorkAddressForm,
      arguments: <String, dynamic>{
        'customerId': widget.customerId,
        if (existing != null) 'workAddress': existing,
      },
    );
    if (result == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              customerPanel(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _search,
                        style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                        decoration: customerInputDecoration('Search').copyWith(
                          isDense: true,
                          prefixIcon: Icon(Icons.search_rounded, color: AppColors.whiteOverlay(0.45), size: 22),
                        ),
                        textInputAction: TextInputAction.search,
                        onSubmitted: (_) => _load(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: _loading ? null : _load,
                      style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
                      child: Text('Search', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              customerPanel(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: SegmentedButton<int>(
                        segments: const [
                          ButtonSegment(value: 0, label: Text('Active'), icon: Icon(Icons.check_circle_outline, size: 16)),
                          ButtonSegment(value: 1, label: Text('Dormant'), icon: Icon(Icons.pause_circle_outline, size: 16)),
                        ],
                        selected: {_segment},
                        onSelectionChanged: (s) {
                          setState(() => _segment = s.first);
                          _load();
                        },
                        style: ButtonStyle(
                          visualDensity: VisualDensity.compact,
                          foregroundColor: WidgetStateProperty.resolveWith((st) {
                            if (st.contains(WidgetState.selected)) return AppColors.gradientStart;
                            return AppColors.whiteOverlay(0.75);
                          }),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: FilledButton.icon(
                        onPressed: _loading ? null : () => _openWorkAddressForm(),
                        style: FilledButton.styleFrom(visualDensity: VisualDensity.compact),
                        icon: const Icon(Icons.add_location_alt_outlined, size: 18),
                        label: Text(
                          'Add work address',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 11),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: _loading && _rows.isEmpty
              ? Center(child: CircularProgressIndicator(color: AppColors.primary))
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: _load,
                  child: _rows.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          children: [
                            customerEmptyState(
                              icon: Icons.location_city_outlined,
                              title: _segment == 0 ? 'No active work addresses' : 'No dormant work addresses',
                              subtitle: 'Add a work address to schedule jobs at a property.',
                            ),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          itemCount: _rows.length,
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            final id = (r['id'] as num?)?.toInt() ?? 0;
                            final sub = [ctStr(r, 'address_line_1'), ctStr(r, 'town'), ctStr(r, 'postcode')].where((e) => e.isNotEmpty).join(', ');
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: customerPanel(
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: InkWell(
                                        onTap: () => _enterWorkAddressScope(id),
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(ctStr(r, 'name'), style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                                            const SizedBox(height: 6),
                                            Text(sub, style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.65), height: 1.3)),
                                          ],
                                        ),
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: () => _enterWorkAddressScope(id),
                                      child: Text('View', style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.primary)),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.edit_outlined, size: 20),
                                      color: AppColors.primary,
                                      onPressed: () => _openWorkAddressForm(existing: r),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline_rounded, size: 20),
                                      color: const Color(0xFFFCA5A5),
                                      onPressed: () async {
                                        final go = await showDialog<bool>(
                                          context: context,
                                          builder: (ctx) => AlertDialog(
                                            title: const Text('Delete this work address?'),
                                            actions: [
                                              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                                              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
                                            ],
                                          ),
                                        );
                                        if (go != true) return;
                                        try {
                                          await _repo.deleteWorkAddress(widget.customerId, id);
                                          await _load();
                                        } on ApiException catch (e) {
                                          Get.snackbar('Error', e.message);
                                        }
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
        ),
      ],
    );
  }
}

// ─── Communications ───────────────────────────────────────────────────────

class CustomerCommsTab extends StatefulWidget {
  const CustomerCommsTab({super.key, required this.customerId, this.workAddressId});

  final int customerId;
  final int? workAddressId;

  @override
  State<CustomerCommsTab> createState() => _CustomerCommsTabState();
}

class _CustomerCommsTabState extends State<CustomerCommsTab> {
  final _repo = Get.find<CustomersRepository>();
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _typeFilter; // null = all
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _search.addListener(_schedule);
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.removeListener(_schedule);
    _search.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CustomerCommsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workAddressId != widget.workAddressId) {
      _load();
    }
  }

  void _schedule() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _load);
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final d = await _repo.getCommunications(
        widget.customerId,
        search: _search.text.trim().isEmpty ? null : _search.text.trim(),
        type: _typeFilter,
        workAddressId: widget.workAddressId,
      );
      final raw = d['communications'];
      _rows = raw is List ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList() : [];
      _rows.sort((a, b) {
        final da = DateTime.tryParse(ctStr(a, 'created_at')) ?? DateTime(1970);
        final db = DateTime.tryParse(ctStr(b, 'created_at')) ?? DateTime(1970);
        return db.compareTo(da);
      });
    } catch (_) {
      _rows = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, List<Map<String, dynamic>>> _groupByDay() {
    final m = <String, List<Map<String, dynamic>>>{};
    for (final r in _rows) {
      final iso = ctStr(r, 'created_at');
      final d = DateTime.tryParse(iso);
      final key = d == null ? 'Unknown' : '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      m.putIfAbsent(key, () => []).add(r);
    }
    final keys = m.keys.toList()..sort((a, b) => b.compareTo(a));
    return {for (final k in keys) k: m[k]!};
  }

  Future<void> _composer({required String recordType, String title = 'Log communication'}) async {
    final sub = TextEditingController();
    final msg = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: sub, decoration: const InputDecoration(labelText: 'Subject')),
              const SizedBox(height: 12),
              TextField(controller: msg, decoration: const InputDecoration(labelText: 'Message *'), maxLines: 5),
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
    if (msg.text.trim().isEmpty && sub.text.trim().isEmpty) return;
    try {
      await _repo.postCommunication(widget.customerId, {
        'record_type': recordType,
        'subject': sub.text.trim().isEmpty ? null : sub.text.trim(),
        'message': msg.text.trim().isEmpty ? null : msg.text.trim(),
        'object_type': 'customer',
        'object_id': widget.customerId,
        if (widget.workAddressId != null) 'work_address_id': widget.workAddressId,
      });
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final grouped = _groupByDay();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: customerPanel(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _search,
                  style: GoogleFonts.inter(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Search communications…',
                    hintStyle: GoogleFonts.inter(color: AppColors.whiteOverlay(0.35)),
                    prefixIcon: Icon(Icons.search_rounded, color: AppColors.whiteOverlay(0.45)),
                    border: InputBorder.none,
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _filterChip('All', null),
                      const SizedBox(width: 8),
                      _filterChip('Notes', 'note'),
                      const SizedBox(width: 8),
                      _filterChip('Email', 'email'),
                      const SizedBox(width: 8),
                      _filterChip('Phone', 'phone'),
                      const SizedBox(width: 8),
                      _filterChip('Schedule', 'schedule'),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _composer(recordType: 'note', title: 'Add note'),
                        icon: const Icon(Icons.note_add_outlined, size: 18),
                        label: const Text('Note'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.tonalIcon(
                        onPressed: () => _composer(recordType: 'phone', title: 'Log phone call'),
                        icon: const Icon(Icons.phone_callback_outlined, size: 18),
                        label: const Text('Call'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: _loading && _rows.isEmpty
              ? Center(child: CircularProgressIndicator(color: AppColors.primary))
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: _load,
                  child: grouped.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          children: [
                            customerEmptyState(
                              icon: Icons.forum_outlined,
                              title: 'No communications',
                              subtitle: 'Log calls and notes to build a timeline like the web CRM.',
                            ),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          itemCount: grouped.length,
                          itemBuilder: (_, gi) {
                            final day = grouped.keys.elementAt(gi);
                            final items = grouped[day]!;
                            final prettyDay = () {
                              final d = DateTime.tryParse(day);
                              if (d == null) return day;
                              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                              return '${d.day} ${months[d.month - 1]} ${d.year}';
                            }();
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Padding(
                                  padding: EdgeInsets.only(bottom: 8, top: gi == 0 ? 0 : 12),
                                  child: Text(
                                    prettyDay,
                                    style: GoogleFonts.inter(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.8,
                                      color: AppColors.whiteOverlay(0.45),
                                    ),
                                  ),
                                ),
                                ...items.map((r) {
                                  final rt = ctStr(r, 'record_type').toUpperCase();
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: customerPanel(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              metaChip(rt),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: Text(
                                                  ctStr(r, 'subject').isEmpty ? '(no subject)' : ctStr(r, 'subject'),
                                                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                                                  maxLines: 2,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            '${formatIsoDateShort(ctStr(r, 'created_at'))}'
                                                '${ctStr(r, 'created_by_name').isNotEmpty ? ' · ${ctStr(r, 'created_by_name')}' : ''}',
                                            style: GoogleFonts.inter(fontSize: 11, color: AppColors.whiteOverlay(0.4)),
                                          ),
                                          if (ctStr(r, 'message').isNotEmpty) ...[
                                            const SizedBox(height: 8),
                                            Text(
                                              ctStr(r, 'message'),
                                              style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.82), height: 1.4),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                  );
                                }),
                              ],
                            );
                          },
                        ),
                ),
        ),
      ],
    );
  }

  Widget _filterChip(String label, String? type) {
    final sel = _typeFilter == type;
    return FilterChip(
      label: Text(label, style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 12)),
      selected: sel,
      onSelected: (_) {
        setState(() => _typeFilter = type);
        _load();
      },
      selectedColor: AppColors.primary,
      checkmarkColor: AppColors.gradientStart,
      backgroundColor: AppColors.whiteOverlay(0.08),
      side: BorderSide(color: AppColors.whiteOverlay(0.15)),
    );
  }
}
