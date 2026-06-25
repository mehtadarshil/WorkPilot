import 'package:get/get.dart';

import '../../core/services/user_profile_cache.dart';
import '../../data/models/mobile_profile.dart';
import '../../data/repositories/mobile_profile_repository.dart';
import '../home/controllers/home_controller.dart';

class IdCardController extends GetxController {
  UserProfileCache get _cache => Get.find<UserProfileCache>();

  /// `true` = front (portrait / identity), `false` = back (contact details).
  final RxBool showFront = true.obs;

  MobileProfile? get profile => _cache.profile.value;

  String get companyName => _cache.companyName ?? 'WorkPilot';

  final RxList<Map<String, dynamic>> signatureOfficers = <Map<String, dynamic>>[].obs;
  final RxBool fetchingOfficers = false.obs;
  final RxnInt selectedOfficerId = RxnInt();
  final RxnString selectedOfficerSignature = RxnString();
  final RxBool loadingSignature = false.obs;

  String get idLabel {
    final p = profile;
    if (p == null) return '—';
    final prefix = p.isOfficer ? 'OFF' : 'USR';
    return '$prefix-${p.id.toString().padLeft(5, '0')}';
  }

  String get statusLabel {
    final s = profile?.state?.trim();
    if (s == null || s.isEmpty) return 'ACTIVE';
    return s.toUpperCase().replaceAll('_', ' ');
  }

  @override
  void onInit() {
    super.onInit();
    if (_cache.profile.value == null) {
      _cache.refresh();
    }
    
    // Load officers list if logged-in user is admin
    if (Get.isRegistered<HomeController>()) {
      final home = Get.find<HomeController>().home.value;
      final isAdmin = home?.role.toUpperCase() == 'ADMIN' || home?.role.toUpperCase() == 'SUPER_ADMIN';
      if (isAdmin) {
        _loadOfficers();
      }
    }
  }

  Future<void> _loadOfficers() async {
    fetchingOfficers.value = true;
    try {
      final list = await Get.find<MobileProfileRepository>().getOfficersList();
      signatureOfficers.value = list;
    } catch (_) {}
    fetchingOfficers.value = false;
  }

  Future<void> onOfficerChanged(int? id) async {
    selectedOfficerId.value = id;
    if (id == null) {
      selectedOfficerSignature.value = null;
      return;
    }
    loadingSignature.value = true;
    try {
      final sig = await Get.find<MobileProfileRepository>().getOfficerSignature(id);
      selectedOfficerSignature.value = sig;
    } catch (_) {}
    loadingSignature.value = false;
  }

  Future<void> reload() async {
    if (selectedOfficerId.value != null) {
      await onOfficerChanged(selectedOfficerId.value);
    } else {
      await _cache.refresh();
    }
  }

  @override
  void onClose() {
    showFront.value = true;
    super.onClose();
  }
}
