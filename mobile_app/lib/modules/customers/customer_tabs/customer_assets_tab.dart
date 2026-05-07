import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/routes/app_routes.dart';
import '../../../core/values/app_colors.dart';
import '../../../data/repositories/customers_repository.dart';
import 'helpers.dart';
import 'shell.dart';

String customerAssetListTitle(Map<String, dynamic> r) {
  final desc = ctStr(r, 'description').trim();
  if (desc.isNotEmpty) return desc;
  final g = ctStr(r, 'asset_group').trim();
  final t = ctStr(r, 'asset_type').trim();
  if (g.isNotEmpty && t.isNotEmpty) return '$g · $t';
  if (g.isNotEmpty) return g;
  if (t.isNotEmpty) return t;
  return 'Asset #${(r['id'] as num?)?.toInt() ?? ''}';
}

class CustomerAssetsTab extends StatefulWidget {
  const CustomerAssetsTab({super.key, required this.customerId, this.workAddressId});

  final int customerId;
  final int? workAddressId;

  @override
  State<CustomerAssetsTab> createState() => _CustomerAssetsTabState();
}

class _CustomerAssetsTabState extends State<CustomerAssetsTab> {
  final _repo = Get.find<CustomersRepository>();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant CustomerAssetsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workAddressId != widget.workAddressId) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      _rows = await _repo.getAssets(widget.customerId, workAddressId: widget.workAddressId);
    } catch (_) {
      _rows = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openForm({int? assetId}) async {
    final ok = await Get.toNamed(
      AppRoutes.customerAssetForm,
      arguments: <String, dynamic>{
        'customerId': widget.customerId,
        if (assetId != null) 'assetId': assetId,
        if (widget.workAddressId != null) 'work_address_id': widget.workAddressId,
      },
    );
    if (ok == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return Center(child: CircularProgressIndicator(color: AppColors.primary));
    return Stack(
      children: [
        RefreshIndicator(
          color: AppColors.primary,
          onRefresh: _load,
          child: _rows.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                  children: [
                    customerEmptyState(
                      icon: Icons.precision_manufacturing_outlined,
                      title: 'No assets registered',
                      subtitle: 'Tap + to add equipment for this customer${widget.workAddressId != null ? ' at this site' : ''}.',
                    ),
                  ],
                )
              : ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                  itemCount: _rows.length,
                  itemBuilder: (_, i) {
                    final r = _rows[i];
                    final id = (r['id'] as num?)?.toInt() ?? 0;
                    final title = customerAssetListTitle(r);
                    final sub = <String>[
                      if (ctStr(r, 'asset_group').isNotEmpty && ctStr(r, 'description').trim().isNotEmpty) ctStr(r, 'asset_group'),
                      if (ctStr(r, 'make').isNotEmpty || ctStr(r, 'model').isNotEmpty)
                        [ctStr(r, 'make'), ctStr(r, 'model')].where((e) => e.isNotEmpty).join(' '),
                      if (ctStr(r, 'serial_number').isNotEmpty) 'S/N ${ctStr(r, 'serial_number')}',
                    ].where((e) => e.isNotEmpty).join(' · ');
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: id > 0 ? () => _openForm(assetId: id) : null,
                          child: customerPanel(
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Icon(Icons.inventory_2_outlined, color: AppColors.primary),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        title,
                                        style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      if (sub.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(sub, style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.55)), maxLines: 2, overflow: TextOverflow.ellipsis),
                                      ],
                                    ],
                                  ),
                                ),
                                Icon(Icons.chevron_right_rounded, color: AppColors.whiteOverlay(0.35)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
        Positioned(
          right: 20,
          bottom: 20,
          child: FloatingActionButton.extended(
            onPressed: () => _openForm(),
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.gradientStart,
            icon: const Icon(Icons.add_rounded),
            label: Text('Add asset', style: GoogleFonts.inter(fontWeight: FontWeight.w800)),
          ),
        ),
      ],
    );
  }
}
