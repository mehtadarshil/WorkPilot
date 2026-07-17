import 'package:file_picker/file_picker.dart' as fp;
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import 'docu_center_controller.dart';

const _roleOptions = <({String key, String label})>[
  (key: 'ADMIN', label: 'Admin'),
  (key: 'STAFF', label: 'Staff'),
  (key: 'OFFICER', label: 'Officer / field'),
];

String folderAccessSubtitle(DocuFolder f) {
  final peopleCount = f.specificPeopleCount;
  if (f.allowedRoles.isEmpty && peopleCount == 0) return 'Managers only';
  final parts = <String>[];
  if (f.allowedRoles.isNotEmpty) parts.add(f.allowedRoles.join(', '));
  if (peopleCount > 0) {
    parts.add('$peopleCount specific ${peopleCount == 1 ? 'person' : 'people'}');
  }
  return 'Visible: ${parts.join(' + ')}';
}

class DocuCenterView extends GetView<DocuCenterController> {
  const DocuCenterView({super.key});

  Widget _peoplePicker({
    required Set<String> selected,
    required void Function(void Function()) setLocal,
    required String filter,
    required void Function(String) onFilter,
  }) {
    final q = filter.trim().toLowerCase();
    final principals = controller.accessPrincipals.where((p) {
      if (q.isEmpty) return true;
      return p.fullName.toLowerCase().contains(q) ||
          (p.subtitle ?? '').toLowerCase().contains(q);
    });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        Text(
          'Specific people (optional)',
          style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12),
        ),
        const SizedBox(height: 8),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          onChanged: onFilter,
        ),
        const SizedBox(height: 8),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 180),
          child: principals.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'No people match.',
                    style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
                  ),
                )
              : ListView(
                  shrinkWrap: true,
                  children: principals
                      .map(
                        (p) => CheckboxListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(p.fullName),
                          subtitle: p.subtitle == null ? null : Text(p.subtitle!),
                          value: selected.contains(p.key),
                          onChanged: (v) {
                            setLocal(() {
                              if (v == true) {
                                selected.add(p.key);
                              } else {
                                selected.remove(p.key);
                              }
                            });
                          },
                        ),
                      )
                      .toList(),
                ),
        ),
      ],
    );
  }

  ({List<int> userIds, List<int> officerIds}) _idsFromKeys(Set<String> keys) {
    final userIds = <int>[];
    final officerIds = <int>[];
    for (final key in keys) {
      final parts = key.split(':');
      if (parts.length != 2) continue;
      final id = int.tryParse(parts[1]);
      if (id == null) continue;
      if (parts[0] == 'user') userIds.add(id);
      if (parts[0] == 'officer') officerIds.add(id);
    }
    return (userIds: userIds, officerIds: officerIds);
  }

  Set<String> _keysFromFolder(DocuFolder f) {
    final keys = <String>{};
    for (final id in f.allowedUserIds) {
      keys.add('user:$id');
    }
    for (final id in f.allowedOfficerIds) {
      keys.add('officer:$id');
    }
    return keys;
  }

  Future<void> _showNewFolder() async {
    final nameCtrl = TextEditingController();
    final roles = <String>{'ADMIN', 'STAFF', 'OFFICER'};
    final selectedPeople = <String>{};
    var peopleFilter = '';
    final ok = await Get.dialog<bool>(
      AlertDialog(
        title: const Text('New folder'),
        content: StatefulBuilder(
          builder: (context, setLocal) {
            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Roles who can view',
                    style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12),
                  ),
                  ..._roleOptions.map(
                    (r) => CheckboxListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(r.label),
                      value: roles.contains(r.key),
                      onChanged: (v) {
                        setLocal(() {
                          if (v == true) {
                            roles.add(r.key);
                          } else {
                            roles.remove(r.key);
                          }
                        });
                      },
                    ),
                  ),
                  _peoplePicker(
                    selected: selectedPeople,
                    setLocal: setLocal,
                    filter: peopleFilter,
                    onFilter: (v) => setLocal(() => peopleFilter = v),
                  ),
                ],
              ),
            );
          },
        ),
        actions: [
          TextButton(onPressed: () => Get.back(result: false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Get.back(result: true), child: const Text('Create')),
        ],
      ),
    );
    if (ok == true && nameCtrl.text.trim().isNotEmpty) {
      final ids = _idsFromKeys(selectedPeople);
      await controller.createFolder(
        nameCtrl.text,
        roles.toList(),
        ids.userIds,
        ids.officerIds,
      );
    }
    nameCtrl.dispose();
  }

  Future<void> _showFolderOptions(DocuFolder f) async {
    final nameCtrl = TextEditingController(text: f.name);
    final roles = f.allowedRoles.toSet();
    final selectedPeople = _keysFromFolder(f);
    var peopleFilter = '';
    final ok = await Get.dialog<bool>(
      AlertDialog(
        title: const Text('Folder options'),
        content: StatefulBuilder(
          builder: (context, setLocal) {
            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Roles who can view',
                    style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 12),
                  ),
                  ..._roleOptions.map(
                    (r) => CheckboxListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(r.label),
                      value: roles.contains(r.key),
                      onChanged: (v) {
                        setLocal(() {
                          if (v == true) {
                            roles.add(r.key);
                          } else {
                            roles.remove(r.key);
                          }
                        });
                      },
                    ),
                  ),
                  _peoplePicker(
                    selected: selectedPeople,
                    setLocal: setLocal,
                    filter: peopleFilter,
                    onFilter: (v) => setLocal(() => peopleFilter = v),
                  ),
                ],
              ),
            );
          },
        ),
        actions: [
          TextButton(onPressed: () => Get.back(result: false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Get.back(result: true), child: const Text('Save')),
        ],
      ),
    );
    if (ok == true && nameCtrl.text.trim().isNotEmpty) {
      final ids = _idsFromKeys(selectedPeople);
      await controller.updateFolder(
        f.id,
        nameCtrl.text,
        roles.toList(),
        ids.userIds,
        ids.officerIds,
      );
    }
    nameCtrl.dispose();
  }

  Future<void> _pickUpload() async {
    final res = await fp.FilePicker.pickFiles(allowMultiple: true, withData: true);
    if (res == null || res.files.isEmpty) return;
    for (final f in res.files) {
      final bytes = f.bytes;
      if (bytes == null) continue;
      final name = f.name.isNotEmpty ? f.name : 'file';
      final ct = switch ((f.extension ?? '').toLowerCase()) {
        'pdf' => 'application/pdf',
        'png' => 'image/png',
        'jpg' || 'jpeg' => 'image/jpeg',
        _ => 'application/octet-stream',
      };
      await controller.uploadBytes(name, ct, bytes);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: AppBar(
        title: Text('Docu Center', style: GoogleFonts.inter(fontWeight: FontWeight.w800)),
        actions: [
          Obx(() {
            if (!controller.isManage) return const SizedBox.shrink();
            return IconButton(
              icon: const Icon(Icons.create_new_folder_outlined),
              onPressed: controller.busy.value ? null : _showNewFolder,
            );
          }),
          Obx(() {
            if (!controller.isManage || controller.parentId.value == null) {
              return const SizedBox.shrink();
            }
            return IconButton(
              icon: const Icon(Icons.upload_file_outlined),
              onPressed: controller.busy.value ? null : _pickUpload,
            );
          }),
        ],
      ),
      body: Obx(() {
        if (controller.loading.value && controller.folders.isEmpty) {
          return const Center(child: CircularProgressIndicator(color: AppColors.primary));
        }
        if (controller.error.value.isNotEmpty && controller.folders.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(controller.error.value, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: controller.load, child: const Text('Retry')),
                ],
              ),
            ),
          );
        }

        return RefreshIndicator(
          color: AppColors.primary,
          onRefresh: controller.load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    TextButton(
                      onPressed: controller.openRoot,
                      child: const Text('Root'),
                    ),
                    ...controller.breadcrumbs.map(
                      (c) => Row(
                        children: [
                          const Icon(Icons.chevron_right, size: 16, color: AppColors.slate400),
                          TextButton(
                            onPressed: () => controller.openFolder(c.id),
                            child: Text(c.name),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'FOLDERS',
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                  color: AppColors.slate400,
                ),
              ),
              const SizedBox(height: 8),
              if (controller.folders.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text(
                    'No folders here.',
                    style: GoogleFonts.inter(color: AppColors.slate400),
                  ),
                )
              else
                ...controller.folders.map((f) {
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: Icon(Icons.folder_rounded, color: AppColors.primary),
                      title: Text(f.name, style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
                      subtitle: Text(
                        folderAccessSubtitle(f),
                        style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
                      ),
                      onTap: () => controller.openFolder(f.id),
                      trailing: controller.isManage
                          ? PopupMenuButton<String>(
                              onSelected: (v) async {
                                if (v == 'options') await _showFolderOptions(f);
                                if (v == 'delete') {
                                  final ok = await Get.dialog<bool>(
                                    AlertDialog(
                                      title: const Text('Delete folder?'),
                                      content: const Text(
                                        'This deletes the folder and everything inside it.',
                                      ),
                                      actions: [
                                        TextButton(
                                          onPressed: () => Get.back(result: false),
                                          child: const Text('Cancel'),
                                        ),
                                        FilledButton(
                                          onPressed: () => Get.back(result: true),
                                          child: const Text('Delete'),
                                        ),
                                      ],
                                    ),
                                  );
                                  if (ok == true) await controller.deleteFolder(f.id);
                                }
                              },
                              itemBuilder: (_) => const [
                                PopupMenuItem(value: 'options', child: Text('Folder options')),
                                PopupMenuItem(value: 'delete', child: Text('Delete')),
                              ],
                            )
                          : const Icon(Icons.chevron_right),
                    ),
                  );
                }),
              if (controller.parentId.value != null) ...[
                const SizedBox(height: 16),
                Text(
                  'FILES',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: AppColors.slate400,
                  ),
                ),
                const SizedBox(height: 8),
                if (controller.files.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      'No files in this folder.',
                      style: GoogleFonts.inter(color: AppColors.slate400),
                    ),
                  )
                else
                  ...controller.files.map((f) {
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: const Icon(Icons.insert_drive_file_outlined),
                        title: Text(
                          f.originalFilename,
                          style: GoogleFonts.inter(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text(
                          '${(f.byteSize / 1024).toStringAsFixed(1)} KB',
                          style: GoogleFonts.inter(fontSize: 12, color: AppColors.slate400),
                        ),
                        onTap: () => controller.openFile(f),
                        trailing: controller.isManage
                            ? IconButton(
                                icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                                onPressed: () async {
                                  final ok = await Get.dialog<bool>(
                                    AlertDialog(
                                      title: const Text('Delete file?'),
                                      actions: [
                                        TextButton(
                                          onPressed: () => Get.back(result: false),
                                          child: const Text('Cancel'),
                                        ),
                                        FilledButton(
                                          onPressed: () => Get.back(result: true),
                                          child: const Text('Delete'),
                                        ),
                                      ],
                                    ),
                                  );
                                  if (ok == true) await controller.deleteFile(f.id);
                                },
                              )
                            : const Icon(Icons.open_in_new, size: 18),
                      ),
                    );
                  }),
              ],
            ],
          ),
        );
      }),
    );
  }
}
