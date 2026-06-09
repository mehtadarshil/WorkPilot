import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/mobile_repository.dart';

class SiteReportsListController extends GetxController {
  SiteReportsListController({MobileRepository? mobile})
    : _mobile = mobile ?? Get.find<MobileRepository>();

  final MobileRepository _mobile;

  final RxList<Map<String, dynamic>> items = <Map<String, dynamic>>[].obs;
  final RxBool loading = false.obs;
  final RxString error = ''.obs;

  int _page = 1;
  int? _totalPages;

  bool get hasMore {
    if (_totalPages == null) return false;
    return _page < _totalPages!;
  }

  @override
  void onInit() {
    super.onInit();
    reloadFromStart();
  }

  Future<void> reloadFromStart() async {
    _page = 1;
    items.clear();
    await _fetch(append: false);
  }

  Future<void> loadMore() async {
    if (!hasMore || loading.value) return;
    _page++;
    await _fetch(append: true);
  }

  Future<void> _fetch({required bool append}) async {
    loading.value = true;
    error.value = '';
    try {
      final r = await _mobile.fetchSiteReports(page: _page);
      if (append) {
        items.addAll(r.items);
      } else {
        items.assignAll(r.items);
      }
      _totalPages = r.totalPages;
    } on ApiException catch (e) {
      error.value = e.message;
      if (append && _page > 1) _page--;
    } catch (e) {
      error.value = e.toString();
      if (append && _page > 1) _page--;
    } finally {
      loading.value = false;
    }
  }
}
