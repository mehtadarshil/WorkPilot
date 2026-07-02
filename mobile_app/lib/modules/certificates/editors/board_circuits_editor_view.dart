import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import '../../../core/values/app_colors.dart';
import '../certificate_document_utils.dart';
import '../certificate_editor_controller.dart';
import '../widgets/cert_form_widgets.dart';
import 'board_field_options.dart';
import 'circuit_calculations.dart';
import 'circuit_cell.dart';
import 'circuit_columns.dart';
import 'circuit_find_replace_sheet.dart';
import 'circuit_paste_sheet.dart';
import 'circuit_helpers.dart';
import 'circuit_quick_add_presets.dart';
import 'circuit_quick_add_sheet.dart';
import '../certificate_print_webview_page.dart';

class BoardCircuitsEditorView extends StatefulWidget {
  const BoardCircuitsEditorView({
    required this.controller,
    required this.boardIndex,
    super.key,
  });

  final CertificateEditorController controller;
  final int boardIndex;

  @override
  State<BoardCircuitsEditorView> createState() => _BoardCircuitsEditorViewState();
}

class _BoardCircuitsEditorViewState extends State<BoardCircuitsEditorView> {
  bool _detailsExpanded = false;
  bool _fillToolsExpanded = false;
  int _quickAddCount = 6;
  String _fillColumnKey = 'wiringType';
  final TextEditingController _fillValueController = TextEditingController();
  final Map<String, FocusNode> _cellFocusNodes = {};
  late final ScrollController _gridVerticalScroll;
  late final ScrollController _gridVerticalOverlayScroll;
  bool _syncingGridScroll = false;

  static const _stickyColumns = stickyCircuitColumnKeys;

  List<CircuitColSpec> get _stickyColumnSpecs =>
      CIRCUIT_COLUMNS_SPEC.where((c) => _stickyColumns.contains(c.key)).toList();

  @override
  void initState() {
    super.initState();
    _gridVerticalScroll = ScrollController();
    _gridVerticalOverlayScroll = ScrollController();
    _gridVerticalScroll.addListener(_syncOverlayScrollFromMain);
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
  }

  void _syncOverlayScrollFromMain() {
    if (_syncingGridScroll || !_gridVerticalOverlayScroll.hasClients) return;
    _syncingGridScroll = true;
    _gridVerticalOverlayScroll.jumpTo(_gridVerticalScroll.offset);
    _syncingGridScroll = false;
  }

  @override
  void dispose() {
    _gridVerticalScroll.removeListener(_syncOverlayScrollFromMain);
    _gridVerticalScroll.dispose();
    _gridVerticalOverlayScroll.dispose();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    for (final node in _cellFocusNodes.values) {
      node.dispose();
    }
    _fillValueController.dispose();
    super.dispose();
  }

  FocusNode _focusForCell(int row, int col) {
    return _cellFocusNodes.putIfAbsent('$row:$col', FocusNode.new);
  }

  void _moveCellFocus(int row, int col, int rowDelta, int colDelta, int rowCount) {
    final editableCols = CIRCUIT_COLUMNS_SPEC.where((c) => c.key != 'actions').toList();
    var nextRow = row;
    var nextCol = col + colDelta;
    if (colDelta != 0) {
      if (nextCol >= editableCols.length) {
        nextRow += 1;
        nextCol = 0;
      } else if (nextCol < 0) {
        nextRow -= 1;
        nextCol = editableCols.length - 1;
      }
    } else {
      nextRow += rowDelta;
    }
    nextRow = nextRow.clamp(0, rowCount - 1);
    nextCol = nextCol.clamp(0, editableCols.length - 1);
    _focusForCell(nextRow, nextCol).requestFocus();
  }

  bool _isCompact(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return MediaQuery.orientationOf(context) == Orientation.landscape || size.height < 480;
  }

  @override
  Widget build(BuildContext context) {
    final compact = _isCompact(context);
    final chromeMaxHeight = MediaQuery.sizeOf(context).height * (compact ? 0.28 : 0.45);

    return CertificateGradientScaffold(
      appBar: AppBar(
        title: Obx(() {
          final boards = widget.controller.listAt('boards');
          if (widget.boardIndex < 0 || widget.boardIndex >= boards.length) {
            return const Text('Board details');
          }
          final board = boards[widget.boardIndex];
          return Text('${board['name'] ?? 'DB'} Circuits Schedule');
        }),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.slate900,
        actions: [
          Obx(() {
            final boards = widget.controller.listAt('boards');
            if (widget.boardIndex < 0 || widget.boardIndex >= boards.length) {
              return const SizedBox.shrink();
            }
            final board = boards[widget.boardIndex];
            final boardId = board['id']?.toString().trim() ?? '';
            final boardName = board['name']?.toString().trim();
            if (boardId.isEmpty) return const SizedBox.shrink();
            return IconButton(
              tooltip: 'Print schedule',
              icon: Icon(Icons.print_rounded, color: AppColors.slate900),
              onPressed: () async {
                await Get.to(
                  () => CertificatePrintWebViewPage(
                    certificateId: widget.controller.certificateId,
                    boardId: boardId,
                    title: boardName != null && boardName.isNotEmpty ? 'Print $boardName' : 'Print board schedule',
                  ),
                );
              },
            );
          }),
          Obx(() {
            final boards = widget.controller.listAt('boards');
            if (widget.boardIndex < 0 || widget.boardIndex >= boards.length) {
              return const SizedBox.shrink();
            }
            final board = boards[widget.boardIndex];
            final done = isBoardDone(board);
            return TextButton(
              onPressed: () => _toggleBoardDone(board, boards.cast<Map<String, dynamic>>()),
              child: Text(
                done ? 'Mark in progress' : 'Mark as done',
                style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.bold),
              ),
            );
          }),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Obx(() {
          final List<dynamic> rawBoards = widget.controller.document['boards'] as List<dynamic>? ?? [];
          if (widget.boardIndex < 0 || widget.boardIndex >= rawBoards.length) {
            return const Center(child: Text('Board not found', style: TextStyle(color: AppColors.slate900)));
          }
          final boards = rawBoards.cast<Map<String, dynamic>>();
          final board = boards[widget.boardIndex];
          final readOnly = isBoardDone(board);
          final List<dynamic> rawCircuits = board['circuits'] as List? ?? [];
          final circuits = rawCircuits.map((c) => Map<String, dynamic>.from(c)).toList();
          final use100Percent = board['maxZsUse100Percent'] == true;
          final List<dynamic> rawPhotos = board['photos'] as List? ?? [];
          final photos = rawPhotos.cast<Map<String, dynamic>>();
          final testedCount = countTestedCircuits(circuits);
          final zsAtDb = board['zsAtDb']?.toString().trim() ?? '';

          return Column(
            children: [
              if (readOnly)
                Container(
                  width: double.infinity,
                  margin: EdgeInsets.fromLTRB(16, compact ? 4 : 8, 16, 0),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade900.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.amber.shade700.withValues(alpha: 0.4)),
                  ),
                  child: Text(
                    'Board is marked done — mark in progress to edit circuits and details.',
                    style: GoogleFonts.inter(color: Colors.amber.shade900, fontSize: 11),
                  ),
                ),
              Flexible(
                fit: FlexFit.loose,
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: chromeMaxHeight),
                  child: SingleChildScrollView(
                    padding: EdgeInsets.only(bottom: compact ? 4 : 8),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildBoardNameBar(board, boards, readOnly, compact: compact),
                        _buildCollapsibleDetails(board, photos, boards, readOnly, compact: compact),
                        _buildToolbar(
                          board,
                          circuits,
                          boards,
                          readOnly,
                          testedCount,
                          zsAtDb,
                          compact: compact,
                        ),
                        _buildFillColumnRow(
                          board,
                          circuits,
                          boards,
                          readOnly,
                          compact: compact,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Stack(
                        children: [
                          SingleChildScrollView(
                            controller: _gridVerticalScroll,
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _buildGroupHeaderRow(),
                                  _buildHeaderRow(),
                                  ...circuits.asMap().entries.map((entry) {
                                    return _buildCircuitRow(
                                      entry.value,
                                      entry.key,
                                      board,
                                      circuits,
                                      boards,
                                      use100Percent,
                                      readOnly,
                                    );
                                  }),
                                ],
                              ),
                            ),
                          ),
                          Positioned(
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: stickyCircuitColumnsWidth(),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: Colors.white,
                                border: Border(
                                  right: BorderSide(color: AppColors.slate200),
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.12),
                                    blurRadius: 8,
                                    offset: const Offset(2, 0),
                                  ),
                                ],
                              ),
                              child: SingleChildScrollView(
                                controller: _gridVerticalOverlayScroll,
                                physics: const NeverScrollableScrollPhysics(),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _buildGroupHeaderRow(columns: _stickyColumnSpecs),
                                    _buildHeaderRow(columns: _stickyColumnSpecs),
                                    ...circuits.asMap().entries.map((entry) {
                                      return _buildCircuitRow(
                                        entry.value,
                                        entry.key,
                                        board,
                                        circuits,
                                        boards,
                                        use100Percent,
                                        readOnly,
                                        columns: _stickyColumnSpecs,
                                      );
                                    }),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        }),
      ),
    );
  }

  Widget _buildBoardNameBar(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> boards,
    bool readOnly, {
    bool compact = false,
  }) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, compact ? 4 : 8, 16, compact ? 2 : 4),
      child: Row(
        children: [
          Expanded(
            child: TextFormField(
              key: ValueKey('board-name-bar:${board['id']}:${board['name']}'),
              initialValue: board['name']?.toString() ?? '',
              readOnly: readOnly,
              style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14, fontWeight: FontWeight.w700),
              decoration: InputDecoration(
                labelText: 'Board name',
                labelStyle: GoogleFonts.inter(color: AppColors.slate500, fontSize: 11),
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: AppColors.slate200),
                ),
              ),
              onChanged: readOnly ? null : (val) => _patchBoardField(board, 'name', val, boards),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            boardStatusLabel(board['status']?.toString()),
            style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 11, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  Widget _buildCollapsibleDetails(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> photos,
    List<Map<String, dynamic>> boards,
    bool readOnly, {
    bool compact = false,
  }) {
    return Container(
      margin: EdgeInsets.fromLTRB(16, compact ? 4 : 8, 16, compact ? 4 : 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.slate200),
      ),
      child: Column(
        children: [
          ListTile(
            dense: true,
            title: Text(
              'Board Specifications & Photos',
              style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.bold),
            ),
            subtitle: Text(
              boardStatusLabel(board['status']?.toString()),
              style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 11),
            ),
            trailing: Icon(
              _detailsExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
              color: AppColors.slate500,
            ),
            onTap: () => setState(() => _detailsExpanded = !_detailsExpanded),
          ),
          if (_detailsExpanded)
            Container(
              padding: const EdgeInsets.all(16),
              height: compact ? 220 : 260,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  SizedBox(
                    width: 980,
                    child: GridView(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        childAspectRatio: 3.8,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 4,
                      ),
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        _boardTextField(board, 'name', 'Board Name', boards, readOnly),
                        _boardTextField(board, 'manufacturer', 'Manufacturer', boards, readOnly),
                        _boardTextField(board, 'location', 'Location', boards, readOnly),
                        _boardTextField(board, 'suppliedFrom', 'Supplied From', boards, readOnly),
                        _boardQuickSelect(board, 'phases', 'Number of phases', boardPhaseOptions, boards, readOnly),
                        _boardQuickText(board, 'zsAtDb', 'Zs at DB (Ω)', boards, readOnly),
                        _boardQuickText(board, 'ipfAtDb', 'IPF at DB (kA)', boards, readOnly),
                        _boardOutcome(board, 'polarityConfirmed', 'Supply polarity confirmed', boards, readOnly),
                        _boardOutcome(board, 'phaseSequence', 'Phase sequence confirmed', boards, readOnly),
                        _boardQuickSelect(
                          board,
                          'mainSwitchBs',
                          'Main Switch BS (EN)',
                          boardMainSwitchBsOptions,
                          boards,
                          readOnly,
                          quickOptions: quickNaLimUnknown,
                        ),
                        _boardQuickSelect(
                          board,
                          'mainSwitchVoltage',
                          'Main Switch Voltage (V)',
                          boardVoltageOptions,
                          boards,
                          readOnly,
                        ),
                        _boardQuickSelect(
                          board,
                          'mainSwitchRating',
                          'Main Switch Rating (A)',
                          boardCurrentOptions,
                          boards,
                          readOnly,
                          quickOptions: quickNaLimUnknown,
                        ),
                        _boardQuickText(board, 'mainSwitchIpf', 'Main Switch IPF (kA)', boards, readOnly),
                        _boardQuickSelect(
                          board,
                          'rcdRating',
                          'RCD Rating',
                          boardRcdRatingOptions,
                          boards,
                          readOnly,
                          quickOptions: quickNaLimUnknown,
                        ),
                        _boardQuickText(board, 'rcdTripTime', 'RCD Trip Time (ms)', boards, readOnly),
                        _boardSelect(board, 'spdType', 'SPD Type', boardSpdTypeOptions, boards, readOnly),
                        _boardOutcome(board, 'spdStatus', 'SPD operation status', boards, readOnly),
                        _boardQuickSelect(
                          board,
                          'ocpdBs',
                          'OCPD BS (EN)',
                          boardOcpdBsOptions,
                          boards,
                          readOnly,
                        ),
                        _boardQuickSelect(
                          board,
                          'ocpdVoltage',
                          'OCPD Voltage (V)',
                          boardVoltageOptions,
                          boards,
                          readOnly,
                        ),
                        _boardQuickSelect(
                          board,
                          'ocpdRating',
                          'OCPD Rating (A)',
                          boardOcpdCurrentOptions,
                          boards,
                          readOnly,
                          quickOptions: quickNaLimUnknown,
                        ),
                        _boardTextField(board, 'notes', 'Notes', boards, readOnly, maxLines: 2),
                      ],
                    ),
                  ),
                  const VerticalDivider(color: Colors.black12, width: 20),
                  SizedBox(
                    width: 320,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Board Photos',
                              style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 13, fontWeight: FontWeight.bold),
                            ),
                            if (!readOnly)
                              Row(
                                children: [
                                  IconButton(
                                    icon: Icon(Icons.photo_library_outlined, color: AppColors.primary, size: 18),
                                    onPressed: () => _pickBoardPhoto(ImageSource.gallery, board, photos, boards),
                                  ),
                                  IconButton(
                                    icon: Icon(Icons.photo_camera_outlined, color: AppColors.primary, size: 18),
                                    onPressed: () => _pickBoardPhoto(ImageSource.camera, board, photos, boards),
                                  ),
                                ],
                              ),
                          ],
                        ),
                        Expanded(
                          child: photos.isEmpty
                              ? Center(
                                  child: Text('No photos', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12)),
                                )
                              : ListView.separated(
                                  scrollDirection: Axis.horizontal,
                                  itemCount: photos.length,
                                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                                  itemBuilder: (context, idx) => _photoTile(idx, photos, board, boards, readOnly),
                                ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _photoTile(
    int idx,
    List<Map<String, dynamic>> photos,
    Map<String, dynamic> board,
    List<Map<String, dynamic>> boards,
    bool readOnly,
  ) {
    final p = photos[idx];
    final dataUrl = p['dataUrl']?.toString() ?? '';
    final ImageProvider imgProvider = dataUrl.startsWith('data:image/')
        ? MemoryImage(base64Decode(dataUrl.split(',').last))
        : NetworkImage(dataUrl);

    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image(image: imgProvider, width: 100, height: 100, fit: BoxFit.cover),
        ),
        if (!readOnly)
          Positioned(
            top: 2,
            right: 2,
            child: CircleAvatar(
              backgroundColor: Colors.black54,
              radius: 12,
              child: IconButton(
                icon: Icon(Icons.close, size: 12, color: Color(0xFFE11D48)),
                padding: EdgeInsets.zero,
                onPressed: () => _removeBoardPhoto(idx, board, photos, boards),
              ),
            ),
          ),
      ],
    );
  }

  Widget _boardTextField(
    Map<String, dynamic> board,
    String key,
    String label,
    List<Map<String, dynamic>> boards,
    bool readOnly, {
    int maxLines = 1,
  }) {
    return TextFormField(
      key: ValueKey('${board['id']}:$key:${board[key]}'),
      initialValue: board[key]?.toString() ?? '',
      maxLines: maxLines,
      readOnly: readOnly,
      style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 12),
      decoration: _boardDecoration(label),
      onChanged: readOnly ? null : (val) => _patchBoardField(board, key, val, boards),
    );
  }

  Widget _boardSelect(
    Map<String, dynamic> board,
    String key,
    String label,
    List<CertOption> options,
    List<Map<String, dynamic>> boards,
    bool readOnly,
  ) {
    final val = board[key]?.toString() ?? '';
    final safeVal = options.any((o) => o.value == val) ? val : options.first.value;
    return DropdownButtonFormField<String>(
      value: safeVal,
      dropdownColor: AppColors.slate50,
      style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 12),
      decoration: _boardDecoration(label),
      items: options.map((o) => DropdownMenuItem(value: o.value, child: Text(o.label, overflow: TextOverflow.ellipsis))).toList(),
      onChanged: readOnly ? null : (nextVal) {
        if (nextVal == null) return;
        _patchBoardField(board, key, nextVal, boards);
      },
    );
  }

  Widget _boardQuickText(
    Map<String, dynamic> board,
    String key,
    String label,
    List<Map<String, dynamic>> boards,
    bool readOnly,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _boardTextField(board, key, label, boards, readOnly),
        if (!readOnly)
          Wrap(
            spacing: 4,
            children: quickNaLim
                .map(
                  (option) => ActionChip(
                    label: Text(option, style: GoogleFonts.inter(fontSize: 10)),
                    onPressed: () => _patchBoardField(board, key, option, boards, recalc: key == 'zsAtDb' || key == 'ipfAtDb'),
                  ),
                )
                .toList(),
          ),
      ],
    );
  }

  Widget _boardQuickSelect(
    Map<String, dynamic> board,
    String key,
    String label,
    List<CertOption> options,
    List<Map<String, dynamic>> boards,
    bool readOnly, {
    List<String> quickOptions = quickNaLim,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _boardSelect(board, key, label, options, boards, readOnly),
        if (!readOnly)
          Wrap(
            spacing: 4,
            children: quickOptions
                .map(
                  (option) => ActionChip(
                    label: Text(option, style: GoogleFonts.inter(fontSize: 10)),
                    onPressed: () => _patchBoardField(
                      board,
                      key,
                      option.toLowerCase() == 'n/a' ? 'na' : option.toLowerCase() == 'unknown' ? 'UNKNOWN' : option,
                      boards,
                    ),
                  ),
                )
                .toList(),
          ),
      ],
    );
  }

  Widget _boardOutcome(
    Map<String, dynamic> board,
    String key,
    String label,
    List<Map<String, dynamic>> boards,
    bool readOnly,
  ) {
    final value = board[key]?.toString() ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 10)),
        const SizedBox(height: 4),
        Wrap(
          spacing: 4,
          runSpacing: 4,
          children: boardPassFailOptions.map((option) {
            final selected = option.value == value;
            return ChoiceChip(
              label: Text(option.label, style: GoogleFonts.inter(fontSize: 10)),
              selected: selected,
              selectedColor: AppColors.primary,
              onSelected: readOnly ? null : (_) => _patchBoardField(board, key, option.value, boards),
            );
          }).toList(),
        ),
      ],
    );
  }

  InputDecoration _boardDecoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: GoogleFonts.inter(color: AppColors.slate500, fontSize: 10),
      filled: true,
      fillColor: Colors.white,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
    );
  }

  Widget _buildToolbar(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
    bool readOnly,
    int testedCount,
    String zsAtDb, {
    bool compact = false,
  }) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: compact ? 2 : 4),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            if (compact) ...[
              IconButton(
                tooltip: 'Quick add',
                onPressed: readOnly ? null : () => _openQuickAdd(board, circuits, boards),
                icon: Icon(Icons.bolt_rounded, color: AppColors.primary, size: 20),
              ),
              IconButton(
                tooltip: 'Quick add 6',
                onPressed: readOnly ? null : () => _addCircuits(board, circuits, boards, 6),
                icon: Icon(Icons.playlist_add_rounded, color: AppColors.slate700, size: 20),
              ),
              IconButton(
                tooltip: 'Add circuits',
                onPressed: readOnly ? null : () => _addCircuits(board, circuits, boards, _quickAddCount),
                icon: Icon(Icons.add_circle_outline_rounded, color: AppColors.primary, size: 20),
              ),
              DropdownButton<int>(
                value: _quickAddCount,
                dropdownColor: AppColors.slate50,
                style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 12),
                underline: const SizedBox.shrink(),
                items: const [1, 6, 12, 18].map((c) => DropdownMenuItem(value: c, child: Text('× $c'))).toList(),
                onChanged: readOnly
                    ? null
                    : (v) {
                        if (v != null) setState(() => _quickAddCount = v);
                      },
              ),
              IconButton(
                tooltip: 'Find & replace',
                onPressed: readOnly
                    ? null
                    : () => showCircuitFindReplaceSheet(
                        context: context,
                        onApply: (column, find, replace) {
                          final next = replaceInCircuits(circuits, column, find, replace);
                          _saveCircuitsList(next, board, boards);
                        },
                      ),
                icon: Icon(Icons.find_replace_rounded, color: AppColors.primary, size: 20),
              ),
              IconButton(
                tooltip: 'Paste',
                onPressed: readOnly
                    ? null
                    : () => showCircuitPasteSheet(
                        context: context,
                        onApply: (text, startRow, startColIndex) {
                          final grid = parsePastedGrid(text);
                          if (grid.isEmpty) return;
                          final next = pasteIntoCircuits(
                            circuits,
                            startRow,
                            startColIndex,
                            grid,
                            board,
                            board['maxZsUse100Percent'] == true,
                          );
                          _saveCircuitsList(next, board, boards);
                        },
                      ),
                icon: Icon(Icons.content_paste_rounded, color: AppColors.primary, size: 20),
              ),
              IconButton(
                tooltip: 'Autofill',
                onPressed: readOnly || circuits.length < 2
                    ? null
                    : () => _autofillFromPrevious(board, circuits, boards),
                icon: Icon(Icons.auto_fix_high_rounded, color: AppColors.primary, size: 20),
              ),
              IconButton(
                tooltip: 'Fill blanks',
                onPressed: readOnly || circuits.isEmpty
                    ? null
                    : () => _autofillBlanks(board, circuits, boards),
                icon: Icon(Icons.grid_on_rounded, color: AppColors.primary, size: 20),
              ),
              IconButton(
                tooltip: 'Fill column',
                onPressed: readOnly || circuits.isEmpty
                    ? null
                    : () => _fillColumnDialog(board, circuits, boards),
                icon: Icon(Icons.view_column_rounded, color: AppColors.primary, size: 20),
              ),
              IconButton(
                tooltip: 'Renumber',
                onPressed: readOnly ? null : () => _renumberCircuits(board, circuits, boards),
                icon: Icon(Icons.format_list_numbered_rounded, color: AppColors.primary, size: 20),
              ),
              IconButton(
                tooltip: 'Recalculate',
                onPressed: readOnly ? null : () => _recalculateCircuits(board, circuits, boards),
                icon: Icon(Icons.calculate_outlined, color: AppColors.primary, size: 20),
              ),
            ] else ...[
            ElevatedButton(
              onPressed: readOnly ? null : () => _openQuickAdd(board, circuits, boards),
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary.withValues(alpha: 0.15), foregroundColor: AppColors.primary),
              child: Text('Quick add', style: GoogleFonts.inter(fontWeight: FontWeight.bold, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            ElevatedButton(
              onPressed: readOnly ? null : () => _addCircuits(board, circuits, boards, 6),
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.slate100, foregroundColor: AppColors.slate700),
              child: Text('Quick add 6', style: GoogleFonts.inter(fontWeight: FontWeight.bold, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            ElevatedButton.icon(
              onPressed: readOnly ? null : () => _addCircuits(board, circuits, boards, _quickAddCount),
              icon: Icon(Icons.add, size: 16),
              label: Text('Add', style: GoogleFonts.inter(fontWeight: FontWeight.bold, fontSize: 12)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(width: 6),
            DropdownButton<int>(
              value: _quickAddCount,
              dropdownColor: AppColors.slate50,
              style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 12),
              items: const [1, 6, 12, 18].map((c) => DropdownMenuItem(value: c, child: Text('× $c'))).toList(),
              onChanged: readOnly ? null : (v) {
                if (v != null) setState(() => _quickAddCount = v);
              },
            ),
            const SizedBox(width: 12),
            TextButton.icon(
              onPressed: readOnly ? null : () => showCircuitFindReplaceSheet(
                context: context,
                onApply: (column, find, replace) {
                  final next = replaceInCircuits(circuits, column, find, replace);
                  _saveCircuitsList(next, board, boards);
                },
              ),
              icon: Icon(Icons.find_replace_rounded, color: AppColors.primary, size: 18),
              label: Text('Find & replace', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            TextButton.icon(
              onPressed: readOnly ? null : () => showCircuitPasteSheet(
                context: context,
                onApply: (text, startRow, startColIndex) {
                  final grid = parsePastedGrid(text);
                  if (grid.isEmpty) return;
                  final next = pasteIntoCircuits(
                    circuits,
                    startRow,
                    startColIndex,
                    grid,
                    board,
                    board['maxZsUse100Percent'] == true,
                  );
                  _saveCircuitsList(next, board, boards);
                },
              ),
              icon: Icon(Icons.content_paste_rounded, color: AppColors.primary, size: 18),
              label: Text('Paste', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            TextButton.icon(
              onPressed: readOnly || circuits.length < 2 ? null : () => _autofillFromPrevious(board, circuits, boards),
              icon: Icon(Icons.auto_fix_high_rounded, color: AppColors.primary, size: 18),
              label: Text('Autofill', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            TextButton.icon(
              onPressed: readOnly || circuits.isEmpty ? null : () => _autofillBlanks(board, circuits, boards),
              icon: Icon(Icons.grid_on_rounded, color: AppColors.primary, size: 18),
              label: Text('Fill blanks', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            TextButton.icon(
              onPressed: readOnly || circuits.isEmpty ? null : () => _fillColumnDialog(board, circuits, boards),
              icon: Icon(Icons.view_column_rounded, color: AppColors.primary, size: 18),
              label: Text('Fill column', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            TextButton.icon(
              onPressed: readOnly ? null : () => _renumberCircuits(board, circuits, boards),
              icon: Icon(Icons.format_list_numbered_rounded, color: AppColors.primary, size: 18),
              label: Text('Renumber', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            TextButton.icon(
              onPressed: readOnly ? null : () => _recalculateCircuits(board, circuits, boards),
              icon: Icon(Icons.calculate_outlined, color: AppColors.primary, size: 18),
              label: Text('Recalculate', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
            ),
            ],
            const SizedBox(width: 12),
            FilterChip(
              label: Text('100% Max Zs', style: GoogleFonts.inter(fontSize: 11)),
              selected: board['maxZsUse100Percent'] == true,
              onSelected: readOnly
                  ? null
                  : (val) {
                      final nextB = Map<String, dynamic>.from(board);
                      nextB['maxZsUse100Percent'] = val;
                      _saveBoardAndRecalculate(nextB, boards, true);
                    },
            ),
            const SizedBox(width: 12),
            Text(
              '${circuits.length} circuit${circuits.length == 1 ? '' : 's'} · $testedCount tested',
              style: GoogleFonts.inter(color: AppColors.slate400, fontSize: 12),
            ),
            if (zsAtDb.isNotEmpty) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.slate900,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'Zdb: $zsAtDb Ω',
                  style: GoogleFonts.inter(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFillColumnRow(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
    bool readOnly, {
    bool compact = false,
  }) {
    final fillable = fillableCircuitColumns();
    if (!fillable.any((col) => col.key == _fillColumnKey)) {
      _fillColumnKey = fillable.first.key;
    }

    if (compact && !_fillToolsExpanded) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
        child: Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _fillToolsExpanded = true),
            icon: Icon(Icons.view_column_outlined, color: AppColors.primary, size: 18),
            label: Text('Fill column tools', style: GoogleFonts.inter(color: AppColors.primary, fontSize: 12)),
          ),
        ),
      );
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, compact ? 4 : 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (compact)
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                tooltip: 'Collapse fill tools',
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                onPressed: () => setState(() => _fillToolsExpanded = false),
                icon: Icon(Icons.expand_less_rounded, color: AppColors.slate400, size: 20),
              ),
            ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Icon(Icons.view_column_outlined, color: AppColors.slate400, size: 16),
                const SizedBox(width: 8),
                Text('Fill column', style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 12)),
                const SizedBox(width: 8),
                DropdownButton<String>(
                  value: _fillColumnKey,
                  dropdownColor: AppColors.slate50,
                  style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 12),
                  underline: const SizedBox.shrink(),
                  items: fillable
                      .map((col) => DropdownMenuItem(value: col.key, child: Text(col.label, overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: readOnly
                      ? null
                      : (value) {
                          if (value != null) setState(() => _fillColumnKey = value);
                        },
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: compact ? 88 : 100,
                  child: TextField(
                    controller: _fillValueController,
                    readOnly: readOnly,
                    style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 12),
                    decoration: InputDecoration(
                      hintText: 'Value…',
                      hintStyle: GoogleFonts.inter(color: AppColors.slate500, fontSize: 12),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: readOnly || _fillValueController.text.trim().isEmpty || circuits.isEmpty
                      ? null
                      : () {
                          final value = _fillValueController.text.trim();
                          final next = fillColumnIntelligent(circuits, _fillColumnKey, value, board, board['maxZsUse100Percent'] == true);
                          _saveCircuitsList(next, board, boards);
                          _fillValueController.clear();
                        },
                  child: Text(compact ? 'Apply' : 'Apply (skip spares)', style: GoogleFonts.inter(fontSize: 12)),
                ),
                TextButton(
                  onPressed: readOnly || circuits.isEmpty
                      ? null
                      : () {
                          final next = clearColumnIntelligent(circuits, _fillColumnKey, board, board['maxZsUse100Percent'] == true);
                          _saveCircuitsList(next, board, boards);
                        },
                  child: Text('Clear', style: GoogleFonts.inter(fontSize: 12)),
                ),
              ],
            ),
          ),
          if (getColumnQuickOptions(_fillColumnKey).isNotEmpty) ...[
            const SizedBox(height: 6),
            SizedBox(
              height: 34,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: getColumnQuickOptions(_fillColumnKey)
                    .map(
                      (option) => Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ActionChip(
                          visualDensity: VisualDensity.compact,
                          label: Text(option, style: GoogleFonts.inter(fontSize: 11)),
                          onPressed: readOnly || circuits.isEmpty
                              ? null
                              : () {
                                  final next = fillColumnIntelligent(
                                    circuits,
                                    _fillColumnKey,
                                    option,
                                    board,
                                    board['maxZsUse100Percent'] == true,
                                  );
                                  _saveCircuitsList(next, board, boards);
                                },
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildGroupHeaderRow({List<CircuitColSpec>? columns}) {
    final cols = columns ?? CIRCUIT_COLUMNS_SPEC;
    final spans = <Map<String, dynamic>>[];
    var currentGroup = '';
    var span = 0;
    var start = 0;
    for (var i = 0; i < cols.length; i++) {
      final group = cols[i].group;
      if (group != currentGroup) {
        if (span > 0) {
          spans.add({'label': currentGroup, 'span': span, 'start': start});
        }
        currentGroup = group;
        span = 0;
        start = i;
      }
      span++;
    }
    if (span > 0) {
      spans.add({'label': currentGroup, 'span': span, 'start': start});
    }

    return Container(
      color: AppColors.slate900.withValues(alpha: 0.85),
      child: Row(
        children: spans.map((entry) {
          final startIndex = entry['start'] as int;
          final spanCount = entry['span'] as int;
          var totalWidth = 0.0;
          for (var i = startIndex; i < startIndex + spanCount; i++) {
            totalWidth += circuitColWidths[cols[i].key] ?? 80.0;
          }
          final labelKey = entry['label'] as String;
          final label = labelKey.isEmpty ? '' : (circuitGroupLabels[labelKey] ?? labelKey);
          return Container(
            width: totalWidth,
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            decoration: BoxDecoration(
              border: Border(
                right: BorderSide(color: AppColors.whiteOverlay(0.08)),
                bottom: BorderSide(color: AppColors.whiteOverlay(0.08)),
              ),
            ),
            child: Text(
              label,
              style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 10, fontWeight: FontWeight.bold),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildHeaderRow({List<CircuitColSpec>? columns}) {
    final cols = columns ?? CIRCUIT_COLUMNS_SPEC;
    return Container(
      color: AppColors.slate900,
      child: Row(
        children: cols.map((col) {
          final width = circuitColWidths[col.key] ?? 80.0;
          return Container(
            width: width,
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            decoration: BoxDecoration(
              border: Border(
                right: BorderSide(color: AppColors.whiteOverlay(0.08)),
                bottom: BorderSide(color: AppColors.whiteOverlay(0.12)),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    col.label,
                    style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 11, fontWeight: FontWeight.bold),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (col.calculated)
                  Icon(Icons.calculate_outlined, color: AppColors.primary, size: 10),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _circuitRowActionButton({
    required IconData icon,
    required Color color,
    required VoidCallback? onPressed,
  }) {
    return IconButton(
      icon: Icon(icon, size: 14, color: color),
      padding: EdgeInsets.zero,
      visualDensity: VisualDensity.compact,
      style: IconButton.styleFrom(
        minimumSize: const Size(30, 30),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      onPressed: onPressed,
    );
  }

  Widget _buildCircuitRow(
    Map<String, dynamic> circuit,
    int rowIndex,
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
    bool use100Percent,
    bool readOnly, {
    List<CircuitColSpec>? columns,
  }) {
    final cols = columns ?? CIRCUIT_COLUMNS_SPEC;
    final editableCols = CIRCUIT_COLUMNS_SPEC.where((c) => c.key != 'actions').toList();

    return Container(
      decoration: BoxDecoration(
        color: AppColors.whiteOverlay(rowIndex % 2 == 0 ? 0.01 : 0.03),
        border: Border(bottom: BorderSide(color: AppColors.whiteOverlay(0.04))),
      ),
      child: Row(
        children: cols.map((col) {
          final width = circuitColWidths[col.key] ?? 80.0;
          if (col.key == 'actions') {
            return Container(
              width: width,
              height: circuitRowHeight,
              decoration: BoxDecoration(border: Border(right: BorderSide(color: AppColors.whiteOverlay(0.08)))),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _circuitRowActionButton(
                    icon: Icons.arrow_upward,
                    color: Colors.black54,
                    onPressed: readOnly || rowIndex <= 0 ? null : () => _moveCircuit(rowIndex, -1, board, circuits, boards),
                  ),
                  _circuitRowActionButton(
                    icon: Icons.arrow_downward,
                    color: Colors.black54,
                    onPressed: readOnly || rowIndex >= circuits.length - 1
                        ? null
                        : () => _moveCircuit(rowIndex, 1, board, circuits, boards),
                  ),
                  _circuitRowActionButton(
                    icon: Icons.delete_outline,
                    color: const Color(0xFFE11D48),
                    onPressed: readOnly ? null : () => _deleteCircuit(rowIndex, board, circuits, boards),
                  ),
                ],
              ),
            );
          }

          final cellValue = circuit[col.key]?.toString() ?? '';
          final overrides = circuit['calcOverrides'] as Map? ?? {};
          final overridden = col.calculated && overrides[col.key] == true;
          final colIndex = editableCols.indexWhere((c) => c.key == col.key);

          return Container(
            width: width,
            height: circuitRowHeight,
            decoration: BoxDecoration(border: Border(right: BorderSide(color: AppColors.whiteOverlay(0.08)))),
            child: CircuitCell(
              columnKey: col.key,
              value: cellValue,
              isCalc: col.calculated,
              overridden: overridden,
              options: circuitColumnOptions[col.key],
              readOnly: readOnly,
              focusNode: _focusForCell(rowIndex, colIndex),
              onMoveFocus: readOnly
                  ? null
                  : (rowDelta, colDelta) => _moveCellFocus(rowIndex, colIndex, rowDelta, colDelta, circuits.length),
              onChanged: (nextVal) => _updateCircuitCell(
                rowIndex,
                col.key,
                nextVal,
                circuit,
                board,
                circuits,
                boards,
                use100Percent,
              ),
              onResetOverride: overridden && !readOnly
                  ? () => _resetCalcOverride(rowIndex, col.key, circuit, board, circuits, boards, use100Percent)
                  : null,
            ),
          );
        }).toList(),
      ),
    );
  }

  void _updateCircuitCell(
    int rowIndex,
    String key,
    String nextVal,
    Map<String, dynamic> circuit,
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
    bool use100Percent,
  ) {
    final nextC = Map<String, dynamic>.from(circuit);
    nextC[key] = clampCircuitField(key, nextVal);
    final col = CIRCUIT_COLUMNS_SPEC.firstWhere((c) => c.key == key, orElse: () => const CircuitColSpec(key: '', label: ''));
    if (col.calculated) {
      final overrides = Map<String, dynamic>.from(circuit['calcOverrides'] as Map? ?? {});
      overrides[key] = true;
      nextC['calcOverrides'] = overrides;
    }
    if (key == 'description' && isNaDescription(nextVal)) {
      final naCircuit = applyNaCircuitDefaults(nextC);
      _saveCircuit(rowIndex, naCircuit, board, circuits, boards);
      return;
    }
    if (key == 'zs') {
      nextC['tested'] = isCircuitTested(nextC);
    }
    final updated = applyCircuitCalculations(nextC, board, use100Percent);
    _saveCircuit(rowIndex, updated, board, circuits, boards);
  }

  void _resetCalcOverride(
    int rowIndex,
    String key,
    Map<String, dynamic> circuit,
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
    bool use100Percent,
  ) {
    final nextC = Map<String, dynamic>.from(circuit);
    final overrides = Map<String, dynamic>.from(circuit['calcOverrides'] as Map? ?? {});
    overrides.remove(key);
    nextC['calcOverrides'] = overrides;
    nextC[key] = '';
    final updated = applyCircuitCalculations(nextC, board, use100Percent);
    _saveCircuit(rowIndex, updated, board, circuits, boards);
  }

  void _toggleBoardDone(Map<String, dynamic> board, List<Map<String, dynamic>> boards) {
    final nextB = Map<String, dynamic>.from(board);
    nextB['status'] = isBoardDone(board) ? 'in_progress' : 'done';
    _saveBoardAndRecalculate(nextB, boards, false);
  }

  void _patchBoardField(
    Map<String, dynamic> board,
    String key,
    String value,
    List<Map<String, dynamic>> boards, {
    bool recalc = false,
  }) {
    final nextB = Map<String, dynamic>.from(board);
    nextB[key] = value;
    _saveBoardAndRecalculate(nextB, boards, recalc || key == 'zsAtDb' || key == 'ipfAtDb' || key == 'maxZsUse100Percent');
  }

  void _openQuickAdd(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
  ) {
    showCircuitQuickAddSheet(
      context: context,
      onSelect: (preset) {
        final nextCircuits = List<Map<String, dynamic>>.from(circuits);
        final circuitNumber = '${nextCircuits.length + 1}';
        nextCircuits.add(buildCircuitFromQuickAddPreset(preset, board, circuitNumber));
        _saveCircuitsList(nextCircuits, board, boards);
      },
    );
  }

  void _addCircuits(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
    int count,
  ) {
    final nextCircuits = List<Map<String, dynamic>>.from(circuits);
    final prev = nextCircuits.isNotEmpty ? nextCircuits.last : null;
    final use100Percent = board['maxZsUse100Percent'] == true;

    for (var i = 0; i < count; i++) {
      final nextNum = nextCircuits.length + 1;
      final c = <String, dynamic>{
        'id': newId('c'),
        'circuitNumber': nextNum.toString(),
        'description': '',
        'points': '',
        'wiringType': prev != null ? (prev['wiringType'] ?? '') : '',
        'refMethod': prev != null ? (prev['refMethod'] ?? '') : '',
        'liveMm2': '',
        'cpcMm2': '',
        'maxDisconnectTime': '',
        'ocpdBs': prev != null ? (prev['ocpdBs'] ?? '') : '',
        'ocpdType': prev != null ? (prev['ocpdType'] ?? '') : '',
        'ocpdRatingA': '',
        'ocpdBreakingKa': '',
        'maxZs': '',
        'rcdBs': '',
        'rcdType': '',
        'rcdRatingMa': '',
        'rcdRatingA': '',
        'ringR1': '',
        'ringRn': '',
        'ringR2End': '',
        'r1r2': '',
        'r2': '',
        'insulationTestVoltage': '',
        'insulationLL': '',
        'insulationLE': '',
        'polarity': '',
        'zs': '',
        'rcdTripMs': '',
        'afdd': '',
        'remarks': '',
        'tested': false,
        'calcOverrides': <String, dynamic>{},
      };
      nextCircuits.add(applyCircuitCalculations(c, board, use100Percent));
    }
    _saveCircuitsList(nextCircuits, board, boards);
  }

  void _autofillFromPrevious(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
  ) {
    if (circuits.length < 2) return;
    final prev = circuits[circuits.length - 2];
    final last = circuits.last;
    final filled = autofillCircuitFromPrevious(
      last,
      prev,
      board,
      board['maxZsUse100Percent'] == true,
    );
    final nextCircuits = List<Map<String, dynamic>>.from(circuits);
    nextCircuits[nextCircuits.length - 1] = filled;
    _saveCircuitsList(nextCircuits, board, boards);
    Get.snackbar('Autofill', 'Last circuit filled from previous row.');
  }

  Future<void> _autofillBlanks(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
  ) async {
    final blanks = countBlankCells(circuits);
    if (blanks == 0) {
      Get.snackbar('Autofill', 'No empty cells to fill.');
      return;
    }
    final selected = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        title: Text(
          'Autofill all blanks?',
          style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w700),
        ),
        content: Text(
          'This will fill all $blanks empty cell${blanks == 1 ? '' : 's'} in the table with the selected value. This action cannot be undone.',
          style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 13, height: 1.4),
        ),
        actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('Cancel', style: GoogleFonts.inter(color: AppColors.slate600, fontWeight: FontWeight.w600)),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: autofillBlankValues
                .map(
                  (v) => ElevatedButton(
                    onPressed: () => Navigator.of(ctx).pop(v),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    ),
                    child: Text('Autofill with $v', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12)),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
    if (selected == null) return;
    final next = autofillBlankCells(
      circuits,
      selected,
      board,
      board['maxZsUse100Percent'] == true,
    );
    _saveCircuitsList(next, board, boards);
    Get.snackbar('Autofill', 'Filled $blanks empty cell${blanks == 1 ? '' : 's'} with "$selected".');
  }

  Future<void> _fillColumnDialog(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
  ) async {
    if (circuits.isEmpty) {
      Get.snackbar('Fill column', 'Add circuits first.');
      return;
    }
    final fillable = fillableCircuitColumns();
    var selKey = fillable.any((c) => c.key == _fillColumnKey) ? _fillColumnKey : fillable.first.key;
    final valueCtrl = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          final label = fillable.firstWhere((c) => c.key == selKey).label;
          final suggestions = getColumnQuickOptions(selKey)
              .where((o) => !autofillBlankValues.contains(o))
              .toList();

          void apply(List<Map<String, dynamic>> next, String msg) {
            _saveCircuitsList(next, board, boards);
            Navigator.of(ctx).pop();
            Get.snackbar('Fill column', msg);
          }

          return AlertDialog(
            backgroundColor: Colors.white,
            title: Text('Fill column', style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w700)),
            content: SizedBox(
              width: 360,
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Column', style: GoogleFonts.inter(color: AppColors.slate600, fontSize: 12, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.slate200),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: selKey,
                          isExpanded: true,
                          dropdownColor: Colors.white,
                          style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
                          items: fillable
                              .map((c) => DropdownMenuItem(value: c.key, child: Text(c.label, overflow: TextOverflow.ellipsis)))
                              .toList(),
                          onChanged: (v) {
                            if (v != null) setLocal(() => selKey = v);
                          },
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text('Set $label to…', style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: valueCtrl,
                      autofocus: true,
                      style: GoogleFonts.inter(color: AppColors.slate900, fontSize: 14),
                      onChanged: (_) => setLocal(() {}),
                      decoration: InputDecoration(
                        hintText: 'Enter value to fill…',
                        hintStyle: GoogleFonts.inter(color: AppColors.slate400, fontSize: 14),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: autofillBlankValues
                          .map(
                            (v) => GestureDetector(
                              onTap: () => setLocal(() => valueCtrl.text = v),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.slate900,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(v, style: GoogleFonts.inter(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                              ),
                            ),
                          )
                          .toList(),
                    ),
                    if (suggestions.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 160),
                        child: SingleChildScrollView(
                          child: Column(
                            children: suggestions
                                .map(
                                  (o) => InkWell(
                                    onTap: () => setLocal(() => valueCtrl.text = o),
                                    child: Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                      decoration: BoxDecoration(
                                        color: valueCtrl.text == o ? AppColors.primary.withValues(alpha: 0.08) : Colors.transparent,
                                        border: Border(bottom: BorderSide(color: AppColors.slate100)),
                                      ),
                                      child: Text(
                                        o,
                                        style: GoogleFonts.inter(
                                          color: valueCtrl.text == o ? AppColors.primary : AppColors.slate700,
                                          fontSize: 13,
                                          fontWeight: valueCtrl.text == o ? FontWeight.w700 : FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ),
                                )
                                .toList(),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            actions: [
              TextButton.icon(
                onPressed: () {
                  final next = clearColumnIntelligent(circuits, selKey, board, board['maxZsUse100Percent'] == true);
                  apply(next, 'Cleared "$label".');
                },
                icon: Icon(Icons.backspace_outlined, color: AppColors.slate600, size: 16),
                label: Text('Clear', style: GoogleFonts.inter(color: AppColors.slate600, fontWeight: FontWeight.w600, fontSize: 12)),
              ),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: Text('Cancel', style: GoogleFonts.inter(color: AppColors.slate600, fontWeight: FontWeight.w600)),
              ),
              OutlinedButton(
                onPressed: valueCtrl.text.trim().isEmpty
                    ? null
                    : () {
                        final next = fillColumnBlanks(circuits, selKey, valueCtrl.text.trim(), board, board['maxZsUse100Percent'] == true);
                        apply(next, 'Filled blanks in "$label".');
                      },
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  side: BorderSide(color: AppColors.primary),
                ),
                child: Text('Fill blanks', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12)),
              ),
              ElevatedButton(
                onPressed: valueCtrl.text.trim().isEmpty
                    ? null
                    : () {
                        final next = fillColumnIntelligent(circuits, selKey, valueCtrl.text.trim(), board, board['maxZsUse100Percent'] == true);
                        apply(next, 'Filled "$label".');
                      },
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: Colors.white),
                child: Text('Fill all', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12)),
              ),
            ],
          );
        },
      ),
    );
    valueCtrl.dispose();
    if (fillable.any((c) => c.key == selKey)) {
      setState(() => _fillColumnKey = selKey);
    }
  }

  void _renumberCircuits(Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
    _saveCircuitsList(renumberCircuitsSmart(circuits), board, boards);
  }

  void _recalculateCircuits(Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
    final use100Percent = board['maxZsUse100Percent'] == true;
    final nextCircuits = recalculateAllCircuits(circuits, board, use100Percent, clearOverrides: true);
    _saveCircuitsList(nextCircuits, board, boards);
    Get.snackbar('Recalculated', 'Circuits recalculated successfully.');
  }

  void _moveCircuit(int index, int delta, Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
    final nextCircuits = List<Map<String, dynamic>>.from(circuits);
    final target = index + delta;
    if (target < 0 || target >= nextCircuits.length) return;
    final temp = nextCircuits[index];
    nextCircuits[index] = nextCircuits[target];
    nextCircuits[target] = temp;
    _saveCircuitsList(nextCircuits, board, boards);
  }

  void _deleteCircuit(int index, Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
    final nextCircuits = List<Map<String, dynamic>>.from(circuits);
    if (index >= 0 && index < nextCircuits.length) {
      nextCircuits.removeAt(index);
      _saveCircuitsList(nextCircuits, board, boards);
    }
  }

  Future<void> _pickBoardPhoto(
    ImageSource source,
    Map<String, dynamic> board,
    List<Map<String, dynamic>> photos,
    List<Map<String, dynamic>> boards,
  ) async {
    final picker = ImagePicker();
    final f = await picker.pickImage(source: source, maxWidth: 1400, imageQuality: 82);
    if (f == null) return;
    try {
      final bytes = await FlutterImageCompress.compressWithFile(
        f.path,
        minWidth: 1400,
        minHeight: 1400,
        quality: 80,
        format: CompressFormat.jpeg,
      );
      if (bytes == null) return;
      final dataUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      final nextB = Map<String, dynamic>.from(board);
      final nextPhotos = List<Map<String, dynamic>>.from(photos);
      nextPhotos.add({
        'id': newId('ph'),
        'caption': f.name.replaceAll(RegExp(r'\.[^.]+$'), ''),
        'dataUrl': dataUrl,
      });
      nextB['photos'] = nextPhotos;
      _saveBoardAndRecalculate(nextB, boards, false);
    } catch (e) {
      Get.snackbar('Image Error', 'Failed to read image file: $e');
    }
  }

  void _removeBoardPhoto(int idx, Map<String, dynamic> board, List<Map<String, dynamic>> photos, List<Map<String, dynamic>> boards) {
    final nextB = Map<String, dynamic>.from(board);
    final nextPhotos = List<Map<String, dynamic>>.from(photos);
    if (idx >= 0 && idx < nextPhotos.length) {
      nextPhotos.removeAt(idx);
      nextB['photos'] = nextPhotos;
      _saveBoardAndRecalculate(nextB, boards, false);
    }
  }

  void _saveCircuit(
    int index,
    Map<String, dynamic> updatedCircuit,
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
  ) {
    final nextCircuits = List<Map<String, dynamic>>.from(circuits);
    if (index >= 0 && index < nextCircuits.length) {
      nextCircuits[index] = updatedCircuit;
      _saveCircuitsList(nextCircuits, board, boards);
    }
  }

  void _saveCircuitsList(List<Map<String, dynamic>> nextCircuits, Map<String, dynamic> board, List<Map<String, dynamic>> boards) {
    final nextB = Map<String, dynamic>.from(board);
    nextB['circuits'] = nextCircuits;
    _saveBoardAndRecalculate(nextB, boards, false);
  }

  void _saveBoardAndRecalculate(Map<String, dynamic> updatedBoard, List<Map<String, dynamic>> boards, bool triggerRecalc) {
    final nextBoards = boards.map((b) {
      if (b['id'] == updatedBoard['id']) {
        final nextB = Map<String, dynamic>.from(updatedBoard);
        nextB['status'] = normalizeBoardStatus(nextB['status']?.toString());
        if (triggerRecalc) {
          final rawCircuits = nextB['circuits'] as List? ?? [];
          final circuits = rawCircuits.map((c) => Map<String, dynamic>.from(c)).toList();
          final use100Percent = nextB['maxZsUse100Percent'] == true;
          nextB['circuits'] = recalculateAllCircuits(circuits, nextB, use100Percent);
        }
        return nextB;
      }
      return b;
    }).toList();
    widget.controller.updatePath('boards', nextBoards);
  }
}
