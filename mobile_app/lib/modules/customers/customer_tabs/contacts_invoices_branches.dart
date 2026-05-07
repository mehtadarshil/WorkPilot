import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../app/routes/app_routes.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/values/app_colors.dart';
import '../../../data/repositories/customers_repository.dart';
import 'helpers.dart';
import 'shell.dart';

const _branchUkCounties = <String>[
  'Bedfordshire', 'Berkshire', 'Bristol', 'Buckinghamshire', 'Cambridgeshire', 'Cheshire', 'Cornwall',
  'Cumbria', 'Derbyshire', 'Devon', 'Dorset', 'Durham', 'East Sussex', 'Essex', 'Gloucestershire',
  'Greater London', 'Greater Manchester', 'Hampshire', 'Herefordshire', 'Hertfordshire', 'Isle of Wight',
  'Kent', 'Lancashire', 'Leicestershire', 'Lincolnshire', 'Merseyside', 'Norfolk', 'North Yorkshire',
  'Northamptonshire', 'Northumberland', 'Nottinghamshire', 'Oxfordshire', 'Shropshire', 'Somerset',
  'South Yorkshire', 'Staffordshire', 'Suffolk', 'Surrey', 'Tyne and Wear', 'Warwickshire', 'West Midlands',
  'West Sussex', 'West Yorkshire', 'Wiltshire', 'Worcestershire',
];

// ─── Contacts ────────────────────────────────────────────────────────────

class CustomerContactsTab extends StatefulWidget {
  const CustomerContactsTab({super.key, required this.customerId, this.workAddressId});

  final int customerId;
  final int? workAddressId;

  @override
  State<CustomerContactsTab> createState() => _CustomerContactsTabState();
}

class _CustomerContactsTabState extends State<CustomerContactsTab> {
  final _repo = Get.find<CustomersRepository>();
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _search.addListener(_scheduleSearch);
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.removeListener(_scheduleSearch);
    _search.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CustomerContactsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workAddressId != widget.workAddressId) {
      _load();
    }
  }

  void _scheduleSearch() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _load);
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final q = _search.text.trim();
      _rows = await _repo.getContacts(
        widget.customerId,
        search: q.isEmpty ? null : q,
        workAddressId: widget.workAddressId,
      );
    } catch (_) {
      _rows = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveSheet({Map<String, dynamic>? existing}) async {
    final titleC = TextEditingController(text: ctStr(existing, 'title'));
    final firstC = TextEditingController(text: ctStr(existing, 'first_name'));
    final surC = TextEditingController(text: ctStr(existing, 'surname'));
    final emailC = TextEditingController(text: ctStr(existing, 'email'));
    final mobileC = TextEditingController(text: ctStr(existing, 'mobile'));
    final landC = TextEditingController(text: ctStr(existing, 'landline'));
    final posC = TextEditingController(text: ctStr(existing, 'position'));
    var primary = existing?['is_primary'] == true;
    final id = (existing?['id'] as num?)?.toInt();

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0f172a),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: StatefulBuilder(
            builder: (ctx, setS) => SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Text(
                        id == null ? 'New contact' : 'Edit contact',
                        style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                      ),
                      const Spacer(),
                      IconButton(onPressed: () => Navigator.pop(ctx, false), icon: const Icon(Icons.close_rounded, color: Colors.white54)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: titleC,
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: customerInputDecoration('Title (Mr / Ms / …)'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: firstC,
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: customerInputDecoration('First name'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: surC,
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: customerInputDecoration('Surname *'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: posC,
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: customerInputDecoration('Position'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: emailC,
                    style: GoogleFonts.inter(color: Colors.white),
                    keyboardType: TextInputType.emailAddress,
                    decoration: customerInputDecoration('Email'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: mobileC,
                    style: GoogleFonts.inter(color: Colors.white),
                    keyboardType: TextInputType.phone,
                    decoration: customerInputDecoration('Mobile'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: landC,
                    style: GoogleFonts.inter(color: Colors.white),
                    keyboardType: TextInputType.phone,
                    decoration: customerInputDecoration('Landline'),
                  ),
                  const SizedBox(height: 8),
                  CheckboxListTile(
                    value: primary,
                    onChanged: (v) => setS(() => primary = v ?? false),
                    title: Text('Primary contact', style: GoogleFonts.inter(color: Colors.white)),
                    activeColor: AppColors.primary,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () {
                      if (surC.text.trim().isEmpty) {
                        Get.snackbar('Validation', 'Surname is required');
                        return;
                      }
                      Navigator.pop(ctx, true);
                    },
                    child: Text(id == null ? 'Create' : 'Save changes'),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
    if (ok != true) return;
    final payload = <String, dynamic>{
      'title': titleC.text.trim().isEmpty ? null : titleC.text.trim(),
      'first_name': firstC.text.trim().isEmpty ? null : firstC.text.trim(),
      'surname': surC.text.trim(),
      'position': posC.text.trim().isEmpty ? null : posC.text.trim(),
      'email': emailC.text.trim().isEmpty ? null : emailC.text.trim(),
      'mobile': mobileC.text.trim().isEmpty ? null : mobileC.text.trim(),
      'landline': landC.text.trim().isEmpty ? null : landC.text.trim(),
      'is_primary': primary,
      'prefers_phone': false,
      'prefers_sms': false,
      'prefers_email': false,
      'prefers_letter': false,
      if (widget.workAddressId != null) 'work_address_id': widget.workAddressId,
    };
    try {
      if (id == null) {
        await _repo.createContact(widget.customerId, payload);
      } else {
        await _repo.updateContact(widget.customerId, id, payload);
      }
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: customerPanel(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _search,
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(
                      hintText: 'Search contacts',
                      hintStyle: GoogleFonts.inter(color: AppColors.whiteOverlay(0.35)),
                      prefixIcon: Icon(Icons.search_rounded, color: AppColors.whiteOverlay(0.45)),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Refresh',
                  onPressed: _load,
                  icon: Icon(Icons.refresh_rounded, color: AppColors.whiteOverlay(0.65)),
                ),
                FilledButton.icon(
                  onPressed: () => _saveSheet(),
                  style: FilledButton.styleFrom(visualDensity: VisualDensity.compact),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: Text('Add', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12)),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: _loading && _rows.isEmpty
              ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: _load,
                  child: _rows.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          children: [
                            customerEmptyState(
                              icon: Icons.people_outline_rounded,
                              title: 'No contacts match your search',
                              subtitle: 'Try another keyword or add a contact.',
                            ),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          itemCount: _rows.length,
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            final name = '${ctStr(r, 'title')} ${ctStr(r, 'first_name')} ${ctStr(r, 'surname')}'.trim();
                            final sub = [
                              if (ctStr(r, 'position').isNotEmpty) ctStr(r, 'position'),
                              if (ctStr(r, 'email').isNotEmpty) ctStr(r, 'email') else ctStr(r, 'mobile'),
                            ].where((e) => e.isNotEmpty).join(' · ');
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: customerPanel(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                child: InkWell(
                                  onTap: () => _saveSheet(existing: r),
                                  borderRadius: BorderRadius.circular(12),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              name.isEmpty ? 'Contact' : name,
                                              style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15),
                                            ),
                                            if (sub.isNotEmpty) ...[
                                              const SizedBox(height: 4),
                                              Text(sub, style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.55))),
                                            ],
                                          ],
                                        ),
                                      ),
                                      if (r['is_primary'] == true)
                                        Padding(
                                          padding: const EdgeInsets.only(left: 8),
                                          child: metaChip('PRIMARY'),
                                        ),
                                      Icon(Icons.chevron_right_rounded, color: AppColors.whiteOverlay(0.35)),
                                    ],
                                  ),
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

// ─── Invoices ─────────────────────────────────────────────────────────────

class CustomerInvoicesTab extends StatefulWidget {
  const CustomerInvoicesTab({super.key, required this.customerId, this.workAddressId});

  final int customerId;
  final int? workAddressId;

  @override
  State<CustomerInvoicesTab> createState() => _CustomerInvoicesTabState();
}

class _CustomerInvoicesTabState extends State<CustomerInvoicesTab> {
  final _repo = Get.find<CustomersRepository>();
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CustomerInvoicesTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workAddressId != widget.workAddressId) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final d = await _repo.listInvoicesForCustomer(
        widget.customerId,
        invoiceWorkAddressId: widget.workAddressId,
      );
      final raw = d['invoices'];
      _rows = raw is List ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList() : [];
    } catch (_) {
      _rows = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return _rows;
    return _rows.where((inv) {
      return ctStr(inv, 'invoice_number').toLowerCase().contains(q) ||
          ctStr(inv, 'job_title').toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _openNewInvoice() async {
    final ok = await Get.toNamed(
      AppRoutes.customerNewInvoice,
      arguments: <String, dynamic>{
        'customerId': widget.customerId,
        if (widget.workAddressId != null) 'work_address_id': widget.workAddressId,
      },
    );
    if (ok == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final list = _filtered;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: customerPanel(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _search,
                  style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Search by invoice # or job…',
                    hintStyle: GoogleFonts.inter(color: AppColors.whiteOverlay(0.35)),
                    prefixIcon: Icon(Icons.search_rounded, color: AppColors.whiteOverlay(0.45)),
                    border: InputBorder.none,
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _openNewInvoice,
                  icon: const Icon(Icons.add_rounded, size: 20),
                  label: Text('Add new invoice', style: GoogleFonts.inter(fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: _loading && _rows.isEmpty
              ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: _load,
                  child: list.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          children: [
                            customerEmptyState(
                              icon: Icons.receipt_long_outlined,
                              title: _rows.isEmpty ? 'No invoices yet' : 'No matches',
                              subtitle: 'Tap “Add new invoice” above or adjust your search.',
                            ),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          itemCount: list.length,
                          itemBuilder: (_, i) {
                            final r = list[i];
                            final paid = r['total_paid'];
                            final total = r['total_amount'];
                            final paidNum = paid is num ? paid.toDouble() : double.tryParse('$paid') ?? 0;
                            final totalNum = total is num ? total.toDouble() : double.tryParse('$total') ?? 0;
                            final partial = paidNum > 0 && paidNum < totalNum;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: customerPanel(
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
                                                ctStr(r, 'invoice_number'),
                                                style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                ctStr(r, 'job_title').isEmpty ? 'Direct invoice' : ctStr(r, 'job_title'),
                                                style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.75)),
                                              ),
                                              const SizedBox(height: 6),
                                              Text(
                                                formatIsoDateShort(ctStr(r, 'invoice_date')),
                                                style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45)),
                                              ),
                                            ],
                                          ),
                                        ),
                                        invoiceStateBadge(ctStr(r, 'state')),
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                    Row(
                                      children: [
                                        Text(
                                          formatGbp(total),
                                          style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.primary),
                                        ),
                                        if (partial) ...[
                                          const SizedBox(width: 8),
                                          Text(
                                            'Paid ${formatGbp(paid)}',
                                            style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFFFBBF24), fontWeight: FontWeight.w600),
                                          ),
                                        ],
                                      ],
                                    ),
                                    if (ctStr(r, 'work_address_name').isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      Text(
                                        ctStr(r, 'work_address_name'),
                                        style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.45)),
                                      ),
                                    ],
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

// ─── Branches ─────────────────────────────────────────────────────────────

class CustomerBranchesTab extends StatefulWidget {
  const CustomerBranchesTab({super.key, required this.customerId});

  final int customerId;

  @override
  State<CustomerBranchesTab> createState() => _CustomerBranchesTabState();
}

class _CustomerBranchesTabState extends State<CustomerBranchesTab> {
  final _repo = Get.find<CustomersRepository>();
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _search.addListener(_scheduleSearch);
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.removeListener(_scheduleSearch);
    _search.dispose();
    super.dispose();
  }

  void _scheduleSearch() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _load);
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final q = _search.text.trim();
      _rows = await _repo.getBranches(widget.customerId, search: q.isEmpty ? null : q);
    } catch (_) {
      _rows = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _branchSheet({Map<String, dynamic>? existing}) async {
    final name = TextEditingController(text: ctStr(existing, 'branch_name'));
    final line1 = TextEditingController(text: ctStr(existing, 'address_line_1'));
    final line2 = TextEditingController(text: ctStr(existing, 'address_line_2'));
    final line3 = TextEditingController(text: ctStr(existing, 'address_line_3'));
    final town = TextEditingController(text: ctStr(existing, 'town'));
    var county = ctStr(existing, 'county');
    if (county.isNotEmpty && !_branchUkCounties.contains(county)) {
      county = '';
    }
    final postcode = TextEditingController(text: ctStr(existing, 'postcode'));
    final id = (existing?['id'] as num?)?.toInt();

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0f172a),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(id == null ? 'New branch' : 'Edit branch', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                const SizedBox(height: 14),
                TextField(controller: name, style: const TextStyle(color: Colors.white), decoration: customerInputDecoration('Branch name *')),
                const SizedBox(height: 10),
                TextField(controller: line1, style: const TextStyle(color: Colors.white), decoration: customerInputDecoration('Address line 1 *')),
                const SizedBox(height: 10),
                TextField(controller: line2, style: const TextStyle(color: Colors.white), decoration: customerInputDecoration('Address line 2')),
                const SizedBox(height: 10),
                TextField(controller: line3, style: const TextStyle(color: Colors.white), decoration: customerInputDecoration('Address line 3')),
                const SizedBox(height: 10),
                TextField(controller: town, style: const TextStyle(color: Colors.white), decoration: customerInputDecoration('Town')),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: county.isEmpty ? null : county,
                  decoration: customerInputDecoration('County'),
                  hint: Text('Select county', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.45))),
                  items: [
                    const DropdownMenuItem<String>(value: null, child: Text('—')),
                    ..._branchUkCounties.map((c) => DropdownMenuItem(value: c, child: Text(c, overflow: TextOverflow.ellipsis))),
                  ],
                  onChanged: (v) => setS(() {
                    county = v ?? '';
                  }),
                ),
                const SizedBox(height: 10),
                TextField(controller: postcode, style: const TextStyle(color: Colors.white), decoration: customerInputDecoration('Postcode')),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: () {
                    if (name.text.trim().isEmpty || line1.text.trim().isEmpty) {
                      Get.snackbar('Validation', 'Branch name and address line 1 are required');
                      return;
                    }
                    Navigator.pop(ctx, true);
                  },
                  child: Text(id == null ? 'Create' : 'Save'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (ok != true) return;
    final body = <String, dynamic>{
      'branch_name': name.text.trim(),
      'address_line_1': line1.text.trim(),
      'address_line_2': line2.text.trim().isEmpty ? null : line2.text.trim(),
      'address_line_3': line3.text.trim().isEmpty ? null : line3.text.trim(),
      'town': town.text.trim().isEmpty ? null : town.text.trim(),
      'county': county.trim().isEmpty ? null : county.trim(),
      'postcode': postcode.text.trim().isEmpty ? null : postcode.text.trim(),
    };
    try {
      if (id == null) {
        await _repo.createBranch(widget.customerId, body);
      } else {
        await _repo.updateBranch(widget.customerId, id, body);
      }
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  Future<void> _delete(int id) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete branch?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)), onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (go != true) return;
    try {
      await _repo.deleteBranch(widget.customerId, id);
      await _load();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: customerPanel(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _search,
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: 'Search branches',
                      hintStyle: GoogleFonts.inter(color: AppColors.whiteOverlay(0.35)),
                      prefixIcon: Icon(Icons.search_rounded, color: AppColors.whiteOverlay(0.45)),
                      border: InputBorder.none,
                    ),
                  ),
                ),
                IconButton(onPressed: _load, icon: Icon(Icons.refresh_rounded, color: AppColors.whiteOverlay(0.65))),
                FilledButton.icon(
                  onPressed: () => _branchSheet(),
                  style: FilledButton.styleFrom(visualDensity: VisualDensity.compact),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: Text('Add', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12)),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: _loading && _rows.isEmpty
              ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: _load,
                  child: _rows.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          children: [
                            customerEmptyState(icon: Icons.domain_outlined, title: 'No branches', subtitle: 'Add a branch to bill or visit a secondary site.'),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          itemCount: _rows.length,
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            final id = (r['id'] as num?)?.toInt() ?? 0;
                            final addr = [ctStr(r, 'address_line_1'), ctStr(r, 'town'), ctStr(r, 'postcode')].where((e) => e.isNotEmpty).join(', ');
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: customerPanel(
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: InkWell(
                                        onTap: () => _branchSheet(existing: r),
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(ctStr(r, 'branch_name'), style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                                            const SizedBox(height: 6),
                                            Text(addr, style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.65), height: 1.3)),
                                          ],
                                        ),
                                      ),
                                    ),
                                    IconButton(icon: const Icon(Icons.edit_outlined, size: 20), color: AppColors.primary, onPressed: () => _branchSheet(existing: r)),
                                    IconButton(icon: const Icon(Icons.delete_outline_rounded, size: 20), color: const Color(0xFFFCA5A5), onPressed: () => _delete(id)),
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
