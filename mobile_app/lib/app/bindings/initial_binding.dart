import 'package:get/get.dart';

import '../../core/network/dio_client.dart';
import '../../core/offline/connectivity_service.dart';
import '../../core/offline/offline_queue_service.dart';
import '../../core/services/storage_service.dart';
import '../../data/providers/api_provider.dart';
import '../../data/repositories/mobile_repository.dart';

/// Global dependencies available before any route loads.
class InitialBinding extends Bindings {
  @override
  void dependencies() {
    Get.put<StorageService>(StorageService(), permanent: true);
    Get.put<ConnectivityService>(ConnectivityService(), permanent: true);
    Get.put<DioClient>(DioClient(), permanent: true);
    Get.put<ApiProvider>(ApiProvider(Get.find<DioClient>()), permanent: true);
    Get.put<OfflineQueueService>(
      OfflineQueueService(Get.find<ApiProvider>()),
      permanent: true,
    );
    Get.put<MobileRepository>(
      MobileRepository(Get.find<ApiProvider>()),
      permanent: true,
    );
  }
}
