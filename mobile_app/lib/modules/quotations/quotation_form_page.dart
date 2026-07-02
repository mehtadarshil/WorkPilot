import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import '../../data/repositories/mobile_repository.dart';
import '../../data/repositories/quotations_repository.dart';
import '../../widgets/searchable_select_field.dart';
import 'quotation_helpers.dart';
import 'quotations_list_controller.dart';

/// Create (no args) or edit (`arguments`: quotation id as [int]).
class QuotationFormPage extends StatefulWidget {
  const QuotationFormPage({super.key});

  @override
  State<QuotationFormPage> createState() => _QuotationFormPageState();
}

class _LineRowImage {
  _LineRowImage({
    this.localPath,
    this.storedFilename,
    this.contentType,
    this.originalFilename,
    this.byteSize,
    this.dataUrl,
  });

  final String? localPath;
  final String? storedFilename;
  final String? contentType;
  final String? originalFilename;
  final int? byteSize;
  final String? dataUrl;

  bool get isLocal => localPath != null;

  Uint8List? get memoryBytes {
    if (dataUrl != null && dataUrl!.startsWith('data:')) {
      final comma = dataUrl!.indexOf(',');
      if (comma != -1) {
        try {
          return base64Decode(dataUrl!.substring(comma + 1));
        } catch (_) {}
      }
    }
    return null;
  }
}

class _LineRow {
  _LineRow({
    String desc = '',
    double qty = 1,
    double price = 0,
    List<_LineRowImage> images = const [],
  })  : descC = TextEditingController(text: desc),
        qtyC = TextEditingController(text: qty == qty.roundToDouble() ? '${qty.toInt()}' : '$qty'),
        priceC = TextEditingController(text: '$price'),
        images = List.from(images);

  final TextEditingController descC;
  final TextEditingController qtyC;
  final TextEditingController priceC;
  final List<_LineRowImage> images;

  void dispose() {
    descC.dispose();
    qtyC.dispose();
    priceC.dispose();
  }
}

class _QuotationFormPageState extends State<QuotationFormPage> {
  final _repo = Get.find<QuotationsRepository>();
  final _customersRepo = Get.find<CustomersRepository>();

  int? _editId;
  int? _diaryEventId;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  final _picker = ImagePicker();

  Future<void> _addLinePhotoCamera(int i) async {
    final f = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 2000,
      imageQuality: 85,
    );
    if (f == null) return;
    setState(() {
      _lines[i].images.add(_LineRowImage(localPath: f.path));
    });
  }

  Future<void> _addLinePhotoGallery(int i) async {
    final list = await _picker.pickMultiImage();
    if (list.isEmpty) return;
    setState(() {
      for (final f in list) {
        _lines[i].images.add(_LineRowImage(localPath: f.path));
      }
    });
  }

  List<Map<String, dynamic>> _customers = [];
  int? _customerId;
  List<Map<String, dynamic>> _workAddresses = [];
  int? _workAddressId;

  late DateTime _quotationDate;
  late DateTime _validUntil;
  String _currency = 'USD';
  final _notesC = TextEditingController();
  final _descriptionC = TextEditingController();
  final _taxC = TextEditingController(text: '0');
  final List<_LineRow> _lines = [];
  String _state = 'draft';

  static const _currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'];

  @override
  void initState() {
    super.initState();
    final a = Get.arguments;
    if (a is int) {
      _editId = a;
    } else if (a is Map<String, dynamic>) {
      _diaryEventId = (a['diaryEventId'] as num?)?.toInt();
      _customerId = (a['customerId'] as num?)?.toInt();
    }
    _quotationDate = DateTime.now();
    _validUntil = DateTime.now().add(const Duration(days: 30));
    _lines.add(_LineRow());
    _load();
  }

  @override
  void dispose() {
    _notesC.dispose();
    _descriptionC.dispose();
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
      final settings = await _repo.getQuotationSettings();
      final cust = await _customersRepo.listCustomers(page: 1, limit: 5000);
      final rows = cust['customers'];
      _customers = rows is List
          ? rows.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
          : [];

      if (_editId != null) {
        final q = await _repo.getQuotation(_editId!);
        _customerId = (q['customer_id'] as num?)?.toInt();
        _state = (q['state'] as String?) ?? 'draft';
        _currency = (q['currency'] as String?) ?? 'USD';
        _quotationDate = DateTime.tryParse((q['quotation_date'] as String?) ?? '') ?? DateTime.now();
        _validUntil = DateTime.tryParse((q['valid_until'] as String?) ?? '') ?? _quotationDate.add(const Duration(days: 30));
        _notesC.text = (q['notes'] as String?) ?? '';
        _descriptionC.text = (q['description'] as String?) ?? '';
        _workAddressId = (q['quotation_work_address_id'] as num?)?.toInt();
        final sub = (q['subtotal'] as num?)?.toDouble() ?? 0;
        final tax = (q['tax_amount'] as num?)?.toDouble() ?? 0;
        final tp = sub > 0 ? (tax / sub * 10000).round() / 100 : 0;
        _taxC.text = '$tp';
        for (final l in _lines) {
          l.dispose();
        }
        _lines.clear();
        final items = q['line_items'];
        if (items is List && items.isNotEmpty) {
          for (final e in items) {
            if (e is! Map) continue;
            final m = Map<String, dynamic>.from(e);
            final rawImgs = m['images'];
            final imgs = <_LineRowImage>[];
            if (rawImgs is List) {
              for (final img in rawImgs) {
                if (img is! Map) continue;
                final im = Map<String, dynamic>.from(img);
                imgs.add(_LineRowImage(
                  storedFilename: im['stored_filename'] as String?,
                  originalFilename: im['original_filename'] as String?,
                  contentType: im['content_type'] as String?,
                  byteSize: (im['byte_size'] as num?)?.toInt(),
                  dataUrl: im['data_url'] as String?,
                ));
              }
            }
            _lines.add(
              _LineRow(
                desc: (m['description'] as String?) ?? '',
                qty: (m['quantity'] as num?)?.toDouble() ?? 1,
                price: (m['unit_price'] as num?)?.toDouble() ?? 0,
                images: imgs,
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
        final vd = (settings['default_valid_days'] as num?)?.toInt() ?? 30;
        _validUntil = DateTime.now().add(Duration(days: vd));
        final dtp = (settings['default_tax_percentage'] as num?)?.toDouble() ?? 20.0;
        _taxC.text = '$dtp';
        if (_customerId != null) {
          await _loadWorkAddresses(_customerId!);
        }
        await _prefillNotesFromQuotationVisit();
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

  Future<void> _prefillNotesFromQuotationVisit() async {
    final diaryId = _diaryEventId;
    if (diaryId == null || _notesC.text.trim().isNotEmpty) return;
    try {
      final result = await Get.find<MobileRepository>().fetchDiaryEventDetail(diaryId);
      final notes = result.detail.technicalNotes
          .map((n) => n.notes?.trim() ?? '')
          .where((n) => n.isNotEmpty)
          .toList();
      if (notes.isEmpty) return;
      _notesC.text = notes.join('\n\n');
    } catch (_) {
      // Visit notes are helpful prefill only; quotation creation can continue without them.
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

  Future<void> _save() async {
    if (_customerId == null) {
      setState(() => _error = 'Customer is required.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final validItems = <Map<String, dynamic>>[];
      for (final l in _lines) {
        final d = l.descC.text.trim();
        if (d.isEmpty) continue;

        final listImages = <Map<String, dynamic>>[];
        for (final img in l.images) {
          if (img.storedFilename != null) {
            listImages.add(<String, dynamic>{
              'stored_filename': img.storedFilename,
              'original_filename': img.originalFilename ?? 'image.jpg',
              'content_type': img.contentType ?? 'image/jpeg',
              'byte_size': img.byteSize ?? 0,
            });
          } else if (img.localPath != null) {
            final p = img.localPath!;
            final u = await FlutterImageCompress.compressWithFile(
              p,
              minWidth: 1280,
              minHeight: 1280,
              quality: 68,
              format: CompressFormat.jpeg,
            );
            if (u == null) continue;
            final filename = 'photo_${DateTime.now().millisecondsSinceEpoch}.jpg';
            listImages.add(<String, dynamic>{
              'original_filename': filename,
              'filename': filename,
              'content_type': 'image/jpeg',
              'byte_size': u.length,
              'content_base64': base64Encode(u),
            });
          }
        }

        validItems.add(<String, dynamic>{
          'description': d,
          'quantity': double.tryParse(l.qtyC.text) ?? 1,
          'unit_price': double.tryParse(l.priceC.text) ?? 0,
          'images': listImages,
        });
      }
      if (validItems.isEmpty) {
        setState(() {
          _saving = false;
          _error = 'At least one line item with a description is required.';
        });
        return;
      }
      final qd = _quotationDate.toIso8601String().split('T').first;
      final vu = _validUntil.toIso8601String().split('T').first;
      if (_editId == null) {
        final body = <String, dynamic>{
          'customer_id': _customerId,
          'quotation_date': qd,
          'valid_until': vu,
          'currency': _currency,
          if (_notesC.text.trim().isNotEmpty) 'notes': _notesC.text.trim(),
          if (_descriptionC.text.trim().isNotEmpty) 'description': _descriptionC.text.trim(),
          if (_workAddressId != null) 'quotation_work_address_id': _workAddressId,
          'line_items': validItems,
          'tax_percentage': _taxPct,
        };
        final Map<String, dynamic> created;
        if (_diaryEventId != null) {
          created = await _repo.createQuotationFromDiaryEvent(_diaryEventId!, body);
        } else {
          created = await _repo.createQuotation(body);
        }
        final id = (created['id'] as num?)?.toInt();
        Get.back(result: id);
      } else {
        final body = <String, dynamic>{
          'customer_id': _customerId,
          'quotation_date': qd,
          'valid_until': vu,
          'currency': _currency,
          'notes': _notesC.text.trim().isEmpty ? null : _notesC.text.trim(),
          'description': _descriptionC.text.trim().isEmpty ? null : _descriptionC.text.trim(),
          'state': _state,
          'line_items': validItems,
          'tax_percentage': _taxPct,
          'quotation_work_address_id': _workAddressId,
        };
        await _repo.patchQuotation(_editId!, body);
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
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(
          title: Text(
            _editId == null
                ? (_diaryEventId != null ? 'Create quotation from visit' : 'Create quotation')
                : 'Edit quotation',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: _saving ? null : () => Get.back(),
          ),
          actions: [
            TextButton(
              onPressed: _saving || _loading ? null : _save,
              child: Text('Save', style: GoogleFonts.inter(fontWeight: FontWeight.w800, color: AppColors.slate900)),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
            : Container(
                decoration: BoxDecoration(
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
                        child: Text(_error!, style: GoogleFonts.inter(color: const Color(0xFFFECACA))),
                      ),
                    _panel(
                      child: SearchableSelectField<int>(
                        label: 'Customer *',
                        hint: 'Choose customer',
                        sheetTitle: 'Customer',
                        value: _customerId,
                        enabled: !_saving,
                        decoration: _inputDeco('').copyWith(
                          labelText: 'Customer *',
                          labelStyle: GoogleFonts.inter(color: AppColors.slate500),
                          floatingLabelBehavior: FloatingLabelBehavior.always,
                        ),
                        options: [
                          for (final c in _customers)
                            if ((c['id'] as num?) != null)
                              SelectOption<int>(
                                value: (c['id'] as num).toInt(),
                                label: (c['full_name'] as String?)?.trim().isNotEmpty == true
                                    ? c['full_name'] as String
                                    : 'Customer #${c['id']}',
                              ),
                        ],
                        onChanged: _saving
                            ? null
                            : (v) async {
                                if (v == null) return;
                                setState(() {
                                  _customerId = v;
                                  _workAddressId = null;
                                });
                                await _loadWorkAddresses(v);
                              },
                      ),
                    ),
                    if (_customerId != null) ...[
                      const SizedBox(height: 16),
                      _panel(
                        child: DropdownButtonFormField<int?>(
                          isExpanded: true,
                          initialValue: _workAddressId,
                          dropdownColor: const Color(0xFF1e293b),
                          style: GoogleFonts.inter(color: AppColors.slate900),
                          decoration: _inputDeco('').copyWith(
                            labelText: 'Work / site (optional)',
                            labelStyle: GoogleFonts.inter(color: AppColors.slate500),
                            floatingLabelBehavior: FloatingLabelBehavior.always,
                          ),
                          items: [
                            DropdownMenuItem<int?>(
                              value: null,
                              child: Text('None', style: GoogleFonts.inter(color: AppColors.slate900)),
                            ),
                            for (final w in _workAddresses)
                              DropdownMenuItem<int?>(
                                value: (w['id'] as num?)?.toInt(),
                                child: Text(
                                  '${(w['name'] as String?)?.trim().isNotEmpty == true ? w['name'] : 'Site #${w['id']}'}',
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 1,
                                ),
                              ),
                          ],
                          onChanged: _saving ? null : (v) => setState(() => _workAddressId = v),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: _panel(
                            child: ListTile(
                              title: Text('Quotation date', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12)),
                              subtitle: Text(
                                QuotationHelpers.formatDateIso(_quotationDate.toIso8601String()),
                                style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                              ),
                              trailing: Icon(Icons.calendar_today_rounded, color: Colors.white70, size: 20),
                              onTap: _saving
                                  ? null
                                  : () async {
                                      final d = await showDatePicker(
                                        context: context,
                                        initialDate: _quotationDate,
                                        firstDate: DateTime(2000),
                                        lastDate: DateTime(2100),
                                      );
                                      if (d != null) setState(() => _quotationDate = d);
                                    },
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _panel(
                            child: ListTile(
                              title: Text('Valid until', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12)),
                              subtitle: Text(
                                QuotationHelpers.formatDateIso(_validUntil.toIso8601String()),
                                style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                              ),
                              trailing: Icon(Icons.event_rounded, color: Colors.white70, size: 20),
                              onTap: _saving
                                  ? null
                                  : () async {
                                      final d = await showDatePicker(
                                        context: context,
                                        initialDate: _validUntil,
                                        firstDate: DateTime(2000),
                                        lastDate: DateTime(2100),
                                      );
                                      if (d != null) setState(() => _validUntil = d);
                                    },
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _panel(
                      child: DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _currency,
                        decoration: _inputDeco('Currency'),
                        dropdownColor: const Color(0xFF1e293b),
                        style: GoogleFonts.inter(color: AppColors.slate900),
                        items: [for (final c in _currencies) DropdownMenuItem(value: c, child: Text(c))],
                        onChanged: _saving ? null : (v) => setState(() => _currency = v ?? 'USD'),
                      ),
                    ),
                    if (_editId != null) ...[
                      const SizedBox(height: 16),
                      _panel(
                        child: DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: _state,
                          decoration: _inputDeco('Status'),
                          dropdownColor: const Color(0xFF1e293b),
                          style: GoogleFonts.inter(color: AppColors.slate900),
                          items: [
                            for (final s in QuotationsListController.states)
                              DropdownMenuItem(value: s, child: Text(QuotationHelpers.stateLabel(s))),
                          ],
                          onChanged: _saving ? null : (v) => setState(() => _state = v ?? 'draft'),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    _panel(
                      child: TextField(
                        controller: _descriptionC,
                        enabled: !_saving,
                        maxLines: 3,
                        style: GoogleFonts.inter(color: AppColors.slate900),
                        decoration: _inputDeco('Project description'),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text('Line items', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    for (var i = 0; i < _lines.length; i++) ...[
                      _lineEditor(i),
                      const SizedBox(height: 12),
                    ],
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: _saving ? null : () => setState(() => _lines.add(_LineRow())),
                        icon: Icon(Icons.add_rounded, color: AppColors.primary),
                        label: Text('Add item', style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w700)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _panel(
                      child: TextField(
                        controller: _taxC,
                        enabled: !_saving,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: GoogleFonts.inter(color: AppColors.slate900),
                        decoration: _inputDeco('Tax %'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Subtotal ${QuotationHelpers.formatMoney(_subtotal, _currency)} · Tax ${QuotationHelpers.formatMoney(_taxAmount, _currency)} · Total ${QuotationHelpers.formatMoney(_total, _currency)}',
                      style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w700),
                      softWrap: true,
                    ),
                    const SizedBox(height: 16),
                    _panel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Service notes',
                            style: GoogleFonts.inter(
                              color: AppColors.slate500,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Notes shown on the quotation, PDF, and customer link.',
                            style: GoogleFonts.inter(
                              color: AppColors.slate400,
                              fontSize: 11,
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _notesC,
                            enabled: !_saving,
                            maxLines: 4,
                            style: GoogleFonts.inter(color: AppColors.slate900),
                            decoration: _inputDeco('Add service notes...'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _saving ? null : _save,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: _saving
                          ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.slate900))
                          : Text(
                              _editId == null
                                  ? (_diaryEventId != null ? 'Submit quotation' : 'Create quotation')
                                  : 'Save changes',
                              style: GoogleFonts.inter(fontWeight: FontWeight.w800),
                            ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _panel({required Widget child}) {
    return Material(
      color: AppColors.whiteOverlay(0.08),
      borderRadius: BorderRadius.circular(14),
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), child: child),
    );
  }

  InputDecoration _inputDeco(String hint) {
    return InputDecoration(
      hintText: hint.isEmpty ? null : hint,
      hintStyle: GoogleFonts.inter(color: AppColors.slate400),
      border: InputBorder.none,
    );
  }

  Widget _lineEditor(int i) {
    final l = _lines[i];
    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: l.descC,
            enabled: !_saving,
            style: GoogleFonts.inter(color: AppColors.slate900),
            decoration: _inputDeco('Description'),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: l.qtyC,
                  enabled: !_saving,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: GoogleFonts.inter(color: AppColors.slate900),
                  decoration: _inputDeco('Qty'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: l.priceC,
                  enabled: !_saving,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: GoogleFonts.inter(color: AppColors.slate900),
                  decoration: _inputDeco('Unit price'),
                ),
              ),
              IconButton(
                onPressed: _saving || _lines.length <= 1
                    ? null
                    : () {
                        setState(() {
                          _lines[i].dispose();
                          _lines.removeAt(i);
                        });
                      },
                icon: Icon(Icons.delete_outline_rounded, color: Color(0xFFF87171)),
              ),
            ],
          ),
          if (l.images.isNotEmpty) ...[
            const SizedBox(height: 8),
            SizedBox(
              height: 60,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: l.images.length,
                itemBuilder: (ctx, idx) {
                  final img = l.images[idx];
                  Widget imageWidget;
                  if (img.isLocal) {
                    imageWidget = Image.file(
                      File(img.localPath!),
                      width: 80,
                      height: 60,
                      fit: BoxFit.cover,
                    );
                  } else {
                    final bytes = img.memoryBytes;
                    if (bytes != null) {
                      imageWidget = Image.memory(
                        bytes,
                        width: 80,
                        height: 60,
                        fit: BoxFit.cover,
                      );
                    } else {
                      imageWidget = Container(
                        width: 80,
                        height: 60,
                        color: Colors.white12,
                        child: Icon(Icons.image_outlined, color: Colors.white38),
                      );
                    }
                  }
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: imageWidget,
                        ),
                        Positioned(
                          right: 2,
                          top: 2,
                          child: InkWell(
                            onTap: () => setState(() => l.images.removeAt(idx)),
                            child: Container(
                              padding: const EdgeInsets.all(2),
                              decoration: BoxDecoration(
                                color: Colors.black54,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(Icons.close_rounded, size: 12, color: AppColors.slate900),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              TextButton.icon(
                onPressed: _saving ? null : () => _addLinePhotoCamera(i),
                icon: Icon(Icons.camera_alt_outlined, size: 16, color: Colors.white70),
                label: Text('Camera', style: GoogleFonts.inter(color: Colors.white70, fontSize: 11)),
              ),
              const SizedBox(width: 8),
              TextButton.icon(
                onPressed: _saving ? null : () => _addLinePhotoGallery(i),
                icon: Icon(Icons.photo_library_outlined, size: 16, color: Colors.white70),
                label: Text('Gallery', style: GoogleFonts.inter(color: Colors.white70, fontSize: 11)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
