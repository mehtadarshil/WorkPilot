import 'package:get/get.dart';

import '../../core/network/api_exception.dart';
import '../../data/repositories/quotations_repository.dart';
import 'quotation_visit_formatters.dart';

/// [Get.arguments] must be the quotation visit job id ([int] or [num]).
class QuotationVisitDetailController extends GetxController {
  QuotationVisitDetailController({QuotationsRepository? repo})
      : _repo = repo ?? Get.find<QuotationsRepository>();

  final QuotationsRepository _repo;

  late final int visitId = _parseId(Get.arguments);

  final Rxn<Map<String, dynamic>> data = Rxn<Map<String, dynamic>>();
  final RxBool loading = true.obs;
  final RxString error = ''.obs;
  final RxBool creatingQuotation = false.obs;
  final RxString actionError = ''.obs;

  static int _parseId(dynamic a) {
    if (a is int) return a;
    if (a is num) return a.toInt();
    throw ArgumentError('QuotationVisitDetailController expects int visit id, got: $a');
  }

  Map<String, dynamic>? get visit {
    final v = data.value?['visit'];
    if (v is Map) return Map<String, dynamic>.from(v);
    return null;
  }

  List<Map<String, dynamic>> get diaryEvents {
    final raw = data.value?['diary_events'];
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Map<String, dynamic>? get quotation {
    final q = data.value?['quotation'];
    if (q is Map) return Map<String, dynamic>.from(q);
    return null;
  }

  bool get canCreateQuotation =>
      quotation == null && diaryEvents.any((e) => QuotationVisitFormatters.isVisitReadyForQuotation((e['event_status'] as String?) ?? ''));

  bool get canSetupWorkJob =>
      quotation?['state'] == 'accepted' && (visit?['customer_id'] as num?) != null;

  Map<String, dynamic>? get readyDiaryEvent {
    for (final e in diaryEvents) {
      if (QuotationVisitFormatters.isVisitReadyForQuotation((e['event_status'] as String?) ?? '')) {
        return e;
      }
    }
    return null;
  }

  @override
  void onInit() {
    super.onInit();
    load();
  }

  Future<void> load() async {
    loading.value = true;
    error.value = '';
    try {
      data.value = await _repo.getQuotationVisit(visitId);
    } on ApiException catch (e) {
      error.value = e.message;
      data.value = null;
    } catch (e) {
      error.value = e.toString();
      data.value = null;
    } finally {
      loading.value = false;
    }
  }

  Future<int?> createQuotation() async {
    final ready = readyDiaryEvent;
    final v = visit;
    if (ready == null || v == null) {
      actionError.value = 'Officer must arrive at site or complete the visit before creating a quotation.';
      return null;
    }

    creatingQuotation.value = true;
    actionError.value = '';
    try {
      final technical = ready['technical_notes'];
      final extra = ready['extra_submissions'];
      final noteTexts = <String>[];
      if (technical is List) {
        for (final n in technical) {
          if (n is Map) {
            final text = (n['notes'] as String?)?.trim();
            if (text != null && text.isNotEmpty) noteTexts.add(text);
          }
        }
      }
      if (extra is List) {
        for (final s in extra) {
          if (s is Map) {
            final text = (s['notes'] as String?)?.trim();
            if (text != null && text.isNotEmpty) noteTexts.add(text);
          }
        }
      }
      final diaryNotes = (ready['notes'] as String?)?.trim();
      if (diaryNotes != null && diaryNotes.isNotEmpty) noteTexts.add(diaryNotes);

      final res = await _repo.createQuotationFromDiaryEvent(
        (ready['diary_id'] as num).toInt(),
        <String, dynamic>{
          if (noteTexts.isNotEmpty) 'notes': noteTexts.join('\n\n'),
          'description': (v['title'] as String?) ?? '',
        },
      );
      final q = res['quotation'];
      if (q is Map) {
        final id = (q['id'] as num?)?.toInt();
        await load();
        return id;
      }
      await load();
      return null;
    } on ApiException catch (e) {
      actionError.value = e.message;
      return null;
    } catch (e) {
      actionError.value = e.toString();
      return null;
    } finally {
      creatingQuotation.value = false;
    }
  }
}
