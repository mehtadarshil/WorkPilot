import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import '../../data/repositories/invoices_repository.dart';
import 'invoice_helpers.dart';

class _LineRow {
  _LineRow({String desc = '', double qty = 1, double price = 0})
    : descC = TextEditingController(text: desc),
      qtyC = TextEditingController(text: qty == qty.roundToDouble() ? '${qty.toInt()}' : '$qty'),
      priceC = TextEditingController(text: '$price');

  final TextEditingController descC;
  final TextEditingController qtyC;
  final TextEditingController priceC;

  void dispose() {
    descC.dispose();
    qtyC.dispose();
    priceC.dispose();
  }
}

/// Create: no args, optional [Map] `{ customerId, work_address_id?, job_id? }`. Edit: [int] id.
class InvoiceFormPage extends StatefulWidget {
  const InvoiceFormPage({super.key});

  @override
  State<InvoiceFormPage> createState() => _InvoiceFormPageState();
}

class _InvoiceFormPageState extends State<InvoiceFormPage> {
  final _repo = Get.find<InvoicesRepository>();
  final _customersRepo = Get.find<CustomersRepository>();

  int? _editId;
  int? _prefillCustomerId;
  int? _prefillWorkId;
  int? _prefillJobId;

  bool _loading = true;
  bool _saving = false;
  String? _error;

  List<Map<String, dynamic>> _customers = [];
  int? _customerId;
  List<Map<String, dynamic>> _workAddresses = [];
  int? _workAddressId;
  bool _workSiteLocked = false;

  List<Map<String, dynamic>> _jobs = [];
  int? _jobId;

  final _invoiceNumberC = TextEditingController();
  late DateTime _invoiceDate;
  late DateTime _dueDate;
  String _currency = 'USD';
  final _notesC = TextEditingController();
  final _descriptionC = TextEditingController();
  final _customerRefC = TextEditingController();
  final _taxC = TextEditingController(text: '0');
  final List<_LineRow> _lines = [];
  String _state = 'draft';
  double _loadedTotalPaid = 0;

  static const _currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

  @override
  void initState() {
    super.initState();
    final a = Get.arguments;
    if (a is int) {
      _editId = a;
    } else if (a is Map) {
      final m = Map<String, dynamic>.from(a);
      _editId = (m['editId'] as num?)?.toInt();
      _prefillCustomerId = (m['customerId'] as num?)?.toInt() ?? (m['customer_id'] as num?)?.toInt();
      _prefillWorkId = (m['work_address_id'] as num?)?.toInt() ?? (m['invoice_work_address_id'] as num?)?.toInt();
      _prefillJobId = (m['job_id'] as num?)?.toInt();
    }
    _invoiceDate = DateTime.now();
    _dueDate = DateTime.now().add(const Duration(days: 30));
    _lines.add(_LineRow());
    _load();
  }

  @override
  void dispose() {
    _invoiceNumberC.dispose();
    _notesC.dispose();
    _descriptionC.dispose();
    _customerRefC.dispose();
    _taxC.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final settings = await _repo.getInvoiceSettings();
      final cust = await _customersRepo.listCustomers(page: 1, limit: 5000);
      final rows = cust['customers'];
      _customers = rows is List
          ? rows.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
          : [];
      _jobs = await _repo.listJobsForPicker();

      if (_editId != null) {
        final inv = await _repo.getInvoice(_editId!);
        _invoiceNumberC.text = (inv['invoice_number'] as String?) ?? '';
        _customerId = (inv['customer_id'] as num?)?.toInt();
        _jobId = (inv['job_id'] as num?)?.toInt();
        _invoiceDate = DateTime.tryParse((inv['invoice_date'] as String?) ?? '') ?? DateTime.now();
        _dueDate = DateTime.tryParse((inv['due_date'] as String?) ?? '') ?? _invoiceDate.add(const Duration(days: 30));
        _currency = (inv['currency'] as String?) ?? 'USD';
        _notesC.text = (inv['notes'] as String?) ?? '';
        _descriptionC.text = (inv['description'] as String?) ?? '';
        _customerRefC.text = (inv['customer_reference'] as String?) ?? '';
        _workAddressId = (inv['invoice_work_address_id'] as num?)?.toInt();
        _workSiteLocked = _workAddressId != null;
        _state = (inv['state'] as String?) ?? 'draft';
        _loadedTotalPaid = (inv['total_paid'] as num?)?.toDouble() ?? 0;
        final sub = (inv['subtotal'] as num?)?.toDouble() ?? 0;
        final tax = (inv['tax_amount'] as num?)?.toDouble() ?? 0;
        final tp = sub > 0 ? (tax / sub * 10000).round() / 100 : 0;
        _taxC.text = '$tp';
        for (final l in _lines) {
          l.dispose();
        }
        _lines.clear();
        final items = inv['line_items'];
        if (items is List && items.isNotEmpty) {
          for (final e in items) {
            if (e is! Map) continue;
            final m = Map<String, dynamic>.from(e);
            _lines.add(
              _LineRow(
                desc: (m['description'] as String?) ?? '',
                qty: (m['quantity'] as num?)?.toDouble() ?? 1,
                price: (m['unit_price'] as num?)?.toDouble() ?? 0,
              ),
            );
          }
        } else {
          _lines.add(_LineRow());
        }
        if (_customerId != null) {
          await _loadWorkAddresses(_customerId!);
        }
      } else {
        _currency = (settings['default_currency'] as String?)?.trim().isNotEmpty == true
            ? settings['default_currency'] as String
            : 'USD';
        final dueDays = (settings['default_due_days'] as num?)?.toInt() ?? 30;
        _dueDate = DateTime.now().add(Duration(days: dueDays));
        final dtp = (settings['default_tax_percentage'] as num?)?.toDouble() ?? 0;
        _taxC.text = '$dtp';
        if (_prefillCustomerId != null) {
          _customerId = _prefillCustomerId;
          _workAddressId = _prefillWorkId;
          _jobId = _prefillJobId;
          await _loadWorkAddresses(_prefillCustomerId!);
        }
      }
      setState(() => _loading = false);
    } on ApiException catch (e) {
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _loadWorkAddresses(int customerId) async {
    try {
      final wa = await _customersRepo.getWorkAddresses(customerId, status: 'active');
      setState(() {
        _workAddresses = wa;
        if (_workAddressId != null && !wa.any((w) => (w['id'] as num?)?.toInt() == _workAddressId)) {
          _workAddressId = null;
        }
      });
    } catch (_) {
      setState(() => _workAddresses = []);
    }
  }

  double get _subtotal {
    var s = 0.0;
    for (final l in _lines) {
      final q = double.tryParse(l.qtyC.text) ?? 0;
      final p = double.tryParse(l.priceC.text) ?? 0;
      s += q * p;
    }
    return s;
  }

  double get _taxPct => double.tryParse(_taxC.text) ?? 0;

  double get _taxAmount => (_subtotal * (_taxPct / 100) * 100).round() / 100;

  double get _total => _subtotal + _taxAmount;

  Future<void> _save({String? targetState}) async {
    if (_customerId == null) {
      setState(() => _error = 'Customer is required.');
      return;
    }
    final validItems = <Map<String, dynamic>>[];
    for (final l in _lines) {
      final d = l.descC.text.trim();
      if (d.isEmpty) continue;
      validItems.add(<String, dynamic>{
        'description': d,
        'quantity': double.tryParse(l.qtyC.text) ?? 1,
        'unit_price': double.tryParse(l.priceC.text) ?? 0,
      });
    }
    if (validItems.isEmpty) {
      setState(() => _error = 'At least one line item with a description is required.');
      return;
    }
    if (_editId != null && _invoiceNumberC.text.trim().isEmpty) {
      setState(() => _error = 'Invoice number is required.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final idStr = _invoiceDate.toIso8601String().split('T').first;
      final ddStr = _dueDate.toIso8601String().split('T').first;
      if (_editId == null) {
        final body = <String, dynamic>{
          'customer_id': _customerId,
          if (_jobId != null) 'job_id': _jobId,
          'invoice_date': idStr,
          'due_date': ddStr,
          'currency': _currency,
          if (_notesC.text.trim().isNotEmpty) 'notes': _notesC.text.trim(),
          if (_descriptionC.text.trim().isNotEmpty) 'description': _descriptionC.text.trim(),
          if (_customerRefC.text.trim().isNotEmpty) 'customer_reference': _customerRefC.text.trim(),
          if (_workAddressId != null) 'invoice_work_address_id': _workAddressId,
          'line_items': validItems,
          'tax_percentage': _taxPct,
          if (targetState != null) 'state': targetState,
        };
        final created = await _repo.createInvoice(body);
        final id = (created['id'] as num?)?.toInt();
        Get.back(result: id);
      } else {
        final body = <String, dynamic>{
          'invoice_number': _invoiceNumberC.text.trim(),
          'customer_id': _customerId,
          'job_id': _jobId,
          'invoice_date': idStr,
          'due_date': ddStr,
          'currency': _currency,
          'notes': _notesC.text.trim().isEmpty ? null : _notesC.text.trim(),
          'description': _descriptionC.text.trim().isEmpty ? null : _descriptionC.text.trim(),
          'customer_reference': _customerRefC.text.trim().isEmpty ? null : _customerRefC.text.trim(),
          'state': _state,
          'total_paid': _loadedTotalPaid,
          'line_items': validItems,
          'tax_percentage': _taxPct,
        };
        await _repo.patchInvoice(_editId!, body);
        Get.back(result: _editId);
      }
    } on ApiException catch (e) {
      setState(() {
        _saving = false;
        _error = e.message;
      });
    } catch (e) {
      setState(() {
        _saving = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text(
            _editId == null ? 'Create invoice' : 'Edit invoice',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: _saving ? null : () => Get.back(),
          ),
          actions: [
            if (_editId == null) ...[
              TextButton(
                onPressed: _saving || _loading ? null : () => _save(targetState: 'issued'),
                child: Text('Issue', style: GoogleFonts.inter(fontWeight: FontWeight.w800, color: Colors.amber)),
              ),
            ],
            TextButton(
              onPressed: _saving || _loading ? null : () => _save(),
              child: Text('Save', style: GoogleFonts.inter(fontWeight: FontWeight.w800, color: Colors.white)),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
            : Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.gradientStart, AppColors.gradientMid, AppColors.gradientEnd],
                  ),
                ),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  children: [
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(_error!, style: GoogleFonts.inter(color: Colors.redAccent)),
                      ),
                    if (_editId != null)
                      TextField(
                        controller: _invoiceNumberC,
                        style: GoogleFonts.inter(color: Colors.white),
                        decoration: const InputDecoration(
                          labelText: 'Invoice number',
                          labelStyle: TextStyle(color: Colors.white70),
                        ),
                      ),
                    if (_editId != null) const SizedBox(height: 16),
                    DropdownButtonFormField<int>(
                      isExpanded: true,
                      initialValue: _customerId,
                      dropdownColor: const Color(0xFF1e293b),
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Customer *',
                        labelStyle: TextStyle(color: Colors.white70),
                        floatingLabelBehavior: FloatingLabelBehavior.always,
                      ),
                      items: [
                        for (final c in _customers)
                          DropdownMenuItem<int>(
                            value: (c['id'] as num?)?.toInt(),
                            child: Text(
                              (c['full_name'] as String?) ?? 'Customer',
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                      ],
                      onChanged: _workSiteLocked
                          ? null
                          : (v) async {
                              setState(() {
                                _customerId = v;
                                _workAddressId = null;
                              });
                              if (v != null) await _loadWorkAddresses(v);
                            },
                    ),
                    if (_workSiteLocked)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'This invoice is tied to a work / site address. Customer cannot be changed here.',
                          style: GoogleFonts.inter(color: const Color(0xFFFBBF24), fontSize: 12),
                        ),
                      ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<int>(
                      isExpanded: true,
                      initialValue: _jobId,
                      dropdownColor: const Color(0xFF1e293b),
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Related job (optional)',
                        labelStyle: TextStyle(color: Colors.white70),
                        floatingLabelBehavior: FloatingLabelBehavior.always,
                      ),
                      items: [
                        const DropdownMenuItem<int>(value: null, child: Text('None')),
                        for (final j in _jobs)
                          DropdownMenuItem<int>(
                            value: (j['id'] as num?)?.toInt(),
                            child: Text(
                              (j['title'] as String?) ?? 'Job',
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                      ],
                      onChanged: (v) => setState(() => _jobId = v),
                    ),
                    const SizedBox(height: 16),
                    if (_customerId != null && !_workSiteLocked) ...[
                      DropdownButtonFormField<int>(
                        isExpanded: true,
                        initialValue: _workAddressId,
                        dropdownColor: const Color(0xFF1e293b),
                        style: GoogleFonts.inter(color: Colors.white),
                        decoration: const InputDecoration(
                          labelText: 'Work / site on invoice (optional)',
                          labelStyle: TextStyle(color: Colors.white70),
                          floatingLabelBehavior: FloatingLabelBehavior.always,
                        ),
                        items: [
                          const DropdownMenuItem<int>(value: null, child: Text('Default billing address')),
                          for (final w in _workAddresses)
                            DropdownMenuItem<int>(
                              value: (w['id'] as num?)?.toInt(),
                              child: Text(
                                '${(w['name'] as String?)?.trim().isNotEmpty == true ? w['name'] : 'Site'} — ${(w['address_line_1'] as String?) ?? ''}',
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                        ],
                        onChanged: (v) => setState(() => _workAddressId = v),
                      ),
                      const SizedBox(height: 16),
                    ],
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Expanded(
                          child: ListTile(
                            title: Text('Invoice date', style: GoogleFonts.inter(color: Colors.white70, fontSize: 12)),
                            subtitle: Text(
                              _invoiceDate.toIso8601String().split('T').first,
                              style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                            ),
                            onTap: () async {
                              final d = await showDatePicker(
                                context: context,
                                initialDate: _invoiceDate,
                                firstDate: DateTime(2000),
                                lastDate: DateTime(2100),
                              );
                              if (d != null) setState(() => _invoiceDate = d);
                            },
                          ),
                        ),
                        Expanded(
                          child: ListTile(
                            title: Text('Due date', style: GoogleFonts.inter(color: Colors.white70, fontSize: 12)),
                            subtitle: Text(
                              _dueDate.toIso8601String().split('T').first,
                              style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                            ),
                            onTap: () async {
                              final d = await showDatePicker(
                                context: context,
                                initialDate: _dueDate,
                                firstDate: DateTime(2000),
                                lastDate: DateTime(2100),
                              );
                              if (d != null) setState(() => _dueDate = d);
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: _currency,
                      dropdownColor: const Color(0xFF1e293b),
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Currency', labelStyle: TextStyle(color: Colors.white70)),
                      items: [for (final c in _currencies) DropdownMenuItem(value: c, child: Text(c))],
                      onChanged: (v) => setState(() => _currency = v ?? 'USD'),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _customerRefC,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Customer reference (optional)',
                        labelStyle: TextStyle(color: Colors.white70),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _descriptionC,
                      maxLines: 3,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Project description',
                        labelStyle: TextStyle(color: Colors.white70),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _notesC,
                      maxLines: 2,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Internal notes',
                        labelStyle: TextStyle(color: Colors.white70),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Text('Line items', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700)),
                        const Spacer(),
                        TextButton(
                          onPressed: () => setState(() => _lines.add(_LineRow())),
                          child: Text('+ Add', style: GoogleFonts.inter(color: AppColors.primary)),
                        ),
                      ],
                    ),
                    for (var i = 0; i < _lines.length; i++) ...[
                      _lineEditor(i),
                      const SizedBox(height: 12),
                    ],
                    const SizedBox(height: 4),
                    TextField(
                      controller: _taxC,
                      keyboardType: TextInputType.number,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Tax %',
                        labelStyle: TextStyle(color: Colors.white70),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Subtotal ${InvoiceHelpers.formatMoney(_subtotal, _currency)} · Tax ${InvoiceHelpers.formatMoney(_taxAmount, _currency)} · Total ${InvoiceHelpers.formatMoney(_total, _currency)}',
                      style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.75), fontSize: 13),
                      softWrap: true,
                    ),
                    if (_editId != null) ...[
                      const SizedBox(height: 20),
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        key: ValueKey<String>(_state),
                        initialValue: _state,
                        dropdownColor: const Color(0xFF1e293b),
                        style: GoogleFonts.inter(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Status', labelStyle: TextStyle(color: Colors.white70)),
                        items: [
                          for (final s in invoiceStatesOrdered)
                            DropdownMenuItem(value: s, child: Text(InvoiceHelpers.stateLabel(s))),
                        ],
                        onChanged: (v) => setState(() => _state = v ?? _state),
                      ),
                    ],
                  ],
                ),
              ),
      ),
    );
  }

  Widget _lineEditor(int i) {
    final l = _lines[i];
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: TextField(
            controller: l.descC,
            style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
            decoration: const InputDecoration(hintText: 'Description', hintStyle: TextStyle(color: Colors.white38)),
          ),
        ),
        const SizedBox(width: 6),
        SizedBox(
          width: 48,
          child: TextField(
            controller: l.qtyC,
            keyboardType: TextInputType.number,
            style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
            decoration: const InputDecoration(hintText: 'Qty', hintStyle: TextStyle(color: Colors.white38)),
          ),
        ),
        const SizedBox(width: 6),
        SizedBox(
          width: 64,
          child: TextField(
            controller: l.priceC,
            keyboardType: TextInputType.number,
            style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
            decoration: const InputDecoration(hintText: 'Price', hintStyle: TextStyle(color: Colors.white38)),
          ),
        ),
        IconButton(
          onPressed: _lines.length <= 1
              ? null
              : () => setState(() {
                  _lines.removeAt(i).dispose();
                }),
          icon: const Icon(Icons.close_rounded, color: Colors.redAccent, size: 20),
        ),
      ],
    );
  }
}
