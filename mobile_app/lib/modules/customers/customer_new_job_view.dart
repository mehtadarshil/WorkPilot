import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import 'customer_new_job_pricing_panel.dart';
import 'customer_new_job_pricing_row.dart';
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

  Map<String, dynamic>? _customer;
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
    } else if (a is Map) {
      final m = Map<String, dynamic>.from(a);
      _customerId = (m['customerId'] as num?)?.toInt() ?? (m['id'] as num?)?.toInt() ?? 0;
      _workAddressId = (m['work_address_id'] as num?)?.toInt();
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
    if (_customerId <= 0) {
      setState(() {
        _loading = false;
        _pageError = 'Invalid customer';
      });
      return;
    }
    setState(() {
      _loading = true;
      _pageError = null;
    });
    try {
      final cust = await _repo.getCustomer(_customerId);
      final descs = await _repo.listJobDescriptions();
      final bu = await _repo.listBusinessUnits();
      final ug = await _repo.listUserGroups();
      final sc = await _repo.listServiceChecklistItems();
      final contacts = await _repo.getContacts(
        _customerId,
        workAddressId: _workAddressId,
      );

      final cn = '${ctStr(cust, 'contact_first_name')} ${ctStr(cust, 'contact_surname')}'.trim();
      _contactName.text = cn.isNotEmpty ? cn : ctStr(cust, 'full_name');

      setState(() {
        _customer = cust;
        _jobDescriptions = descs;
        _businessUnits = bu;
        _userGroups = ug;
        _serviceChecklist = sc;
        _contacts = contacts;
        _loading = false;
      });
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
    if (_descriptionId == null) {
      setState(() => _pageError = 'Please choose a job description.');
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

      await _repo.createCustomerJob(_customerId, body);
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

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: AppColors.gradientStart,
          appBar: AppBar(title: Text('Add new job', style: GoogleFonts.inter(fontWeight: FontWeight.w700))),
          body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        ),
      );
    }

    if (_customerId <= 0 || _customer == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Add job')),
        body: Center(child: Text(_pageError ?? 'Invalid customer')),
      );
    }

    final cust = _customer!;
    final addressStr = [ctStr(cust, 'address_line_1'), ctStr(cust, 'town'), ctStr(cust, 'county'), ctStr(cust, 'postcode')]
        .where((e) => e.isNotEmpty)
        .join(', ');

    final activeChecklist = _serviceChecklist.where((i) => i['is_active'] == true).toList();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text('Add new job', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
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
                    Text('Customer: ${ctStr(cust, 'full_name')}', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                    if (addressStr.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text('Address: $addressStr', style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.65))),
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
              customerSectionHeader('Add new job'),
              customerPanel(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('JOB CONTACT (FROM CONTACTS LIST)', style: _labelStyle()),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<int?>(
                      value: _jobContactId,
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
                      value: _descriptionId,
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
                          'No job descriptions loaded. You need Settings (job descriptions) access, same as the web app.',
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
                    CheckboxListTile(
                      value: _isServiceJob,
                      onChanged: _saving
                          ? null
                          : (v) {
                              setState(() {
                                _isServiceJob = v ?? false;
                                if (!_isServiceJob) _completedServiceItems.clear();
                              });
                            },
                      title: Text('Service job', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        'Enable automatic service reminder scheduling for this job type.',
                        style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.5)),
                      ),
                      activeColor: AppColors.primary,
                      contentPadding: EdgeInsets.zero,
                    ),
                    if (_isServiceJob) ...[
                      const SizedBox(height: 12),
                      customerPanel(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text('Service reminder frequency', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _reminderFrequency,
                                    enabled: !_saving,
                                    keyboardType: TextInputType.number,
                                    style: GoogleFonts.inter(color: Colors.white),
                                    decoration: customerInputDecoration('e.g. 1'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: DropdownButtonFormField<String>(
                                    value: _reminderUnit,
                                    decoration: customerInputDecoration('Unit'),
                                    items: _reminderUnits
                                        .map((u) => DropdownMenuItem(value: u, child: Text(u[0].toUpperCase() + u.substring(1))))
                                        .toList(),
                                    onChanged: _saving ? null : (v) => setState(() => _reminderUnit = v ?? 'years'),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'How often should a reminder be triggered for this service job?',
                              style: GoogleFonts.inter(fontSize: 11, color: AppColors.whiteOverlay(0.45)),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text('COMPLETED SERVICES IN THIS JOB', style: _labelStyle()),
                      const SizedBox(height: 8),
                      customerPanel(
                        padding: const EdgeInsets.all(12),
                        child: activeChecklist.isEmpty
                            ? Text(
                                'No service checklist options configured yet. Add them in Settings → Job Descriptions.',
                                style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.55)),
                              )
                            : Wrap(
                                spacing: 12,
                                runSpacing: 8,
                                children: activeChecklist.map((item) {
                                  final name = ctStr(item, 'name');
                                  final sel = _completedServiceItems.contains(name);
                                  return FilterChip(
                                    label: Text(name, style: GoogleFonts.inter(fontSize: 12)),
                                    selected: sel,
                                    onSelected: _saving
                                        ? null
                                        : (on) {
                                            setState(() {
                                              if (on) {
                                                _completedServiceItems.add(name);
                                              } else {
                                                _completedServiceItems.remove(name);
                                              }
                                            });
                                          },
                                    selectedColor: AppColors.primary.withValues(alpha: 0.35),
                                    checkmarkColor: Colors.white,
                                  );
                                }).toList(),
                              ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    Divider(color: AppColors.whiteOverlay(0.1)),
                    const SizedBox(height: 12),
                    Text('EXPECTED COMPLETION DATE', style: _labelStyle()),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _saving ? null : _pickDate,
                            child: Text(
                              _expectedDate == null ? 'Pick date' : '${_expectedDate!.year}-${_expectedDate!.month.toString().padLeft(2, '0')}-${_expectedDate!.day.toString().padLeft(2, '0')}',
                              style: GoogleFonts.inter(color: Colors.white),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 110,
                          child: OutlinedButton(
                            onPressed: _saving ? null : _pickTime,
                            child: Text(
                              _expectedTime == null ? 'Time' : _expectedTime!.format(context),
                              style: GoogleFonts.inter(color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Text('PRIORITY', style: _labelStyle()),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: _priority,
                      decoration: customerInputDecoration(''),
                      items: const [
                        DropdownMenuItem(value: 'low', child: Text('Low')),
                        DropdownMenuItem(value: 'medium', child: Text('Medium')),
                        DropdownMenuItem(value: 'high', child: Text('High')),
                        DropdownMenuItem(value: 'critical', child: Text('Critical')),
                      ],
                      onChanged: _saving ? null : (v) => setState(() => _priority = v ?? 'medium'),
                    ),
                    const SizedBox(height: 16),
                    Text('USER GROUP', style: _labelStyle()),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String?>(
                      value: _userGroup,
                      decoration: customerInputDecoration(''),
                      hint: const Text('-- Please choose --'),
                      items: [
                        const DropdownMenuItem<String?>(value: null, child: Text('-- Please choose --')),
                        ..._userGroupChoices.map((n) => DropdownMenuItem<String?>(value: n, child: Text(n))),
                      ],
                      onChanged: _saving ? null : (v) => setState(() => _userGroup = v),
                    ),
                    const SizedBox(height: 6),
                    Text('Assign this job to a specific team or user group.', style: GoogleFonts.inter(fontSize: 11, color: AppColors.whiteOverlay(0.45))),
                    const SizedBox(height: 16),
                    Text('BUSINESS UNIT', style: _labelStyle()),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String?>(
                      value: _businessUnit,
                      decoration: customerInputDecoration(''),
                      hint: const Text('-- Please choose --'),
                      items: [
                        const DropdownMenuItem<String?>(value: null, child: Text('-- Please choose --')),
                        ..._businessUnitChoices.map((n) => DropdownMenuItem<String?>(value: n, child: Text(n))),
                      ],
                      onChanged: _saving ? null : (v) => setState(() => _businessUnit = v),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'When this job is invoiced the system will automatically select this category.',
                      style: GoogleFonts.inter(fontSize: 11, color: AppColors.primary, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 16),
                    CheckboxListTile(
                      value: _bookIntoDiary,
                      onChanged: _saving ? null : (v) => setState(() => _bookIntoDiary = v ?? true),
                      title: Text('Book into diary after adding job', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        'Same flag as web; scheduling still happens from the calendar on web.',
                        style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.5)),
                      ),
                      activeColor: AppColors.primary,
                      contentPadding: EdgeInsets.zero,
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
                      value: _jobPipeline,
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
