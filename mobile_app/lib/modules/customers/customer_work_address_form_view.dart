import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import 'customer_tabs/helpers.dart';
import 'customer_tabs/shell.dart';

/// Same fields and API payload as web `CustomerWorkAddressTab` modal.
class CustomerWorkAddressFormView extends StatefulWidget {
  const CustomerWorkAddressFormView({super.key});

  @override
  State<CustomerWorkAddressFormView> createState() => _CustomerWorkAddressFormViewState();
}

class _CustomerWorkAddressFormViewState extends State<CustomerWorkAddressFormView> {
  static const _titles = ['Mr', 'Mrs', 'Ms', 'Dr'];

  final _repo = Get.find<CustomersRepository>();
  late final int _customerId;
  int? _workAddressId;

  final _landlord = TextEditingController();
  final _name = TextEditingController();
  final _addressLine1 = TextEditingController();
  final _addressLine2 = TextEditingController();
  final _addressLine3 = TextEditingController();
  final _firstName = TextEditingController();
  final _surname = TextEditingController();
  final _companyName = TextEditingController();
  final _town = TextEditingController();
  final _county = TextEditingController();
  final _postcode = TextEditingController();
  final _landline = TextEditingController();
  final _mobile = TextEditingController();
  final _email = TextEditingController();
  final _uprn = TextEditingController();

  String _branchName = '';
  String _title = 'Mr';
  bool _prefersPhone = false;
  bool _prefersSms = false;
  bool _prefersEmail = false;
  bool _prefersLetter = false;
  bool _isActive = true;

  List<Map<String, dynamic>> _branches = [];
  bool _loadingBranches = true;
  bool _saving = false;
  String? _pageError;

  @override
  void initState() {
    super.initState();
    final parsed = _parseArgs(Get.arguments);
    _customerId = parsed.$1;
    _workAddressId = parsed.$2;
    final e = parsed.$3;
    if (e != null) {
      _branchName = ctStr(e, 'branch_name');
      _landlord.text = ctStr(e, 'landlord');
      _name.text = ctStr(e, 'name');
      _addressLine1.text = ctStr(e, 'address_line_1');
      _addressLine2.text = ctStr(e, 'address_line_2');
      _addressLine3.text = ctStr(e, 'address_line_3');
      _firstName.text = ctStr(e, 'first_name');
      _surname.text = ctStr(e, 'surname');
      _companyName.text = ctStr(e, 'company_name');
      _town.text = ctStr(e, 'town');
      _county.text = ctStr(e, 'county');
      _postcode.text = ctStr(e, 'postcode');
      _landline.text = ctStr(e, 'landline');
      _mobile.text = ctStr(e, 'mobile');
      _email.text = ctStr(e, 'email');
      _uprn.text = ctStr(e, 'uprn');
      final t = ctStr(e, 'title');
      _title = t.isEmpty ? 'Mr' : (_titles.contains(t) ? t : 'Mr');
      _prefersPhone = e['prefers_phone'] == true;
      _prefersSms = e['prefers_sms'] == true;
      _prefersEmail = e['prefers_email'] == true;
      _prefersLetter = e['prefers_letter'] == true;
      _isActive = e['is_active'] != false;
    }
    _loadBranches();
  }

  (int, int?, Map<String, dynamic>?) _parseArgs(dynamic args) {
    int cid = 0;
    int? wid;
    Map<String, dynamic>? row;
    if (args is int) {
      cid = args;
    } else if (args is Map) {
      cid = (args['customerId'] as num?)?.toInt() ?? 0;
      final raw = args['workAddress'];
      if (raw is Map) {
        row = Map<String, dynamic>.from(raw);
        wid = (row['id'] as num?)?.toInt();
      }
    }
    return (cid, wid, row);
  }

  Future<void> _loadBranches() async {
    if (_customerId <= 0) {
      setState(() => _loadingBranches = false);
      return;
    }
    try {
      _branches = await _repo.getBranches(_customerId);
    } catch (_) {
      _branches = [];
    } finally {
      if (mounted) setState(() => _loadingBranches = false);
    }
  }

  @override
  void dispose() {
    _landlord.dispose();
    _name.dispose();
    _addressLine1.dispose();
    _addressLine2.dispose();
    _addressLine3.dispose();
    _firstName.dispose();
    _surname.dispose();
    _companyName.dispose();
    _town.dispose();
    _county.dispose();
    _postcode.dispose();
    _landline.dispose();
    _mobile.dispose();
    _email.dispose();
    _uprn.dispose();
    super.dispose();
  }

  String? _trimOrNull(String s) {
    final t = s.trim();
    return t.isEmpty ? null : t;
  }

  Map<String, dynamic> _payload() {
    return <String, dynamic>{
      'name': _name.text.trim(),
      'branch_name': _branchName.trim().isEmpty ? null : _branchName.trim(),
      'landlord': _trimOrNull(_landlord.text),
      'title': _trimOrNull(_title),
      'first_name': _trimOrNull(_firstName.text),
      'surname': _trimOrNull(_surname.text),
      'company_name': _trimOrNull(_companyName.text),
      'address_line_1': _addressLine1.text.trim(),
      'address_line_2': _trimOrNull(_addressLine2.text),
      'address_line_3': _trimOrNull(_addressLine3.text),
      'town': _trimOrNull(_town.text),
      'county': _trimOrNull(_county.text),
      'postcode': _trimOrNull(_postcode.text),
      'landline': _trimOrNull(_landline.text),
      'mobile': _trimOrNull(_mobile.text),
      'email': _trimOrNull(_email.text),
      'prefers_phone': _prefersPhone,
      'prefers_sms': _prefersSms,
      'prefers_email': _prefersEmail,
      'prefers_letter': _prefersLetter,
      'uprn': _trimOrNull(_uprn.text),
      'is_active': _isActive,
    };
  }

  Future<void> _save() async {
    final p = _payload();
    if ((p['name'] as String).isEmpty || (p['address_line_1'] as String).isEmpty) {
      setState(() => _pageError = 'Name and Address line 1 are required');
      return;
    }
    setState(() {
      _saving = true;
      _pageError = null;
    });
    try {
      if (_workAddressId != null) {
        await _repo.updateWorkAddress(_customerId, _workAddressId!, p);
      } else {
        await _repo.createWorkAddress(_customerId, p);
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

  List<DropdownMenuItem<String>> _branchDropdownItems() {
    final items = <DropdownMenuItem<String>>[
      const DropdownMenuItem<String>(value: '', child: Text('Please Enter Branch')),
    ];
    final seen = <String>{''};
    final current = _branchName.trim();
    if (current.isNotEmpty && !_branches.any((b) => ctStr(b, 'branch_name') == current)) {
      items.add(DropdownMenuItem(value: _branchName, child: Text(_branchName, overflow: TextOverflow.ellipsis)));
      seen.add(current);
    }
    for (final b in _branches) {
      final nm = ctStr(b, 'branch_name');
      if (nm.isEmpty || seen.contains(nm)) continue;
      seen.add(nm);
      items.add(DropdownMenuItem(value: nm, child: Text(nm, overflow: TextOverflow.ellipsis)));
    }
    return items;
  }

  TextStyle _labelStyle() => GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.6,
        color: AppColors.whiteOverlay(0.5),
      );

  @override
  Widget build(BuildContext context) {
    final editing = _workAddressId != null;
    if (_customerId <= 0) {
      return Scaffold(
        appBar: AppBar(title: const Text('Work address')),
        body: const Center(child: Text('Invalid customer')),
      );
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text(
            editing ? 'Edit Work address' : 'Add new Work address',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
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
              if (_pageError != null && _pageError!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: customerPanel(
                    padding: const EdgeInsets.all(12),
                    child: Text(_pageError!, style: GoogleFonts.inter(color: const Color(0xFFFECACA), fontWeight: FontWeight.w600)),
                  ),
                ),
              customerSectionHeader('Branch / landlord'),
              customerPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('BRANCH', style: _labelStyle()),
                    const SizedBox(height: 6),
                    _loadingBranches
                        ? const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))),
                          )
                        : DropdownButtonFormField<String>(
                            value: _branchName.isEmpty ? '' : _branchName,
                            decoration: customerInputDecoration(''),
                            items: _branchDropdownItems(),
                            onChanged: _saving ? null : (v) => setState(() => _branchName = v ?? ''),
                          ),
                    const SizedBox(height: 14),
                    Text('LANDLORD', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _landlord,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('Please Enter Landlord'),
                    ),
                  ],
                ),
              ),
              customerSectionHeader('Address'),
              customerPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('NAME *', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _name,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('ADDRESS LINE 1 *', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _addressLine1,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('TITLE', style: _labelStyle()),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: _title,
                      decoration: customerInputDecoration(''),
                      items: _titles.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                      onChanged: _saving ? null : (v) => setState(() => _title = v ?? 'Mr'),
                    ),
                    const SizedBox(height: 12),
                    Text('ADDRESS LINE 2', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _addressLine2,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('NAME', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _firstName,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('First name'),
                    ),
                    const SizedBox(height: 12),
                    Text('ADDRESS LINE 3', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _addressLine3,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('SURNAME', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _surname,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('TOWN', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _town,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('COMPANY NAME', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _companyName,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('CITY', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _county,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('County / city'),
                    ),
                    const SizedBox(height: 12),
                    Text('LANDLINE', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _landline,
                      enabled: !_saving,
                      keyboardType: TextInputType.phone,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('POSTCODE', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _postcode,
                      enabled: !_saving,
                      textCapitalization: TextCapitalization.characters,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('MOBILE', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _mobile,
                      enabled: !_saving,
                      keyboardType: TextInputType.phone,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                    const SizedBox(height: 12),
                    Text('EMAIL', style: _labelStyle()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _email,
                      enabled: !_saving,
                      keyboardType: TextInputType.emailAddress,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration(''),
                    ),
                  ],
                ),
              ),
              customerSectionHeader('Communication rules'),
              customerPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    CheckboxListTile(
                      value: _prefersPhone,
                      onChanged: _saving ? null : (v) => setState(() => _prefersPhone = v ?? false),
                      title: Text('Phone call', style: GoogleFonts.inter(color: Colors.white)),
                      activeColor: AppColors.primary,
                      contentPadding: EdgeInsets.zero,
                    ),
                    CheckboxListTile(
                      value: _prefersSms,
                      onChanged: _saving ? null : (v) => setState(() => _prefersSms = v ?? false),
                      title: Text('SMS', style: GoogleFonts.inter(color: Colors.white)),
                      activeColor: AppColors.primary,
                      contentPadding: EdgeInsets.zero,
                    ),
                    CheckboxListTile(
                      value: _prefersEmail,
                      onChanged: _saving ? null : (v) => setState(() => _prefersEmail = v ?? false),
                      title: Text('Email', style: GoogleFonts.inter(color: Colors.white)),
                      activeColor: AppColors.primary,
                      contentPadding: EdgeInsets.zero,
                    ),
                    CheckboxListTile(
                      value: _prefersLetter,
                      onChanged: _saving ? null : (v) => setState(() => _prefersLetter = v ?? false),
                      title: Text('Letter', style: GoogleFonts.inter(color: Colors.white)),
                      activeColor: AppColors.primary,
                      contentPadding: EdgeInsets.zero,
                    ),
                  ],
                ),
              ),
              customerSectionHeader('UPRN'),
              customerPanel(
                child: TextField(
                  controller: _uprn,
                  enabled: !_saving,
                  style: GoogleFonts.inter(color: Colors.white),
                  decoration: customerInputDecoration(''),
                ),
              ),
              CheckboxListTile(
                value: _isActive,
                onChanged: _saving ? null : (v) => setState(() => _isActive = v ?? true),
                title: Text('Active work address', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                activeColor: AppColors.primary,
                contentPadding: EdgeInsets.zero,
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(onPressed: _saving ? null : () => Get.back(), child: const Text('Cancel')),
                  const SizedBox(width: 12),
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(editing ? 'Update Work address' : 'Add Work address'),
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
