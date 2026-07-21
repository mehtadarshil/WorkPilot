import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/network/api_exception.dart';
import '../../core/services/storage_service.dart';
import '../../data/repositories/stock_tools_repository.dart';
import '../../core/stock_placements.dart';

class StockToolsController extends GetxController {
  StockToolsController({required this.repository});

  final StockToolsRepository repository;
  final ImagePicker _picker = ImagePicker();

  final RxString activeTab = 'stock'.obs; // 'stock', 'tools', 'uniforms', 'analytics'

  // Listings
  final RxList<Map<String, dynamic>> stockItems = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> tools = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> uniforms = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> transactions = <Map<String, dynamic>>[].obs;
  final RxMap<String, dynamic> analytics = <String, dynamic>{}.obs;
  final RxList<Map<String, dynamic>> officers = <Map<String, dynamic>>[].obs;

  // Configuration options
  final RxList<String> locations = <String>['Van', 'House', 'Store', 'Other'].obs;
  final RxList<String> stockCategories = <String>['Electrical', 'Locksmith', 'Plumbing', 'HVAC', 'General'].obs;
  final RxList<String> toolCategories = <String>['Power Tools', 'Hand Tools', 'Measurement', 'Safety', 'Other'].obs;
  final RxList<String> uniformCategories = <String>['Jacket', 'Hi-Vis', 'PPE', 'Fire Safety', 'Footwear', 'Branded', 'Other'].obs;
  final RxList<String> uniformSizes = <String>['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '28', '30', '32', '34', '36', '38', '40', '42', '8', '9', '10', '11', '12'].obs;
  final RxList<String> storageBins = <String>[].obs;
  final RxList<String> requireBinLocations = <String>['Store'].obs;
  final RxInt defaultLowStockThreshold = 5.obs;

  int effectiveLowStockThreshold(Map<String, dynamic> item) {
    final raw = item['min_quantity'];
    if (raw is num && raw >= 0) return raw.toInt();
    if (raw is String) {
      final parsed = int.tryParse(raw);
      if (parsed != null && parsed >= 0) return parsed;
    }
    return defaultLowStockThreshold.value;
  }

  bool isLowStock(Map<String, dynamic> item) {
    if (item['quantity_mode'] == 'level') {
      return item['quantity_level'] == 'low';
    }
    final qtyRaw = item['quantity'];
    final qty = qtyRaw is num ? qtyRaw.toInt() : int.tryParse('$qtyRaw') ?? 0;
    if (qty <= 0) return false;
    return qty <= effectiveLowStockThreshold(item);
  }

  // Filter values
  final RxString stockSearch = ''.obs;
  final RxString stockCategoryFilter = 'All'.obs;
  final RxString stockLocationFilter = 'All'.obs;

  final RxString toolSearch = ''.obs;
  final RxString toolCategoryFilter = 'All'.obs;
  final RxString toolStatusFilter = 'All'.obs;

  final RxString uniformSearch = ''.obs;
  final RxString uniformCategoryFilter = 'All'.obs;
  final RxString uniformSizeFilter = 'All'.obs;
  final RxString uniformStatusFilter = 'All'.obs;

  // Loading flags
  final RxBool loadingStock = false.obs;
  final RxBool loadingTools = false.obs;
  final RxBool loadingUniforms = false.obs;
  final RxBool loadingAnalytics = false.obs;

  // Image Upload draft state
  final RxString base64Image = ''.obs;
  final RxString imageFilename = ''.obs;
  final RxString imageMime = ''.obs;

  String get authToken => Get.find<StorageService>().authToken ?? '';

  @override
  void onInit() {
    super.onInit();
    fetchSettings();
    fetchOfficers();
    fetchStock();

    // Re-fetch data on tab change
    ever(activeTab, (tab) {
      if (tab == 'stock') {
        fetchStock();
      } else if (tab == 'tools') {
        fetchTools();
      } else if (tab == 'uniforms') {
        fetchUniforms();
      } else if (tab == 'analytics') {
        fetchAnalytics();
      }
    });

    // Auto-refresh listings on search/filter update
    debounce(stockSearch, (_) => fetchStock(), time: const Duration(milliseconds: 300));
    ever(stockCategoryFilter, (_) => fetchStock());
    ever(stockLocationFilter, (_) => fetchStock());

    debounce(toolSearch, (_) => fetchTools(), time: const Duration(milliseconds: 300));
    ever(toolCategoryFilter, (_) => fetchTools());
    ever(toolStatusFilter, (_) => fetchTools());

    debounce(uniformSearch, (_) => fetchUniforms(), time: const Duration(milliseconds: 300));
    ever(uniformCategoryFilter, (_) => fetchUniforms());
    ever(uniformSizeFilter, (_) => fetchUniforms());
    ever(uniformStatusFilter, (_) => fetchUniforms());
  }

  // --- Fetch Methods ---

  Future<void> fetchSettings() async {
    try {
      final res = await repository.getSettings();
      _parseSettings(res);
    } catch (e) {
      Get.log('Error getting stock settings: $e');
    }
  }

  void _parseSettings(Map<String, dynamic> json) {
    if (json['location_options'] is List) {
      locations.value = List<String>.from(json['location_options']);
    }
    if (json['stock_category_options'] is List) {
      stockCategories.value = List<String>.from(json['stock_category_options']);
    }
    if (json['tool_category_options'] is List) {
      toolCategories.value = List<String>.from(json['tool_category_options']);
    }
    if (json['uniform_category_options'] is List) {
      uniformCategories.value = List<String>.from(json['uniform_category_options']);
    }
    if (json['uniform_size_options'] is List) {
      uniformSizes.value = List<String>.from(json['uniform_size_options']);
    }
    if (json['storage_bin_options'] is List) {
      storageBins.value = List<String>.from(json['storage_bin_options']);
    }
    if (json['require_bin_for_locations'] is List) {
      final req = List<String>.from(json['require_bin_for_locations']);
      requireBinLocations.value = req.isNotEmpty ? req : <String>['Store'];
    }
    final threshold = json['default_low_stock_threshold'];
    if (threshold is num && threshold >= 0) {
      defaultLowStockThreshold.value = threshold.toInt();
    } else if (threshold is String) {
      final parsed = int.tryParse(threshold);
      if (parsed != null && parsed >= 0) {
        defaultLowStockThreshold.value = parsed;
      }
    }
  }

  Future<void> saveSettings({
    required List<String> locs,
    required List<String> stockCats,
    required List<String> toolCats,
    required List<String> uniCats,
    required List<String> uniSizes,
    List<String>? bins,
    List<String>? requireBins,
    int? defaultLowStock,
  }) async {
    try {
      final res = await repository.patchSettings({
        'location_options': locs,
        'stock_category_options': stockCats,
        'tool_category_options': toolCats,
        'uniform_category_options': uniCats,
        'uniform_size_options': uniSizes,
        if (bins != null) 'storage_bin_options': bins,
        if (requireBins != null) 'require_bin_for_locations': requireBins,
        if (defaultLowStock != null) 'default_low_stock_threshold': defaultLowStock,
      });
      _parseSettings(res);
      Get.snackbar('Success', 'Options updated successfully');
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    }
  }

  Future<void> fetchOfficers() async {
    try {
      final res = await repository.getOfficers();
      officers.value = res;
    } catch (e) {
      Get.log('Error loading officers: $e');
    }
  }

  Future<void> fetchStock() async {
    loadingStock.value = true;
    try {
      final items = await repository.getStock(
        search: stockSearch.value,
        category: stockCategoryFilter.value,
        location: stockLocationFilter.value,
      );
      stockItems.value = items;

      // also load transactions log
      final txs = await repository.getStockTransactions();
      transactions.value = txs;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    } finally {
      loadingStock.value = false;
    }
  }

  Future<void> fetchTools() async {
    loadingTools.value = true;
    try {
      final items = await repository.getTools(
        search: toolSearch.value,
        category: toolCategoryFilter.value,
        status: toolStatusFilter.value,
      );
      tools.value = items;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    } finally {
      loadingTools.value = false;
    }
  }

  Future<void> fetchUniforms() async {
    loadingUniforms.value = true;
    try {
      final items = await repository.getUniforms(
        search: uniformSearch.value,
        category: uniformCategoryFilter.value,
        size: uniformSizeFilter.value,
        status: uniformStatusFilter.value,
      );
      uniforms.value = items;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    } finally {
      loadingUniforms.value = false;
    }
  }

  Future<void> fetchAnalytics() async {
    loadingAnalytics.value = true;
    try {
      final stats = await repository.getAnalytics();
      analytics.value = stats;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    } finally {
      loadingAnalytics.value = false;
    }
  }

  // --- Image Pick Helpers ---

  Future<void> pickImage(ImageSource source) async {
    try {
      final file = await _picker.pickImage(source: source, maxWidth: 800, imageQuality: 80);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      base64Image.value = base64Encode(bytes);
      imageFilename.value = file.name;
      imageMime.value = file.mimeType ?? 'image/jpeg';
      Get.snackbar('Photo Selected', 'Image loaded successfully');
    } catch (e) {
      Get.snackbar('Error', 'Could not select image: $e');
    }
  }

  void clearImage() {
    base64Image.value = '';
    imageFilename.value = '';
    imageMime.value = '';
  }

  // --- Stock Mutation Actions ---

  Future<bool> saveStockItem({
    int? id,
    required String name,
    required String mpn,
    required List<Map<String, dynamic>> locs,
    required String category,
    int? minQuantity,
    String quantityMode = 'count',
    String? quantityLevel,
  }) async {
    final isLevel = quantityMode == 'level';
    final payload = <String, dynamic>{
      'name': name.trim(),
      'mpn': mpn.trim().isEmpty ? null : mpn.trim(),
      'category': category,
      'locations': isLevel ? [] : locs.map(placementRowToApi).toList(),
      'min_quantity': minQuantity,
      'quantity_mode': quantityMode,
      'quantity_level': isLevel ? quantityLevel : null,
    };
    final binError = isLevel ? null : validatePlacementsRequireBin(locs, requireBinLocations.toList());
    if (binError != null) {
      Get.snackbar('Error', binError);
      return false;
    }
    if (base64Image.isNotEmpty) {
      payload['image_base64'] = base64Image.value;
      payload['original_filename'] = imageFilename.value;
      payload['content_type'] = imageMime.value;
    }

    try {
      if (id != null) {
        await repository.patchStock(id, payload);
        Get.snackbar('Success', 'Stock item updated');
      } else {
        await repository.postStock(payload);
        Get.snackbar('Success', 'Stock item added');
      }
      clearImage();
      fetchStock();
      return true;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
      return false;
    } catch (e) {
      Get.snackbar('Error', '$e');
      return false;
    }
  }

  Future<void> deleteStockItem(int id) async {
    try {
      await repository.deleteStock(id);
      Get.snackbar('Success', 'Stock item deleted');
      fetchStock();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    }
  }

  Future<bool> convertStockToTool(int stockItemId, int quantity) async {
    try {
      await repository.convertToTool(stockItemId, quantity);
      Get.snackbar('Success', 'Converted stock item to tool');
      fetchStock();
      return true;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
      return false;
    } catch (e) {
      Get.snackbar('Error', '$e');
      return false;
    }
  }

  // --- Tools Mutation Actions ---

  Future<bool> saveToolItem({
    int? id,
    required String name,
    required String category,
    required String status,
    required List<Map<String, dynamic>> locs,
    int? assignedOfficerId,
    int? minQuantity,
    String quantityMode = 'count',
    String? quantityLevel,
  }) async {
    final isLevel = quantityMode == 'level';
    final payload = <String, dynamic>{
      'name': name.trim(),
      'category': category,
      'status': status,
      'assigned_officer_id': assignedOfficerId,
      'locations': isLevel ? [] : locs.map(placementRowToApi).toList(),
      'min_quantity': minQuantity,
      'quantity_mode': quantityMode,
      'quantity_level': isLevel ? quantityLevel : null,
    };
    final binError = isLevel ? null : validatePlacementsRequireBin(locs, requireBinLocations.toList());
    if (binError != null) {
      Get.snackbar('Error', binError);
      return false;
    }
    if (base64Image.isNotEmpty) {
      payload['image_base64'] = base64Image.value;
      payload['original_filename'] = imageFilename.value;
      payload['content_type'] = imageMime.value;
    }

    try {
      if (id != null) {
        await repository.patchTool(id, payload);
        Get.snackbar('Success', 'Tool updated');
      } else {
        await repository.postTool(payload);
        Get.snackbar('Success', 'Tool added');
      }
      clearImage();
      fetchTools();
      return true;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
      return false;
    } catch (e) {
      Get.snackbar('Error', '$e');
      return false;
    }
  }

  Future<void> deleteToolItem(int id) async {
    try {
      await repository.deleteTool(id);
      Get.snackbar('Success', 'Tool deleted');
      fetchTools();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    }
  }

  Future<bool> convertToolToStock({
    required int toolId,
    required int quantity,
    required String category,
    required String quality,
  }) async {
    try {
      await repository.convertToStock(toolId, {
        'quantity': quantity,
        'category': category,
        'quality': quality,
      });
      Get.snackbar('Success', 'Converted tool item to stock');
      fetchTools();
      return true;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
      return false;
    } catch (e) {
      Get.snackbar('Error', '$e');
      return false;
    }
  }

  // --- Uniform Mutations Actions ---

  Future<bool> saveUniformItem({
    int? id,
    required String name,
    required String category,
    required String size,
    required String status,
    required List<Map<String, dynamic>> locs,
    int? assignedOfficerId,
    required String notes,
    String quantityMode = 'count',
    String? quantityLevel,
  }) async {
    final isLevel = quantityMode == 'level';
    final binError = isLevel ? null : validatePlacementsRequireBin(locs, requireBinLocations.toList());
    if (binError != null) {
      Get.snackbar('Error', binError);
      return false;
    }
    final payload = <String, dynamic>{
      'name': name.trim(),
      'category': category,
      'size': size,
      'status': status,
      'locations': isLevel ? [] : locs.map(placementRowToApi).toList(),
      'assigned_officer_id': assignedOfficerId,
      'notes': notes.trim().isEmpty ? null : notes.trim(),
      'quantity_mode': quantityMode,
      'quantity_level': isLevel ? quantityLevel : null,
    };
    if (base64Image.isNotEmpty) {
      payload['image_base64'] = base64Image.value;
      payload['original_filename'] = imageFilename.value;
      payload['content_type'] = imageMime.value;
    }

    try {
      if (id != null) {
        await repository.patchUniform(id, payload);
        Get.snackbar('Success', 'Uniform item updated');
      } else {
        await repository.postUniform(payload);
        Get.snackbar('Success', 'Uniform item added');
      }
      clearImage();
      fetchUniforms();
      return true;
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
      return false;
    } catch (e) {
      Get.snackbar('Error', '$e');
      return false;
    }
  }

  Future<void> deleteUniformItem(int id) async {
    try {
      await repository.deleteUniform(id);
      Get.snackbar('Success', 'Uniform item deleted');
      fetchUniforms();
    } on ApiException catch (e) {
      Get.snackbar('Error', e.message);
    } catch (e) {
      Get.snackbar('Error', '$e');
    }
  }
}
