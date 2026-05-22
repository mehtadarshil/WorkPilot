import 'package:get/get.dart';

import '../../core/services/user_profile_cache.dart';
import '../../data/models/mobile_profile.dart';

class IdCardController extends GetxController {
  UserProfileCache get _cache => Get.find<UserProfileCache>();

  /// `true` = front (portrait / identity), `false` = back (contact details).
  final RxBool showFront = true.obs;

  MobileProfile? get profile => _cache.profile.value;

  String get companyName => _cache.companyName ?? 'WorkPilot';

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
  }

  Future<void> reload() => _cache.refresh();

  @override
  void onClose() {
    showFront.value = true;
    super.onClose();
  }
}
