import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import '../customers/customer_tabs/helpers.dart';
import '../customers/customer_tabs/shell.dart';
import 'job_detail_controller.dart';

class EditJobView extends StatefulWidget {
  const EditJobView({super.key});

  @override
  State<EditJobView> createState() => _EditJobViewState();
}

class _EditJobViewState extends State<EditJobView> {
  final _controller = Get.find<JobDetailController>();
  final _customerRepo = Get.find<CustomersRepository>();

  late final TextEditingController _titleCtrl;
  late final TextEditingController _descCtrl;
  late final TextEditingController _respPersonCtrl;
  late final TextEditingController _locationCtrl;
  late final TextEditingController _certCtrl;
  late final TextEditingController _schedNotesCtrl;
  late final TextEditingController _jobNotesCtrl;
  late final TextEditingController _custRefCtrl;
  late final TextEditingController _quotedAmountCtrl;
  late final TextEditingController _skillsCtrl;

  String _priority = 'medium';
  String _chargeType = 'chargeable';
  bool _isServiceJob = false;
  int? _descriptionId;
  String? _businessUnit;
  String? _userGroup;

  DateTime? _startDate;
  DateTime? _deadline;
  DateTime? _expectedCompletion;

  final Set<int> _selectedOfficerIds = {};

  List<Map<String, dynamic>> _jobDescriptions = [];
  List<Map<String, dynamic>> _businessUnits = [];
  List<Map<String, dynamic>> _userGroups = [];

  bool _loadingMetadata = true;
  bool _saving = false;
  String? _pageError;

  @override
  void initState() {
    super.initState();
    final job = _controller.job.value ?? {};

    _titleCtrl = TextEditingController(text: ctStr(job, 'title'));
    _descCtrl = TextEditingController(text: ctStr(job, 'description'));
    _respPersonCtrl = TextEditingController(text: ctStr(job, 'responsible_person'));
    _locationCtrl = TextEditingController(text: ctStr(job, 'location'));
    _certCtrl = TextEditingController(text: ctStr(job, 'required_certifications'));
    _schedNotesCtrl = TextEditingController(text: ctStr(job, 'scheduling_notes'));
    _jobNotesCtrl = TextEditingController(text: ctStr(job, 'job_notes'));
    _custRefCtrl = TextEditingController(text: ctStr(job, 'customer_reference'));
    _skillsCtrl = TextEditingController(text: ctStr(job, 'skills'));

    final quotedVal = job['quoted_amount'];
    _quotedAmountCtrl = TextEditingController(
      text: quotedVal != null ? quotedVal.toString() : '',
    );

    _priority = ctStr(job, 'priority').isEmpty ? 'medium' : ctStr(job, 'priority');
    _chargeType = ctStr(job, 'charge_type').isEmpty ? 'chargeable' : ctStr(job, 'charge_type');
    _isServiceJob = job['is_service_job'] == true;
    _descriptionId = (job['job_description_id'] as num?)?.toInt();
    
    final dbu = ctStr(job, 'business_unit');
    _businessUnit = dbu.isEmpty ? null : dbu;
    
    final dug = ctStr(job, 'user_group');
    _userGroup = dug.isEmpty ? null : dug;

    if (job['start_date'] != null) {
      _startDate = DateTime.tryParse(job['start_date'].toString());
    }
    if (job['deadline'] != null) {
      _deadline = DateTime.tryParse(job['deadline'].toString());
    }
    if (job['expected_completion'] != null) {
      _expectedCompletion = DateTime.tryParse(job['expected_completion'].toString());
    }

    final rawOfficers = job['officers'];
    if (rawOfficers is List) {
      for (final o in rawOfficers) {
        if (o is Map) {
          final oid = (o['id'] as num?)?.toInt();
          if (oid != null) {
            _selectedOfficerIds.add(oid);
          }
        }
      }
    }

    _loadMetadata();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _respPersonCtrl.dispose();
    _locationCtrl.dispose();
    _certCtrl.dispose();
    _schedNotesCtrl.dispose();
    _jobNotesCtrl.dispose();
    _custRefCtrl.dispose();
    _quotedAmountCtrl.dispose();
    _skillsCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMetadata() async {
    try {
      final descs = await _customerRepo.listJobDescriptions();
      final bu = await _customerRepo.listBusinessUnits();
      final ug = await _customerRepo.listUserGroups();
      if (mounted) {
        setState(() {
          _jobDescriptions = descs;
          _businessUnits = bu;
          _userGroups = ug;
          _loadingMetadata = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadingMetadata = false;
        });
      }
    }
  }

  TextStyle _labelStyle() {
    return GoogleFonts.inter(
      fontSize: 11,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.8,
      color: AppColors.slate500,
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    int maxLines = 1,
    TextInputType keyboardType = TextInputType.text,
    List<TextInputFormatter>? inputFormatters,
    TextCapitalization textCapitalization = TextCapitalization.none,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: _labelStyle()),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          enabled: !_saving,
          maxLines: maxLines,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          textCapitalization: textCapitalization,
          style: GoogleFonts.inter(color: AppColors.slate900),
          decoration: customerInputDecoration(''),
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  Future<void> _pickDateField(String fieldName, DateTime? currentVal, Function(DateTime) onPicked) async {
    final d = await showDatePicker(
      context: context,
      initialDate: currentVal ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: ThemeData.dark().copyWith(
          colorScheme: const ColorScheme.dark(
            primary: AppColors.primary,
            onPrimary: Colors.white,
            surface: Color(0xFF1E293B),
          ),
        ),
        child: child!,
      ),
    );
    if (d != null) {
      setState(() => onPicked(d));
    }
  }

  Widget _buildDatePickerTile({
    required String label,
    required DateTime? date,
    required VoidCallback onTap,
    required VoidCallback onClear,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: _labelStyle()),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.slate200),
            borderRadius: BorderRadius.circular(12),
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 12),
            title: Text(
              date != null ? date.toIso8601String().split('T').first : 'Not set',
              style: GoogleFonts.inter(color: date != null ? AppColors.slate900 : AppColors.whiteOverlay(0.5)),
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (date != null)
                  IconButton(
                    icon: Icon(Icons.clear_rounded, color: Colors.black45),
                    onPressed: _saving ? null : onClear,
                  ),
                IconButton(
                  icon: Icon(Icons.calendar_month_rounded, color: AppColors.primary),
                  onPressed: _saving ? null : onTap,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty) {
      setState(() => _pageError = 'Job title is required');
      return;
    }

    setState(() {
      _saving = true;
      _pageError = null;
    });

    final body = <String, dynamic>{
      'title': title,
      'description': _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      'priority': _priority,
      'charge_type': _chargeType,
      'responsible_person': _respPersonCtrl.text.trim().isEmpty ? null : _respPersonCtrl.text.trim(),
      'location': _locationCtrl.text.trim().isEmpty ? null : _locationCtrl.text.trim(),
      'required_certifications': _certCtrl.text.trim().isEmpty ? null : _certCtrl.text.trim(),
      'scheduling_notes': _schedNotesCtrl.text.trim().isEmpty ? null : _schedNotesCtrl.text.trim(),
      'job_notes': _jobNotesCtrl.text.trim().isEmpty ? null : _jobNotesCtrl.text.trim(),
      'customer_reference': _custRefCtrl.text.trim().isEmpty ? null : _custRefCtrl.text.trim(),
      'skills': _skillsCtrl.text.trim().isEmpty ? null : _skillsCtrl.text.trim(),
      'quoted_amount': _quotedAmountCtrl.text.trim().isEmpty ? null : double.tryParse(_quotedAmountCtrl.text.trim()),
      'is_service_job': _isServiceJob,
      'job_description_id': _descriptionId,
      'business_unit': _businessUnit,
      'user_group': _userGroup,
      'start_date': _startDate?.toUtc().toIso8601String(),
      'deadline': _deadline?.toUtc().toIso8601String(),
      'expected_completion': _expectedCompletion?.toUtc().toIso8601String(),
      'officer_ids': _selectedOfficerIds.toList(),
    };

    final ok = await _controller.updateJob(body);
    if (ok) {
      Get.back(result: true);
    } else {
      setState(() {
        _saving = false;
        _pageError = _controller.error.value;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        title: Text('Edit Job', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: _saving ? null : () => Get.back(),
        ),
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppColors.gradientStart,
              AppColors.gradientMid,
              AppColors.gradientEnd,
            ],
          ),
        ),
        child: _loadingMetadata
            ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                children: [
                  if (_pageError != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: customerPanel(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          _pageError!,
                          style: GoogleFonts.inter(color: const Color(0xFFFECACA), fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  customerPanel(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildTextField(
                          controller: _titleCtrl,
                          label: 'Job Title *',
                          textCapitalization: TextCapitalization.sentences,
                        ),
                        _buildTextField(
                          controller: _descCtrl,
                          label: 'Description',
                          maxLines: 3,
                          textCapitalization: TextCapitalization.sentences,
                        ),
                        
                        Text('PRIORITY', style: _labelStyle()),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String>(
                          initialValue: _priority,
                          decoration: customerInputDecoration(''),
                          items: const [
                            DropdownMenuItem(value: 'low', child: Text('Low')),
                            DropdownMenuItem(value: 'medium', child: Text('Medium')),
                            DropdownMenuItem(value: 'high', child: Text('High')),
                            DropdownMenuItem(value: 'critical', child: Text('Critical')),
                          ],
                          onChanged: _saving ? null : (v) => setState(() => _priority = v ?? 'medium'),
                        ),
                        const SizedBox(height: 14),

                        Text('CHARGE TYPE', style: _labelStyle()),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String>(
                          initialValue: _chargeType,
                          decoration: customerInputDecoration(''),
                          items: const [
                            DropdownMenuItem(value: 'chargeable', child: Text('Chargeable')),
                            DropdownMenuItem(value: 'free', child: Text('Free (Warranty)')),
                            DropdownMenuItem(value: 'callback', child: Text('Callback')),
                          ],
                          onChanged: _saving ? null : (v) => setState(() => _chargeType = v ?? 'chargeable'),
                        ),
                        const SizedBox(height: 14),

                        Text('JOB TYPE / DESCRIPTION', style: _labelStyle()),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<int?>(
                          initialValue: _descriptionId,
                          decoration: customerInputDecoration(''),
                          hint: Text('None', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.5))),
                          items: [
                            const DropdownMenuItem<int?>(value: null, child: Text('None')),
                            ..._jobDescriptions.map((d) {
                              final id = (d['id'] as num?)?.toInt();
                              return DropdownMenuItem<int?>(
                                value: id,
                                child: Text(ctStr(d, 'name')),
                              );
                            }),
                          ],
                          onChanged: _saving ? null : (v) => setState(() => _descriptionId = v),
                        ),
                        const SizedBox(height: 14),

                        Text('BUSINESS UNIT', style: _labelStyle()),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String?>(
                          initialValue: _businessUnit,
                          decoration: customerInputDecoration(''),
                          hint: Text('None', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.5))),
                          items: [
                            const DropdownMenuItem<String?>(value: null, child: Text('None')),
                            ..._businessUnits.map((u) {
                              final name = ctStr(u, 'name');
                              return DropdownMenuItem<String?>(
                                value: name,
                                child: Text(name),
                              );
                            }),
                          ],
                          onChanged: _saving ? null : (v) => setState(() => _businessUnit = v),
                        ),
                        const SizedBox(height: 14),

                        Text('USER GROUP', style: _labelStyle()),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String?>(
                          initialValue: _userGroup,
                          decoration: customerInputDecoration(''),
                          hint: Text('None', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.5))),
                          items: [
                            const DropdownMenuItem<String?>(value: null, child: Text('None')),
                            ..._userGroups.map((g) {
                              final name = ctStr(g, 'name');
                              return DropdownMenuItem<String?>(
                                value: name,
                                child: Text(name),
                              );
                            }),
                          ],
                          onChanged: _saving ? null : (v) => setState(() => _userGroup = v),
                        ),
                        const SizedBox(height: 14),

                        _buildTextField(
                          controller: _respPersonCtrl,
                          label: 'Responsible Person',
                          textCapitalization: TextCapitalization.words,
                        ),
                        _buildTextField(
                          controller: _locationCtrl,
                          label: 'Location',
                          textCapitalization: TextCapitalization.sentences,
                        ),
                        _buildTextField(
                          controller: _certCtrl,
                          label: 'Required Certifications',
                          textCapitalization: TextCapitalization.sentences,
                        ),
                        _buildTextField(
                          controller: _skillsCtrl,
                          label: 'Skills Required',
                          textCapitalization: TextCapitalization.sentences,
                        ),
                        _buildTextField(
                          controller: _custRefCtrl,
                          label: 'Customer Reference',
                        ),
                        _buildTextField(
                          controller: _quotedAmountCtrl,
                          label: 'Quoted Amount (£)',
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        ),

                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'IS SERVICE JOB',
                                style: _labelStyle(),
                              ),
                            ),
                            Switch(
                              value: _isServiceJob,
                              activeThumbColor: AppColors.primary,
                              onChanged: _saving ? null : (v) => setState(() => _isServiceJob = v),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),

                        _buildDatePickerTile(
                          label: 'Start Date',
                          date: _startDate,
                          onTap: () => _pickDateField('start_date', _startDate, (d) => _startDate = d),
                          onClear: () => setState(() => _startDate = null),
                        ),
                        _buildDatePickerTile(
                          label: 'Deadline',
                          date: _deadline,
                          onTap: () => _pickDateField('deadline', _deadline, (d) => _deadline = d),
                          onClear: () => setState(() => _deadline = null),
                        ),
                        _buildDatePickerTile(
                          label: 'Expected Completion',
                          date: _expectedCompletion,
                          onTap: () => _pickDateField('expected_completion', _expectedCompletion, (d) => _expectedCompletion = d),
                          onClear: () => setState(() => _expectedCompletion = null),
                        ),

                        _buildTextField(
                          controller: _schedNotesCtrl,
                          label: 'Scheduling Notes',
                          maxLines: 2,
                          textCapitalization: TextCapitalization.sentences,
                        ),
                        _buildTextField(
                          controller: _jobNotesCtrl,
                          label: 'Job Notes',
                          maxLines: 3,
                          textCapitalization: TextCapitalization.sentences,
                        ),

                        const SizedBox(height: 8),
                        Text('ENGINEER ASSIGNMENT', style: _labelStyle()),
                        const SizedBox(height: 6),
                        if (_controller.officers.isEmpty)
                          const Text('No engineers/officers available', style: TextStyle(color: Colors.black45))
                        else
                          Container(
                            decoration: BoxDecoration(
                              border: Border.all(color: AppColors.slate200),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              children: _controller.officers.map((o) {
                                final id = (o['id'] as num?)?.toInt() ?? 0;
                                final name = (o['full_name'] as String?) ?? '';
                                return CheckboxListTile(
                                  value: _selectedOfficerIds.contains(id),
                                  onChanged: _saving
                                      ? null
                                      : (v) => setState(() {
                                            if (v == true) {
                                              _selectedOfficerIds.add(id);
                                            } else {
                                              _selectedOfficerIds.remove(id);
                                            }
                                          }),
                                  title: Text(name, style: GoogleFonts.inter(fontSize: 14, color: AppColors.slate900)),
                                  activeColor: AppColors.primary,
                                  dense: true,
                                  visualDensity: VisualDensity.compact,
                                );
                              }).toList(),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.gradientEnd,
          border: Border(top: BorderSide(color: AppColors.whiteOverlay(0.1))),
        ),
        child: SafeArea(
          child: FilledButton(
            onPressed: _saving ? null : _submit,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size.fromHeight(50),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: _saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                  )
                : Text('Save Job', style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 16)),
          ),
        ),
      ),
    );
  }
}
