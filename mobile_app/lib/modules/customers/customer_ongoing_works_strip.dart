import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/routes/app_routes.dart';
import '../../core/network/api_exception.dart';
import '../../core/values/app_colors.dart';
import '../../data/repositories/customers_repository.dart';
import 'customer_tabs/helpers.dart';
import 'customer_tabs/shell.dart';

/// Always-visible ongoing jobs for a work site (matches web Overview → On going works).
class CustomerOngoingWorksStrip extends StatefulWidget {
  const CustomerOngoingWorksStrip({
    super.key,
    required this.customerId,
    required this.workAddressId,
  });

  final int customerId;
  final int workAddressId;

  @override
  State<CustomerOngoingWorksStrip> createState() => _CustomerOngoingWorksStripState();
}

class _CustomerOngoingWorksStripState extends State<CustomerOngoingWorksStrip> {
  final _repo = Get.find<CustomersRepository>();
  List<Map<String, dynamic>> _jobs = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant CustomerOngoingWorksStrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workAddressId != widget.workAddressId || oldWidget.customerId != widget.customerId) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final jobs = await _repo.getCustomerJobs(
        widget.customerId,
        workAddressId: widget.workAddressId,
      );
      if (!mounted) return;
      setState(() {
        _jobs = jobs.where(jobIsOngoing).toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _jobs = [];
        _loading = false;
      });
      Get.snackbar('Jobs', e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _jobs = [];
        _loading = false;
      });
    }
  }

  Future<void> _openJob(Map<String, dynamic> j) async {
    final id = (j['id'] as num?)?.toInt();
    if (id == null || id <= 0) return;
    await Get.toNamed(AppRoutes.jobDetail, arguments: id);
    if (mounted) await _load();
  }

  Future<void> _addJob() async {
    final result = await Get.toNamed<dynamic>(
      AppRoutes.customerNewJob,
      arguments: <String, dynamic>{
        'customerId': widget.customerId,
        'work_address_id': widget.workAddressId,
      },
    );
    if (result == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.slate50,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'ONGOING WORKS',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.1,
                    color: AppColors.slate500,
                  ),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: _loading ? null : _addJob,
                  icon: Icon(Icons.add_rounded, size: 18),
                  label: Text('Add job', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
              )
            else if (_jobs.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'No ongoing works at this site.',
                  style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
                ),
              )
            else
              ..._jobs.map(
                (j) => Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Material(
                    color: AppColors.whiteOverlay(0.08),
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      onTap: () => _openJob(j),
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    ctStr(j, 'description_name').isEmpty ? ctStr(j, 'title') : ctStr(j, 'description_name'),
                                    style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '#${(j['id'] as num?)?.toInt().toString().padLeft(4, '0') ?? '—'} · ${formatIsoDateWeekday(ctStr(j, 'created_at'))}',
                                    style: GoogleFonts.inter(fontSize: 12, color: AppColors.whiteOverlay(0.5)),
                                  ),
                                ],
                              ),
                            ),
                            TextButton(
                              onPressed: () => _openJob(j),
                              child: Text('View', style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.primary)),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
