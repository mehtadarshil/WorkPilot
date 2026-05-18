import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/providers/api_provider.dart';
import '../../data/repositories/jobs_repository.dart';
import 'job_detail_controller.dart';

class JobTabFiles extends StatefulWidget {
  const JobTabFiles({super.key});

  @override
  State<JobTabFiles> createState() => _JobTabFilesState();
}

class _JobTabFilesState extends State<JobTabFiles> {
  bool _loading = true;
  String? _err;
  List<Map<String, dynamic>> _files = [];

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
      final m = await jobs.getJobFilesManifest(c.jobId);
      final raw = m['files'];
      _files = raw is List
          ? raw.map((e) => e is Map ? Map<String, dynamic>.from(e as Map) : <String, dynamic>{}).toList()
          : [];
    } on ApiException catch (e) {
      _err = e.message;
      _files = [];
    } catch (e) {
      _err = '$e';
      _files = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openFile(String href) async {
    final api = Get.find<ApiProvider>();
    final path = href.startsWith('/') ? href : '/$href';
    try {
      final res = await api.getBytes(path);
      final bytes = res.data;
      if (bytes == null || bytes.isEmpty) return;
      final dir = await getTemporaryDirectory();
      final name = path.split('/').last.split('?').first;
      final f = File('${dir.path}/$name');
      await f.writeAsBytes(bytes, flush: true);
      await OpenFilex.open(f.path);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
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
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        itemCount: _files.length + 1,
        itemBuilder: (context, i) {
          if (i == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Job files (manifest)',
                style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
              ),
            );
          }
          final f = _files[i - 1];
          final label = (f['label'] as String?) ?? (f['source'] as String?) ?? 'File';
          final href = f['href'] as String?;
          final kind = (f['kind'] as String?) ?? '';
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: AppColors.whiteOverlay(0.08),
              borderRadius: BorderRadius.circular(14),
              child: ListTile(
                title: Text(label, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
                subtitle: Text(
                  '${f['source'] ?? ''} · $kind',
                  style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
                ),
                trailing: href != null && href.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.open_in_new_rounded, color: AppColors.primary),
                        onPressed: () => _openFile(href),
                      )
                    : null,
              ),
            ),
          );
        },
      ),
    );
  }
}
