import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/jobs_repository.dart';
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
  int _offset = 0;
  int _total = 0;
  static const _page = 20;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      final m = await jobs.getJobParts(c.jobId, limit: _page, offset: _offset);
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

  Future<void> _addFromCatalog() async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    List<Map<String, dynamic>> catalog = [];
    try {
      catalog = await jobs.getPartCatalog(limit: 200);
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

    final qtyC = TextEditingController(text: '1');
    Map<String, dynamic>? res;
    try {
      res = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (ctx) {
          var catId = (items.first['id'] as num).toInt();
          return StatefulBuilder(
            builder: (ctx, setS) {
              return AlertDialog(
                title: const Text('Add part'),
                content: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    DropdownButtonFormField<int>(
                      value: catId,
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
                    TextField(
                      controller: qtyC,
                      decoration: const InputDecoration(labelText: 'Qty'),
                      keyboardType: TextInputType.number,
                    ),
                  ],
                ),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx, <String, dynamic>{'id': catId, 'qty': qtyC.text}),
                    child: const Text('Add'),
                  ),
                ],
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
      try {
        await jobs.postJobPart(c.jobId, <String, dynamic>{
          'part_catalog_id': catId,
          'quantity': q,
        });
        _offset = 0;
        await _load();
      } on ApiException catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _applyKit() async {
    final c = Get.find<JobDetailController>();
    final jobs = Get.find<JobsRepository>();
    List<Map<String, dynamic>> kits = [];
    try {
      kits = await jobs.getPartKits();
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
        await jobs.postJobPartsFromKit(c.jobId, selectedKit);
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
          child: ListView.builder(
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
              final stockLoc = p['stock_item_location'] as String?;
              final stockQty = p['stock_item_quantity'] as num?;
              final stockInfo = stockLoc != null ? ' · Stock: $stockLoc (${stockQty ?? 0} avail)' : '';
              return ListTile(
                tileColor: AppColors.whiteOverlay(0.06),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                title: Text(name, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                subtitle: Text('Status: $st · Qty ${p['quantity']}$stockInfo', style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12)),
                trailing: id != null
                    ? IconButton(
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
                              await Get.find<JobsRepository>().deleteJobPart(Get.find<JobDetailController>().jobId, id);
                              await _load();
                            } on ApiException catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                              }
                            }
                          }
                        },
                      )
                    : null,
              );
            },
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
