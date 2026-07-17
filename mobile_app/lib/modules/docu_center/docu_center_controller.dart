import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:get/get.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';

import '../../core/network/api_exception.dart';
import '../../data/providers/api_provider.dart';
import '../home/controllers/home_controller.dart';

class DocuFolder {
  DocuFolder({
    required this.id,
    this.parentId,
    required this.name,
    required this.allowedRoles,
    required this.allowedUserIds,
    required this.allowedOfficerIds,
  });

  factory DocuFolder.fromJson(Map<String, dynamic> j) {
    final roles = <String>[];
    final raw = j['allowed_roles'];
    if (raw is List) {
      for (final e in raw) {
        if (e != null) roles.add(e.toString());
      }
    }
    final userIds = <int>[];
    final ur = j['allowed_user_ids'];
    if (ur is List) {
      for (final e in ur) {
        if (e is num) userIds.add(e.toInt());
      }
    }
    final officerIds = <int>[];
    final or = j['allowed_officer_ids'];
    if (or is List) {
      for (final e in or) {
        if (e is num) officerIds.add(e.toInt());
      }
    }
    return DocuFolder(
      id: (j['id'] as num).toInt(),
      parentId: (j['parent_id'] as num?)?.toInt(),
      name: (j['name'] as String?)?.trim() ?? 'Folder',
      allowedRoles: roles,
      allowedUserIds: userIds,
      allowedOfficerIds: officerIds,
    );
  }

  final int id;
  final int? parentId;
  final String name;
  final List<String> allowedRoles;
  final List<int> allowedUserIds;
  final List<int> allowedOfficerIds;

  int get specificPeopleCount => allowedUserIds.length + allowedOfficerIds.length;
}

class DocuAccessPrincipal {
  DocuAccessPrincipal({
    required this.kind,
    required this.id,
    required this.fullName,
    this.subtitle,
  });

  factory DocuAccessPrincipal.fromJson(Map<String, dynamic> j) {
    return DocuAccessPrincipal(
      kind: (j['kind'] as String?) == 'officer' ? 'officer' : 'user',
      id: (j['id'] as num).toInt(),
      fullName: (j['full_name'] as String?)?.trim() ?? 'Person',
      subtitle: j['subtitle'] as String?,
    );
  }

  final String kind;
  final int id;
  final String fullName;
  final String? subtitle;

  String get key => '$kind:$id';
}

class DocuFileItem {
  DocuFileItem({
    required this.id,
    required this.folderId,
    required this.originalFilename,
    this.contentType,
    required this.byteSize,
  });

  factory DocuFileItem.fromJson(Map<String, dynamic> j) {
    return DocuFileItem(
      id: (j['id'] as num).toInt(),
      folderId: (j['folder_id'] as num).toInt(),
      originalFilename: (j['original_filename'] as String?)?.trim() ?? 'file',
      contentType: j['content_type'] as String?,
      byteSize: (j['byte_size'] as num?)?.toInt() ?? 0,
    );
  }

  final int id;
  final int folderId;
  final String originalFilename;
  final String? contentType;
  final int byteSize;
}

class DocuCenterController extends GetxController {
  DocuCenterController({ApiProvider? api}) : _api = api ?? Get.find<ApiProvider>();

  final ApiProvider _api;

  final RxBool loading = true.obs;
  final RxString error = ''.obs;
  final RxBool canManage = false.obs;
  final RxnInt parentId = RxnInt();
  final RxList<DocuFolder> folders = <DocuFolder>[].obs;
  final RxList<DocuFileItem> files = <DocuFileItem>[].obs;
  final RxList<({int id, String name})> breadcrumbs = <({int id, String name})>[].obs;
  final RxList<DocuAccessPrincipal> accessPrincipals = <DocuAccessPrincipal>[].obs;
  final RxBool busy = false.obs;

  bool get isManage => canManage.value;

  @override
  void onInit() {
    super.onInit();
    load();
    loadAccessPrincipals();
  }

  Future<void> loadAccessPrincipals() async {
    if (!isManage) return;
    try {
      final res = await _api.get<Map<String, dynamic>>('/docu-center/access-principals');
      final list = <DocuAccessPrincipal>[];
      final raw = res.data?['people'];
      if (raw is List) {
        for (final e in raw) {
          if (e is Map) {
            list.add(DocuAccessPrincipal.fromJson(Map<String, dynamic>.from(e)));
          }
        }
      }
      accessPrincipals.assignAll(list);
    } catch (_) {
      accessPrincipals.clear();
    }
  }

  Future<void> load() async {
    loading.value = true;
    error.value = '';
    try {
      final q = parentId.value == null ? '' : '?parent_id=${parentId.value}';
      final res = await _api.get<Map<String, dynamic>>('/docu-center/folders$q');
      final data = res.data ?? {};
      canManage.value = data['can_manage'] == true;
      final list = <DocuFolder>[];
      final raw = data['folders'];
      if (raw is List) {
        for (final e in raw) {
          if (e is Map) list.add(DocuFolder.fromJson(Map<String, dynamic>.from(e)));
        }
      }
      folders.assignAll(list);
      if (canManage.value) {
        unawaited(loadAccessPrincipals());
      }

      if (parentId.value != null) {
        final detail = await _api.get<Map<String, dynamic>>(
          '/docu-center/folders/${parentId.value}',
        );
        final d = detail.data ?? {};
        canManage.value = d['can_manage'] == true;
        final crumbs = <({int id, String name})>[];
        final bc = d['breadcrumbs'];
        if (bc is List) {
          for (final e in bc) {
            if (e is Map) {
              final id = (e['id'] as num?)?.toInt();
              final name = (e['name'] as String?)?.trim();
              if (id != null && name != null) crumbs.add((id: id, name: name));
            }
          }
        }
        breadcrumbs.assignAll(crumbs);

        final fileRes = await _api.get<Map<String, dynamic>>(
          '/docu-center/folders/${parentId.value}/files',
        );
        final fd = fileRes.data ?? {};
        final fl = <DocuFileItem>[];
        final fr = fd['files'];
        if (fr is List) {
          for (final e in fr) {
            if (e is Map) fl.add(DocuFileItem.fromJson(Map<String, dynamic>.from(e)));
          }
        }
        files.assignAll(fl);
      } else {
        breadcrumbs.clear();
        files.clear();
      }
    } on ApiException catch (e) {
      error.value = e.message;
      folders.clear();
      files.clear();
    } catch (e) {
      error.value = e.toString();
    } finally {
      loading.value = false;
    }
  }

  void openRoot() {
    parentId.value = null;
    load();
  }

  void openFolder(int id) {
    parentId.value = id;
    load();
  }

  Future<void> createFolder(
    String name,
    List<String> roles,
    List<int> userIds,
    List<int> officerIds,
  ) async {
    if (!isManage || name.trim().isEmpty) return;
    busy.value = true;
    try {
      await _api.post<Map<String, dynamic>>(
        '/docu-center/folders',
        data: {
          'name': name.trim(),
          'parent_id': parentId.value,
          'allowed_roles': roles,
          'allowed_user_ids': userIds,
          'allowed_officer_ids': officerIds,
        },
      );
      await load();
    } on ApiException catch (e) {
      Get.snackbar('Docu Center', e.message);
    } finally {
      busy.value = false;
    }
  }

  Future<void> updateFolder(
    int id,
    String name,
    List<String> roles,
    List<int> userIds,
    List<int> officerIds,
  ) async {
    if (!isManage) return;
    busy.value = true;
    try {
      await _api.patch<Map<String, dynamic>>(
        '/docu-center/folders/$id',
        data: {
          'name': name.trim(),
          'allowed_roles': roles,
          'allowed_user_ids': userIds,
          'allowed_officer_ids': officerIds,
        },
      );
      await load();
    } on ApiException catch (e) {
      Get.snackbar('Docu Center', e.message);
    } finally {
      busy.value = false;
    }
  }

  Future<void> deleteFolder(int id) async {
    if (!isManage) return;
    busy.value = true;
    try {
      await _api.delete<Map<String, dynamic>>('/docu-center/folders/$id');
      if (parentId.value == id) parentId.value = null;
      await load();
    } on ApiException catch (e) {
      Get.snackbar('Docu Center', e.message);
    } finally {
      busy.value = false;
    }
  }

  Future<void> uploadBytes(String filename, String contentType, Uint8List bytes) async {
    final folder = parentId.value;
    if (!isManage || folder == null) {
      Get.snackbar('Docu Center', 'Open a folder before uploading.');
      return;
    }
    busy.value = true;
    try {
      await _api.post<Map<String, dynamic>>(
        '/docu-center/folders/$folder/files',
        data: {
          'filename': filename,
          'content_type': contentType,
          'content_base64': base64Encode(bytes),
        },
      );
      await load();
    } on ApiException catch (e) {
      Get.snackbar('Upload', e.message);
    } finally {
      busy.value = false;
    }
  }

  Future<void> openFile(DocuFileItem f) async {
    busy.value = true;
    try {
      final res = await _api.getBytes('/docu-center/files/${f.id}/content');
      final bytes = res.data;
      if (bytes == null || bytes.isEmpty) throw StateError('Empty file');
      final dir = await getTemporaryDirectory();
      final safe = f.originalFilename.replaceAll(RegExp(r'[/\\]'), '_');
      final path = '${dir.path}/docu_$safe';
      final file = File(path);
      await file.writeAsBytes(bytes, flush: true);
      await OpenFilex.open(path);
    } on ApiException catch (e) {
      Get.snackbar('File', e.message);
    } catch (e) {
      Get.snackbar('File', e.toString());
    } finally {
      busy.value = false;
    }
  }

  Future<void> deleteFile(int id) async {
    if (!isManage) return;
    busy.value = true;
    try {
      await _api.delete<Map<String, dynamic>>('/docu-center/files/$id');
      await load();
    } on ApiException catch (e) {
      Get.snackbar('Docu Center', e.message);
    } finally {
      busy.value = false;
    }
  }

  static bool hubVisible() {
    if (!Get.isRegistered<HomeController>()) return false;
    final h = Get.find<HomeController>().home.value;
    if (h == null) return false;
    return h.hasDocuCenterAccess && h.showWorkHubTab;
  }
}
