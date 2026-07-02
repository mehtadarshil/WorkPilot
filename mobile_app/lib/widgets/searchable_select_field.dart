import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../core/values/app_colors.dart';

/// One row in a [SearchableSelectField] list.
class SelectOption<T> {
  const SelectOption({required this.value, required this.label});

  final T value;
  final String label;
}

/// Form field that opens a searchable sheet — avoids iOS full-screen dropdown traps.
class SearchableSelectField<T> extends StatelessWidget {
  const SearchableSelectField({
    super.key,
    required this.label,
    required this.options,
    required this.onChanged,
    this.value,
    this.enabled = true,
    this.hint = 'Select…',
    this.sheetTitle,
    this.allowClear = false,
    this.clearLabel = 'None',
    this.decoration,
  });

  final String label;
  final List<SelectOption<T>> options;
  final T? value;
  final ValueChanged<T?>? onChanged;
  final bool enabled;
  final String hint;
  final String? sheetTitle;
  final bool allowClear;
  final String clearLabel;
  final InputDecoration? decoration;

  String? get _displayLabel {
    if (value == null) return null;
    for (final o in options) {
      if (o.value == value) return o.label;
    }
    return null;
  }

  Future<void> _openSheet(BuildContext context) async {
    if (!enabled || onChanged == null) return;
    final picked = await showModalBottomSheet<Object?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.slate50,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _SearchablePickerSheet<T>(
        title: sheetTitle ?? label,
        options: options,
        selected: value,
        allowClear: allowClear,
        clearLabel: clearLabel,
      ),
    );
    if (!context.mounted) return;
    if (picked == null || identical(picked, _pickerDismissed)) return;
    if (identical(picked, _pickerCleared)) {
      onChanged!(null);
      return;
    }
    onChanged!(picked as T);
  }

  @override
  Widget build(BuildContext context) {
    final display = _displayLabel;
    final baseDeco = decoration ??
        InputDecoration(
          labelText: label,
          labelStyle: TextStyle(color: Colors.white70),
          floatingLabelBehavior: FloatingLabelBehavior.always,
        );

    return InputDecorator(
      decoration: baseDeco.copyWith(
        enabled: enabled,
        suffixIcon: Icon(
          Icons.unfold_more_rounded,
          color: enabled ? Colors.white70 : Colors.white38,
        ),
      ),
      child: InkWell(
        onTap: enabled ? () => _openSheet(context) : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text(
            display ?? hint,
            style: GoogleFonts.inter(
              color: display != null
                  ? (enabled ? Colors.white : Colors.white54)
                  : AppColors.whiteOverlay(0.45),
              fontWeight: display != null ? FontWeight.w500 : FontWeight.w400,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}

/// Cancel — close without changing the field.
const Object _pickerDismissed = Object();

/// Clear — set value to null when [SearchableSelectField.allowClear] is true.
const Object _pickerCleared = Object();

class _SearchablePickerSheet<T> extends StatefulWidget {
  const _SearchablePickerSheet({
    required this.title,
    required this.options,
    required this.selected,
    required this.allowClear,
    required this.clearLabel,
  });

  final String title;
  final List<SelectOption<T>> options;
  final T? selected;
  final bool allowClear;
  final String clearLabel;

  @override
  State<_SearchablePickerSheet<T>> createState() => _SearchablePickerSheetState<T>();
}

class _SearchablePickerSheetState<T> extends State<_SearchablePickerSheet<T>> {
  final _searchC = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchC.dispose();
    super.dispose();
  }

  List<SelectOption<T>> get _filtered {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return widget.options;
    return widget.options.where((o) => o.label.toLowerCase().contains(q)).toList();
  }

  void _cancel() => Navigator.of(context).pop(_pickerDismissed);

  void _pick(T value) => Navigator.of(context).pop(value);

  void _pickClear() => Navigator.of(context).pop(_pickerCleared);

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.sizeOf(context).height * 0.88;
    final filtered = _filtered;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxH),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                child: Row(
                  children: [
                    TextButton(onPressed: _cancel, child: const Text('Cancel')),
                    Expanded(
                      child: Text(
                        widget.title,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(width: 64),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: TextField(
                  controller: _searchC,
                  style: GoogleFonts.inter(color: AppColors.slate900),
                  decoration: InputDecoration(
                    hintText: 'Search…',
                    hintStyle: GoogleFonts.inter(color: AppColors.slate500),
                    prefixIcon: Icon(Icons.search_rounded, color: AppColors.slate400),
                    filled: true,
                    fillColor: AppColors.whiteOverlay(0.06),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.slate200),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.slate200),
                    ),
                  ),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              Flexible(
                child: filtered.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'No matches',
                          style: GoogleFonts.inter(color: AppColors.slate400),
                        ),
                      )
                    : ListView.builder(
                        shrinkWrap: true,
                        itemCount: filtered.length + (widget.allowClear ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (widget.allowClear && index == 0) {
                            return ListTile(
                              title: Text(
                                widget.clearLabel,
                                style: GoogleFonts.inter(color: AppColors.slate400),
                              ),
                              onTap: _pickClear,
                            );
                          }
                          final opt = filtered[widget.allowClear ? index - 1 : index];
                          final selected = opt.value == widget.selected;
                          return ListTile(
                            title: Text(
                              opt.label,
                              style: GoogleFonts.inter(
                                color: Colors.white,
                                fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                              ),
                            ),
                            trailing: selected
                                ? Icon(Icons.check_rounded, color: AppColors.primary)
                                : null,
                            onTap: () => _pick(opt.value),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
