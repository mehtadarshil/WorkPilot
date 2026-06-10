import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/values/app_colors.dart';
import '../../../data/repositories/customers_repository.dart';
import '../customer_detail_controller.dart';
import 'helpers.dart';
import 'shell.dart';

class CustomerNotesTab extends StatefulWidget {
  const CustomerNotesTab({super.key, required this.controller});

  final CustomerDetailController controller;

  @override
  State<CustomerNotesTab> createState() => _CustomerNotesTabState();
}

class _CustomerNotesTabState extends State<CustomerNotesTab> {
  final _repo = Get.find<CustomersRepository>();
  final _picker = ImagePicker();
  bool _savingBehaviour = false;
  int? _busyNoteId;

  List<Map<String, dynamic>> _notesForScope(Map<String, dynamic> customer) {
    final raw = customer['specific_notes'];
    if (raw is! List) return [];
    final wid = widget.controller.scopedWorkAddressId.value;
    return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).where((n) {
      final nw = n['work_address_id'];
      if (wid == null) return nw == null;
      return nw is num && nw.toInt() == wid;
    }).toList();
  }

  Future<void> _editBehaviourNotes(String current) async {
    final c = TextEditingController(text: current);
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0f172a),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Customer behaviour & notes',
                      style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                    ),
                  ),
                  IconButton(onPressed: () => Navigator.pop(ctx, false), icon: const Icon(Icons.close_rounded, color: Colors.white54)),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'Payment behaviour, access warnings, booking preferences, or anything the team should know.',
                style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.6), fontSize: 12, height: 1.35),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: c,
                maxLines: 7,
                minLines: 4,
                style: GoogleFonts.inter(color: Colors.white),
                decoration: customerInputDecoration('Behaviour notes'),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Save notes'),
              ),
            ],
          ),
        ),
      ),
    );
    if (ok != true) return;
    setState(() => _savingBehaviour = true);
    try {
      await _repo.updateCustomer(widget.controller.customerId, {
        'notes': c.text.trim(),
      });
      await widget.controller.refreshCustomer();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } finally {
      if (mounted) setState(() => _savingBehaviour = false);
    }
  }

  Future<void> _noteDialog({Map<String, dynamic>? existing}) async {
    final titleC = TextEditingController(text: ctStr(existing, 'title'));
    final descC = TextEditingController(text: ctStr(existing, 'description'));
    final noteId = (existing?['id'] as num?)?.toInt();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0f172a),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                noteId == null ? 'New technical note' : 'Edit technical note',
                style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
              ),
              const SizedBox(height: 14),
              TextField(controller: titleC, style: GoogleFonts.inter(color: Colors.white), decoration: customerInputDecoration('Title *')),
              const SizedBox(height: 12),
              TextField(
                controller: descC,
                maxLines: 5,
                style: GoogleFonts.inter(color: Colors.white),
                decoration: customerInputDecoration('Description *'),
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save note')),
            ],
          ),
        ),
      ),
    );
    if (ok != true) return;
    final title = titleC.text.trim();
    final desc = descC.text.trim();
    if (title.isEmpty || desc.isEmpty) {
      Get.snackbar('Validation', 'Title and description are required.');
      return;
    }
    try {
      final wid = widget.controller.scopedWorkAddressId.value;
      if (noteId == null) {
        await _repo.createSpecificNote(widget.controller.customerId, {
          'title': title,
          'description': desc,
          if (wid != null) 'work_address_id': wid,
        });
      } else {
        await _repo.updateSpecificNote(widget.controller.customerId, noteId, {
          'title': title,
          'description': desc,
        });
      }
      await widget.controller.refreshCustomer();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  Future<void> _deleteNote(int noteId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete note?'),
        content: const Text('This removes the technical note and any attached pictures.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _repo.deleteSpecificNote(widget.controller.customerId, noteId);
      await widget.controller.refreshCustomer();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  Future<void> _attachImage(int noteId, ImageSource source) async {
    final x = await _picker.pickImage(source: source, maxWidth: 1800, imageQuality: 82);
    if (x == null) return;
    setState(() => _busyNoteId = noteId);
    try {
      final bytes = await x.readAsBytes();
      await _repo.uploadSpecificNoteImage(
        widget.controller.customerId,
        noteId,
        filename: x.name.isEmpty ? 'technical-note.jpg' : x.name,
        contentType: x.mimeType ?? 'image/jpeg',
        bytes: bytes,
      );
      await widget.controller.refreshCustomer();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } finally {
      if (mounted) setState(() => _busyNoteId = null);
    }
  }

  Future<void> _deleteMedia(int noteId, String stored) async {
    if (stored.trim().isEmpty) return;
    try {
      await _repo.deleteSpecificNoteMedia(widget.controller.customerId, noteId, stored);
      await widget.controller.refreshCustomer();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final c = widget.controller.customer.value;
      if (c == null) return const SizedBox.shrink();
      final behaviour = ctStr(c, 'notes');
      final technicalNotes = _notesForScope(c);
      return RefreshIndicator(
        color: AppColors.primary,
        onRefresh: widget.controller.refreshCustomer,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            customerPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Customer behaviour & notes',
                          style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: _savingBehaviour ? null : () => _editBehaviourNotes(behaviour),
                        icon: _savingBehaviour
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.edit_note_rounded, size: 18),
                        label: const Text('Edit'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    behaviour.isEmpty ? 'No behaviour notes recorded yet.' : behaviour,
                    style: GoogleFonts.inter(color: AppColors.whiteOverlay(0.78), fontSize: 13, height: 1.45),
                  ),
                ],
              ),
            ),
            customerSectionHeader(
              'Technical notes',
              trailing: IconButton.filledTonal(
                visualDensity: VisualDensity.compact,
                onPressed: () => _noteDialog(),
                icon: const Icon(Icons.add_rounded, size: 20),
              ),
            ),
            if (technicalNotes.isEmpty)
              customerEmptyState(
                icon: Icons.note_alt_outlined,
                title: 'No technical notes',
                subtitle: 'Add access codes, site caveats, installation notes, and pictures.',
              )
            else
              ...technicalNotes.map((n) => _noteCard(n)),
          ],
        ),
      );
    });
  }

  Widget _noteCard(Map<String, dynamic> n) {
    final id = (n['id'] as num?)?.toInt() ?? 0;
    final media = n['media'] is List
        ? (n['media'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
        : <Map<String, dynamic>>[];
    return customerPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(ctStr(n, 'title'), style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w800)),
              ),
              IconButton(icon: const Icon(Icons.edit_outlined, size: 20), color: AppColors.primary, onPressed: () => _noteDialog(existing: n)),
              IconButton(icon: const Icon(Icons.delete_outline_rounded, size: 20), color: const Color(0xFFFCA5A5), onPressed: () => _deleteNote(id)),
            ],
          ),
          const SizedBox(height: 6),
          Text(ctStr(n, 'description'), style: GoogleFonts.inter(fontSize: 13, color: AppColors.whiteOverlay(0.78), height: 1.4)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final item in media) _mediaTile(id, item),
              _addImageButton(id, Icons.camera_alt_outlined, 'Camera', ImageSource.camera),
              _addImageButton(id, Icons.photo_library_outlined, 'Gallery', ImageSource.gallery),
              if (_busyNoteId == id)
                const SizedBox(width: 36, height: 36, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _addImageButton(int noteId, IconData icon, String label, ImageSource source) {
    return ActionChip(
      avatar: Icon(icon, size: 16),
      label: Text(label),
      onPressed: _busyNoteId == null ? () => _attachImage(noteId, source) : null,
    );
  }

  Widget _mediaTile(int noteId, Map<String, dynamic> item) {
    final filePath = ctStr(item, 'file_path');
    final stored = ctStr(item, 'stored_filename');
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: FutureBuilder<Uint8List>(
            future: filePath.isEmpty ? Future.value(Uint8List(0)) : _repo.getSpecificNoteMediaBytes(filePath),
            builder: (ctx, snap) {
              final bytes = snap.data;
              if (bytes == null || bytes.isEmpty) {
                return Container(
                  width: 92,
                  height: 72,
                  color: AppColors.whiteOverlay(0.08),
                  child: Icon(Icons.image_outlined, color: AppColors.whiteOverlay(0.35)),
                );
              }
              return Image.memory(bytes, width: 92, height: 72, fit: BoxFit.cover);
            },
          ),
        ),
        Positioned(
          right: 2,
          top: 2,
          child: InkWell(
            onTap: () => _deleteMedia(noteId, stored),
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.65), shape: BoxShape.circle),
              child: const Icon(Icons.close_rounded, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}
