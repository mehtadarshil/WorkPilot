import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/values/app_colors.dart';
import 'circuit_quick_add_presets.dart';

const Map<String, Color> _categoryChipBg = {
  'distribution': Color(0xFFF1F5F9),
  'submains': Color(0xFFEDE9FE),
  'lights': Color(0xFFFEF3C7),
  'sockets': Color(0xFFFFE4E6),
  'kitchen': Color(0xFFE0F2FE),
  'bathroom': Color(0xFFCFFAFE),
  'ac_heating': Color(0xFFFFEDD5),
  'misc': Color(0xFFD1FAE5),
};

const Map<String, Color> _categoryChipFg = {
  'distribution': Color(0xFF1E293B),
  'submains': Color(0xFF4C1D95),
  'lights': Color(0xFF78350F),
  'sockets': Color(0xFF881337),
  'kitchen': Color(0xFF0C4A6E),
  'bathroom': Color(0xFF155E75),
  'ac_heating': Color(0xFF9A3412),
  'misc': Color(0xFF065F46),
};

Future<void> showCircuitQuickAddSheet({
  required BuildContext context,
  required void Function(CircuitQuickAddPreset preset) onSelect,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.slate50,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => _CircuitQuickAddSheet(onSelect: onSelect),
  );
}

class _CircuitQuickAddSheet extends StatefulWidget {
  const _CircuitQuickAddSheet({required this.onSelect});

  final void Function(CircuitQuickAddPreset preset) onSelect;

  @override
  State<_CircuitQuickAddSheet> createState() => _CircuitQuickAddSheetState();
}

class _CircuitQuickAddSheetState extends State<_CircuitQuickAddSheet> {
  String _tab = 'domestic';
  final Set<String> _added = {};

  @override
  Widget build(BuildContext context) {
    final categories = categoriesForTab(_tab);
    final presets = presetsForTab(_tab);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.72,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                child: Row(
                  children: [
                    Text(
                      'Quick add',
                      style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.slate900),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: Icon(Icons.close_rounded, color: Colors.black54),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: circuitQuickAddTabs.map((tab) {
                    final id = tab['id']!;
                    final selected = _tab == id;
                    return ChoiceChip(
                      label: Text(tab['label']!),
                      selected: selected,
                      onSelected: (_) => setState(() => _tab = id),
                      selectedColor: AppColors.primary,
                      labelStyle: GoogleFonts.inter(
                        fontWeight: FontWeight.w600,
                        color: selected ? Colors.white : AppColors.slate600,
                      ),
                      backgroundColor: AppColors.slate100,
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: _tab == 'ultimate_london'
                    ? Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Container(
                          padding: const EdgeInsets.all(24),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.slate200, style: BorderStyle.solid),
                            color: Colors.white,
                          ),
                          child: Text(
                            'No custom presets configured yet. Use Domestic or Commercial presets, or add circuits manually with Add.',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 13, height: 1.4),
                          ),
                        ),
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        children: [
                          for (final category in categories) ...[
                            Text(
                              circuitQuickAddCategoryLabels[category] ?? category,
                              style: GoogleFonts.inter(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.black45,
                                letterSpacing: 0.6,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: presets.where((p) => p.category == category).map((preset) {
                                final added = _added.contains(preset.id);
                                final bg = _categoryChipBg[category] ?? AppColors.slate100;
                                final fg = _categoryChipFg[category] ?? AppColors.slate900;
                                return ActionChip(
                                  label: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        preset.label,
                                        style: GoogleFonts.inter(fontWeight: FontWeight.w600, color: fg),
                                      ),
                                      if (preset.subtitle != null)
                                        Text(
                                          preset.subtitle!,
                                          style: GoogleFonts.inter(fontSize: 10, color: fg.withValues(alpha: 0.75)),
                                        ),
                                      if (added)
                                        Text(
                                          'Added',
                                          style: GoogleFonts.inter(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.primary,
                                          ),
                                        ),
                                    ],
                                  ),
                                  onPressed: () {
                                    widget.onSelect(preset);
                                    setState(() => _added.add(preset.id));
                                  },
                                  backgroundColor: bg,
                                  side: added ? BorderSide(color: AppColors.primary, width: 2) : null,
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 16),
                          ],
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
