import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/values/app_colors.dart';
import 'circuit_columns.dart';

class CircuitCell extends StatefulWidget {
  const CircuitCell({
    required this.columnKey,
    required this.value,
    required this.isCalc,
    required this.overridden,
    required this.options,
    required this.onChanged,
    required this.onResetOverride,
    this.readOnly = false,
    this.onMoveFocus,
    this.focusNode,
    super.key,
  });

  final String columnKey;
  final String value;
  final bool isCalc;
  final bool overridden;
  final List<String>? options;
  final ValueChanged<String> onChanged;
  final VoidCallback? onResetOverride;
  final bool readOnly;
  final void Function(int rowDelta, int colDelta)? onMoveFocus;
  final FocusNode? focusNode;

  @override
  State<CircuitCell> createState() => _CircuitCellState();
}

class _CircuitCellState extends State<CircuitCell> {
  late TextEditingController _textController;
  FocusNode? _ownedFocusNode;

  FocusNode get _focusNode => widget.focusNode ?? _ownedFocusNode!;

  @override
  void initState() {
    super.initState();
    _textController = TextEditingController(text: widget.value);
    if (widget.focusNode == null) {
      _ownedFocusNode = FocusNode();
    }
  }

  @override
  void didUpdateWidget(covariant CircuitCell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _textController.text) {
      _textController.text = widget.value;
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    _ownedFocusNode?.dispose();
    super.dispose();
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (widget.readOnly || widget.onMoveFocus == null) return KeyEventResult.ignored;
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    if (event.logicalKey == LogicalKeyboardKey.enter) {
      final shift = HardwareKeyboard.instance.isShiftPressed;
      widget.onMoveFocus!(shift ? -1 : 0, shift ? -1 : 1);
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowUp) {
      widget.onMoveFocus!(-1, 0);
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowDown) {
      widget.onMoveFocus!(1, 0);
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowLeft) {
      widget.onMoveFocus!(0, -1);
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowRight) {
      widget.onMoveFocus!(0, 1);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final hasOptions = widget.options != null && widget.options!.isNotEmpty;

    final cellDecoration = InputDecoration(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.slate200),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.slate200),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: AppColors.primary, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      isDense: true,
    );

    return Container(
      decoration: BoxDecoration(
        color: widget.isCalc
            ? (widget.overridden
                ? Colors.amber.shade900.withValues(alpha: 0.15)
                : AppColors.primary.withValues(alpha: 0.08))
            : Colors.transparent,
        border: widget.overridden ? Border.all(color: Colors.amber.shade500, width: 1) : null,
      ),
      alignment: Alignment.center,
      child: Row(
        children: [
          Expanded(
            child: Focus(
              onKeyEvent: _handleKey,
              child: hasOptions
                  ? RawAutocomplete<String>(
                      textEditingController: _textController,
                      focusNode: _focusNode,
                      optionsBuilder: (TextEditingValue textEditingValue) {
                        final query = textEditingValue.text.trim().toLowerCase();
                        if (query.isEmpty) return widget.options!;
                        return widget.options!.where((String option) {
                          return option.toLowerCase().contains(query);
                        });
                      },
                      optionsViewBuilder: (
                        BuildContext context,
                        AutocompleteOnSelected<String> onSelected,
                        Iterable<String> options,
                      ) {
                        final double cellWidth = circuitColWidths[widget.columnKey] ?? 80.0;
                        final double menuWidth = cellWidth < 150.0 ? 150.0 : cellWidth;

                        return Align(
                          alignment: Alignment.topLeft,
                          child: Material(
                            color: Colors.white,
                            elevation: 12,
                            borderRadius: BorderRadius.circular(8),
                            clipBehavior: Clip.antiAlias,
                            child: Container(
                              width: menuWidth,
                              decoration: BoxDecoration(
                                border: Border.all(color: const Color(0xFFE2E8F0)),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              constraints: const BoxConstraints(maxHeight: 180),
                              child: ListView.builder(
                                padding: EdgeInsets.zero,
                                shrinkWrap: true,
                                itemCount: options.length,
                                itemBuilder: (BuildContext context, int index) {
                                  final String option = options.elementAt(index);
                                  final isKeyword = widget.columnKey == 'description' &&
                                      (option == 'Spare' || option == 'Unknown');
                                  return Material(
                                    color: Colors.transparent,
                                    child: InkWell(
                                      onTap: () => onSelected(option),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        decoration: BoxDecoration(
                                          color: isKeyword ? const Color(0xFFF0FDFA) : null,
                                          border: const Border(
                                            bottom: BorderSide(color: Color(0xFFF1F5F9)),
                                          ),
                                        ),
                                        child: Text(
                                          option,
                                          style: GoogleFonts.inter(
                                            color: isKeyword ? const Color(0xFF0F766E) : const Color(0xFF1E293B),
                                            fontSize: 13,
                                            fontWeight: isKeyword ? FontWeight.w600 : FontWeight.w500,
                                          ),
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ),
                        );
                      },
                      onSelected: widget.readOnly ? null : widget.onChanged,
                      fieldViewBuilder: (
                        BuildContext context,
                        TextEditingController textEditingController,
                        FocusNode focusNode,
                        VoidCallback onFieldSubmitted,
                      ) {
                        return TextField(
                          controller: textEditingController,
                          focusNode: focusNode,
                          readOnly: widget.readOnly,
                          style: GoogleFonts.inter(
                            color: widget.isCalc ? const Color(0xFF134E4A) : Colors.white,
                            fontSize: 13,
                          ),
                          decoration: cellDecoration,
                          onChanged: widget.readOnly ? null : widget.onChanged,
                        );
                      },
                    )
                  : TextField(
                      controller: _textController,
                      focusNode: _focusNode,
                      readOnly: widget.readOnly,
                      style: GoogleFonts.inter(
                        color: widget.isCalc ? const Color(0xFF134E4A) : Colors.white,
                        fontSize: 13,
                      ),
                      decoration: cellDecoration,
                      onChanged: widget.readOnly ? null : widget.onChanged,
                    ),
            ),
          ),
          if (hasOptions && !widget.readOnly)
            IconButton(
              icon: Icon(Icons.arrow_drop_down, color: AppColors.slate400, size: 16),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: () {
                if (!_focusNode.hasFocus) {
                  _focusNode.requestFocus();
                } else {
                  _focusNode.unfocus();
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _focusNode.requestFocus();
                  });
                }
              },
            ),
          if (widget.isCalc && widget.overridden && widget.onResetOverride != null && !widget.readOnly)
            IconButton(
              icon: Icon(Icons.refresh, color: AppColors.primary, size: 14),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: widget.onResetOverride,
            ),
        ],
      ),
    );
  }
}
