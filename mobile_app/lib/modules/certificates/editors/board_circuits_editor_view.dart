import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/values/app_colors.dart';
import '../certificate_document_utils.dart';
import '../certificate_editor_controller.dart';
import '../widgets/cert_form_widgets.dart';
import 'circuit_calculations.dart';

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
  int _quickAddCount = 6;

  // Options map matching web
  static const Map<String, List<String>> columnOptions = {
    'description': ['Spare', 'Unknown'],
    'points': ['1', '2', '3', '4', '5', '6', '8', '10', '12', 'N/A', 'LIM'],
    'wiringType': ['A', 'B', 'C', 'D', 'SWA', 'MICC', 'FP200', 'Twin & earth', 'Singles', 'N/A', 'LIM', 'Other'],
    'refMethod': ['A1', 'A2', 'B1', 'B2', 'C', 'D', 'E', 'F', 'G', '100', '101', '102', '103', 'N/A', 'LIM'],
    'liveMm2': ['1', '1.5', '2.5', '4', '6', '10', '16', '25', '35', '50', '70', 'N/A', 'LIM'],
    'cpcMm2': ['1', '1.5', '2.5', '4', '6', '10', '16', '25', '35', 'N/A', 'LIM'],
    'maxDisconnectTime': ['0.2', '0.4', '1', '5', 'N/A', 'LIM'],
    'ocpdBs': ['60898', '61009', '88-2', '88-3', '3036', '3871', '1361', '60947-2', '60269', 'N/A', 'LIM', 'UNKNOWN'],
    'ocpdType': ['B', 'C', 'D', '1', '2', '3', 'gG', 'gL', 'aM', 'N/A', 'LIM'],
    'ocpdRatingA': ['5', '6', '10', '15', '16', '20', '25', '32', '40', '45', '50', '63', '80', '100', 'N/A', 'LIM'],
    'ocpdBreakingKa': ['1', '3', '6', '10', '16', '25', '33', '50', 'N/A', 'LIM', 'UNKNOWN'],
    'maxZs': ['N/A', 'LIM', 'N/V', '---'],
    'rcdBs': ['61008', '61009', '62423', 'N/A', 'LIM', 'UNKNOWN'],
    'rcdType': ['AC', 'A', 'F', 'B', 'S', 'N/A', 'LIM'],
    'rcdRatingMa': ['10', '30', '100', '300', '500', '1000', 'N/A', 'N/V', 'LIM'],
    'rcdRatingA': ['16', '20', '25', '32', '40', '63', '80', '100', 'N/A', 'LIM'],
    'ringR1': ['N/A', 'LIM', 'N/V', '---'],
    'ringRn': ['N/A', 'LIM', 'N/V', '---'],
    'ringR2End': ['N/A', 'LIM', 'N/V', '---'],
    'r1r2': ['N/A', 'LIM', 'N/V', '---'],
    'r2': ['N/A', 'LIM', 'N/V', '---'],
    'insulation': ['>999', '>500', '>200', '>100', 'N/A', 'LIM', 'N/V', '---'],
    'insulationTestVoltage': ['250', '500', '1000', 'N/A', 'LIM'],
    'insulationLL': ['>999', '>500', '>200', '>100', 'N/A', 'LIM', 'N/V', '---'],
    'insulationLE': ['>999', '>500', '>200', '>100', 'N/A', 'LIM', 'N/V', '---'],
    'polarity': ['PASS', 'FAIL', 'LIM', 'N/A'],
    'zs': ['N/A', 'LIM', 'N/V', '---'],
    'rcdTripMs': ['N/A', 'LIM', 'N/V', '---'],
    'afdd': ['PASS', 'FAIL', 'LIM', 'N/A'],
    'remarks': ['N/A', 'LIM', 'N/V', '---'],
  };

  // Fixed widths for columns in landscape view
  static const Map<String, double> colWidths = {
    'actions': 100.0,
    'circuitNumber': 50.0,
    'description': 160.0,
    'points': 80.0,
    'wiringType': 100.0,
    'refMethod': 80.0,
    'liveMm2': 80.0,
    'cpcMm2': 80.0,
    'maxDisconnectTime': 85.0,
    'ocpdBs': 110.0,
    'ocpdType': 80.0,
    'ocpdRatingA': 80.0,
    'ocpdBreakingKa': 90.0,
    'maxZs': 85.0,
    'rcdBs': 110.0,
    'rcdType': 80.0,
    'rcdRatingMa': 80.0,
    'rcdRatingA': 80.0,
    'ringR1': 80.0,
    'ringRn': 80.0,
    'ringR2End': 80.0,
    'r1r2': 85.0,
    'r2': 80.0,
    'insulationTestVoltage': 100.0,
    'insulationLL': 80.0,
    'insulationLE': 80.0,
    'polarity': 80.0,
    'zs': 85.0,
    'rcdTripMs': 80.0,
    'afdd': 80.0,
    'remarks': 180.0,
  };

  @override
  void initState() {
    super.initState();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
        foregroundColor: Colors.white,
      ),
      child: SafeArea(
        child: Obx(() {
          final List<dynamic> rawBoards = widget.controller.document['boards'] as List<dynamic>? ?? [];
          if (widget.boardIndex < 0 || widget.boardIndex >= rawBoards.length) {
            return const Center(child: Text('Board not found', style: TextStyle(color: Colors.white)));
          }
          final boards = rawBoards.cast<Map<String, dynamic>>();
          final board = boards[widget.boardIndex];
          final List<dynamic> rawCircuits = board['circuits'] as List? ?? [];
          final circuits = rawCircuits.map((c) => Map<String, dynamic>.from(c)).toList();
          final use100Percent = board['maxZsUse100Percent'] == true;
          final List<dynamic> rawPhotos = board['photos'] as List? ?? [];
          final photos = rawPhotos.cast<Map<String, dynamic>>();

          return Column(
            children: [
              // Collapsible Board Details Panel
              _buildCollapsibleDetails(board, photos, boards),

              // Toolbar
              _buildToolbar(board, circuits, boards),

              // Horizontally Scrollable Circuits Grid
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.vertical,
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Header Row
                        _buildHeaderRow(),
                        // Data Rows
                        ...circuits.asMap().entries.map((entry) {
                          final rowIndex = entry.key;
                          final circuit = entry.value;
                          return _buildCircuitRow(circuit, rowIndex, board, circuits, boards, use100Percent);
                        }),
                      ],
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

  Widget _buildCollapsibleDetails(
    Map<String, dynamic> board,
    List<Map<String, dynamic>> photos,
    List<Map<String, dynamic>> boards,
  ) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.whiteOverlay(0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.whiteOverlay(0.08)),
      ),
      child: Column(
        children: [
          ListTile(
            dense: true,
            title: Text(
              'Board Specifications & Photos',
              style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold),
            ),
            trailing: Icon(
              _detailsExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
              color: Colors.white,
            ),
            onTap: () {
              setState(() => _detailsExpanded = !_detailsExpanded);
            },
          ),
          if (_detailsExpanded)
            Container(
              padding: const EdgeInsets.all(16),
              height: 220,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  // Text fields grid
                  SizedBox(
                    width: 900,
                    child: GridView.count(
                      crossAxisCount: 3,
                      childAspectRatio: 4.5,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 8,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        _boardTextField(board, 'name', 'Board Name', boards),
                        _boardSelectField(board, 'status', 'Status', const [
                          CertOption('in_progress', 'In Progress'),
                          CertOption('complete', 'Complete'),
                        ], boards),
                        _boardTextField(board, 'manufacturer', 'Manufacturer', boards),
                        _boardTextField(board, 'location', 'Location', boards),
                        _boardTextField(board, 'suppliedFrom', 'Supplied From', boards),
                        _boardTextField(board, 'phases', 'Phases', boards),
                        _boardTextField(board, 'zsAtDb', 'Zs at DB (Ω)', boards),
                        _boardTextField(board, 'ipfAtDb', 'IPF at DB (kA)', boards),
                        _boardTextField(board, 'polarityConfirmed', 'Polarity Confirmed', boards),
                        _boardTextField(board, 'phaseSequence', 'Phase Sequence', boards),
                        _boardTextField(board, 'mainSwitchBs', 'Main Switch BS (EN)', boards),
                        _boardTextField(board, 'mainSwitchVoltage', 'Main Switch Voltage (V)', boards),
                        _boardTextField(board, 'mainSwitchRating', 'Main Switch Rating (A)', boards),
                        _boardTextField(board, 'mainSwitchIpf', 'Main Switch IPF (kA)', boards),
                        _boardTextField(board, 'rcdRating', 'RCD Rating', boards),
                        _boardTextField(board, 'rcdTripTime', 'RCD Trip Time (ms)', boards),
                        _boardTextField(board, 'spdType', 'SPD Type', boards),
                        _boardTextField(board, 'spdStatus', 'SPD Status', boards),
                        _boardTextField(board, 'ocpdBs', 'OCPD BS (EN)', boards),
                        _boardTextField(board, 'ocpdVoltage', 'OCPD Voltage (V)', boards),
                        _boardTextField(board, 'ocpdRating', 'OCPD Rating (A)', boards),
                      ],
                    ),
                  ),
                  const VerticalDivider(color: Colors.white24, width: 20),
                  // Board Photos Gallery
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
                              style: GoogleFonts.inter(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                            ),
                            Row(
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.photo_library_outlined, color: AppColors.primary, size: 18),
                                  onPressed: () => _pickBoardPhoto(ImageSource.gallery, board, photos, boards),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.photo_camera_outlined, color: AppColors.primary, size: 18),
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
                                  itemBuilder: (context, idx) {
                                    final p = photos[idx];
                                    final dataUrl = p['dataUrl']?.toString() ?? '';
                                    ImageProvider imgProvider;
                                    if (dataUrl.startsWith('data:image/')) {
                                      imgProvider = MemoryImage(base64Decode(dataUrl.split(',').last));
                                    } else {
                                      imgProvider = NetworkImage(dataUrl);
                                    }
                                    return Stack(
                                      children: [
                                        ClipRRect(
                                          borderRadius: BorderRadius.circular(8),
                                          child: Image(
                                            image: imgProvider,
                                            width: 100,
                                            height: 100,
                                            fit: BoxFit.cover,
                                          ),
                                        ),
                                        Positioned(
                                          top: 2,
                                          right: 2,
                                          child: CircleAvatar(
                                            backgroundColor: Colors.black54,
                                            radius: 12,
                                            child: IconButton(
                                              icon: const Icon(Icons.close, size: 12, color: Color(0xFFE11D48)),
                                              padding: EdgeInsets.zero,
                                              onPressed: () => _removeBoardPhoto(idx, board, photos, boards),
                                            ),
                                          ),
                                        ),
                                      ],
                                    );
                                  },
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

  Widget _boardTextField(Map<String, dynamic> board, String key, String label, List<Map<String, dynamic>> boards) {
    return TextFormField(
      key: ValueKey('${board['id']}:$key:${board[key]}'),
      initialValue: board[key]?.toString() ?? '',
      style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.inter(color: AppColors.slate400, fontSize: 11),
        filled: true,
        fillColor: AppColors.whiteOverlay(0.04),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
      ),
      onChanged: (val) {
        final nextB = Map<String, dynamic>.from(board);
        nextB[key] = val;
        _saveBoardAndRecalculate(nextB, boards, key == 'zsAtDb' || key == 'ipfAtDb');
      },
    );
  }

  Widget _boardSelectField(Map<String, dynamic> board, String key, String label, List<CertOption> options, List<Map<String, dynamic>> boards) {
    final val = board[key]?.toString() ?? '';
    final safeVal = options.any((o) => o.value == val) ? val : options.first.value;
    return DropdownButtonFormField<String>(
      initialValue: safeVal,
      dropdownColor: const Color(0xFF0F172A),
      style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.inter(color: AppColors.slate400, fontSize: 11),
        filled: true,
        fillColor: AppColors.whiteOverlay(0.04),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
      ),
      items: options.map((o) => DropdownMenuItem(value: o.value, child: Text(o.label))).toList(),
      onChanged: (nextVal) {
        if (nextVal == null) return;
        final nextB = Map<String, dynamic>.from(board);
        nextB[key] = nextVal;
        _saveBoardAndRecalculate(nextB, boards, false);
      },
    );
  }

  Widget _buildToolbar(Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            ElevatedButton.icon(
              onPressed: () => _addCircuits(board, circuits, boards),
              icon: const Icon(Icons.add, size: 16),
              label: Text('Add Circuit(s)', style: GoogleFonts.inter(fontWeight: FontWeight.bold)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(width: 8),
            DropdownButton<int>(
              value: _quickAddCount,
              dropdownColor: const Color(0xFF0F172A),
              style: GoogleFonts.inter(color: Colors.white),
              items: const [1, 6, 12, 18].map((c) => DropdownMenuItem(value: c, child: Text('x $c'))).toList(),
              onChanged: (v) {
                if (v != null) setState(() => _quickAddCount = v);
              },
            ),
            const SizedBox(width: 16),
            TextButton.icon(
              onPressed: () => _renumberCircuits(board, circuits, boards),
              icon: const Icon(Icons.format_list_numbered_rounded, color: AppColors.primary, size: 18),
              label: Text('Renumber', style: GoogleFonts.inter(color: AppColors.primary)),
            ),
            const SizedBox(width: 12),
            TextButton.icon(
              onPressed: () => _recalculateCircuits(board, circuits, boards),
              icon: const Icon(Icons.calculate_outlined, color: AppColors.primary, size: 18),
              label: Text('Recalculate', style: GoogleFonts.inter(color: AppColors.primary)),
            ),
            const SizedBox(width: 16),
            Row(
              children: [
                Checkbox(
                  value: board['maxZsUse100Percent'] == true,
                  activeColor: AppColors.primary,
                  onChanged: (val) {
                    final nextB = Map<String, dynamic>.from(board);
                    nextB['maxZsUse100Percent'] = val == true;
                    _saveBoardAndRecalculate(nextB, boards, true);
                  },
                ),
                Text(
                  'Use 100% max Zs (80% if unchecked)',
                  style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeaderRow() {
    final columns = CIRCUIT_COLUMNS_SPEC;
    return Container(
      color: AppColors.slate900,
      child: Row(
        children: columns.map((col) {
          final width = colWidths[col.key] ?? 80.0;
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
              mainAxisSize: MainAxisSize.min,
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
                  const Icon(Icons.calculate_outlined, color: AppColors.primary, size: 10),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildCircuitRow(
    Map<String, dynamic> circuit,
    int rowIndex,
    Map<String, dynamic> board,
    List<Map<String, dynamic>> circuits,
    List<Map<String, dynamic>> boards,
    bool use100Percent,
  ) {
    final columns = CIRCUIT_COLUMNS_SPEC;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.whiteOverlay(rowIndex % 2 == 0 ? 0.01 : 0.03),
        border: Border(bottom: BorderSide(color: AppColors.whiteOverlay(0.04))),
      ),
      child: Row(
        children: columns.map((col) {
          final width = colWidths[col.key] ?? 80.0;
          if (col.key == 'actions') {
            return Container(
              width: width,
              height: 36,
              decoration: BoxDecoration(
                border: Border(right: BorderSide(color: AppColors.whiteOverlay(0.08))),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_upward, size: 14, color: Colors.white70),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: rowIndex > 0 ? () => _moveCircuit(rowIndex, -1, board, circuits, boards) : null,
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    icon: const Icon(Icons.arrow_downward, size: 14, color: Colors.white70),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: rowIndex < circuits.length - 1 ? () => _moveCircuit(rowIndex, 1, board, circuits, boards) : null,
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    icon: const Icon(Icons.delete_outline, size: 14, color: Color(0xFFE11D48)),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () => _deleteCircuit(rowIndex, board, circuits, boards),
                  ),
                ],
              ),
            );
          }

          final cellValue = circuit[col.key]?.toString() ?? '';
          final calcField = col.key;
          final isCalc = col.calculated;
          final overrides = circuit['calcOverrides'] as Map? ?? {};
          final overridden = isCalc && overrides[calcField] == true;
          final opts = columnOptions[col.key];

          return Container(
            width: width,
            height: 36,
            decoration: BoxDecoration(
              border: Border(
                right: BorderSide(color: AppColors.whiteOverlay(0.08)),
              ),
            ),
            child: CircuitCell(
              columnKey: col.key,
              value: cellValue,
              isCalc: isCalc,
              overridden: overridden,
              options: opts,
              onChanged: (nextVal) {
                final nextC = Map<String, dynamic>.from(circuit);
                nextC[col.key] = nextVal;
                if (isCalc) {
                  final nextOverrides = Map<String, dynamic>.from(overrides);
                  nextOverrides[calcField] = true;
                  nextC['calcOverrides'] = nextOverrides;
                }
                final updatedC = applyCircuitCalculations(nextC, board, use100Percent);
                _saveCircuit(rowIndex, updatedC, board, circuits, boards);
              },
              onResetOverride: overridden
                  ? () {
                      final nextC = Map<String, dynamic>.from(circuit);
                      final nextOverrides = Map<String, dynamic>.from(overrides);
                      nextOverrides.remove(calcField);
                      nextC['calcOverrides'] = nextOverrides;
                      // clear the explicit value so calculation takes over
                      nextC[col.key] = '';
                      final updatedC = applyCircuitCalculations(nextC, board, use100Percent);
                      _saveCircuit(rowIndex, updatedC, board, circuits, boards);
                    }
                  : null,
            ),
          );
        }).toList(),
      ),
    );
  }

  // Action methods
  void _addCircuits(Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
    final nextCircuits = List<Map<String, dynamic>>.from(circuits);
    final prev = nextCircuits.isNotEmpty ? nextCircuits.last : null;
    final use100Percent = board['maxZsUse100Percent'] == true;

    for (var i = 0; i < _quickAddCount; i++) {
      final nextNum = nextCircuits.length + 1;
      final c = {
        'id': newId('c'),
        'circuitNumber': nextNum.toString(),
        'description': '',
        'points': '',
        'wiringType': prev != null ? (prev['wiringType'] ?? '') : '',
        'refMethod': prev != null ? (prev['refMethod'] ?? '') : '',
        'liveMm2': prev != null ? (prev['liveMm2'] ?? '') : '',
        'cpcMm2': prev != null ? (prev['cpcMm2'] ?? '') : '',
        'maxDisconnectTime': prev != null ? (prev['maxDisconnectTime'] ?? '') : '',
        'ocpdBs': prev != null ? (prev['ocpdBs'] ?? '') : '',
        'ocpdType': prev != null ? (prev['ocpdType'] ?? '') : '',
        'ocpdRatingA': prev != null ? (prev['ocpdRatingA'] ?? '') : '',
        'ocpdBreakingKa': prev != null ? (prev['ocpdBreakingKa'] ?? '') : '',
        'maxZs': prev != null ? (prev['maxZs'] ?? '') : '',
        'rcdBs': prev != null ? (prev['rcdBs'] ?? '') : '',
        'rcdType': prev != null ? (prev['rcdType'] ?? '') : '',
        'rcdRatingMa': prev != null ? (prev['rcdRatingMa'] ?? '') : '',
        'rcdRatingA': prev != null ? (prev['rcdRatingA'] ?? '') : '',
        'ringR1': '',
        'ringRn': '',
        'ringR2End': '',
        'r1r2': '',
        'r2': '',
        'insulationTestVoltage': prev != null ? (prev['insulationTestVoltage'] ?? '') : '',
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
      final calculated = applyCircuitCalculations(c, board, use100Percent);
      nextCircuits.add(calculated);
    }
    _saveCircuitsList(nextCircuits, board, boards);
  }

  void _renumberCircuits(Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
    final nextCircuits = circuits.asMap().entries.map((entry) {
      final nextC = Map<String, dynamic>.from(entry.value);
      nextC['circuitNumber'] = (entry.key + 1).toString();
      return nextC;
    }).toList();
    _saveCircuitsList(nextCircuits, board, boards);
  }

  void _recalculateCircuits(Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
    final use100Percent = board['maxZsUse100Percent'] == true;
    final nextCircuits = recalculateAllCircuits(circuits, board, use100Percent, clearOverrides: false);
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

  // Photo handlers
  Future<void> _pickBoardPhoto(ImageSource source, Map<String, dynamic> board, List<Map<String, dynamic>> photos, List<Map<String, dynamic>> boards) async {
    final picker = ImagePicker();
    final f = await picker.pickImage(
      source: source,
      maxWidth: 1400,
      imageQuality: 82,
    );
    if (f == null) return;
    try {
      final bytes = await f.readAsBytes();
      final base64Str = base64Encode(bytes);
      final dataUrl = 'data:image/jpeg;base64,$base64Str';
      final fileName = f.name.replaceAll(RegExp(r'\.[^.]+$'), '');

      final nextB = Map<String, dynamic>.from(board);
      final nextPhotos = List<Map<String, dynamic>>.from(photos);
      nextPhotos.add({
        'id': newId('ph'),
        'caption': fileName,
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

  // Save Helpers
  void _saveCircuit(int index, Map<String, dynamic> updatedCircuit, Map<String, dynamic> board, List<Map<String, dynamic>> circuits, List<Map<String, dynamic>> boards) {
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

// Custom Grid Input Cell
class CircuitCell extends StatefulWidget {
  const CircuitCell({
    required this.columnKey,
    required this.value,
    required this.isCalc,
    required this.overridden,
    required this.options,
    required this.onChanged,
    required this.onResetOverride,
    super.key,
  });

  final String columnKey;
  final String value;
  final bool isCalc;
  final bool overridden;
  final List<String>? options;
  final ValueChanged<String> onChanged;
  final VoidCallback? onResetOverride;

  @override
  State<CircuitCell> createState() => _CircuitCellState();
}

class _CircuitCellState extends State<CircuitCell> {
  late TextEditingController _textController;
  late FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _textController = TextEditingController(text: widget.value);
    _focusNode = FocusNode();
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
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasOptions = widget.options != null && widget.options!.isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: widget.isCalc
            ? (widget.overridden ? Colors.amber.shade900.withValues(alpha: 0.15) : AppColors.primary.withValues(alpha: 0.08))
            : Colors.transparent,
        border: widget.overridden ? Border.all(color: Colors.amber.shade500, width: 1) : null,
      ),
      alignment: Alignment.center,
      child: Row(
        children: [
          Expanded(
            child: hasOptions
                ? RawAutocomplete<String>(
                    textEditingController: _textController,
                    focusNode: _focusNode,
                    optionsBuilder: (TextEditingValue textEditingValue) {
                      return widget.options!.where((String option) {
                        return option.toLowerCase().contains(textEditingValue.text.toLowerCase());
                      });
                    },
                    optionsViewBuilder: (BuildContext context, AutocompleteOnSelected<String> onSelected, Iterable<String> options) {
                      final double cellWidth = _BoardCircuitsEditorViewState.colWidths[widget.columnKey] ?? 80.0;
                      final double menuWidth = cellWidth < 150.0 ? 150.0 : cellWidth;

                      return Align(
                        alignment: Alignment.topLeft,
                        child: Material(
                          color: const Color(0xFF0F172A), // Premium dark slate matching web
                          elevation: 8,
                          borderRadius: BorderRadius.circular(8),
                          clipBehavior: Clip.antiAlias,
                          child: Container(
                            width: menuWidth,
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.white10),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            constraints: const BoxConstraints(maxHeight: 180),
                            child: ListView.builder(
                              padding: EdgeInsets.zero,
                              shrinkWrap: true,
                              itemCount: options.length,
                              itemBuilder: (BuildContext context, int index) {
                                final String option = options.elementAt(index);
                                return Material(
                                  color: Colors.transparent,
                                  child: InkWell(
                                    onTap: () {
                                      onSelected(option);
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      decoration: const BoxDecoration(
                                        border: Border(bottom: BorderSide(color: Colors.white10)),
                                      ),
                                      child: Text(
                                        option,
                                        style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
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
                    onSelected: (String selection) {
                      widget.onChanged(selection);
                    },
                    fieldViewBuilder: (BuildContext context, TextEditingController textEditingController, FocusNode focusNode, VoidCallback onFieldSubmitted) {
                      return TextField(
                        controller: textEditingController,
                        focusNode: focusNode,
                        style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                          isDense: true,
                        ),
                        onChanged: widget.onChanged,
                      );
                    },
                  )
                : TextField(
                    controller: _textController,
                    focusNode: _focusNode,
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                      isDense: true,
                    ),
                    onChanged: widget.onChanged,
                  ),
          ),
          if (hasOptions)
            IconButton(
              icon: const Icon(Icons.arrow_drop_down, color: AppColors.slate400, size: 16),
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
          if (widget.isCalc && widget.overridden && widget.onResetOverride != null)
            IconButton(
              icon: const Icon(Icons.refresh, color: AppColors.primary, size: 14),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: widget.onResetOverride,
            ),
        ],
      ),
    );
  }
}

// Columns metadata matching web
class CircuitColSpec {
  const CircuitColSpec({required this.key, required this.label, this.calculated = false});
  final String key;
  final String label;
  final bool calculated;
}

const List<CircuitColSpec> CIRCUIT_COLUMNS_SPEC = [
  CircuitColSpec(key: 'actions', label: 'Actions'),
  CircuitColSpec(key: 'circuitNumber', label: '#'),
  CircuitColSpec(key: 'description', label: 'Circuit description'),
  CircuitColSpec(key: 'points', label: 'No. points'),
  CircuitColSpec(key: 'wiringType', label: 'Wiring type'),
  CircuitColSpec(key: 'refMethod', label: 'Ref method'),
  CircuitColSpec(key: 'liveMm2', label: 'Live mm²'),
  CircuitColSpec(key: 'cpcMm2', label: 'cpc mm²', calculated: true),
  CircuitColSpec(key: 'maxDisconnectTime', label: 'Max disconnect time (s)', calculated: true),
  CircuitColSpec(key: 'ocpdBs', label: 'OCPD BS'),
  CircuitColSpec(key: 'ocpdType', label: 'OCPD Type'),
  CircuitColSpec(key: 'ocpdRatingA', label: 'Rating (A)'),
  CircuitColSpec(key: 'ocpdBreakingKa', label: 'Breaking (kA)', calculated: true),
  CircuitColSpec(key: 'maxZs', label: 'Max Zs (Ω)', calculated: true),
  CircuitColSpec(key: 'rcdBs', label: 'RCD BS'),
  CircuitColSpec(key: 'rcdType', label: 'RCD Type'),
  CircuitColSpec(key: 'rcdRatingMa', label: 'IΔn (mA)'),
  CircuitColSpec(key: 'rcdRatingA', label: 'RCD Rating (A)'),
  CircuitColSpec(key: 'ringR1', label: 'r1 (Ω)'),
  CircuitColSpec(key: 'ringRn', label: 'rn (Ω)'),
  CircuitColSpec(key: 'ringR2End', label: 'r2 (Ω)'),
  CircuitColSpec(key: 'r1r2', label: 'R1+R2 (Ω)', calculated: true),
  CircuitColSpec(key: 'r2', label: 'R2 (Ω)'),
  CircuitColSpec(key: 'insulationTestVoltage', label: 'Test voltage (V)'),
  CircuitColSpec(key: 'insulationLL', label: 'L-L (MΩ)'),
  CircuitColSpec(key: 'insulationLE', label: 'L-E (MΩ)'),
  CircuitColSpec(key: 'polarity', label: 'Polarity'),
  CircuitColSpec(key: 'zs', label: 'Measured Zs (Ω)', calculated: true),
  CircuitColSpec(key: 'rcdTripMs', label: 'RCD (ms)'),
  CircuitColSpec(key: 'afdd', label: 'AFDD'),
  CircuitColSpec(key: 'remarks', label: 'Remarks'),
];
