import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:get/get.dart';

import 'offline_queue_service.dart';

/// Tracks device connectivity; triggers [OfflineQueueService.processQueue] when coming online.
class ConnectivityService extends GetxService {
  final RxBool isOnline = true.obs;
  StreamSubscription<List<ConnectivityResult>>? _sub;

  @override
  void onInit() {
    super.onInit();
    _sub = Connectivity().onConnectivityChanged.listen(_apply);
    Connectivity().checkConnectivity().then(_apply);
  }

  void _apply(List<ConnectivityResult> results) {
    final online = results.any((r) => r != ConnectivityResult.none);
    final was = isOnline.value;
    isOnline.value = online;
    if (!was && online && Get.isRegistered<OfflineQueueService>()) {
      unawaited(Get.find<OfflineQueueService>().processQueue());
    }
  }

  @override
  void onClose() {
    _sub?.cancel();
    super.onClose();
  }
}
