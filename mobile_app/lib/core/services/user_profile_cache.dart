import 'dart:convert';
import 'dart:typed_data';

import 'package:get/get.dart';

import '../../data/models/mobile_profile.dart';
import '../../data/repositories/mobile_profile_repository.dart';
import 'storage_service.dart';

/// Cached mobile profile + photo for Home header, Profile tab, and ID card.
class UserProfileCache extends GetxService {
  UserProfileCache({
    MobileProfileRepository? repo,
    StorageService? storage,
  })  : _repo = repo ?? Get.find<MobileProfileRepository>(),
        _storage = storage ?? Get.find<StorageService>();

  final MobileProfileRepository _repo;
  final StorageService _storage;

  final Rxn<MobileProfile> profile = Rxn<MobileProfile>();
  final Rxn<Uint8List> photoBytes = Rxn<Uint8List>();
  final RxBool loading = false.obs;

  String? get companyName {
    final raw = _storage.userJson;
    if (raw == null || raw.isEmpty) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      final c = (m['company_name'] as String?)?.trim();
      return c != null && c.isNotEmpty ? c : null;
    } catch (_) {
      return null;
    }
  }

  String get displayInitial {
    final name = profile.value?.fullName ?? _nameFromStorage() ?? '';
    if (name.isEmpty) return '?';
    return name[0].toUpperCase();
  }

  String? _nameFromStorage() {
    final raw = _storage.userJson;
    if (raw == null) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return (m['full_name'] as String?)?.trim() ??
          (m['name'] as String?)?.trim() ??
          (m['email'] as String?)?.trim();
    } catch (_) {
      return null;
    }
  }

  Future<void> refresh() async {
    if (loading.value) return;
    loading.value = true;
    try {
      final p = await _repo.getProfile();
      profile.value = p;
      photoBytes.value = await _fetchPhotoBytes(p);
    } catch (_) {
      /* keep prior cache if any */
    } finally {
      loading.value = false;
    }
  }

  Future<Uint8List?> _fetchPhotoBytes(MobileProfile p) async {
    if (!p.hasProfilePhoto) {
      try {
        final b = await _repo.fetchPhotoBytes();
        if (b.isNotEmpty) return Uint8List.fromList(b);
      } catch (_) {}
      return null;
    }
    try {
      final b = await _repo.fetchPhotoBytes();
      if (b.isNotEmpty) return Uint8List.fromList(b);
    } catch (_) {}
    return null;
  }

  void clear() {
    profile.value = null;
    photoBytes.value = null;
  }
}
