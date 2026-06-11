import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';

/// Customer site / FRA report — mirrors web job tab **Reports** (`CustomerSiteReportTab`).
/// When [customerId] is provided, the tab loads that customer directly instead of
/// reading from [JobDetailController].
class JobTabSiteReports extends StatefulWidget {
  final int? customerId;
  final int? workAddressId;
  final int? reportId;

  const JobTabSiteReports({super.key, this.customerId, this.workAddressId, this.reportId});

  @override
  State<JobTabSiteReports> createState() => _JobTabSiteReportsState();
}

class _JobTabSiteReportsState extends State<JobTabSiteReports> {
  bool _loading = true;
  bool _saving = false;
  String? _err;
  Map<String, dynamic>? _report;
  Map<String, dynamic>? _templateDef;
  int? _customerId;
  int? _workAddressId;
  int? _reportId;

  final Map<String, TextEditingController> _textCtr = {};
  final Map<String, String?> _yesNo = {};
  final Map<String, SignatureController> _sigCtr = {};
  final Map<int, Uint8List> _imageCache = {};
  final Map<String, bool> _signatureBusy = {};
  final Map<String, TextEditingController> _imageCaptionCtr = {};
  final Map<String, TextEditingController> _imageNoteCtr = {};
  final Map<String, List<Map<String, dynamic>>> _repeatableInstances = {};
  final Map<String, bool> _repeatableCollapsed = {};
  TextEditingController? _titleCtr;

  @override
  void dispose() {
    _disposeFieldControllers();
    super.dispose();
  }

  void _disposeFieldControllers() {
    for (final c in _textCtr.values) {
      c.dispose();
    }
    _textCtr.clear();
    _yesNo.clear();
    for (final c in _sigCtr.values) {
      c.dispose();
    }
    _sigCtr.clear();
    _imageCache.clear();
    _signatureBusy.clear();
    for (final c in _imageCaptionCtr.values) {
      c.dispose();
    }
    _imageCaptionCtr.clear();
    for (final c in _imageNoteCtr.values) {
      c.dispose();
    }
    _imageNoteCtr.clear();
    _titleCtr?.dispose();
    _titleCtr = null;
    _repeatableInstances.clear();
    _repeatableCollapsed.clear();
  }

  String _scopedRepeatableFieldKey(String sectionId, String instanceId, String fieldId) =>
      'repeat:$sectionId:$instanceId:$fieldId';

  String _repeatableCtrlKey(String sectionId, String instanceId, String fieldId) =>
      '$sectionId|$instanceId|$fieldId';

  Map<String, dynamic> _jsonClone(Map<String, dynamic> m) =>
      Map<String, dynamic>.from(jsonDecode(jsonEncode(m)) as Map);

  void _collectFields(Map<String, dynamic> def, List<Map<String, dynamic>> out, {bool includeRepeatable = false}) {
    final sections = def['sections'];
    if (sections is List) {
      for (final s in sections) {
        if (s is! Map) continue;
        if (!includeRepeatable && s['repeatable'] == true) continue;
        final fields = s['fields'];
        if (fields is List) {
          for (final f in fields) {
            if (f is Map) out.add(Map<String, dynamic>.from(f));
          }
        }
      }
    }
    final footer = def['footer'];
    if (footer is Map) {
      final fields = footer['fields'];
      if (fields is List) {
        for (final f in fields) {
          if (f is Map) out.add(Map<String, dynamic>.from(f));
        }
      }
    }
  }

  Future<void> _load() async {
    final jobs = Get.find<JobsRepository>();
    int? cid = widget.customerId;
    int? waId = widget.workAddressId;
    if (cid == null) {
      final c = Get.find<JobDetailController>();
      final j = c.job.value;
      cid = (j?['customer_id'] as num?)?.toInt();
      if (cid == null) {
        setState(() {
          _loading = false;
          _err = 'Missing customer';
        });
        return;
      }
      waId ??= (j?['work_address_id'] as num?)?.toInt();
      final wa = j?['work_address'];
      if (waId == null && wa is Map) {
        waId = (wa['id'] as num?)?.toInt();
      }
    }

    setState(() {
      _loading = true;
      _err = null;
      _disposeFieldControllers();
    });

    try {
      final payload = await jobs.getCustomerSiteReport(cid, workAddressId: waId, reportId: widget.reportId);
      final rep = payload['report'];
      final tpl = payload['template'];
      if (rep is! Map) throw ApiException('Invalid site report response');
      final def = tpl is Map ? tpl['definition'] : null;
      if (def is! Map) throw ApiException('Invalid template');

      final reportMap = Map<String, dynamic>.from(rep);
      final defMap = Map<String, dynamic>.from(def);
      final doc = reportMap['document'];
      final values = doc is Map ? (doc['values'] as Map?) : null;
      final valueStr = <String, String>{};
      if (values != null) {
        for (final e in values.entries) {
          valueStr[e.key.toString()] = e.value?.toString() ?? '';
        }
      }

      final fields = <Map<String, dynamic>>[];
      _collectFields(defMap, fields);

      final titleText = (reportMap['report_title'] as String?)?.trim() ?? '';
      _titleCtr = TextEditingController(text: titleText);

      _repeatableInstances.clear();
      final repeatableRaw = doc is Map ? doc['repeatable_values'] : null;
      if (repeatableRaw is Map) {
        for (final entry in repeatableRaw.entries) {
          final sectionId = entry.key.toString();
          final list = entry.value;
          if (list is! List) continue;
          final instances = <Map<String, dynamic>>[];
          for (final item in list) {
            if (item is! Map) continue;
            final inst = Map<String, dynamic>.from(item);
            final instanceId = inst['id']?.toString() ?? '';
            if (instanceId.isEmpty) continue;
            instances.add(inst);
            final vals = inst['values'];
            final valueMap = vals is Map
                ? vals.map((k, v) => MapEntry(k.toString(), v?.toString() ?? ''))
                : <String, String>{};
            final sectionFields = _sectionFields(defMap, sectionId);
            for (final f in sectionFields) {
              final fieldId = (f['id'] as String?) ?? '';
              if (fieldId.isEmpty) continue;
              final type = (f['type'] as String?) ?? 'text';
              if (type == 'static_text' || type == 'image' || type == 'signature') continue;
              final ctrlKey = _repeatableCtrlKey(sectionId, instanceId, fieldId);
              final cur = valueMap[fieldId] ?? '';
              if (type == 'yes_no_na' || type == 'pass_fail') {
                _yesNo[ctrlKey] = cur.isEmpty ? null : cur;
              } else {
                _textCtr[ctrlKey] = TextEditingController(text: cur);
              }
            }
          }
          _repeatableInstances[sectionId] = instances;
        }
      }

      for (final f in fields) {
        final id = (f['id'] as String?) ?? '';
        if (id.isEmpty) continue;
        final type = (f['type'] as String?) ?? 'text';
        if (type == 'static_text') continue;
        final cur = valueStr[id] ?? '';
        if (type == 'yes_no_na') {
          _yesNo[id] = cur.isEmpty ? null : cur;
        } else if (type == 'image' || type == 'signature') {
          continue;
        } else {
          _textCtr[id] = TextEditingController(text: cur);
        }
      }

      final fieldImages = doc is Map ? (doc['field_images'] as Map?) : null;

      if (!mounted) return;
      setState(() {
        _report = reportMap;
        _templateDef = defMap;
        _customerId = cid;
        _workAddressId = waId;
        _reportId = (reportMap['id'] as num?)?.toInt();
      });

      if (fieldImages != null && _reportId != null) {
        for (final entry in fieldImages.entries) {
          final list = entry.value;
          if (list is List) {
            for (final item in list) {
              if (item is Map) {
                final imageId = (item['image_id'] as num?)?.toInt();
                final rowId = item['id']?.toString() ?? '';
                final caption = item['description']?.toString() ?? '';
                final note = item['note']?.toString() ?? '';
                if (rowId.isNotEmpty) {
                  _imageCaptionCtr[rowId] = TextEditingController(text: caption);
                  _imageNoteCtr[rowId] = TextEditingController(text: note);
                }
                if (imageId != null) {
                  unawaited(_loadImageBytes(cid, _reportId!, imageId));
                }
              }
            }
          }
        }
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } catch (e) {
      if (mounted) setState(() => _err = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadImageBytes(int customerId, int reportId, int imageId) async {
    if (_imageCache.containsKey(imageId)) return;
    try {
      final jobs = Get.find<JobsRepository>();
      final bytes = await jobs.getCustomerSiteReportImageBytes(customerId, reportId, imageId);
      if (mounted) {
        setState(() {
          _imageCache[imageId] = Uint8List.fromList(bytes);
        });
      }
    } catch (_) {
      // ignore
    }
  }

  Future<void> _uploadSignature(String fieldId) async {
    final sig = _sigCtr[fieldId];
    if (sig == null || sig.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please draw a signature first.')));
      return;
    }
    final cid = _customerId;
    final rid = _reportId;
    final rep = _report;
    if (cid == null || rid == null || rep == null) return;

    setState(() {
      _signatureBusy[fieldId] = true;
    });

    try {
      final bytes = await sig.toPngBytes();
      if (bytes == null || bytes.isEmpty) {
        throw Exception('Failed to generate PNG bytes from signature.');
      }
      final jobs = Get.find<JobsRepository>();
      final b64 = base64Encode(bytes);
      final filename = 'signature_${DateTime.now().millisecondsSinceEpoch}.png';

      final res = await jobs.postCustomerSiteReportImage(
        cid,
        rid,
        filename: filename,
        contentType: 'image/png',
        contentBase64: b64,
      );

      final image = res['image'];
      final imageId = image is Map ? (image['id'] as num?)?.toInt() : null;
      if (imageId == null) {
        throw Exception('Upload succeeded but no image ID was returned.');
      }

      final doc = _jsonClone(Map<String, dynamic>.from((rep['document'] as Map?) ?? {}));
      final fieldImages = Map<String, dynamic>.from((doc['field_images'] as Map?) ?? {});
      final row = <String, dynamic>{
        'id': DateTime.now().millisecondsSinceEpoch.toString(),
        'image_id': imageId,
        'description': 'Signature',
        'note': '',
      };
      fieldImages[fieldId] = [row];
      doc['field_images'] = fieldImages;

      final title = _titleCtr?.text.trim();
      await jobs.putCustomerSiteReport(
        cid,
        <String, dynamic>{
          'report_id': rid,
          if (_workAddressId != null) 'work_address_id': _workAddressId,
          'document': doc,
          if (title != null && title.isNotEmpty) 'report_title': title,
        },
      );

      setState(() {
        _imageCache[imageId] = bytes;
        _report = {
          ...rep,
          'document': doc,
        };
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Signature saved.')));
    } on ApiException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      setState(() {
        _signatureBusy[fieldId] = false;
      });
    }
  }

  Future<void> _clearSignature(String fieldId, int imageId) async {
    final cid = _customerId;
    final rid = _reportId;
    final rep = _report;
    if (cid == null || rid == null || rep == null) return;

    setState(() {
      _signatureBusy[fieldId] = true;
    });

    try {
      final jobs = Get.find<JobsRepository>();
      await jobs.deleteCustomerSiteReportImage(cid, rid, imageId);

      final doc = _jsonClone(Map<String, dynamic>.from((rep['document'] as Map?) ?? {}));
      final fieldImages = Map<String, dynamic>.from((doc['field_images'] as Map?) ?? {});
      fieldImages[fieldId] = [];
      doc['field_images'] = fieldImages;

      final title = _titleCtr?.text.trim();
      await jobs.putCustomerSiteReport(
        cid,
        <String, dynamic>{
          'report_id': rid,
          if (_workAddressId != null) 'work_address_id': _workAddressId,
          'document': doc,
          if (title != null && title.isNotEmpty) 'report_title': title,
        },
      );

      setState(() {
        _imageCache.remove(imageId);
        _sigCtr[fieldId]?.clear();
        _report = {
          ...rep,
          'document': doc,
        };
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Signature cleared.')));
    } on ApiException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      setState(() {
        _signatureBusy[fieldId] = false;
      });
    }
  }

  Future<void> _pickImageSource(BuildContext context, String fieldId) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xF21E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_rounded, color: Colors.white),
              title: Text('Gallery', style: GoogleFonts.inter(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndUploadImage(fieldId, ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_rounded, color: Colors.white),
              title: Text('Camera', style: GoogleFonts.inter(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndUploadImage(fieldId, ImageSource.camera);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAndUploadImage(String fieldId, ImageSource source) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: source,
      maxWidth: 2000,
      imageQuality: 82,
    );
    if (file == null) return;

    final cid = _customerId;
    final rid = _reportId;
    final rep = _report;
    if (cid == null || rid == null || rep == null) return;

    setState(() {
      _signatureBusy[fieldId] = true;
    });

    try {
      final bytes = await file.readAsBytes();
      final name = file.name;
      final path = name.toLowerCase();
      final mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
      final b64 = base64Encode(bytes);

      final jobs = Get.find<JobsRepository>();
      final res = await jobs.postCustomerSiteReportImage(
        cid,
        rid,
        filename: name,
        contentType: mime,
        contentBase64: b64,
      );

      final image = res['image'];
      final imageId = image is Map ? (image['id'] as num?)?.toInt() : null;
      if (imageId == null) {
        throw Exception('Upload succeeded but no image ID was returned.');
      }

      final doc = _jsonClone(Map<String, dynamic>.from((rep['document'] as Map?) ?? {}));
      final fieldImages = Map<String, dynamic>.from((doc['field_images'] as Map?) ?? {});
      final list = List<dynamic>.from(fieldImages[fieldId] ?? []);
      
      final rowId = DateTime.now().millisecondsSinceEpoch.toString();
      final row = <String, dynamic>{
        'id': rowId,
        'image_id': imageId,
        'description': '',
        'note': '',
      };
      
      list.add(row);
      fieldImages[fieldId] = list;
      doc['field_images'] = fieldImages;

      // Update controllers immediately
      _imageCaptionCtr[rowId] = TextEditingController(text: '');
      _imageNoteCtr[rowId] = TextEditingController(text: '');

      final title = _titleCtr?.text.trim();
      await jobs.putCustomerSiteReport(
        cid,
        <String, dynamic>{
          'report_id': rid,
          if (_workAddressId != null) 'work_address_id': _workAddressId,
          'document': doc,
          if (title != null && title.isNotEmpty) 'report_title': title,
        },
      );

      setState(() {
        _imageCache[imageId] = bytes;
        _report = {
          ...rep,
          'document': doc,
        };
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Image uploaded.')));
    } on ApiException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      setState(() {
        _signatureBusy[fieldId] = false;
      });
    }
  }

  Future<void> _removeImageRow(String fieldId, String rowId, int imageId) async {
    final cid = _customerId;
    final rid = _reportId;
    final rep = _report;
    if (cid == null || rid == null || rep == null) return;

    setState(() {
      _signatureBusy[fieldId] = true;
    });

    try {
      final jobs = Get.find<JobsRepository>();
      await jobs.deleteCustomerSiteReportImage(cid, rid, imageId);

      final doc = _jsonClone(Map<String, dynamic>.from((rep['document'] as Map?) ?? {}));
      final fieldImages = Map<String, dynamic>.from((doc['field_images'] as Map?) ?? {});
      final list = List<dynamic>.from(fieldImages[fieldId] ?? []);
      list.removeWhere((item) => item is Map && item['id']?.toString() == rowId);
      fieldImages[fieldId] = list;
      doc['field_images'] = fieldImages;

      _imageCaptionCtr[rowId]?.dispose();
      _imageCaptionCtr.remove(rowId);
      _imageNoteCtr[rowId]?.dispose();
      _imageNoteCtr.remove(rowId);

      final title = _titleCtr?.text.trim();
      await jobs.putCustomerSiteReport(
        cid,
        <String, dynamic>{
          'report_id': rid,
          if (_workAddressId != null) 'work_address_id': _workAddressId,
          'document': doc,
          if (title != null && title.isNotEmpty) 'report_title': title,
        },
      );

      setState(() {
        _imageCache.remove(imageId);
        _report = {
          ...rep,
          'document': doc,
        };
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Image removed.')));
    } on ApiException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      setState(() {
        _signatureBusy[fieldId] = false;
      });
    }
  }

  Future<void> _save() async {
    final jobs = Get.find<JobsRepository>();
    final cid = _customerId;
    final rid = _reportId;
    final rep = _report;
    if (cid == null || rid == null || rep == null) return;

    setState(() => _saving = true);
    try {
      final doc = _jsonClone(Map<String, dynamic>.from((rep['document'] as Map?) ?? {}));
      final values = Map<String, dynamic>.from((doc['values'] as Map?) ?? {});
      for (final e in _textCtr.entries) {
        if (e.key.contains('|')) continue;
        values[e.key] = e.value.text;
      }
      for (final e in _yesNo.entries) {
        if (e.key.contains('|')) continue;
        values[e.key] = e.value ?? '';
      }
      doc['values'] = values;

      final repeatableOut = <String, dynamic>{};
      for (final entry in _repeatableInstances.entries) {
        final sectionId = entry.key;
        final sectionFields = _templateDef != null ? _sectionFields(_templateDef!, sectionId) : <Map<String, dynamic>>[];
        final list = <Map<String, dynamic>>[];
        for (final inst in entry.value) {
          final instanceId = inst['id']?.toString() ?? '';
          if (instanceId.isEmpty) continue;
          final instValues = <String, dynamic>{};
          for (final f in sectionFields) {
            final fieldId = (f['id'] as String?) ?? '';
            if (fieldId.isEmpty) continue;
            final type = (f['type'] as String?) ?? 'text';
            if (type == 'static_text' || type == 'image' || type == 'signature') continue;
            final ctrlKey = _repeatableCtrlKey(sectionId, instanceId, fieldId);
            if (type == 'yes_no_na' || type == 'pass_fail') {
              instValues[fieldId] = _yesNo[ctrlKey] ?? '';
            } else {
              instValues[fieldId] = _textCtr[ctrlKey]?.text ?? '';
            }
          }
          list.add({'id': instanceId, 'values': instValues});
        }
        repeatableOut[sectionId] = list;
      }
      doc['repeatable_values'] = repeatableOut;

      final fieldImages = Map<String, dynamic>.from((doc['field_images'] as Map?) ?? {});
      for (final entry in fieldImages.entries) {
        final list = entry.value;
        if (list is List) {
          for (int i = 0; i < list.length; i++) {
            final item = list[i];
            if (item is Map) {
              final itemMap = Map<String, dynamic>.from(item);
              final rowId = itemMap['id']?.toString() ?? '';
              if (rowId.isNotEmpty) {
                if (_imageCaptionCtr.containsKey(rowId)) {
                  itemMap['description'] = _imageCaptionCtr[rowId]!.text;
                }
                if (_imageNoteCtr.containsKey(rowId)) {
                  itemMap['note'] = _imageNoteCtr[rowId]!.text;
                }
                list[i] = itemMap;
              }
            }
          }
        }
      }
      doc['field_images'] = fieldImages;

      final title = _titleCtr?.text.trim();
      await jobs.putCustomerSiteReport(
        cid,
        <String, dynamic>{
          'report_id': rid,
          if (_workAddressId != null) 'work_address_id': _workAddressId,
          'document': doc,
          if (title != null && title.isNotEmpty) 'report_title': title,
        },
      );
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _downloadPdf() async {
    final jobs = Get.find<JobsRepository>();
    final cid = _customerId;
    final rid = _reportId;
    if (cid == null || rid == null) return;
    try {
      final bytes = await jobs.getCustomerSiteReportPdf(cid, rid);
      if (bytes.isEmpty) return;
      final dir = await getTemporaryDirectory();
      final f = File('${dir.path}/site-report-$rid.pdf');
      await f.writeAsBytes(bytes, flush: true);
      await OpenFilex.open(f.path);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_err != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_err!, textAlign: TextAlign.center, style: GoogleFonts.inter(color: AppColors.slate400)),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    final rep = _report!;
    final cert = rep['certificate_number']?.toString();
    final updated = rep['updated_at']?.toString();

    final fields = <Map<String, dynamic>>[];
    if (_templateDef != null) _collectFields(_templateDef!, fields);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Site report',
                  style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                ),
              ),
              FilledButton.tonal(onPressed: _downloadPdf, child: const Text('PDF')),
            ],
          ),
          if (cert != null && cert.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Certificate: $cert', style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 13)),
          ],
          if (updated != null && updated.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Updated $updated', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12)),
          ],
          const SizedBox(height: 16),
          TextField(
            controller: _titleCtr,
            style: GoogleFonts.inter(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Report title',
              labelStyle: GoogleFonts.inter(color: AppColors.slate400),
              filled: true,
              fillColor: AppColors.whiteOverlay(0.06),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          if (_templateDef != null && _templateDef!['sections'] is List)
            for (final sec in (_templateDef!['sections'] as List))
              if (sec is Map)
                if (sec['repeatable'] == true)
                  ..._repeatableSectionWidgets(Map<String, dynamic>.from(sec))
                else
                  ..._sectionWidgets(Map<String, dynamic>.from(sec)),
          if (_templateDef != null && _templateDef!['footer'] is Map)
            if ((_templateDef!['footer']['fields'] as List?)?.isNotEmpty == true)
              ..._sectionWidgets(Map<String, dynamic>.from(_templateDef!['footer'])),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
          ),
        ],
      ),
    );
  }

  List<Map<String, dynamic>> _sectionFields(Map<String, dynamic> def, String sectionId) {
    final sections = def['sections'];
    if (sections is! List) return [];
    for (final s in sections) {
      if (s is! Map) continue;
      if ((s['id'] as String?) != sectionId) continue;
      final fields = s['fields'];
      if (fields is! List) return [];
      return fields.whereType<Map>().map((f) => Map<String, dynamic>.from(f)).toList();
    }
    return [];
  }

  void _addRepeatableInstance(String sectionId, List<Map<String, dynamic>> sectionFields) {
    final instanceId = 'door_${DateTime.now().millisecondsSinceEpoch}';
    final inst = <String, dynamic>{'id': instanceId, 'values': <String, dynamic>{}};
    setState(() {
      final list = List<Map<String, dynamic>>.from(_repeatableInstances[sectionId] ?? []);
      list.add(inst);
      _repeatableInstances[sectionId] = list;
      for (final f in sectionFields) {
        final fieldId = (f['id'] as String?) ?? '';
        if (fieldId.isEmpty) continue;
        final type = (f['type'] as String?) ?? 'text';
        if (type == 'static_text' || type == 'image' || type == 'signature') continue;
        final ctrlKey = _repeatableCtrlKey(sectionId, instanceId, fieldId);
        if (type == 'yes_no_na' || type == 'pass_fail') {
          _yesNo[ctrlKey] = null;
        } else {
          _textCtr[ctrlKey] = TextEditingController();
        }
      }
    });
  }

  void _removeRepeatableInstance(String sectionId, String instanceId, List<Map<String, dynamic>> sectionFields) {
    setState(() {
      _repeatableInstances[sectionId] = (_repeatableInstances[sectionId] ?? [])
          .where((inst) => inst['id']?.toString() != instanceId)
          .toList();
      for (final f in sectionFields) {
        final fieldId = (f['id'] as String?) ?? '';
        if (fieldId.isEmpty) continue;
        final ctrlKey = _repeatableCtrlKey(sectionId, instanceId, fieldId);
        _textCtr.remove(ctrlKey)?.dispose();
        _yesNo.remove(ctrlKey);
        _sigCtr.remove(_scopedRepeatableFieldKey(sectionId, instanceId, fieldId))?.dispose();
      }
      _repeatableCollapsed.remove('$sectionId|$instanceId');
    });
  }

  List<Widget> _repeatableSectionWidgets(Map<String, dynamic> sec) {
    final sectionId = (sec['id'] as String?) ?? '';
    final title = (sec['title'] as String?) ?? 'Section';
    final repeatLabel = (sec['repeat_label'] as String?)?.trim().isNotEmpty == true
        ? (sec['repeat_label'] as String).trim()
        : 'Item';
    final addLabel = (sec['add_label'] as String?)?.trim().isNotEmpty == true
        ? (sec['add_label'] as String).trim()
        : 'Add ${repeatLabel.toLowerCase()}';
    final fields = sec['fields'];
    final sectionFields = fields is List
        ? fields.whereType<Map>().map((f) => Map<String, dynamic>.from(f)).toList()
        : <Map<String, dynamic>>[];
    final instances = _repeatableInstances[sectionId] ?? [];

    return [
      Padding(
        padding: const EdgeInsets.only(top: 24, bottom: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 4),
                  const Divider(color: AppColors.primary, thickness: 1),
                ],
              ),
            ),
            TextButton.icon(
              onPressed: () => _addRepeatableInstance(sectionId, sectionFields),
              icon: const Icon(Icons.add_rounded, color: AppColors.primary, size: 18),
              label: Text(addLabel, style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
      if (instances.isEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            'No $repeatLabel entries yet.',
            style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13),
          ),
        ),
      for (int i = 0; i < instances.length; i++)
        () {
          final inst = instances[i];
          final instanceId = inst['id']?.toString() ?? '';
          if (instanceId.isEmpty) return const SizedBox.shrink();
          final collapseKey = '$sectionId|$instanceId';
          final collapsed = _repeatableCollapsed[collapseKey] == true;
          final doorTitle = _textCtr[_repeatableCtrlKey(sectionId, instanceId, 'door_location')]?.text.trim();
          final cardTitle = (doorTitle != null && doorTitle.isNotEmpty) ? doorTitle : '$repeatLabel ${i + 1}';
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: AppColors.whiteOverlay(0.04),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.whiteOverlay(0.1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ListTile(
                  dense: true,
                  title: Text(cardTitle, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700)),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: Icon(collapsed ? Icons.expand_more : Icons.expand_less, color: AppColors.slate300),
                        onPressed: () => setState(() => _repeatableCollapsed[collapseKey] = !collapsed),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline_rounded, color: AppColors.primary),
                        onPressed: () => _removeRepeatableInstance(sectionId, instanceId, sectionFields),
                      ),
                    ],
                  ),
                ),
                if (!collapsed)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    child: Column(
                      children: [
                        for (final f in sectionFields)
                          ..._fieldWidgets(
                            f,
                            storageKey: _scopedRepeatableFieldKey(sectionId, instanceId, (f['id'] as String?) ?? ''),
                            ctrlKey: _repeatableCtrlKey(sectionId, instanceId, (f['id'] as String?) ?? ''),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          );
        }(),
    ];
  }

  List<Widget> _sectionWidgets(Map<String, dynamic> sec) {
    final title = (sec['title'] as String?) ?? (sec['id'] == 'footer' ? 'Footer' : '');
    final fields = sec['fields'];
    if (fields is! List || fields.isEmpty) return [];

    return [
      if (title.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 24, bottom: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: GoogleFonts.inter(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 4),
              const Divider(color: AppColors.primary, thickness: 1),
            ],
          ),
        ),
      for (final f in fields)
        if (f is Map) ..._fieldWidgets(Map<String, dynamic>.from(f)),
    ];
  }

  List<Widget> _fieldWidgets(
    Map<String, dynamic> f, {
    String? storageKey,
    String? ctrlKey,
  }) {
    final id = (f['id'] as String?) ?? '';
    final key = storageKey ?? id;
    final controlKey = ctrlKey ?? id;
    final label = (f['label'] as String?) ?? id;
    final type = (f['type'] as String?) ?? 'text';
    if (id.isEmpty) return [];

    if (type == 'static_text') {
      final content = (f['content'] as String?) ?? '';
      return [
        Padding(
          padding: const EdgeInsets.only(bottom: 12, top: 4),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.whiteOverlay(0.04),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.whiteOverlay(0.08)),
            ),
            child: Text(
              content,
              style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 13, height: 1.4),
            ),
          ),
        ),
      ];
    }

    final labelWidget = Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 6),
      child: Text(
        label,
        style: GoogleFonts.inter(
          color: Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    );

    if (type == 'image') {
      final busy = _signatureBusy[key] == true;
      final doc = _report?['document'];
      final fieldImages = doc is Map ? doc['field_images'] : null;
      final list = fieldImages is Map ? fieldImages[key] : null;
      final List<dynamic> rows = list is List ? list : [];

      final Widget imageListContent;
      if (busy) {
        imageListContent = const SizedBox(
          height: 80,
          child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
        );
      } else {
        imageListContent = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final row in rows)
              if (row is Map) () {
                final rowId = row['id']?.toString() ?? '';
                final imageId = (row['image_id'] as num?)?.toInt();
                final bytes = imageId != null ? _imageCache[imageId] : null;
                final capCtr = _imageCaptionCtr[rowId];
                final noteCtr = _imageNoteCtr[rowId];

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.whiteOverlay(0.03),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.whiteOverlay(0.08)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (bytes != null)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            bytes,
                            height: 140,
                            width: double.infinity,
                            fit: BoxFit.contain,
                          ),
                        )
                      else
                        const SizedBox(
                          height: 100,
                          child: Center(child: Text('Loading preview...', style: TextStyle(color: Colors.white60))),
                        ),
                      const SizedBox(height: 8),
                      if (capCtr != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: TextField(
                            controller: capCtr,
                            style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                            decoration: InputDecoration(
                              labelText: 'Caption (e.g. Before work)',
                              labelStyle: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                              filled: true,
                              fillColor: AppColors.whiteOverlay(0.03),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ),
                        ),
                      if (noteCtr != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: TextField(
                            controller: noteCtr,
                            style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                            decoration: InputDecoration(
                              labelText: 'Short note (optional)',
                              labelStyle: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                              filled: true,
                              fillColor: AppColors.whiteOverlay(0.03),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ),
                        ),
                      if (imageId != null)
                        TextButton.icon(
                          onPressed: () => _removeImageRow(key, rowId, imageId),
                          icon: const Icon(Icons.delete_outline_rounded, color: AppColors.primary, size: 18),
                          label: Text('Remove image', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
                        ),
                    ],
                  ),
                );
              }(),
            OutlinedButton.icon(
              onPressed: () => _pickImageSource(context, key),
              icon: const Icon(Icons.add_a_photo_rounded, color: Colors.white, size: 16),
              label: Text('Add photo', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: AppColors.whiteOverlay(0.25)),
              ),
            ),
          ],
        );
      }

      return [
        labelWidget,
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: imageListContent,
        ),
      ];
    }

    if (type == 'signature') {
      final busy = _signatureBusy[key] == true;
      int? imageId;
      final doc = _report?['document'];
      final fieldImages = doc is Map ? doc['field_images'] : null;
      final list = fieldImages is Map ? fieldImages[key] : null;
      if (list is List && list.isNotEmpty) {
        final first = list.first;
        if (first is Map) {
          imageId = (first['image_id'] as num?)?.toInt();
        }
      }

      final Widget content;
      if (busy) {
        content = const SizedBox(
          height: 120,
          child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
        );
      } else if (imageId != null && _imageCache.containsKey(imageId)) {
        content = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              padding: const EdgeInsets.all(8),
              child: Image.memory(
                _imageCache[imageId]!,
                height: 120,
                width: double.infinity,
                fit: BoxFit.contain,
              ),
            ),
            TextButton.icon(
              onPressed: () => _clearSignature(key, imageId!),
              icon: const Icon(Icons.delete_outline_rounded, color: AppColors.primary),
              label: Text('Clear signature', style: GoogleFonts.inter(color: AppColors.primary)),
            ),
          ],
        );
      } else if (imageId != null) {
        content = const SizedBox(
          height: 120,
          child: Center(child: Text('Loading signature...', style: TextStyle(color: Colors.white60))),
        );
      } else {
        final sig = _sigCtr.putIfAbsent(
          key,
          () => SignatureController(
            penStrokeWidth: 2.5,
            penColor: Colors.black87,
            exportBackgroundColor: Colors.white,
          ),
        );
        content = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Signature(
                controller: sig,
                height: 150,
                backgroundColor: Colors.white,
              ),
            ),
            Row(
              children: [
                TextButton(
                  onPressed: sig.clear,
                  child: Text('Clear pad', style: GoogleFonts.inter(color: AppColors.slate400)),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => _uploadSignature(key),
                  icon: const Icon(Icons.check_rounded, color: AppColors.primary),
                  label: Text('Save signature', style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ],
        );
      }

      return [
        labelWidget,
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: content,
        ),
      ];
    }

    if (type == 'yes_no_na') {
      const opts = ['yes', 'no', 'na', 'not_determined', ''];
      return [
        labelWidget,
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DropdownButtonFormField<String>(
            value: _yesNo[controlKey] != null && _yesNo[controlKey]!.isNotEmpty ? _yesNo[controlKey] : null,
            decoration: InputDecoration(
              filled: true,
              fillColor: AppColors.whiteOverlay(0.06),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            dropdownColor: const Color(0xFF1E293B),
            style: GoogleFonts.inter(color: Colors.white),
            items: [
              const DropdownMenuItem(value: null, child: Text('—', style: TextStyle(color: Colors.white))),
              for (final o in opts.where((x) => x.isNotEmpty))
                DropdownMenuItem(value: o, child: Text(o, style: const TextStyle(color: Colors.white))),
            ],
            onChanged: (v) => setState(() => _yesNo[controlKey] = v),
          ),
        ),
      ];
    }

    if (type == 'pass_fail') {
      const opts = ['pass', 'fail', 'not_determined', ''];
      return [
        labelWidget,
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DropdownButtonFormField<String>(
            value: _yesNo[controlKey] != null && _yesNo[controlKey]!.isNotEmpty ? _yesNo[controlKey] : null,
            decoration: InputDecoration(
              filled: true,
              fillColor: AppColors.whiteOverlay(0.06),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            dropdownColor: const Color(0xFF1E293B),
            style: GoogleFonts.inter(color: Colors.white),
            items: [
              const DropdownMenuItem(value: null, child: Text('—', style: TextStyle(color: Colors.white))),
              for (final o in opts.where((x) => x.isNotEmpty))
                DropdownMenuItem(value: o, child: Text(o, style: const TextStyle(color: Colors.white))),
            ],
            onChanged: (v) => setState(() => _yesNo[controlKey] = v),
          ),
        ),
      ];
    }

    if (type == 'date') {
      final c = _textCtr[controlKey];
      if (c == null) return [];
      return [
        labelWidget,
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(
            controller: c,
            readOnly: true,
            style: GoogleFonts.inter(color: Colors.white),
            decoration: InputDecoration(
              filled: true,
              fillColor: AppColors.whiteOverlay(0.06),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              suffixIcon: const Icon(Icons.calendar_month_rounded, color: AppColors.slate400),
            ),
            onTap: () async {
              final initial = DateTime.tryParse(c.text) ?? DateTime.now();
              final picked = await showDatePicker(
                context: context,
                initialDate: initial,
                firstDate: DateTime(2000),
                lastDate: DateTime(2100),
                builder: (context, child) {
                  return Theme(
                    data: Theme.of(context).copyWith(
                      colorScheme: const ColorScheme.dark(
                        primary: AppColors.primary,
                        onPrimary: Colors.white,
                        surface: Color(0xFF1E293B),
                        onSurface: Colors.white,
                      ),
                      dialogBackgroundColor: const Color(0xFF0F172A),
                    ),
                    child: child!,
                  );
                },
              );
              if (picked != null) {
                c.text = picked.toIso8601String().split('T')[0];
              }
            },
          ),
        ),
      ];
    }

    final c = _textCtr[controlKey];
    if (c == null) return [];

    final maxLines = type == 'textarea' ? 5 : 1;
    return [
      labelWidget,
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          maxLines: maxLines,
          style: GoogleFonts.inter(color: Colors.white),
          decoration: InputDecoration(
            filled: true,
            fillColor: AppColors.whiteOverlay(0.06),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
    ];
  }
}
