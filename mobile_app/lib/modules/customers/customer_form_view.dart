import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'customer_form_controller.dart';

class CustomerFormView extends GetView<CustomerFormController> {
  const CustomerFormView({super.key});

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
            controller.isEdit ? 'Edit customer' : 'New customer',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700),
          ),
          leading: IconButton(
            icon: const Icon(Icons.close_rounded),
            onPressed: Get.back,
          ),
          actions: [
            Obx(
              () => TextButton(
                onPressed: controller.saving.value ? null : controller.submit,
                child: controller.saving.value
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(
                        'Save',
                        style: GoogleFonts.inter(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
              ),
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
          child: Form(
            key: controller.formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: [
                Obx(() {
                  if (controller.error.value.isEmpty) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Material(
                      color: const Color(0x55B91C1C),
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          controller.error.value,
                          style: GoogleFonts.inter(color: Colors.white),
                        ),
                      ),
                    ),
                  );
                }),
                _fieldLabel('Full name *'),
                _textField(controller.fullName, required: true),
                _fieldLabel('Email *'),
                _textField(controller.email, required: true, keyboard: TextInputType.emailAddress),
                _fieldLabel('Phone'),
                _textField(controller.phone, keyboard: TextInputType.phone),
                _fieldLabel('Company'),
                _textField(controller.company),
                _fieldLabel('Address'),
                _textField(controller.address, maxLines: 2),
                Row(
                  children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_fieldLabel('City'), _textField(controller.city)])),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_fieldLabel('Region'), _textField(controller.region)])),
                  ],
                ),
                _fieldLabel('Country'),
                _textField(controller.country),
                _fieldLabel('Notes'),
                _textField(controller.notes, maxLines: 4),
                _fieldLabel('Status'),
                Obx(
                  () => Wrap(
                    spacing: 8,
                    children: ['LEAD', 'ACTIVE', 'INACTIVE'].map((s) {
                      final sel = controller.status.value == s;
                      return ChoiceChip(
                        label: Text(s, style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
                        selected: sel,
                        onSelected: (_) => controller.status.value = s,
                        selectedColor: AppColors.primary,
                        backgroundColor: AppColors.whiteOverlay(0.1),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 16),
                _fieldLabel('Customer type'),
                Obx(() {
                  final types = controller.customerTypes;
                  if (types.isEmpty) {
                    return Text(
                      'Types unavailable (check Settings permissions on web).',
                      style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 13),
                    );
                  }
                  return DropdownButtonFormField<int?>(
                    value: controller.customerTypeId.value,
                    dropdownColor: AppColors.slate900,
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: _inputDeco(),
                    items: [
                      const DropdownMenuItem<int?>(value: null, child: Text('None')),
                      ...types.map((t) {
                        final id = (t['id'] as num?)?.toInt();
                        final name = '${t['name'] ?? id}';
                        return DropdownMenuItem<int?>(
                          value: id,
                          child: Text(name),
                        );
                      }),
                    ],
                    onChanged: (v) => controller.customerTypeId.value = v,
                  );
                }),
                const SizedBox(height: 28),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  onPressed: controller.saving.value ? null : controller.submit,
                  child: Text(
                    controller.isEdit ? 'Save changes' : 'Create customer',
                    style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _fieldLabel(String t) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, top: 10),
      child: Text(
        t,
        style: GoogleFonts.inter(
          color: AppColors.whiteOverlay(0.7),
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }

  InputDecoration _inputDeco() {
    return InputDecoration(
      filled: true,
      fillColor: AppColors.whiteOverlay(0.08),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.whiteOverlay(0.12)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.primary),
      ),
    );
  }

  Widget _textField(
    TextEditingController c, {
    bool required = false,
    TextInputType keyboard = TextInputType.text,
    int maxLines = 1,
  }) {
    return TextFormField(
      controller: c,
      maxLines: maxLines,
      keyboardType: keyboard,
      style: GoogleFonts.inter(color: Colors.white),
      decoration: _inputDeco(),
      validator: required
          ? (v) {
              if (v == null || v.trim().isEmpty) return 'Required';
              return null;
            }
          : null,
    );
  }
}
