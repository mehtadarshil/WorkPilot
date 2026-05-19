import '../../core/network/api_exception.dart';
import '../models/mobile_profile.dart';
import 'base_repository.dart';

class MobileProfileRepository extends BaseRepository {
  MobileProfileRepository(super.api);

  Future<MobileProfile> getProfile() async {
    final res = await api.get<Map<String, dynamic>>('/mobile/profile');
    final p = res.data?['profile'];
    if (p is! Map) throw ApiException('Invalid profile response');
    return MobileProfile.fromJson(Map<String, dynamic>.from(p));
  }

  Future<MobileProfile> updateProfile(Map<String, dynamic> body) async {
    final res = await api.patch<Map<String, dynamic>>('/mobile/profile', data: body);
    final p = res.data?['profile'];
    if (p is! Map) throw ApiException('Invalid profile response');
    return MobileProfile.fromJson(Map<String, dynamic>.from(p));
  }

  Future<MobileProfile> uploadPhoto(String dataUrl) async {
    final res = await api.post<Map<String, dynamic>>(
      '/mobile/profile/photo',
      data: <String, dynamic>{'image': dataUrl},
    );
    final p = res.data?['profile'];
    if (p is! Map) throw ApiException('Invalid profile response');
    return MobileProfile.fromJson(Map<String, dynamic>.from(p));
  }

  Future<MobileProfile> removePhoto() async {
    final res = await api.post<Map<String, dynamic>>(
      '/mobile/profile/photo',
      data: <String, dynamic>{'remove': true},
    );
    final p = res.data?['profile'];
    if (p is! Map) throw ApiException('Invalid profile response');
    return MobileProfile.fromJson(Map<String, dynamic>.from(p));
  }

  Future<List<int>> fetchPhotoBytes() async {
    final res = await api.getBytes('/mobile/profile/photo');
    return res.data ?? [];
  }
}
