import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/values/app_colors.dart';
import '../certificate_document_utils.dart';
import '../certificate_editor_controller.dart';
import '../widgets/cert_form_widgets.dart';
import 'circuit_calculations.dart';
import 'circuit_helpers.dart';
import '../certificate_print_webview_page.dart';
import 'board_circuits_editor_view.dart';

class BoardsListEditor extends StatelessWidget {
  const BoardsListEditor({required this.controller, super.key});

  final CertificateEditorController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final List<dynamic> rawBoards = controller.document['boards'] as List<dynamic>? ?? [];
      final boards = rawBoards.cast<Map<String, dynamic>>();

      return ListView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          CertSectionCard(
            title: 'Distribution Boards',
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  ElevatedButton.icon(
                    onPressed: () => _addBoard(boards),
                    icon: const Icon(Icons.add_rounded, color: Colors.white),
                    label: Text(
                      'Add Board',
                      style: GoogleFonts.inter(fontWeight: FontWeight.bold),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => _recalculateAllBoards(boards),
                    icon: const Icon(Icons.calculate_outlined, color: AppColors.primary, size: 18),
                    label: Text(
                      'Recalculate All',
                      style: GoogleFonts.inter(color: AppColors.primary, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (boards.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 30),
                  child: Center(
                    child: Text(
                      'No distribution boards added.',
                      style: GoogleFonts.inter(color: AppColors.slate500, fontSize: 14),
                    ),
                  ),
                )
              else
                ...boards.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final board = entry.value;
                  final name = board['name']?.toString() ?? 'DB-${idx + 1}';
                  final circuits = board['circuits'] as List? ?? [];
                  final status = board['status']?.toString() ?? 'in_progress';

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        color: AppColors.whiteOverlay(0.04),
                        border: Border.all(color: AppColors.whiteOverlay(0.08)),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        name,
                                        style: GoogleFonts.inter(
                                          color: Colors.white,
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${circuits.length} circuit(s) · ${boardStatusLabel(status)}',
                                        style: GoogleFonts.inter(
                                          color: AppColors.slate400,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Row(
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.arrow_upward_rounded, size: 18, color: Colors.white),
                                      onPressed: idx > 0 ? () => _moveBoard(idx, -1, boards) : null,
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.arrow_downward_rounded, size: 18, color: Colors.white),
                                      onPressed: idx < boards.length - 1 ? () => _moveBoard(idx, 1, boards) : null,
                                    ),
                                    PopupMenuButton<String>(
                                      icon: const Icon(Icons.more_vert_rounded, color: Colors.white),
                                      onSelected: (val) {
                                        if (val == 'print') {
                                          _printBoardSchedule(board);
                                        } else if (val == 'duplicate') {
                                          _duplicateBoard(idx, boards);
                                        } else if (val == 'delete') {
                                          _deleteBoard(idx, boards);
                                        }
                                      },
                                      itemBuilder: (context) => [
                                        PopupMenuItem(
                                          value: 'print',
                                          child: Text('Print schedule', style: GoogleFonts.inter(color: Colors.white)),
                                        ),
                                        PopupMenuItem(
                                          value: 'duplicate',
                                          child: Text('Duplicate', style: GoogleFonts.inter(color: Colors.white)),
                                        ),
                                        PopupMenuItem(
                                          value: 'delete',
                                          child: Text('Delete', style: GoogleFonts.inter(color: const Color(0xFFE11D48))),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            ElevatedButton.icon(
                              onPressed: () {
                                Get.to(() => BoardCircuitsEditorView(controller: controller, boardIndex: idx));
                              },
                              icon: const Icon(Icons.edit_note_rounded, size: 18),
                              label: const Text('Edit Board & Circuits'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                                foregroundColor: AppColors.primary,
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  side: const BorderSide(color: AppColors.primary, width: 1),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
            ],
          ),
        ],
      );
    });
  }

  void _addBoard(List<Map<String, dynamic>> boards) {
    final nextBoards = List<Map<String, dynamic>>.from(boards);
    final name = 'DB-${nextBoards.length + 1}';
    final db = {
      'id': newId('db'),
      'name': name,
      'status': 'in_progress',
      'manufacturer': '',
      'location': '',
      'suppliedFrom': '',
      'phases': '',
      'zsAtDb': '',
      'ipfAtDb': '',
      'polarityConfirmed': '',
      'phaseSequence': '',
      'mainSwitchBs': '',
      'mainSwitchVoltage': '',
      'mainSwitchRating': '',
      'mainSwitchIpf': '',
      'rcdRating': '',
      'rcdTripTime': '',
      'spdType': '',
      'spdStatus': '',
      'ocpdBs': '',
      'ocpdVoltage': '',
      'ocpdRating': '',
      'notes': '',
      'maxZsUse100Percent': false,
      'circuits': <dynamic>[],
      'photos': <dynamic>[],
    };
    nextBoards.add(db);
    controller.updatePath('boards', nextBoards);
  }

  void _moveBoard(int index, int delta, List<Map<String, dynamic>> boards) {
    final nextBoards = List<Map<String, dynamic>>.from(boards);
    final target = index + delta;
    if (target < 0 || target >= nextBoards.length) return;
    final temp = nextBoards[index];
    nextBoards[index] = nextBoards[target];
    nextBoards[target] = temp;
    controller.updatePath('boards', nextBoards);
  }

  void _duplicateBoard(int index, List<Map<String, dynamic>> boards) {
    final nextBoards = List<Map<String, dynamic>>.from(boards);
    final src = nextBoards[index];
    final copy = deepCloneDocument(src);
    copy['id'] = newId('db');
    copy['name'] = '${src['name']} (Copy)';
    if (copy['circuits'] is List) {
      copy['circuits'] = (copy['circuits'] as List).map((c) {
        final nextC = Map<String, dynamic>.from(c as Map);
        nextC['id'] = newId('c');
        return nextC;
      }).toList();
    }
    nextBoards.insert(index + 1, copy);
    controller.updatePath('boards', nextBoards);
  }

  void _deleteBoard(int index, List<Map<String, dynamic>> boards) {
    if (boards.length <= 1) {
      Get.snackbar('Cannot delete', 'At least one board is required.');
      return;
    }
    final nextBoards = List<Map<String, dynamic>>.from(boards);
    if (index >= 0 && index < nextBoards.length) {
      nextBoards.removeAt(index);
      controller.updatePath('boards', nextBoards);
    }
  }

  void _recalculateAllBoards(List<Map<String, dynamic>> boards) {
    final nextBoards = boards.map((b) {
      final nextB = Map<String, dynamic>.from(b);
      final rawCircuits = nextB['circuits'] as List? ?? [];
      final circuits = rawCircuits.map((c) => Map<String, dynamic>.from(c)).toList();
      final use100Percent = nextB['maxZsUse100Percent'] == true;
      nextB['circuits'] = recalculateAllCircuits(circuits, nextB, use100Percent, clearOverrides: true);
      return nextB;
    }).toList();
    controller.updatePath('boards', nextBoards);
    Get.snackbar('Recalculated', 'All circuits in all boards have been recalculated.');
  }

  Future<void> _printBoardSchedule(Map<String, dynamic> board) async {
    final boardId = board['id']?.toString().trim() ?? '';
    if (boardId.isEmpty) {
      Get.snackbar('Print unavailable', 'Board is missing an id.');
      return;
    }
    final name = board['name']?.toString().trim();
    await Get.to(
      () => CertificatePrintWebViewPage(
        certificateId: controller.certificateId,
        boardId: boardId,
        title: name != null && name.isNotEmpty ? 'Print $name' : 'Print board schedule',
      ),
    );
  }
}
