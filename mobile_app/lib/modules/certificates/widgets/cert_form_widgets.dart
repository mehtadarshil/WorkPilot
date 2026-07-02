import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import '../constants/certificate_schedule_items.dart';

class CertOption {
  const CertOption(this.value, this.label);

  final String value;
  final String label;
}

const passFailNaOptions = [
  CertOption('', '-'),
  CertOption('pass', 'Pass'),
  CertOption('fail', 'Fail'),
  CertOption('na', 'N/A'),
];

const inspectionOutcomeOptions = [
  CertOption('', '-'),
  CertOption('pass', 'Pass'),
  CertOption('c1', 'C1'),
  CertOption('c2', 'C2'),
  CertOption('c3', 'C3'),
  CertOption('fi', 'FI'),
  CertOption('lim', 'LIM'),
  CertOption('nv', 'NV'),
  CertOption('na', 'N/A'),
  CertOption('x', 'X'),
];

const yesNoNaOptions = [
  CertOption('', '-'),
  CertOption('yes', 'Yes'),
  CertOption('no', 'No'),
  CertOption('na', 'N/A'),
];

class CertificateGradientScaffold extends StatelessWidget {
  const CertificateGradientScaffold({
    required this.appBar,
    required this.child,
    super.key,
  });

  final PreferredSizeWidget appBar;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: appBar,
      body: Container(
        width: double.infinity,
        height: double.infinity,
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
        child: child,
      ),
    );
  }
}

class CertSectionCard extends StatelessWidget {
  const CertSectionCard({
    required this.title,
    required this.children,
    this.subtitle,
    super.key,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: Colors.white,
        border: Border.all(color: AppColors.slate200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: GoogleFonts.inter(
                color: AppColors.slate900,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                subtitle!,
                style: GoogleFonts.inter(
                  color: AppColors.slate400,
                  fontSize: 12,
                ),
              ),
            ],
            const SizedBox(height: 14),
            ...children,
          ],
        ),
      ),
    );
  }
}

class CertTextField extends StatelessWidget {
  const CertTextField({
    required this.label,
    required this.value,
    required this.onChanged,
    this.maxLines = 1,
    this.keyboardType,
    super.key,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final int maxLines;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        key: ValueKey('$label:$value'),
        initialValue: value,
        maxLines: maxLines,
        keyboardType: keyboardType,
        style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
        decoration: _inputDecoration(label),
        onChanged: onChanged,
      ),
    );
  }
}

class CertSelectField extends StatelessWidget {
  const CertSelectField({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    super.key,
  });

  final String label;
  final String value;
  final List<CertOption> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final safeValue = options.any((option) => option.value == value)
        ? value
        : options.first.value;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<String>(
        initialValue: safeValue,
        dropdownColor: AppColors.slate50,
        style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
        decoration: _inputDecoration(label),
        items: options
            .map(
              (option) => DropdownMenuItem<String>(
                value: option.value,
                child: Text(option.label),
              ),
            )
            .toList(),
        onChanged: (next) {
          if (next != null) onChanged(next);
        },
      ),
    );
  }
}

class CertQuickSetTextField extends StatelessWidget {
  const CertQuickSetTextField({
    required this.label,
    required this.value,
    required this.onChanged,
    this.quickOptions = const ['N/A', 'LIM'],
    super.key,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final List<String> quickOptions;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CertTextField(label: label, value: value, onChanged: onChanged),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: quickOptions
              .map(
                (option) => ActionChip(
                  label: Text(option, style: GoogleFonts.inter(fontSize: 11)),
                  backgroundColor: AppColors.slate100,
                  side: BorderSide(color: AppColors.slate200),
                  onPressed: () => onChanged(option),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class CertQuickSetSelectField extends StatelessWidget {
  const CertQuickSetSelectField({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    this.quickOptions = const ['N/A', 'LIM'],
    super.key,
  });

  final String label;
  final String value;
  final List<CertOption> options;
  final ValueChanged<String> onChanged;
  final List<String> quickOptions;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CertSelectField(label: label, value: value, options: options, onChanged: onChanged),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: quickOptions
              .map(
                (option) => ActionChip(
                  label: Text(option, style: GoogleFonts.inter(fontSize: 11)),
                  backgroundColor: AppColors.slate100,
                  side: BorderSide(color: AppColors.slate200),
                  onPressed: () => onChanged(option.toLowerCase() == 'n/a' ? 'na' : option),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class OutcomeChipGroup extends StatelessWidget {
  const OutcomeChipGroup({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    super.key,
  });

  final String label;
  final String value;
  final List<CertOption> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: options.map((option) {
              final selected = option.value == value;
              return ChoiceChip(
                label: Text(option.label),
                selected: selected,
                selectedColor: AppColors.primary,
                backgroundColor: AppColors.slate100,
                labelStyle: GoogleFonts.inter(
                  color: selected ? Colors.white : AppColors.slate600,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
                side: BorderSide(
                  color: selected
                      ? AppColors.primary
                      : AppColors.slate200,
                ),
                onSelected: (_) => onChanged(option.value),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class ScheduleItemsCard extends StatelessWidget {
  const ScheduleItemsCard({
    required this.title,
    required this.items,
    required this.valueFor,
    required this.onChanged,
    this.options = inspectionOutcomeOptions,
    super.key,
  });

  final String title;
  final List<CertificateScheduleItem> items;
  final String Function(String id) valueFor;
  final void Function(String id, String value) onChanged;
  final List<CertOption> options;

  @override
  Widget build(BuildContext context) {
    return CertSectionCard(
      title: title,
      subtitle: 'Outcome values update the certificate JSON by item ID.',
      children: items
          .map(
            (item) => OutcomeChipGroup(
              label: '${item.id}  ${item.label}',
              value: valueFor(item.id),
              options: options,
              onChanged: (value) => onChanged(item.id, value),
            ),
          )
          .toList(),
    );
  }
}

InputDecoration _inputDecoration(String label) {
  return InputDecoration(
    labelText: label,
    labelStyle: GoogleFonts.inter(color: AppColors.slate500),
    filled: true,
    fillColor: Colors.white,
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: AppColors.slate200),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: AppColors.primary, width: 1.5),
    ),
  );
}
