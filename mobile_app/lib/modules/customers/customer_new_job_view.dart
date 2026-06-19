import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../core/utils/text_formatters.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import '../../data/repositories/jobs_repository.dart';
import '../../data/repositories/quotations_repository.dart';
import '../../widgets/searchable_select_field.dart';
import 'customer_new_job_customer_panel.dart';
import 'customer_new_job_pricing_panel.dart';
import 'customer_new_job_pricing_row.dart';
import 'customer_new_job_schedule_section.dart';
import 'customer_new_job_service_section.dart';
import 'customer_tabs/helpers.dart';
import 'customer_tabs/shell.dart';

/// Same fields and submit payload as web `customers/[id]/jobs/new` (create only).
class CustomerNewJobView extends StatefulWidget {
  const CustomerNewJobView({super.key});

  @override
  State<CustomerNewJobView> createState() => _CustomerNewJobViewState();
}

class _CustomerNewJobViewState extends State<CustomerNewJobView> {
  static const _pipelines = <String>[
    'Service/Reactive Workflow',
    'Installation Workflow',
    'Emergency Workflow',
    'Maintenance Workflow',
  ];
  static const _fallbackUserGroups = ['Field Engineers', 'Senior Technicians', 'Apprentices', 'Subcontractors'];
  static const _fallbackBusinessUnits = ['Service & Maintenance', 'Installation', 'Emergency', 'Consultation'];
  static const _reminderUnits = ['days', 'weeks', 'months', 'years'];

  final _repo = Get.find<CustomersRepository>();

  late int _customerId;
  int? _workAddressId;
  int? _fromQuotationId;
  int? _editVisitId;
  bool _convertVisit = false;
  bool _customerLocked = false;

  Map<String, dynamic>? _customer;
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _workAddresses = [];
  List<Map<String, dynamic>> _jobDescriptions = [];
  List<Map<String, dynamic>> _contacts = [];
  List<Map<String, dynamic>> _businessUnits = [];
  List<Map<String, dynamic>> _userGroups = [];
  List<Map<String, dynamic>> _serviceChecklist = [];

  bool _loading = true;
  bool _saving = false;
  String? _pageError;

  int? _jobContactId;
  final _contactName = TextEditingController();
  int? _descriptionId;
  final _skills = TextEditingController();
  final _jobNotes = TextEditingController();
  bool _isServiceJob = false;
  final _reminderFrequency = TextEditingController();
  String _reminderUnit = 'years';

  DateTime? _expectedDate;
  TimeOfDay? _expectedTime;
  String _priority = 'medium';
  String? _userGroup;
  String? _businessUnit;
  bool _bookIntoDiary = true;

  final _quotedAmount = TextEditingController();
  final _customerReference = TextEditingController();
  String _jobPipeline = 'Service/Reactive Workflow';

  final List<CustomerNewJobPricingRow> _pricingRows = [];
  final Set<String> _completedServiceItems = {};
  int _piKey = 0;

  @override
  void initState() {
    super.initState();
    final a = Get.arguments;
    if (a is int) {
      _customerId = a;
      _customerLocked = true;
    } else if (a is Map) {
      final m = Map<String, dynamic>.from(a);
      _customerId = (m['customerId'] as num?)?.toInt() ?? (m['id'] as num?)?.toInt() ?? 0;
      _workAddressId = (m['work_address_id'] as num?)?.toInt();
      _fromQuotationId = (m['from_quotation'] as num?)?.toInt();
      _editVisitId = (m['edit_visit_id'] as num?)?.toInt();
      _convertVisit = m['convert_visit'] == true;
      _customerLocked = _customerId > 0;
    } else {
      _customerId = 0;
    }
    _load();
  }

  @override
  void dispose() {
    _contactName.dispose();
    _skills.dispose();
    _jobNotes.dispose();
    _reminderFrequency.dispose();
    _quotedAmount.dispose();
    _customerReference.dispose();
    for (final r in _pricingRows) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _pageError = null;
    });
    try {
      final customerData = await _repo.listCustomers(page: 1, limit: 5000);
      final rawCustomers = customerData['customers'];
      final customers = rawCustomers is List
          ? rawCustomers.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
          : <Map<String, dynamic>>[];
      final descs = await _repo.listJobDescriptions();
      final bu = await _repo.listBusinessUnits();
      final ug = await _repo.listUserGroups();
      final sc = await _repo.listServiceChecklistItems();

      Map<String, dynamic>? cust;
      var contacts = <Map<String, dynamic>>[];
      var workAddresses = <Map<String, dynamic>>[];
      if (_customerId > 0) {
        cust = await _repo.getCustomer(_customerId);
        workAddresses = await _repo.getWorkAddresses(_customerId);
        if (_workAddressId != null && !workAddresses.any((w) => (w['id'] as num?)?.toInt() == _workAddressId)) {
          _workAddressId = null;
        }
        contacts = await _repo.getContacts(
          _customerId,
          workAddressId: _workAddressId,
        );

        final cn = '${ctStr(cust, 'contact_first_name')} ${ctStr(cust, 'contact_surname')}'.trim();
        if (_contactName.text.trim().isEmpty) {
          _contactName.text = cn.isNotEmpty ? cn : ctStr(cust, 'full_name');
        }
      }

      setState(() {
        _customer = cust;
        _customers = customers;
        _workAddresses = workAddresses;
        _jobDescriptions = descs;
        _businessUnits = bu;
        _userGroups = ug;
        _serviceChecklist = sc;
        _contacts = contacts;
        _loading = false;
      });
      await _prefillFromVisit();
      await _prefillFromQuotation();
    } on ApiException catch (e) {
      setState(() {
        _loading = false;
        _pageError = e.message;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _pageError = e.toString();
      });
    }
  }

  Future<void> _prefillFromVisit() async {
    final visitId = _editVisitId;
    if (visitId == null) return;
    try {
      final job = await Get.find<JobsRepository>().getJob(visitId);
      _jobContactId = (job['job_contact_id'] as num?)?.toInt();
      _contactName.text = (job['contact_name'] as String?)?.trim() ?? _contactName.text;
      _descriptionId = (job['job_description_id'] as num?)?.toInt();
      _skills.text = (job['skills'] as String?)?.trim() ?? '';
      _jobNotes.text = (job['job_notes'] as String?)?.trim() ?? _jobNotes.text;
      _isServiceJob = job['is_service_job'] == true;
      final ec = job['expected_completion'] as String?;
      if (ec != null && ec.isNotEmpty) {
        final dt = DateTime.tryParse(ec);
        if (dt != null) {
          _expectedDate = DateTime(dt.year, dt.month, dt.day);
          _expectedTime = TimeOfDay(hour: dt.hour, minute: dt.minute);
        }
      }
      _priority = (job['priority'] as String?)?.trim().isNotEmpty == true ? (job['priority'] as String) : _priority;
      _userGroup = (job['user_group'] as String?)?.trim();
      _businessUnit = (job['business_unit'] as String?)?.trim();
      _bookIntoDiary = job['book_into_diary'] != false;
      final qa = (job['quoted_amount'] as num?)?.toDouble();
      if (qa != null) _quotedAmount.text = qa.toStringAsFixed(2);
      _customerReference.text = (job['customer_reference'] as String?)?.trim() ?? _customerReference.text;
      _jobPipeline = (job['job_pipeline'] as String?)?.trim().isNotEmpty == true
          ? (job['job_pipeline'] as String)
          : _jobPipeline;
      final wa = (job['work_address_id'] as num?)?.toInt();
      if (wa != null) _workAddressId = wa;
      final pricing = job['pricing_items'];
      if (pricing is List && pricing.isNotEmpty) {
        for (final r in _pricingRows) {
          r.dispose();
        }
        _pricingRows.clear();
        for (final raw in pricing) {
          if (raw is! Map) continue;
          final m = Map<String, dynamic>.from(raw);
          _pricingRows.add(
            CustomerNewJobPricingRow(
              key: 'pi_${_piKey++}',
              itemName: (m['item_name'] as String?) ?? '',
              timeIncluded: (m['time_included'] as num?)?.toDouble() ?? 0,
              unitPrice: (m['unit_price'] as num?)?.toDouble() ?? 0,
              vatRate: (m['vat_rate'] as num?)?.toDouble() ?? 20,
              quantity: (m['quantity'] as num?)?.round() ?? 1,
            ),
          );
        }
      }
      if (mounted) setState(() {});
    } catch (_) {}
  }

  Future<void> _prefillFromQuotation() async {
    final qid = _fromQuotationId;
    if (qid == null) return;
    try {
      final qr = Get.find<QuotationsRepository>();
      final q = await qr.getQuotation(qid);
      if ((q['customer_id'] as num?)?.toInt() != _customerId) {
        if (mounted) setState(() => _pageError = 'This quotation does not belong to this customer.');
        return;
      }
      final tot = (q['total_amount'] as num?)?.toDouble();
      if (tot != null) _quotedAmount.text = tot.toStringAsFixed(2);
      final qn = (q['quotation_number'] as String?)?.trim();
      if (qn != null && qn.isNotEmpty) _customerReference.text = qn;
      final desc = (q['description'] as String?)?.trim();
      final notes = (q['notes'] as String?)?.trim();
      final buf = StringBuffer('Prefilled from quotation ${q['quotation_number']}.');
      if (desc != null && desc.isNotEmpty) {
        buf.writeln();
        buf.writeln(desc);
      }
      if (notes != null && notes.isNotEmpty) {
        buf.writeln();
        buf.writeln('Quotation notes:');
        buf.writeln(notes);
      }
      final base = buf.toString();
      final existing = _jobNotes.text.trim();
      if (existing.isEmpty || !existing.contains('Prefilled from quotation')) {
        _jobNotes.text = existing.isEmpty ? base : '$base\n\n$existing';
      }
      if (mounted) setState(() {});
    } catch (_) {}
  }

  List<String> get _userGroupChoices {
    final names = _userGroups.map((g) => ctStr(g, 'name')).where((n) => n.isNotEmpty).toSet().toList()..sort();
    if (names.isEmpty) return List.from(_fallbackUserGroups);
    return names;
  }

  List<String> get _businessUnitChoices {
    final names = _businessUnits.map((u) => ctStr(u, 'name')).where((n) => n.isNotEmpty).toSet().toList()..sort();
    if (names.isEmpty) return List.from(_fallbackBusinessUnits);
    return names;
  }

  List<SelectOption<int>> get _customerOptions {
    final seen = <int>{};
    return [
      for (final c in _customers)
        if ((c['id'] as num?)?.toInt() case final id? when seen.add(id))
          SelectOption<int>(
            value: id,
            label: ctStr(c, 'full_name').isNotEmpty ? ctStr(c, 'full_name') : 'Customer #$id',
          ),
    ];
  }

  List<SelectOption<int>> get _workAddressOptions {
    final seen = <int>{};
    return [
      for (final w in _workAddresses)
        if ((w['id'] as num?)?.toInt() case final id? when seen.add(id))
          SelectOption<int>(
            value: id,
            label: _workAddressLabel(w, fallback: 'Site #$id'),
          ),
    ];
  }

  Map<String, dynamic>? get _selectedWorkAddress {
    final id = _workAddressId;
    if (id == null) return null;
    for (final row in _workAddresses) {
      if ((row['id'] as num?)?.toInt() == id) return row;
    }
    return null;
  }

  String _workAddressLabel(Map<String, dynamic> row, {String fallback = 'Site'}) {
    final name = ctStr(row, 'name');
    final address = [
      ctStr(row, 'address_line_1'),
      ctStr(row, 'address_line_2'),
      ctStr(row, 'address_line_3'),
      ctStr(row, 'town'),
      ctStr(row, 'county'),
      ctStr(row, 'postcode'),
    ].where((e) => e.isNotEmpty).join(', ');
    if (name.isNotEmpty && address.isNotEmpty) return '$name — $address';
    if (name.isNotEmpty) return name;
    if (address.isNotEmpty) return address;
    return fallback;
  }

  Future<void> _onCustomerChanged(int? id) async {
    if (id == null || id == _customerId) return;
    setState(() {
      _customerId = id;
      _workAddressId = null;
      _customer = null;
      _workAddresses = [];
      _contacts = [];
      _jobContactId = null;
      _contactName.clear();
    });
    await _load();
  }

  Future<void> _onWorkAddressChanged(int? id) async {
    if (id == _workAddressId) return;
    setState(() {
      _workAddressId = id;
      _contacts = [];
      _jobContactId = null;
    });
    await _load();
  }

  Future<void> _onDescriptionChanged(int? id) async {
    setState(() => _descriptionId = id);
    if (id == null) {
      _skills.clear();
      _jobNotes.clear();
      _isServiceJob = false;
      _reminderFrequency.clear();
      _reminderUnit = 'years';
      _priority = 'medium';
      _businessUnit = null;
      for (final r in _pricingRows) {
        r.dispose();
      }
      _pricingRows.clear();
      _completedServiceItems.clear();
      setState(() {});
      return;
    }
    try {
      final desc = await _repo.getJobDescription(id);
      _skills.text = ctStr(desc, 'default_skills');
      _jobNotes.text = ctStr(desc, 'default_job_notes');
      _isServiceJob = desc['is_service_job'] == true;
      if (_isServiceJob) {
        final fq = desc['service_reminder_frequency'];
        _reminderFrequency.text = fq == null ? '' : '$fq';
        _reminderUnit = ctStr(desc, 'service_reminder_unit');
        if (_reminderUnit.isEmpty) _reminderUnit = 'years';
      } else {
        _reminderFrequency.clear();
        _reminderUnit = 'years';
        _completedServiceItems.clear();
      }
      _priority = ctStr(desc, 'default_priority').isEmpty ? 'medium' : ctStr(desc, 'default_priority');
      final dbu = ctStr(desc, 'default_business_unit');
      _businessUnit = dbu.isEmpty ? null : dbu;

      for (final r in _pricingRows) {
        r.dispose();
      }
      _pricingRows.clear();
      final raw = desc['pricing_items'];
      if (raw is List) {
        for (final e in raw) {
          if (e is! Map) continue;
          final m = Map<String, dynamic>.from(e);
          final up = (m['unit_price'] as num?)?.toDouble() ?? 0;
          final qty = (m['quantity'] as num?)?.toInt() ?? 1;
          _pricingRows.add(
            CustomerNewJobPricingRow(
              key: 'pi_${++_piKey}_${DateTime.now().millisecondsSinceEpoch}',
              itemName: ctStr(m, 'item_name'),
              timeIncluded: (m['time_included'] as num?)?.toDouble() ?? 0,
              unitPrice: up,
              vatRate: (m['vat_rate'] as num?)?.toDouble() ?? 20,
              quantity: qty,
            ),
          );
        }
      }
      if (_fromQuotationId != null) {
        await _prefillFromQuotation();
      }
      setState(() {});
    } catch (_) {
      setState(() {});
    }
  }

  void _addPricingRow() {
    setState(() {
      _pricingRows.add(
        CustomerNewJobPricingRow(
          key: 'pi_${++_piKey}_${DateTime.now().millisecondsSinceEpoch}',
          itemName: '',
          timeIncluded: 0,
          unitPrice: 0,
          vatRate: 20,
          quantity: 1,
        ),
      );
    });
  }

  void _removePricingRow(String key) {
    final removed = _pricingRows.where((r) => r.key == key).toList();
    setState(() => _pricingRows.removeWhere((r) => r.key == key));
    for (final r in removed) {
      r.dispose();
    }
  }

  double get _pricingGrandTotal => _pricingRows.fold<double>(0, (s, r) => s + r.lineTotal);

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _expectedDate ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (d != null) setState(() => _expectedDate = d);
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(
      context: context,
      initialTime: _expectedTime ?? const TimeOfDay(hour: 9, minute: 0),
    );
    if (t != null) setState(() => _expectedTime = t);
  }

  String? _expectedCompletionIso() {
    if (_expectedDate == null) return null;
    final d = _expectedDate!;
    final t = _expectedTime ?? const TimeOfDay(hour: 23, minute: 59);
    final dt = DateTime(d.year, d.month, d.day, t.hour, t.minute);
    return dt.toIso8601String();
  }

  Future<void> _submit() async {
    if (_customerId <= 0) {
      setState(() => _pageError = 'Please choose a customer.');
      return;
    }
    if (_descriptionId == null) {
      setState(() => _pageError = 'Please choose a job description.');
      return;
    }
    if (_bookIntoDiary && (_expectedDate == null || _expectedTime == null)) {
      setState(() => _pageError = 'Pick a diary visit date and time, or turn off Book into diary.');
      return;
    }
    var titleStr = 'New Job';
    for (final d in _jobDescriptions) {
      if ((d['id'] as num?)?.toInt() == _descriptionId) {
        final n = ctStr(d, 'name');
        if (n.isNotEmpty) titleStr = n;
        break;
      }
    }

    setState(() {
      _saving = true;
      _pageError = null;
    });
    try {
      final body = <String, dynamic>{
        'title': titleStr,
        'job_description_id': _descriptionId,
        'contact_name': _contactName.text.trim(),
        'job_contact_id': _jobContactId,
        'expected_completion': _expectedCompletionIso(),
        'priority': _priority,
        'user_group': _userGroup?.trim().isEmpty ?? true ? null : _userGroup?.trim(),
        'business_unit': _businessUnit?.trim().isEmpty ?? true ? null : _businessUnit?.trim(),
        'skills': _skills.text.trim(),
        'job_notes': _jobNotes.text.trim(),
        'is_service_job': _isServiceJob,
        'service_reminder_frequency': _isServiceJob && _reminderFrequency.text.trim().isNotEmpty
            ? int.tryParse(_reminderFrequency.text.trim())
            : null,
        'service_reminder_unit': _isServiceJob ? _reminderUnit : null,
        'completed_service_items': _isServiceJob ? _completedServiceItems.toList() : <String>[],
        'quoted_amount': _quotedAmount.text.trim().isEmpty ? null : double.tryParse(_quotedAmount.text.trim()),
        'customer_reference': _customerReference.text.trim().isEmpty ? null : _customerReference.text.trim(),
        'job_pipeline': _jobPipeline,
        'book_into_diary': _bookIntoDiary,
        'pricing_items': _pricingRows
            .where((r) => r.itemName.trim().isNotEmpty)
            .map(
              (r) => {
                'item_name': r.itemName.trim(),
                'time_included': r.timeIncluded.round(),
                'unit_price': r.unitPrice,
                'vat_rate': r.vatRate,
                'quantity': r.quantity,
              },
            )
            .toList(),
        if (_workAddressId != null) 'work_address_id': _workAddressId,
      };

      if (_convertVisit && _editVisitId != null) {
        await Get.find<JobsRepository>().convertToWorkJob(_editVisitId!, body);
        Get.offNamed(AppRoutes.jobDetail, arguments: _editVisitId);
        return;
      }

      final job = await _repo.createCustomerJob(_customerId, body);
      final newJobId = (job['id'] as num?)?.toInt();
      if (_fromQuotationId != null && newJobId != null) {
        try {
          await Get.find<QuotationsRepository>().linkJobToQuotation(_fromQuotationId!, newJobId);
        } on ApiException catch (e) {
          setState(() {
            _saving = false;
            _pageError = '${e.message} (job was created)';
          });
          return;
        }
      }
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

  void _onJobContactChanged(int? id) {
    setState(() {
      _jobContactId = id;
      if (id != null) {
        Map<String, dynamic>? row;
        for (final c in _contacts) {
          if ((c['id'] as num?)?.toInt() == id) {
            row = c;
            break;
          }
        }
        if (row != null) {
          final nm = '${ctStr(row, 'title')} ${ctStr(row, 'first_name')} ${ctStr(row, 'surname')}'.trim();
          _contactName.text = nm.isNotEmpty ? nm : ctStr(row, 'surname');
        }
      }
    });
  }

  String get _pageTitle {
    if (_convertVisit && _editVisitId != null) return 'Set up work job';
    return 'Add new job';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: AppColors.gradientStart,
          appBar: AppBar(title: Text(_pageTitle, style: GoogleFonts.inter(fontWeight: FontWeight.w700))),
          body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        ),
      );
    }

    final activeChecklist = _serviceChecklist.where((i) => i['is_active'] == true).toList();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text(_pageTitle, style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
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
              CustomerNewJobCustomerPanel(
                customer: _customer,
                selectedWorkAddress: _selectedWorkAddress,
                customerId: _customerId,
                customerLocked: _customerLocked,
                saving: _saving,
                customerOptions: _customerOptions,
                workAddressOptions: _workAddressOptions,
                workAddressId: _workAddressId,
                workAddresses: _workAddresses,
                onCustomerChanged: _onCustomerChanged,
                onWorkAddressChanged: _onWorkAddressChanged,
              ),
              if (_pageError != null && _pageError!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: customerPanel(
                    padding: const EdgeInsets.all(12),
                    child: Text(_pageError!, style: GoogleFonts.inter(color: const Color(0xFFFECACA), fontWeight: FontWeight.w600)),
                  ),
                ),
              customerSectionHeader('Add new job'),
              customerPanel(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('JOB CONTACT (FROM CONTACTS LIST)', style: _labelStyle()),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<int?>(
                      initialValue: _jobContactId,
                      decoration: customerInputDecoration(''),
                      hint: Text('None — use name below', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.5))),
                      items: [
                        const DropdownMenuItem<int?>(value: null, child: Text('None — use name below')),
                        ..._contacts.map(
                          (c) {
                            final id = (c['id'] as num?)?.toInt();
                            final label =
                                '${ctStr(c, 'title')} ${ctStr(c, 'first_name')} ${ctStr(c, 'surname')}'.trim();
                            final em = ctStr(c, 'email');
                            return DropdownMenuItem<int?>(
                              value: id,
                              child: Text(
                                em.isNotEmpty ? '$label ($em)' : (label.isEmpty ? 'Contact' : label),
                                overflow: TextOverflow.ellipsis,
                              ),
                            );
                          },
                        ),
                      ],
                      onChanged: _saving ? null : _onJobContactChanged,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Optional: pick someone from this customer\'s contacts. Site visit and reminders use their details when set.',
                      style: GoogleFonts.inter(fontSize: 11, color: AppColors.whiteOverlay(0.45)),
                    ),
                    const SizedBox(height: 16),
                    Text('CONTACT NAME', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _contactName,
                      enabled: !_saving,
                      textCapitalization: TextCapitalization.words,
                      inputFormatters: const [capitalizeWordsFormatter],
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Shown on the job and to engineers. Filled automatically when you pick a contact above; you can edit the wording.',
                      style: GoogleFonts.inter(fontSize: 11, color: AppColors.whiteOverlay(0.45)),
                    ),
                    const SizedBox(height: 16),
                    Text('DESCRIPTION *', style: _labelStyle()),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<int?>(
                      initialValue: _descriptionId,
                      decoration: customerInputDecoration(''),
                      items: [
                        const DropdownMenuItem<int?>(value: null, child: Text('-- Please choose --')),
                        ..._jobDescriptions
                            .map((d) {
                              final id = (d['id'] as num?)?.toInt();
                              if (id == null) return null;
                              return DropdownMenuItem<int?>(
                                value: id,
                                child: Text(ctStr(d, 'name'), overflow: TextOverflow.ellipsis),
                              );
                            })
                            .whereType<DropdownMenuItem<int?>>(),
                      ],
                      onChanged: _saving ? null : (v) => _onDescriptionChanged(v),
                    ),
                    if (_jobDescriptions.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'No job descriptions loaded. Ask an admin to add job descriptions in Settings.',
                          style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFFFBBF24)),
                        ),
                      ),
                    const SizedBox(height: 16),
                    Text('SKILLS', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _skills,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('Comma-separated, auto-filled from description'),
                    ),
                    const SizedBox(height: 16),
                    Text('JOB NOTES', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _jobNotes,
                      enabled: !_saving,
                      maxLines: 4,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('Auto-filled from description template…'),
                    ),
                    const SizedBox(height: 16),
                    CustomerNewJobServiceSection(
                      isServiceJob: _isServiceJob,
                      saving: _saving,
                      reminderFrequency: _reminderFrequency,
                      reminderUnit: _reminderUnit,
                      reminderUnits: _reminderUnits,
                      activeChecklist: activeChecklist,
                      completedServiceItems: _completedServiceItems,
                      onServiceJobChanged: (value) {
                        setState(() {
                          _isServiceJob = value;
                          if (!_isServiceJob) _completedServiceItems.clear();
                        });
                      },
                      onReminderUnitChanged: (value) => setState(() => _reminderUnit = value ?? 'years'),
                      onServiceItemChanged: (name, selected) {
                        setState(() {
                          if (selected) {
                            _completedServiceItems.add(name);
                          } else {
                            _completedServiceItems.remove(name);
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 20),
                    CustomerNewJobScheduleSection(
                      saving: _saving,
                      expectedDate: _expectedDate,
                      expectedTime: _expectedTime,
                      priority: _priority,
                      userGroup: _userGroup,
                      businessUnit: _businessUnit,
                      userGroupChoices: _userGroupChoices,
                      businessUnitChoices: _businessUnitChoices,
                      bookIntoDiary: _bookIntoDiary,
                      onPickDate: _pickDate,
                      onPickTime: _pickTime,
                      onPriorityChanged: (value) => setState(() => _priority = value ?? 'medium'),
                      onUserGroupChanged: (value) => setState(() => _userGroup = value),
                      onBusinessUnitChanged: (value) => setState(() => _businessUnit = value),
                      onBookIntoDiaryChanged: (value) => setState(() => _bookIntoDiary = value ?? true),
                    ),
                    const SizedBox(height: 20),
                    Divider(color: AppColors.whiteOverlay(0.1)),
                    const SizedBox(height: 12),
                    Text('QUOTED AMOUNT', style: _labelStyle()),
                    TextField(
                      controller: _quotedAmount,
                      enabled: !_saving,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('0.00'),
                    ),
                    const SizedBox(height: 12),
                    Text('CUSTOMER REFERENCE', style: _labelStyle()),
                    TextField(
                      controller: _customerReference,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('PO number, ref, etc.'),
                    ),
                    const SizedBox(height: 12),
                    Text('JOB PIPELINE', style: _labelStyle()),
                    DropdownButtonFormField<String>(
                      initialValue: _jobPipeline,
                      decoration: customerInputDecoration(''),
                      items: _pipelines.map((p) => DropdownMenuItem(value: p, child: Text(p, overflow: TextOverflow.ellipsis))).toList(),
                      onChanged: _saving ? null : (v) => setState(() => _jobPipeline = v ?? _pipelines.first),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              customerSectionHeader('Pricing items'),
              CustomerNewJobPricingPanel(
                rows: _pricingRows,
                saving: _saving,
                grandTotal: _pricingGrandTotal,
                onAddRow: _addPricingRow,
                onRemoveRow: _removePricingRow,
                onAnyFieldChanged: () => setState(() {}),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(onPressed: _saving ? null : () => Get.back(), child: const Text('Cancel')),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    onPressed: _saving ? null : _submit,
                    icon: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.save_rounded, size: 18),
                    label: Text(_saving ? 'Creating…' : 'Add job'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  TextStyle _labelStyle() => GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.6,
        color: AppColors.whiteOverlay(0.5),
      );
}
