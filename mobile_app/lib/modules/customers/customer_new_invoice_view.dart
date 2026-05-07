import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import 'customer_tabs/helpers.dart';
import 'customer_tabs/shell.dart';

class _LineRow {
  _LineRow() : desc = TextEditingController(), qty = TextEditingController(text: '1'), unit = TextEditingController();

  final TextEditingController desc;
  final TextEditingController qty;
  final TextEditingController unit;

  void dispose() {
    desc.dispose();
    qty.dispose();
    unit.dispose();
  }
}

/// Create invoice via `POST /invoices` (same core payload as web new invoice).
class CustomerNewInvoiceView extends StatefulWidget {
  const CustomerNewInvoiceView({super.key});

  @override
  State<CustomerNewInvoiceView> createState() => _CustomerNewInvoiceViewState();
}

class _CustomerNewInvoiceViewState extends State<CustomerNewInvoiceView> {
  final _repo = Get.find<CustomersRepository>();
  late final int _customerId;
  int? _workAddressId;

  Map<String, dynamic>? _customer;
  Map<String, dynamic>? _workAddress;
  bool _loading = true;
  bool _saving = false;
  String? _pageError;

  DateTime _invoiceDate = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
  DateTime _dueDate = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day).add(const Duration(days: 30));

  final _description = TextEditingController();
  final _notes = TextEditingController();
  final _reference = TextEditingController();
  final _taxPct = TextEditingController(text: '20');
  final List<_LineRow> _lines = [_LineRow()];

  @override
  void initState() {
    super.initState();
    final a = Get.arguments;
    if (a is int) {
      _customerId = a;
    } else if (a is Map) {
      final m = Map<String, dynamic>.from(a);
      _customerId = (m['customerId'] as num?)?.toInt() ?? (m['id'] as num?)?.toInt() ?? 0;
      _workAddressId = (m['work_address_id'] as num?)?.toInt() ?? (m['invoice_work_address_id'] as num?)?.toInt();
    } else {
      _customerId = 0;
    }
    _load();
  }

  @override
  void dispose() {
    _description.dispose();
    _notes.dispose();
    _reference.dispose();
    _taxPct.dispose();
    for (final r in _lines) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    if (_customerId <= 0) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      _customer = await _repo.getCustomer(_customerId);
      if (_workAddressId != null) {
        _workAddress = await _repo.getWorkAddress(_customerId, _workAddressId!);
      } else {
        _workAddress = null;
      }
    } catch (_) {
      _customer = null;
      _workAddress = null;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _addLine() {
    setState(() => _lines.add(_LineRow()));
  }

  void _removeLine(int i) {
    if (_lines.length <= 1) return;
    setState(() {
      _lines.removeAt(i).dispose();
    });
  }

  String _isoDate(DateTime d) => DateTime.utc(d.year, d.month, d.day, 12).toIso8601String();

  Future<void> _submit(String state) async {
    final desc = _description.text.trim();
    if (desc.isEmpty) {
      setState(() => _pageError = 'Description is required.');
      return;
    }
    final tax = double.tryParse(_taxPct.text.trim()) ?? 20;
    final items = <Map<String, dynamic>>[];
    for (final r in _lines) {
      final d = r.desc.text.trim();
      final q = double.tryParse(r.qty.text.trim()) ?? 1;
      final u = double.tryParse(r.unit.text.trim()) ?? 0;
      if (d.isNotEmpty && u > 0) {
        items.add({'description': d, 'quantity': q, 'unit_price': u});
      }
    }
    if (items.isEmpty) {
      setState(() => _pageError = 'Add at least one line with description and unit price.');
      return;
    }

    setState(() {
      _saving = true;
      _pageError = null;
    });
    try {
      await _repo.createInvoice({
        'customer_id': _customerId,
        if (_workAddressId != null) 'invoice_work_address_id': _workAddressId,
        'invoice_date': _isoDate(_invoiceDate),
        'due_date': _isoDate(_dueDate),
        'description': desc,
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        'customer_reference': _reference.text.trim().isEmpty ? null : _reference.text.trim(),
        'tax_percentage': tax.clamp(0, 100),
        'state': state,
        'line_items': items,
      });
      Get.back(result: true);
    } on ApiException catch (e) {
      setState(() {
        _saving = false;
        _pageError = e.message;
      });
    } catch (e) {
      setState(() {
        _saving = false;
        _pageError = e.toString();
      });
    }
  }

  Future<void> _pickInvoiceDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _invoiceDate,
      firstDate: DateTime(DateTime.now().year - 2),
      lastDate: DateTime(DateTime.now().year + 3),
    );
    if (d != null) setState(() => _invoiceDate = d);
  }

  Future<void> _pickDueDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _dueDate,
      firstDate: DateTime(DateTime.now().year - 2),
      lastDate: DateTime(DateTime.now().year + 5),
    );
    if (d != null) setState(() => _dueDate = d);
  }

  TextStyle _label() => GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.5,
        color: AppColors.whiteOverlay(0.5),
      );

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: AppColors.gradientStart,
          appBar: AppBar(title: Text('New invoice', style: GoogleFonts.inter(fontWeight: FontWeight.w700))),
          body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        ),
      );
    }
    if (_customerId <= 0 || _customer == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Invoice')),
        body: const Center(child: Text('Invalid customer')),
      );
    }

    final cust = _customer!;
    final addr = [ctStr(cust, 'address_line_1'), ctStr(cust, 'town'), ctStr(cust, 'postcode')].where((e) => e.isNotEmpty).join(', ');

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text('Add invoice', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: _saving ? null : () => Get.back(),
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
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              customerPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ctStr(cust, 'full_name'), style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
                    if (addr.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(addr, style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.65))),
                    ],
                    if (_workAddress != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        'Site: ${ctStr(_workAddress!, 'name')}',
                        style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w700, color: const Color(0xFFFBBF24)),
                      ),
                      Text(
                        [ctStr(_workAddress!, 'address_line_1'), ctStr(_workAddress!, 'town'), ctStr(_workAddress!, 'postcode')].where((e) => e.isNotEmpty).join(', '),
                        style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.65)),
                      ),
                    ],
                  ],
                ),
              ),
              if (_pageError != null && _pageError!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: customerPanel(
                    padding: const EdgeInsets.all(12),
                    child: Text(_pageError!, style: GoogleFonts.inter(color: const Color(0xFFFECACA), fontWeight: FontWeight.w600)),
                  ),
                ),
              customerSectionHeader('Details'),
              customerPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('DESCRIPTION *', style: _label()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _description,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('Invoice description'),
                    ),
                    const SizedBox(height: 12),
                    Text('NOTES', style: _label()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _notes,
                      enabled: !_saving,
                      maxLines: 3,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('Optional'),
                    ),
                    const SizedBox(height: 12),
                    Text('CUSTOMER REFERENCE', style: _label()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _reference,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('PO / ref'),
                    ),
                    const SizedBox(height: 12),
                    Text('VAT %', style: _label()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _taxPct,
                      enabled: !_saving,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('20'),
                    ),
                    const SizedBox(height: 12),
                    Text('INVOICE DATE', style: _label()),
                    const SizedBox(height: 6),
                    OutlinedButton(
                      onPressed: _saving ? null : _pickInvoiceDate,
                      child: Text(
                        '${_invoiceDate.year}-${_invoiceDate.month.toString().padLeft(2, '0')}-${_invoiceDate.day.toString().padLeft(2, '0')}',
                        style: GoogleFonts.inter(color: Colors.white),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text('DUE DATE', style: _label()),
                    const SizedBox(height: 6),
                    OutlinedButton(
                      onPressed: _saving ? null : _pickDueDate,
                      child: Text(
                        '${_dueDate.year}-${_dueDate.month.toString().padLeft(2, '0')}-${_dueDate.day.toString().padLeft(2, '0')}',
                        style: GoogleFonts.inter(color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
              customerSectionHeader('Line items'),
              customerPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < _lines.length; i++) ...[
                      if (i > 0) Divider(color: AppColors.whiteOverlay(0.08)),
                      Row(
                        children: [
                          Expanded(
                            flex: 3,
                            child: TextField(
                              controller: _lines[i].desc,
                              enabled: !_saving,
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                              decoration: customerInputDecoration('Description'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          SizedBox(
                            width: 52,
                            child: TextField(
                              controller: _lines[i].qty,
                              enabled: !_saving,
                              keyboardType: TextInputType.number,
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                              decoration: customerInputDecoration('Qty'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 2,
                            child: TextField(
                              controller: _lines[i].unit,
                              enabled: !_saving,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                              decoration: customerInputDecoration('Price'),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close_rounded, color: Color(0xFFFCA5A5)),
                            onPressed: _saving ? null : () => _removeLine(i),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: _saving ? null : _addLine,
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: const Text('Add line'),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving ? null : () => _submit('draft'),
                      child: Text(_saving ? '…' : 'Save draft'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _saving ? null : () => _submit('issued'),
                      child: Text(_saving ? 'Saving…' : 'Issue'),
                    ),
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
