import 'package:get/get.dart';

import '../providers/api_provider.dart';

/// Extend this for feature repositories (auth, customers, …).
abstract class BaseRepository extends GetxService {
  BaseRepository(this.api);

  final ApiProvider api;
}
