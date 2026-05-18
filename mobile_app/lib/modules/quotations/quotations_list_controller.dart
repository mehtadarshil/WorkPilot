import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/quotations_repository.dart';

class QuotationsListController extends GetxController {
  QuotationsListController({QuotationsRepository? repo})
    : _repo = repo ?? Get.find<QuotationsRepository>();

  final QuotationsRepository _repo;

  static const states = <String>[
    'draft',
    'sent',
    'accepted',
    'rejected',
    'expired',
  ];

  final RxList<Map<String, dynamic>> items = <Map<String, dynamic>>[].obs;
  final RxMap<String, int> stateCounts = <String, int>{}.obs;
  final RxBool loading = false.obs;
  final RxString error = ''.obs;
  final RxString search = ''.obs;
  final RxString stateFilter = ''.obs;

  int _page = 1;
  int? _totalPages;
  final int _limit = 25;

  bool get hasMore => _totalPages != null && _page < _totalPages!;

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

  void setSearch(String v) {
    search.value = v;
    _scheduleRefetch();
  }

  void setStateFilter(String v) {
    stateFilter.value = v;
    reloadFromStart();
  }

  DateTime? _debounce;
  void _scheduleRefetch() {
    _debounce = DateTime.now();
    final token = _debounce;
    Future<void>.delayed(const Duration(milliseconds: 320), () async {
      if (_debounce != token) return;
      await reloadFromStart();
    });
  }

  Future<void> _fetch({required bool append}) async {
    loading.value = true;
    error.value = '';
    try {
      final raw = await _repo.listQuotations(
        page: _page,
        limit: _limit,
        search: search.value.trim().isEmpty ? null : search.value.trim(),
        state: stateFilter.value.trim().isEmpty ? null : stateFilter.value.trim(),
      );
      final list = raw['quotations'];
      final parsed = <Map<String, dynamic>>[];
      if (list is List) {
        for (final e in list) {
          if (e is Map) parsed.add(Map<String, dynamic>.from(e));
        }
      }
      if (append) {
        items.addAll(parsed);
      } else {
        items.assignAll(parsed);
        final sc = raw['stateCounts'];
        if (sc is Map) {
          final next = <String, int>{};
          for (final e in sc.entries) {
            next['${e.key}'] = (e.value as num?)?.toInt() ?? 0;
          }
          stateCounts.assignAll(next);
        } else {
          stateCounts.clear();
        }
      }
      _totalPages = (raw['totalPages'] as num?)?.toInt();
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
