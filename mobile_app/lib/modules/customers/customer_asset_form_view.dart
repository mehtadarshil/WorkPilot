import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import 'customer_tabs/helpers.dart';
import 'customer_tabs/shell.dart';

const _kAssetGroups = ['Audio', 'Audio Visual', 'Electrical', 'HVAC', 'Fire', 'Security', 'Other'];

/// Create or edit a customer asset (`POST` / `PATCH` `/customers/:id/assets`).
class CustomerAssetFormView extends StatefulWidget {
  const CustomerAssetFormView({super.key});

  @override
  State<CustomerAssetFormView> createState() => _CustomerAssetFormViewState();
}

class _CustomerAssetFormViewState extends State<CustomerAssetFormView> {
  final _repo = Get.find<CustomersRepository>();
  late final int _customerId;
  int? _assetId;
  int? _workAddressId;

  bool _loading = true;
  bool _saving = false;
  String? _pageError;

  String _assetGroup = 'HVAC';
  final _assetType = TextEditingController();
  final _description = TextEditingController();
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _serial = TextEditingController();
  final _location = TextEditingController();
  bool _installedByUs = false;
  bool _underWarranty = false;

  @override
  void initState() {
    super.initState();
    final a = Get.arguments;
    if (a is Map) {
      final m = Map<String, dynamic>.from(a);
      _customerId = (m['customerId'] as num?)?.toInt() ?? 0;
      _assetId = (m['assetId'] as num?)?.toInt();
      _workAddressId = (m['work_address_id'] as num?)?.toInt() ?? (m['workAddressId'] as num?)?.toInt();
    } else {
      _customerId = 0;
    }
    _load();
  }

  @override
  void dispose() {
    _assetType.dispose();
    _description.dispose();
    _make.dispose();
    _model.dispose();
    _serial.dispose();
    _location.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_customerId <= 0) {
      setState(() => _loading = false);
      return;
    }
    final id = _assetId;
    if (id == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final row = await _repo.getAsset(_customerId, id);
      if (row.isEmpty) throw StateError('Not found');
      _assetGroup = ctStr(row, 'asset_group');
      if (!_kAssetGroups.contains(_assetGroup)) _assetGroup = 'Other';
      _assetType.text = ctStr(row, 'asset_type');
      _description.text = ctStr(row, 'description');
      _make.text = ctStr(row, 'make');
      _model.text = ctStr(row, 'model');
      _serial.text = ctStr(row, 'serial_number');
      _location.text = ctStr(row, 'location');
      _installedByUs = row['installed_by_us'] == true;
      _underWarranty = row['under_warranty'] == true;
    } catch (_) {
      _pageError = 'Could not load asset.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final desc = _description.text.trim();
    if (desc.isEmpty) {
      setState(() => _pageError = 'Description is required.');
      return;
    }
    setState(() {
      _saving = true;
      _pageError = null;
    });
    final body = <String, dynamic>{
      'asset_group': _assetGroup,
      'asset_type': _assetType.text.trim().isEmpty ? null : _assetType.text.trim(),
      'description': desc,
      'make': _make.text.trim().isEmpty ? null : _make.text.trim(),
      'model': _model.text.trim().isEmpty ? null : _model.text.trim(),
      'serial_number': _serial.text.trim().isEmpty ? null : _serial.text.trim(),
      'location': _location.text.trim().isEmpty ? null : _location.text.trim(),
      'installed_by_us': _installedByUs,
      'under_warranty': _underWarranty,
      if (_workAddressId != null) 'work_address_id': _workAddressId,
    };
    try {
      final aid = _assetId;
      if (aid == null) {
        await _repo.createAsset(_customerId, body);
      } else {
        await _repo.updateAsset(_customerId, aid, body);
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

  Future<void> _delete() async {
    final aid = _assetId;
    if (aid == null) return;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete asset?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (go != true) return;
    setState(() => _saving = true);
    try {
      await _repo.deleteAsset(_customerId, aid);
      Get.back(result: true);
    } on ApiException catch (e) {
      setState(() {
        _saving = false;
        _pageError = e.message;
      });
    }
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
          appBar: AppBar(title: Text('Asset', style: GoogleFonts.inter(fontWeight: FontWeight.w700))),
          body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        ),
      );
    }
    if (_customerId <= 0) {
      return Scaffold(appBar: AppBar(title: const Text('Asset')), body: const Center(child: Text('Invalid customer')));
    }

    final isNew = _assetId == null;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text(isNew ? 'Add asset' : 'Edit asset', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: _saving ? null : () => Get.back(),
          ),
          actions: [
            if (!isNew)
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded, color: Color(0xFFFCA5A5)),
                onPressed: _saving ? null : _delete,
              ),
          ],
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
              customerSectionHeader('Classification'),
              customerPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('ASSET GROUP *', style: _label()),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: _kAssetGroups.contains(_assetGroup) ? _assetGroup : 'Other',
                      dropdownColor: const Color(0xFF134E4A),
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('Group'),
                      items: _kAssetGroups
                          .map((g) => DropdownMenuItem(value: g, child: Text(g, style: GoogleFonts.inter(color: Colors.white))))
                          .toList(),
                      onChanged: _saving
                          ? null
                          : (v) {
                              if (v != null) setState(() => _assetGroup = v);
                            },
                    ),
                    const SizedBox(height: 12),
                    Text('TYPE', style: _label()),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _assetType,
                      enabled: !_saving,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('e.g. Boiler'),
                    ),
                  ],
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
                      maxLines: 2,
                      style: GoogleFonts.inter(color: Colors.white),
                      decoration: customerInputDecoration('Title / summary shown in lists'),
                    ),
                    const SizedBox(height: 12),
                    Text('MAKE', style: _label()),
                    const SizedBox(height: 6),
                    TextField(controller: _make, enabled: !_saving, style: GoogleFonts.inter(color: Colors.white), decoration: customerInputDecoration('')),
                    const SizedBox(height: 12),
                    Text('MODEL', style: _label()),
                    const SizedBox(height: 6),
                    TextField(controller: _model, enabled: !_saving, style: GoogleFonts.inter(color: Colors.white), decoration: customerInputDecoration('')),
                    const SizedBox(height: 12),
                    Text('SERIAL NUMBER', style: _label()),
                    const SizedBox(height: 6),
                    TextField(controller: _serial, enabled: !_saving, style: GoogleFonts.inter(color: Colors.white), decoration: customerInputDecoration('')),
                    const SizedBox(height: 12),
                    Text('LOCATION', style: _label()),
                    const SizedBox(height: 6),
                    TextField(controller: _location, enabled: !_saving, style: GoogleFonts.inter(color: Colors.white), decoration: customerInputDecoration('')),
                    const SizedBox(height: 12),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Installed by us', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                      value: _installedByUs,
                      onChanged: _saving ? null : (v) => setState(() => _installedByUs = v),
                    ),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Under warranty', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                      value: _underWarranty,
                      onChanged: _saving ? null : (v) => setState(() => _underWarranty = v),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? 'Saving…' : 'Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
