import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../data/providers/api_provider.dart';
import '../../core/stock_placements.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/jobs_repository.dart';
import '../../data/repositories/stock_tools_repository.dart';
import 'job_detail_controller.dart';

class JobTabParts extends StatefulWidget {
  const JobTabParts({super.key});

  @override
  State<JobTabParts> createState() => _JobTabPartsState();
}

class _JobTabPartsState extends State<JobTabParts> {
  bool _loading = true;
  String? _err;
  List<Map<String, dynamic>> _parts = [];
  List<Map<String, dynamic>> _stockItems = [];
  int _offset = 0;
  int _total = 0;
  static const _page = 20;

  JobsRepository get _jobs => Get.find<JobsRepository>();
  StockToolsRepository get _stockRepo => StockToolsRepository(Get.find<ApiProvider>());

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _loadStockItems() async {
    try {
      _stockItems = await _stockRepo.getStock();
    } catch (_) {
      _stockItems = [];
    }
  }

  Future<void> _load() async {
    final c = Get.find<JobDetailController>();
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      await _loadStockItems();
      final m = await _jobs.getJobParts(c.jobId, limit: _page, offset: _offset);
      final raw = m['parts'];
      _parts = raw is List
          ? raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
          : [];
      _total = (m['total'] as num?)?.toInt() ?? _parts.length;
    } on ApiException catch (e) {
      _err = e.message;
      _parts = [];
    } catch (e) {
      _err = '$e';
      _parts = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, dynamic>? _stockById(int? id) {
    if (id == null) return null;
    for (final s in _stockItems) {
      if ((s['id'] as num?)?.toInt() == id) return s;
    }
    return null;
  }

  Future<void> _addFromCatalog() async {
    final c = Get.find<JobDetailController>();
    List<Map<String, dynamic>> catalog = [];
    try {
      catalog = await _jobs.getPartCatalog(limit: 200);
    } on ApiException catch (_) {}
    final items = <Map<String, dynamic>>[];
    for (final p in catalog) {
      final id = (p['id'] as num?)?.toInt();
      if (id != null) items.add(p);
    }
    if (!mounted) return;
    if (items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No parts in catalog')));
      return;
    }

    await _loadStockItems();
    if (!mounted) return;

    final qtyC = TextEditingController(text: '1');
    Map<String, dynamic>? res;
    try {
      res = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        isScrollControlled: true,
        backgroundColor: AppColors.slate900,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) {
          var catId = (items.first['id'] as num).toInt();
          int? stockId;
          int? placementIdx;
          return StatefulBuilder(
            builder: (ctx, setS) {
              final stock = stockId != null ? _stockById(stockId) : null;
              final placements = stock != null ? parsePlacementsFromItem(stock) : <Map<String, dynamic>>[];
              if (stockId != null && placementIdx == null && placements.isNotEmpty) {
                placementIdx = pickDefaultPlacementIndex(placements);
              }

              return Padding(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  top: 16,
                  bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Add part', style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<int>(
                      value: catId,
                      dropdownColor: AppColors.slate900,
                      style: GoogleFonts.outfit(color: Colors.white),
                      decoration: _sheetInputDecoration('Catalogue part'),
                      items: [
                        for (final p in items)
                          DropdownMenuItem(
                            value: (p['id'] as num).toInt(),
                            child: Text((p['name'] as String?) ?? '#', overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) {
                        if (v != null) setS(() => catId = v);
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: qtyC,
                      style: GoogleFonts.outfit(color: Colors.white),
                      decoration: _sheetInputDecoration('Quantity'),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<int?>(
                      value: stockId,
                      dropdownColor: AppColors.slate900,
                      style: GoogleFonts.outfit(color: Colors.white),
                      decoration: _sheetInputDecoration('Link to stock (optional)'),
                      items: [
                        const DropdownMenuItem<int?>(value: null, child: Text('Not linked to stock')),
                        for (final s in _stockItems)
                          DropdownMenuItem<int?>(
                            value: (s['id'] as num).toInt(),
                            child: Text(
                              '${s['name']} (${(s['quantity'] as num?)?.toInt() ?? 0} avail)',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (v) {
                        setS(() {
                          stockId = v;
                          placementIdx = null;
                        });
                      },
                    ),
                    if (stockId != null && placements.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.primary.withOpacity(0.25)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.place_outlined, size: 16, color: AppColors.primary),
                                const SizedBox(width: 6),
                                Text(
                                  'Pick from placement',
                                  style: GoogleFonts.outfit(color: AppColors.primary, fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            DropdownButtonFormField<int>(
                              value: placementIdx ?? pickDefaultPlacementIndex(placements),
                              dropdownColor: AppColors.slate900,
                              style: GoogleFonts.outfit(color: Colors.white, fontSize: 13),
                              decoration: _sheetInputDecoration('Storage location'),
                              items: [
                                for (var i = 0; i < placements.length; i++)
                                  DropdownMenuItem(
                                    value: i,
                                    child: Text(
                                      '${formatPlacementLabel(placements[i])} — ${(placements[i]['quantity'] as num?)?.toInt() ?? 0} avail',
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                              ],
                              onChanged: (v) {
                                if (v != null) setS(() => placementIdx = v);
                              },
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Stock deducts from this bin when status is Picked up or Installed.',
                              style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Cancel'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            onPressed: () => Navigator.pop(ctx, <String, dynamic>{
                              'id': catId,
                              'qty': qtyC.text,
                              'stockId': stockId,
                              'placementIdx': placementIdx,
                            }),
                            child: const Text('Add'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          );
        },
      );
    } finally {
      qtyC.dispose();
    }

    if (res != null) {
      final catId = (res['id'] as num).toInt();
      final q = double.tryParse((res['qty'] as String?) ?? '1') ?? 1;
      final stockId = res['stockId'] as int?;
      final placementIdx = res['placementIdx'] as int?;
      final body = <String, dynamic>{
        'part_catalog_id': catId,
        'quantity': q,
      };
      if (stockId != null) {
        body['stock_item_id'] = stockId;
        if (placementIdx != null) body['stock_placement_index'] = placementIdx;
      }
      try {
        await _jobs.postJobPart(c.jobId, body);
        _offset = 0;
        await _load();
      } on ApiException catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _editPart(Map<String, dynamic> part) async {
    final c = Get.find<JobDetailController>();
    final partId = (part['id'] as num?)?.toInt();
    if (partId == null) return;

    await _loadStockItems();
    if (!mounted) return;

    final qtyC = TextEditingController(text: '${part['quantity'] ?? 1}');
    var status = (part['status'] as String?) ?? 'requested';
    int? stockId = (part['stock_item_id'] as num?)?.toInt();
    int? placementIdx = (part['stock_placement_index'] as num?)?.toInt();

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.slate900,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setS) {
            final stock = stockId != null ? _stockById(stockId) : null;
            final placements = stock != null ? parsePlacementsFromItem(stock) : <Map<String, dynamic>>[];
            if (stockId != null && placementIdx == null && placements.isNotEmpty) {
              placementIdx = pickDefaultPlacementIndex(placements);
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    part['part_name'] as String? ?? 'Edit part',
                    style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: status,
                    dropdownColor: AppColors.slate900,
                    style: GoogleFonts.outfit(color: Colors.white),
                    decoration: _sheetInputDecoration('Status'),
                    items: [
                      for (final s in jobPartStatuses)
                        DropdownMenuItem(value: s, child: Text(jobPartStatusLabel(s))),
                    ],
                    onChanged: (v) {
                      if (v != null) setS(() => status = v);
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: qtyC,
                    style: GoogleFonts.outfit(color: Colors.white),
                    decoration: _sheetInputDecoration('Quantity'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int?>(
                    value: stockId,
                    dropdownColor: AppColors.slate900,
                    style: GoogleFonts.outfit(color: Colors.white),
                    decoration: _sheetInputDecoration('Link to stock'),
                    items: [
                      const DropdownMenuItem<int?>(value: null, child: Text('Not linked')),
                      for (final s in _stockItems)
                        DropdownMenuItem<int?>(
                          value: (s['id'] as num).toInt(),
                          child: Text(
                            '${s['name']} (${(s['quantity'] as num?)?.toInt() ?? 0} avail)',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: (v) {
                      setS(() {
                        stockId = v;
                        placementIdx = null;
                      });
                    },
                  ),
                  if (stockId != null && placements.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    DropdownButtonFormField<int>(
                      value: placementIdx ?? pickDefaultPlacementIndex(placements),
                      dropdownColor: AppColors.slate900,
                      style: GoogleFonts.outfit(color: Colors.white, fontSize: 13),
                      decoration: _sheetInputDecoration('Pick from placement'),
                      items: [
                        for (var i = 0; i < placements.length; i++)
                          DropdownMenuItem(
                            value: i,
                            child: Text(
                              '${formatPlacementLabel(placements[i])} — ${(placements[i]['quantity'] as num?)?.toInt() ?? 0} avail',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (v) {
                        if (v != null) setS(() => placementIdx = v);
                      },
                    ),
                  ],
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel'))),
                      const SizedBox(width: 12),
                      Expanded(child: FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save'))),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );

    final parsedQty = double.tryParse(qtyC.text) ?? 1;
    qtyC.dispose();

    if (saved == true) {
      final body = <String, dynamic>{
        'status': status,
        'quantity': parsedQty,
        'stock_item_id': stockId,
        'stock_placement_index': stockId != null ? placementIdx : null,
      };
      try {
        await _jobs.patchJobPart(c.jobId, partId, body);
        await _load();
      } on ApiException catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  InputDecoration _sheetInputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: AppColors.slate400),
      filled: true,
      fillColor: AppColors.slate500.withOpacity(0.08),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.slate500.withOpacity(0.2)),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: AppColors.primary),
      ),
    );
  }

  Future<void> _applyKit() async {
    final c = Get.find<JobDetailController>();
    List<Map<String, dynamic>> kits = [];
    try {
      kits = await _jobs.getPartKits();
    } on ApiException catch (_) {}
    final kitRows = <Map<String, dynamic>>[];
    for (final k in kits) {
      final id = (k['id'] as num?)?.toInt();
      if (id != null) kitRows.add(k);
    }
    if (!mounted) return;
    if (kitRows.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No kits available')));
      return;
    }

    final selectedKit = await showDialog<int>(
      context: context,
      builder: (ctx) {
        var kitId = (kitRows.first['id'] as num).toInt();
        return StatefulBuilder(
          builder: (ctx, setS) {
            return AlertDialog(
              title: const Text('Apply kit'),
              content: DropdownButtonFormField<int>(
                value: kitId,
                items: [
                  for (final k in kitRows)
                    DropdownMenuItem(
                      value: (k['id'] as num).toInt(),
                      child: Text((k['name'] as String?) ?? '', overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) {
                  if (v != null) setS(() => kitId = v);
                },
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                FilledButton(onPressed: () => Navigator.pop(ctx, kitId), child: const Text('Apply')),
              ],
            );
          },
        );
      },
    );

    if (selectedKit != null) {
      try {
        await _jobs.postJobPartsFromKit(c.jobId, selectedKit);
        await _load();
      } on ApiException catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_err != null) {
      return Center(child: Text(_err!, style: GoogleFonts.inter(color: AppColors.slate400)));
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              FilledButton(onPressed: _addFromCatalog, child: const Text('Add part')),
              const SizedBox(width: 8),
              OutlinedButton(onPressed: _applyKit, child: const Text('From kit')),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.primary,
            onRefresh: _load,
            child: ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: _parts.length + 1,
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text('$_total total', style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12)),
                  );
                }
                final p = _parts[i - 1];
                final id = (p['id'] as num?)?.toInt();
                final name = (p['part_name'] as String?) ?? '';
                final st = (p['status'] as String?) ?? '';
                final stockPlacementLabel = p['stock_placement_label'] as String?;
                final stockName = p['stock_item_name'] as String?;
                final hasStock = p['stock_item_id'] != null;

                return Card(
                  color: AppColors.whiteOverlay(0.06),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  margin: const EdgeInsets.only(bottom: 10),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: id != null ? () => _editPart(p) : null,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
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
                                    Text(name, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${jobPartStatusLabel(st)} · Qty ${p['quantity']}',
                                      style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                                    ),
                                  ],
                                ),
                              ),
                              if (id != null)
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                                  onPressed: () async {
                                    final ok = await Get.dialog<bool>(
                                      AlertDialog(
                                        title: const Text('Remove part line?'),
                                        actions: [
                                          TextButton(onPressed: () => Get.back(result: false), child: const Text('Cancel')),
                                          FilledButton(onPressed: () => Get.back(result: true), child: const Text('Delete')),
                                        ],
                                      ),
                                    );
                                    if (ok == true) {
                                      try {
                                        await _jobs.deleteJobPart(Get.find<JobDetailController>().jobId, id);
                                        await _load();
                                      } on ApiException catch (e) {
                                        if (context.mounted) {
                                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                                        }
                                      }
                                    }
                                  },
                                ),
                            ],
                          ),
                          if (hasStock) ...[
                            const SizedBox(height: 8),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              decoration: BoxDecoration(
                                color: AppColors.primary.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.inventory_2_outlined, size: 14, color: AppColors.primary),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      stockPlacementLabel != null
                                          ? '${stockName ?? 'Stock'} · $stockPlacementLabel'
                                          : (stockName ?? 'Linked to stock'),
                                      style: GoogleFonts.inter(color: AppColors.primary, fontSize: 11, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 4),
                          Text(
                            'Tap to edit status, qty, or stock placement',
                            style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 10),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        if (_offset + _page < _total)
          TextButton(
            onPressed: () {
              _offset += _page;
              _load();
            },
            child: const Text('Load more'),
          ),
      ],
    );
  }
}
