import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../widgets/wp_surface.dart';
import 'holidays_controller.dart';

class HolidaysView extends GetView<HolidaysController> {
  const HolidaysView({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.slate50,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: AppColors.slate50,
        appBar: AppBar(
          title: Text(
            'Holidays',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_new_rounded),
            onPressed: Get.back,
          ),
          actions: [
            IconButton(
              onPressed: () => _showRequestSheet(context),
              icon: Icon(Icons.add_rounded, color: AppColors.primary),
              tooltip: 'Request Holiday',
            ),
          ],
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
          color: selected ? AppColors.primary.withValues(alpha: 0.12) : AppColors.slate100,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppColors.primary.withValues(alpha: 0.35) : AppColors.slate200,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? AppColors.primaryDark : AppColors.slate600,
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
                color: WpAccents.amber.withValues(alpha: 0.14),
                border: Border.all(color: WpAccents.amber.withValues(alpha: 0.35)),
              ),
              child: const Icon(Icons.event_busy_rounded, size: 32, color: WpAccents.amber),
            ),
            const SizedBox(height: 16),
            Text(
              'No holiday requests',
              style: GoogleFonts.inter(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.slate900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Tap + to request time off',
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
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
              color: Colors.white,
              border: Border.all(color: AppColors.slate200),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
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
                            color: AppColors.slate900,
                          ),
                        ),
                      ),
                      _statusBadge(r.status),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.calendar_today_rounded, size: 14, color: AppColors.slate400),
                      const SizedBox(width: 6),
                      Text(
                        _fmtRange(r.startDate, r.endDate, r.allDay),
                        style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate600),
                      ),
                      if (r.daysCount != null || r.startDate.isNotEmpty) ...[
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _fmtDuration(r.startDate, r.endDate, r.daysCount, r.allDay),
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
                      Icon(Icons.label_rounded, size: 14, color: AppColors.slate400),
                      const SizedBox(width: 6),
                      Text(
                        r.leaveType[0].toUpperCase() + r.leaveType.substring(1),
                        style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate600),
                      ),
                    ],
                  ),
                  if (r.reason != null && r.reason!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      r.reason!,
                      style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate400),
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
                              side: BorderSide(color: Color(0xFF7F1D1D)),
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
                color: WpAccents.mint.withValues(alpha: 0.14),
                border: Border.all(color: WpAccents.mint.withValues(alpha: 0.35)),
              ),
              child: const Icon(Icons.celebration_rounded, size: 32, color: WpAccents.mint),
            ),
            const SizedBox(height: 16),
            Text(
              'No company holidays',
              style: GoogleFonts.inter(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.slate900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Tap + to add a holiday',
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
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
                  color: Colors.white,
                  border: Border.all(color: AppColors.slate200),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
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
                        child: Icon(Icons.celebration_rounded, size: 22, color: WpAccents.mint),
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
                                color: AppColors.slate900,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _fmtDate(h.holidayDate),
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                color: AppColors.slate500,
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
                              backgroundColor: Colors.white,
                              title: Text(
                                'Delete Holiday',
                                style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w700),
                              ),
                              content: Text(
                                'Delete "${h.title}"?',
                                style: GoogleFonts.inter(color: AppColors.slate600),
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Get.back(result: false),
                                  child: Text('Cancel', style: GoogleFonts.inter(color: AppColors.slate600)),
                                ),
                                TextButton(
                                  onPressed: () => Get.back(result: true),
                                  child: Text('Delete', style: GoogleFonts.inter(color: const Color(0xFFDC2626))),
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
                          color: AppColors.slate400,
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
    bool? isAllDayState = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.slate50,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Container(
          decoration: const BoxDecoration(
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            color: Colors.white,
          ),
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: StatefulBuilder(
            builder: (ctx, setState) {
              // Track all day state
              isAllDayState ??= true;
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.slate300,
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
                      color: AppColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (controller.officers.isNotEmpty) ...[
                    _sheetLabel('Staff Member'),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<int>(
                      value: selectedOfficerId,
                      dropdownColor: Colors.white,
                      style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
                      decoration: _sheetInputDecoration('Myself'),
                      items: [
                        DropdownMenuItem<int>(
                          value: null,
                          child: Text('Myself', style: GoogleFonts.inter(color: AppColors.slate900)),
                        ),
                        ...controller.officers.map((o) => DropdownMenuItem<int>(
                          value: o['id'] as int,
                          child: Text(o['full_name'] as String? ?? '', style: GoogleFonts.inter(color: AppColors.slate900)),
                        )),
                      ],
                      onChanged: (v) => setState(() => selectedOfficerId = v),
                    ),
                    const SizedBox(height: 16),
                  ],
                  Row(
                    children: [
                      SizedBox(
                        height: 24,
                        width: 24,
                        child: Checkbox(
                          value: isAllDayState,
                          activeColor: AppColors.primary,
                          checkColor: Colors.white,
                          onChanged: (v) {
                            final val = v ?? true;
                            setState(() {
                              isAllDayState = val;
                              if (val) {
                                if (startController.text.length > 10) {
                                  startController.text = startController.text.substring(0, 10);
                                }
                                if (endController.text.length > 10) {
                                  endController.text = endController.text.substring(0, 10);
                                }
                              }
                            });
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'All Day',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.slate900,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _sheetLabel(isAllDayState! ? 'Start Date' : 'Start Date & Time'),
                  const SizedBox(height: 6),
                  TextField(
                    controller: startController,
                    readOnly: true,
                    style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
                    decoration: _sheetInputDecoration(isAllDayState! ? 'Select date' : 'Select date & time').copyWith(
                      suffixIcon: Icon(Icons.calendar_today_rounded, size: 18, color: AppColors.primary),
                    ),
                    onTap: () async {
                      if (isAllDayState!) {
                        final d = await showDatePicker(
                          context: ctx,
                          initialDate: DateTime.now(),
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2030),
                          builder: (context, child) {
                            return Theme(
                              data: Theme.of(context).copyWith(
                                colorScheme: ColorScheme.light(
                                  primary: AppColors.primary,
                                  surface: Colors.white,
                                ),
                              ),
                              child: child!,
                            );
                          },
                        );
                        if (d != null) {
                          setState(() => startController.text = d.toIso8601String().substring(0, 10));
                        }
                      } else {
                        final dt = await _pickDateTime(ctx, initialDateTime: DateTime.tryParse(startController.text));
                        if (dt != null) {
                          setState(() => startController.text = dt.toIso8601String().substring(0, 16));
                        }
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  _sheetLabel(isAllDayState! ? 'End Date' : 'End Date & Time'),
                  const SizedBox(height: 6),
                  TextField(
                    controller: endController,
                    readOnly: true,
                    style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
                    decoration: _sheetInputDecoration(isAllDayState! ? 'Select date' : 'Select date & time').copyWith(
                      suffixIcon: Icon(Icons.calendar_today_rounded, size: 18, color: AppColors.primary),
                    ),
                    onTap: () async {
                      if (isAllDayState!) {
                        final d = await showDatePicker(
                          context: ctx,
                          initialDate: DateTime.now(),
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2030),
                          builder: (context, child) {
                            return Theme(
                              data: Theme.of(context).copyWith(
                                colorScheme: ColorScheme.light(
                                  primary: AppColors.primary,
                                  surface: Colors.white,
                                ),
                              ),
                              child: child!,
                            );
                          },
                        );
                        if (d != null) {
                          setState(() => endController.text = d.toIso8601String().substring(0, 10));
                        }
                      } else {
                        final dt = await _pickDateTime(ctx, initialDateTime: DateTime.tryParse(endController.text));
                        if (dt != null) {
                          setState(() => endController.text = dt.toIso8601String().substring(0, 16));
                        }
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  _sheetLabel('Leave Type'),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    value: leaveType,
                    dropdownColor: Colors.white,
                    style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
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
                    style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
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
                        String startVal = startController.text;
                        String endVal = endController.text;
                        if (isAllDayState!) {
                          final onlyStart = startVal.split('T')[0];
                          final onlyEnd = endVal.split('T')[0];
                          startVal = '${onlyStart}T00:00:00';
                          endVal = '${onlyEnd}T23:59:59';
                        }
                        controller.submitRequest(
                          officerId: selectedOfficerId,
                          startDate: startVal,
                          endDate: endVal,
                          allDay: isAllDayState!,
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

  // Helper method for picking Date & Time
  Future<DateTime?> _pickDateTime(BuildContext context, {DateTime? initialDateTime}) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initialDateTime ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.light(
              primary: AppColors.primary,
              surface: Colors.white,
            ),
          ),
          child: child!,
        );
      },
    );
    if (date == null) return null;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initialDateTime ?? DateTime.now()),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.light(
              primary: AppColors.primary,
              surface: Colors.white,
            ),
          ),
          child: child!,
        );
      },
    );
    if (time == null) {
      return DateTime(date.year, date.month, date.day);
    }
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Widget _sheetLabel(String text) {
    return Text(
      text,
      style: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.slate600,
      ),
    );
  }

  InputDecoration _sheetInputDecoration(String hint) {
    return InputDecoration(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.slate200),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.primary, width: 1.5),
      ),
      filled: true,
      fillColor: Colors.white,
      hintText: hint,
      hintStyle: GoogleFonts.inter(fontSize: 14, color: AppColors.slate400),
    );
  }

  Widget _sectionHeader(String label) {
    return WpSectionLabel(label);
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

  String _fmtRange(String startStr, String endStr, [bool allDay = true]) {
    try {
      final start = DateTime.parse(startStr).toLocal();
      final end = DateTime.parse(endStr).toLocal();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      final startHasTime = !allDay;
      final endHasTime = !allDay;
      
      final startDateStr = '${start.day} ${months[start.month - 1]} ${start.year}';
      final endDateStr = '${end.day} ${months[end.month - 1]} ${end.year}';
      
      if (start.year == end.year && start.month == end.month && start.day == end.day) {
        if (startHasTime || endHasTime) {
          final startHr = start.hour.toString().padLeft(2, '0');
          final startMin = start.minute.toString().padLeft(2, '0');
          final endHr = end.hour.toString().padLeft(2, '0');
          final endMin = end.minute.toString().padLeft(2, '0');
          return '$startDateStr, $startHr:$startMin – $endHr:$endMin';
        }
        return startDateStr;
      } else {
        String startFmt = startDateStr;
        String endFmt = endDateStr;
        if (startHasTime) {
          final startHr = start.hour.toString().padLeft(2, '0');
          final startMin = start.minute.toString().padLeft(2, '0');
          startFmt = '$startDateStr at $startHr:$startMin';
        }
        if (endHasTime) {
          final endHr = end.hour.toString().padLeft(2, '0');
          final endMin = end.minute.toString().padLeft(2, '0');
          endFmt = '$endDateStr at $endHr:$endMin';
        }
        return '$startFmt – $endFmt';
      }
    } catch (_) {
      return '$startStr – $endStr';
    }
  }

  String _fmtDuration(String startStr, String endStr, num? backendDaysCount, [bool allDay = true]) {
    try {
      final start = DateTime.parse(startStr);
      final end = DateTime.parse(endStr);
      final diff = end.difference(start);
      final sameDay = start.year == end.year && start.month == end.month && start.day == end.day;
      // Timed (partial-day) leave always reports in hours.
      if (!allDay) {
        if (diff.inMinutes <= 0) return '–';
        final hrs = diff.inMinutes / 60.0;
        final hrsStr = hrs % 1 == 0 ? hrs.toInt().toString() : hrs.toStringAsFixed(1);
        return '${hrsStr}h';
      }
      if (diff.inSeconds <= 0 && sameDay) return '1d';
      if (sameDay && diff.inHours < 24) {
        if (diff.inHours < 1) return '1d';
        final hrs = diff.inMinutes / 60.0;
        final hrsStr = hrs % 1 == 0 ? hrs.toInt().toString() : hrs.toStringAsFixed(1);
        return '${hrsStr}h';
      }
      if (diff.inHours < 24) {
        final hrs = diff.inMinutes / 60.0;
        final hrsStr = hrs % 1 == 0 ? hrs.toInt().toString() : hrs.toStringAsFixed(1);
        return '${hrsStr}h';
      }
      final startDay = DateTime.utc(start.year, start.month, start.day);
      final endDay = DateTime.utc(end.year, end.month, end.day);
      final calendarDays = endDay.difference(startDay).inDays + 1;
      if (calendarDays > 1 && diff.inHours >= (calendarDays - 1) * 24 * 0.9) {
        return '${calendarDays}d';
      }
      final days = diff.inHours / 24.0;
      final daysStr = days % 1 == 0 ? days.toInt().toString() : days.toStringAsFixed(1);
      return '${daysStr}d';
    } catch (_) {
      return backendDaysCount != null ? '${backendDaysCount}d' : '';
    }
  }

}
