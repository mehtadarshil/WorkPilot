import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'holidays_controller.dart';

class HolidaysView extends GetView<HolidaysController> {
  const HolidaysView({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.gradientStart,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.gradientStart,
        appBar: AppBar(
          title: Text(
            'Holidays',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
          actions: [
            IconButton(
              onPressed: () => _showRequestSheet(context),
              icon: const Icon(Icons.add_rounded, color: AppColors.primary),
              tooltip: 'Request Holiday',
            ),
          ],
        ),
        body: Container(
          decoration: const BoxDecoration(
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
          child: Obx(() {
            if (controller.loading.value) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              );
            }
            return Column(
              children: [
                _buildTabBar(),
                Expanded(
                  child: controller.selectedTab.value == 0
                      ? _buildRequestsList(context)
                      : _buildHolidaysList(context),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }

  Widget _buildTabBar() {
    final pendingCount = controller.requests.where((r) => r.status == 'pending').length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 12),
      child: Row(
        children: [
          _tabChip(0, 'Requests${pendingCount > 0 ? ' ($pendingCount)' : ''}'),
          const SizedBox(width: 8),
          _tabChip(1, 'Company Holidays'),
        ],
      ),
    );
  }

  Widget _tabChip(int index, String label) {
    final selected = controller.selectedTab.value == index;
    return GestureDetector(
      onTap: () => controller.selectedTab.value = index,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary.withValues(alpha: 0.25)
              : AppColors.whiteOverlay(0.06),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected
                ? AppColors.primary.withValues(alpha: 0.5)
                : AppColors.whiteOverlay(0.12),
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? AppColors.primary : AppColors.whiteOverlay(0.6),
          ),
        ),
      ),
    );
  }

  Widget _buildRequestsList(BuildContext context) {
    final pending = controller.requests.where((r) => r.status == 'pending').toList();
    final processed = controller.requests.where((r) => r.status != 'pending').toList();

    if (controller.error.value.isNotEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                controller.error.value,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(color: AppColors.slate400),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: controller.fetchData,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (controller.requests.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.whiteOverlay(0.08),
                border: Border.all(color: AppColors.whiteOverlay(0.12)),
              ),
              child: Icon(Icons.event_busy_rounded, size: 32, color: AppColors.whiteOverlay(0.4)),
            ),
            const SizedBox(height: 16),
            Text(
              'No holiday requests',
              style: GoogleFonts.inter(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.whiteOverlay(0.7),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Tap + to request time off',
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.4)),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 28),
      children: [
        if (pending.isNotEmpty) ...[
          _sectionHeader('Pending Requests'),
          const SizedBox(height: 10),
          ...pending.map((r) => _requestCard(r, showActions: true)),
          const SizedBox(height: 24),
        ],
        if (processed.isNotEmpty) ...[
          _sectionHeader('Processed'),
          const SizedBox(height: 10),
          ...processed.map((r) => _requestCard(r, showActions: false)),
        ],
      ],
    );
  }

  Widget _requestCard(HolidayRequest r, {required bool showActions}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          splashColor: AppColors.primary.withValues(alpha: 0.1),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              color: const Color(0xB30F172A),
              border: Border.all(color: AppColors.whiteOverlay(0.12)),
              boxShadow: [
                BoxShadow(
                  color: AppColors.blackOverlay(0.25),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          r.officerName ?? 'Unknown',
                          style: GoogleFonts.inter(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      _statusBadge(r.status),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.calendar_today_rounded, size: 14, color: AppColors.whiteOverlay(0.5)),
                      const SizedBox(width: 6),
                      Text(
                        '${_fmtDate(r.startDate)}${r.startDate != r.endDate ? ' – ${_fmtDate(r.endDate)}' : ''}',
                        style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.6)),
                      ),
                      if (r.daysCount != null) ...[
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '${r.daysCount}d',
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(Icons.label_rounded, size: 14, color: AppColors.whiteOverlay(0.5)),
                      const SizedBox(width: 6),
                      Text(
                        r.leaveType[0].toUpperCase() + r.leaveType.substring(1),
                        style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.6)),
                      ),
                    ],
                  ),
                  if (r.reason != null && r.reason!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      r.reason!,
                      style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.45)),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  if (showActions) ...[
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => controller.updateRequestStatus(r.id, 'rejected'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFFFCA5A5),
                              side: const BorderSide(color: Color(0xFF7F1D1D)),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              padding: const EdgeInsets.symmetric(vertical: 11),
                            ),
                            child: Text(
                              'Reject',
                              style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () => controller.updateRequestStatus(r.id, 'approved'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              padding: const EdgeInsets.symmetric(vertical: 11),
                            ),
                            child: Text(
                              'Approve',
                              style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHolidaysList(BuildContext context) {
    if (controller.holidays.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.whiteOverlay(0.08),
                border: Border.all(color: AppColors.whiteOverlay(0.12)),
              ),
              child: Icon(Icons.celebration_rounded, size: 32, color: AppColors.whiteOverlay(0.4)),
            ),
            const SizedBox(height: 16),
            Text(
              'No company holidays',
              style: GoogleFonts.inter(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.whiteOverlay(0.7),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Tap + to add a holiday',
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.4)),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 28),
      children: controller.holidays.map((h) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              splashColor: AppColors.primary.withValues(alpha: 0.1),
              child: Ink(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  color: const Color(0xB30F172A),
                  border: Border.all(color: AppColors.whiteOverlay(0.12)),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.blackOverlay(0.25),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.primary.withValues(alpha: 0.22),
                        ),
                        child: const Icon(Icons.celebration_rounded, size: 22, color: Colors.white),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              h.title,
                              style: GoogleFonts.inter(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _fmtDate(h.holidayDate),
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                color: AppColors.whiteOverlay(0.58),
                              ),
                            ),
                            if (h.isRecurring)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    'Recurring',
                                    style: GoogleFonts.inter(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () async {
                          final confirmed = await Get.dialog<bool>(
                            AlertDialog(
                              backgroundColor: const Color(0xFF1E293B),
                              title: Text(
                                'Delete Holiday',
                                style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700),
                              ),
                              content: Text(
                                'Delete "${h.title}"?',
                                style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.7)),
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Get.back(result: false),
                                  child: Text('Cancel', style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.6))),
                                ),
                                TextButton(
                                  onPressed: () => Get.back(result: true),
                                  child: Text('Delete', style: GoogleFonts.inter(color: const Color(0xFFFCA5A5))),
                                ),
                              ],
                            ),
                          );
                          if (confirmed == true) {
                            controller.deleteCompanyHoliday(h.id);
                          }
                        },
                        icon: Icon(
                          Icons.delete_outline_rounded,
                          size: 20,
                          color: AppColors.whiteOverlay(0.4),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  void _showRequestSheet(BuildContext context) {
    final startController = TextEditingController();
    final endController = TextEditingController();
    final reasonController = TextEditingController();
    String leaveType = 'annual';
    int? selectedOfficerId;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Container(
          decoration: const BoxDecoration(
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF0F172A),
                Color(0xFF022C22),
              ],
            ),
          ),
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: StatefulBuilder(
            builder: (ctx, setState) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.whiteOverlay(0.2),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Request Holiday',
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (controller.officers.isNotEmpty) ...[
                    _sheetLabel('Staff Member'),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<int>(
                      value: selectedOfficerId,
                      dropdownColor: const Color(0xFF1E293B),
                      style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                      decoration: _sheetInputDecoration('Myself'),
                      items: [
                        DropdownMenuItem<int>(
                          value: null,
                          child: Text('Myself', style: GoogleFonts.inter(color: Colors.white)),
                        ),
                        ...controller.officers.map((o) => DropdownMenuItem<int>(
                          value: o['id'] as int,
                          child: Text(o['full_name'] as String? ?? '', style: GoogleFonts.inter(color: Colors.white)),
                        )),
                      ],
                      onChanged: (v) => setState(() => selectedOfficerId = v),
                    ),
                    const SizedBox(height: 16),
                  ],
                  _sheetLabel('Start Date'),
                  const SizedBox(height: 6),
                  TextField(
                    controller: startController,
                    readOnly: true,
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                    decoration: _sheetInputDecoration('Select date').copyWith(
                      suffixIcon: const Icon(Icons.calendar_today_rounded, size: 18, color: AppColors.primary),
                    ),
                    onTap: () async {
                      final d = await showDatePicker(
                        context: ctx,
                        initialDate: DateTime.now(),
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2030),
                        builder: (context, child) {
                          return Theme(
                            data: Theme.of(context).copyWith(
                              colorScheme: const ColorScheme.dark(
                                primary: AppColors.primary,
                                surface: Color(0xFF1E293B),
                              ),
                            ),
                            child: child!,
                          );
                        },
                      );
                      if (d != null) {
                        setState(() => startController.text = d.toIso8601String().substring(0, 10));
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  _sheetLabel('End Date'),
                  const SizedBox(height: 6),
                  TextField(
                    controller: endController,
                    readOnly: true,
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                    decoration: _sheetInputDecoration('Select date').copyWith(
                      suffixIcon: const Icon(Icons.calendar_today_rounded, size: 18, color: AppColors.primary),
                    ),
                    onTap: () async {
                      final d = await showDatePicker(
                        context: ctx,
                        initialDate: DateTime.now(),
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2030),
                        builder: (context, child) {
                          return Theme(
                            data: Theme.of(context).copyWith(
                              colorScheme: const ColorScheme.dark(
                                primary: AppColors.primary,
                                surface: Color(0xFF1E293B),
                              ),
                            ),
                            child: child!,
                          );
                        },
                      );
                      if (d != null) {
                        setState(() => endController.text = d.toIso8601String().substring(0, 10));
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  _sheetLabel('Leave Type'),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    value: leaveType,
                    dropdownColor: const Color(0xFF1E293B),
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                    decoration: _sheetInputDecoration(''),
                    items: const [
                      DropdownMenuItem(value: 'annual', child: Text('Annual Leave')),
                      DropdownMenuItem(value: 'sick', child: Text('Sick Leave')),
                      DropdownMenuItem(value: 'personal', child: Text('Personal Leave')),
                      DropdownMenuItem(value: 'unpaid', child: Text('Unpaid Leave')),
                      DropdownMenuItem(value: 'other', child: Text('Other')),
                    ],
                    onChanged: (v) => setState(() => leaveType = v ?? 'annual'),
                  ),
                  const SizedBox(height: 16),
                  _sheetLabel('Reason'),
                  const SizedBox(height: 6),
                  TextField(
                    controller: reasonController,
                    maxLines: 2,
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                    decoration: _sheetInputDecoration('Optional'),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        if (startController.text.isEmpty || endController.text.isEmpty) {
                          Get.snackbar('Error', 'Please select start and end dates');
                          return;
                        }
                        controller.submitRequest(
                          officerId: selectedOfficerId,
                          startDate: startController.text,
                          endDate: endController.text,
                          leaveType: leaveType,
                          reason: reasonController.text.isNotEmpty ? reasonController.text : null,
                        );
                        Navigator.pop(ctx);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: Text(
                        'Submit Request',
                        style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  Widget _sheetLabel(String text) {
    return Text(
      text,
      style: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.whiteOverlay(0.6),
      ),
    );
  }

  InputDecoration _sheetInputDecoration(String hint) {
    return InputDecoration(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.whiteOverlay(0.15)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
      ),
      filled: true,
      fillColor: AppColors.whiteOverlay(0.06),
      hintText: hint,
      hintStyle: GoogleFonts.inter(fontSize: 14, color: AppColors.whiteOverlay(0.35)),
    );
  }

  Widget _sectionHeader(String label) {
    return Text(
      label,
      style: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: AppColors.whiteOverlay(0.5),
        letterSpacing: 0.5,
      ),
    );
  }

  Widget _statusBadge(String status) {
    Color bgColor;
    Color textColor;
    Color borderColor;
    switch (status) {
      case 'approved':
        bgColor = AppColors.primary.withValues(alpha: 0.2);
        textColor = AppColors.primary;
        borderColor = AppColors.primary.withValues(alpha: 0.45);
        break;
      case 'rejected':
        bgColor = const Color(0xFF7F1D1D).withValues(alpha: 0.5);
        textColor = const Color(0xFFFCA5A5);
        borderColor = const Color(0xFF991B1B);
        break;
      default:
        bgColor = const Color(0xFF92400E).withValues(alpha: 0.4);
        textColor = const Color(0xFFFCD34D);
        borderColor = const Color(0xFF92400E);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderColor),
      ),
      child: Text(
        status[0].toUpperCase() + status.substring(1),
        style: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: textColor,
        ),
      ),
    );
  }

  String _fmtDate(String d) {
    try {
      final date = DateTime.parse(d);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${date.day} ${months[date.month - 1]} ${date.year}';
    } catch (_) {
      return d;
    }
  }
}
