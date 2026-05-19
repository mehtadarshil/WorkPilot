import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/network/api_exception.dart';
import '../../core/services/user_profile_cache.dart';
import '../../data/models/mobile_profile.dart';
import '../../data/repositories/mobile_profile_repository.dart';

class ProfileEditController extends GetxController {
  ProfileEditController({MobileProfileRepository? repo})
      : _repo = repo ?? Get.find<MobileProfileRepository>();

  final MobileProfileRepository _repo;
  final ImagePicker _picker = ImagePicker();

  final RxBool loading = true.obs;
  final RxBool saving = false.obs;
  final RxString error = ''.obs;
  final Rxn<MobileProfile> profile = Rxn<MobileProfile>();
  final Rxn<Uint8List> photoBytes = Rxn<Uint8List>();
  final RxBool photoLoading = false.obs;

  late final TextEditingController fullNameC;
  late final TextEditingController emailC;
  late final TextEditingController phoneC;
  late final TextEditingController mobileC;
  late final TextEditingController landlineC;
  late final TextEditingController departmentC;
  late final TextEditingController roleC;
  late final TextEditingController addressC;
  late final TextEditingController notesC;
  late final TextEditingController kinNameC;
  late final TextEditingController kinPhoneC;
  late final TextEditingController kinRelC;

  @override
  void onInit() {
    super.onInit();
    fullNameC = TextEditingController();
    emailC = TextEditingController();
    phoneC = TextEditingController();
    mobileC = TextEditingController();
    landlineC = TextEditingController();
    departmentC = TextEditingController();
    roleC = TextEditingController();
    addressC = TextEditingController();
    notesC = TextEditingController();
    kinNameC = TextEditingController();
    kinPhoneC = TextEditingController();
    kinRelC = TextEditingController();
    load();
  }

  @override
  void onClose() {
    fullNameC.dispose();
    emailC.dispose();
    phoneC.dispose();
    mobileC.dispose();
    landlineC.dispose();
    departmentC.dispose();
    roleC.dispose();
    addressC.dispose();
    notesC.dispose();
    kinNameC.dispose();
    kinPhoneC.dispose();
    kinRelC.dispose();
    super.onClose();
  }

  void _bindFields(MobileProfile p) {
    fullNameC.text = p.fullName;
    emailC.text = p.email ?? '';
    phoneC.text = p.phone ?? '';
    mobileC.text = p.mobilePhone ?? '';
    landlineC.text = p.landlinePhone ?? '';
    departmentC.text = p.department ?? '';
    roleC.text = p.rolePosition ?? '';
    addressC.text = p.profileAddress ?? '';
    notesC.text = p.profileNotes ?? '';
    kinNameC.text = p.nextOfKinName ?? '';
    kinPhoneC.text = p.nextOfKinPhone ?? '';
    kinRelC.text = p.nextOfKinRelationship ?? '';
  }

  Future<void> load() async {
    loading.value = true;
    error.value = '';
    try {
      final p = await _repo.getProfile();
      profile.value = p;
      _bindFields(p);
      await _loadPhoto(p.hasProfilePhoto);
    } on ApiException catch (e) {
      error.value = e.message;
    } catch (e) {
      error.value = '$e';
    } finally {
      loading.value = false;
    }
  }

  Future<void> _loadPhoto(bool hasPhoto) async {
    photoBytes.value = null;
    if (!hasPhoto) return;
    photoLoading.value = true;
    try {
      final bytes = await _repo.fetchPhotoBytes();
      if (bytes.isNotEmpty) photoBytes.value = Uint8List.fromList(bytes);
    } catch (_) {
      /* optional */
    } finally {
      photoLoading.value = false;
    }
  }

  Future<void> pickPhoto(ImageSource source) async {
    try {
      final x = await _picker.pickImage(source: source, maxWidth: 1200, imageQuality: 85);
      if (x == null) return;
      final bytes = await x.readAsBytes();
      final mime = x.mimeType ?? 'image/jpeg';
      final b64 = base64Encode(bytes);
      final dataUrl = 'data:$mime;base64,$b64';
      saving.value = true;
      final updated = await _repo.uploadPhoto(dataUrl);
      profile.value = updated;
      photoBytes.value = Uint8List.fromList(bytes);
      await _syncProfileCache();
    } on ApiException catch (e) {
      Get.snackbar('Photo', e.message);
    } finally {
      saving.value = false;
    }
  }

  Future<void> removePhoto() async {
    saving.value = true;
    try {
      final updated = await _repo.removePhoto();
      profile.value = updated;
      photoBytes.value = null;
      await _syncProfileCache();
    } on ApiException catch (e) {
      Get.snackbar('Photo', e.message);
    } finally {
      saving.value = false;
    }
  }

  Future<bool> save() async {
    saving.value = true;
    error.value = '';
    try {
      final p = profile.value;
      final body = <String, dynamic>{
        'full_name': fullNameC.text.trim().isEmpty ? null : fullNameC.text.trim(),
        'email': emailC.text.trim().isEmpty ? null : emailC.text.trim(),
        'phone': _emptyToNull(phoneC.text),
        'mobile_phone': _emptyToNull(mobileC.text),
        'landline_phone': _emptyToNull(landlineC.text),
        'profile_address': _emptyToNull(addressC.text),
        'profile_notes': _emptyToNull(notesC.text),
        'next_of_kin_name': _emptyToNull(kinNameC.text),
        'next_of_kin_phone': _emptyToNull(kinPhoneC.text),
        'next_of_kin_relationship': _emptyToNull(kinRelC.text),
      };
      if (p?.isOfficer == true) {
        body['department'] = _emptyToNull(departmentC.text);
        body['role_position'] = _emptyToNull(roleC.text);
      }
      final updated = await _repo.updateProfile(body);
      profile.value = updated;
      await _syncProfileCache();
      return true;
    } on ApiException catch (e) {
      error.value = e.message;
      return false;
    } catch (e) {
      error.value = '$e';
      return false;
    } finally {
      saving.value = false;
    }
  }

  String? _emptyToNull(String s) {
    final t = s.trim();
    return t.isEmpty ? null : t;
  }

  Future<void> _syncProfileCache() async {
    if (Get.isRegistered<UserProfileCache>()) {
      await Get.find<UserProfileCache>().refresh();
    }
  }
}
