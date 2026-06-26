import '../../core/network/api_exception.dart';
import 'base_repository.dart';

class StockToolsRepository extends BaseRepository {
  StockToolsRepository(super.api);

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }

  List<Map<String, dynamic>> _listOfMap(dynamic raw) {
    if (raw is! List) return [];
    return raw.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList();
  }

  Future<Map<String, dynamic>> getSettings() async {
    final res = await api.get<Map<String, dynamic>>('/settings/stock-tools');
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> patchSettings(Map<String, dynamic> body) async {
    final res = await api.patch<Map<String, dynamic>>('/settings/stock-tools', data: body);
    return _asMap(res.data);
  }

  Future<List<Map<String, dynamic>>> getStock({
    String search = '',
    String category = '',
    String location = '',
  }) async {
    final res = await api.get<dynamic>(
      '/stock',
      queryParameters: <String, dynamic>{
        if (search.isNotEmpty) 'search': search,
        if (category.isNotEmpty && category != 'All') 'category': category,
        if (location.isNotEmpty && location != 'All') 'location': location,
      },
    );
    return _listOfMap(res.data);
  }

  Future<Map<String, dynamic>> postStock(Map<String, dynamic> body) async {
    final res = await api.post<Map<String, dynamic>>('/stock', data: body);
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> patchStock(int id, Map<String, dynamic> body) async {
    final res = await api.patch<Map<String, dynamic>>('/stock/$id', data: body);
    return _asMap(res.data);
  }

  Future<void> deleteStock(int id) async {
    await api.delete<void>('/stock/$id');
  }

  Future<Map<String, dynamic>> convertToTool(int stockItemId, int quantity) async {
    final res = await api.post<Map<String, dynamic>>(
      '/stock/$stockItemId/convert-to-tool',
      data: <String, dynamic>{'quantity': quantity},
    );
    return _asMap(res.data);
  }

  Future<List<Map<String, dynamic>>> getStockTransactions() async {
    final res = await api.get<dynamic>('/stock/transactions');
    return _listOfMap(res.data);
  }

  Future<Map<String, dynamic>> getAnalytics() async {
    final res = await api.get<Map<String, dynamic>>('/stock-tools/analytics');
    return _asMap(res.data);
  }

  Future<List<Map<String, dynamic>>> getTools({
    String search = '',
    String category = '',
    String status = '',
  }) async {
    final res = await api.get<dynamic>(
      '/tools',
      queryParameters: <String, dynamic>{
        if (search.isNotEmpty) 'search': search,
        if (category.isNotEmpty && category != 'All') 'category': category,
        if (status.isNotEmpty && status != 'All') 'status': status,
      },
    );
    return _listOfMap(res.data);
  }

  Future<Map<String, dynamic>> postTool(Map<String, dynamic> body) async {
    final res = await api.post<Map<String, dynamic>>('/tools', data: body);
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> patchTool(int id, Map<String, dynamic> body) async {
    final res = await api.patch<Map<String, dynamic>>('/tools/$id', data: body);
    return _asMap(res.data);
  }

  Future<void> deleteTool(int id) async {
    await api.delete<void>('/tools/$id');
  }

  Future<Map<String, dynamic>> convertToStock(int toolId, Map<String, dynamic> body) async {
    final res = await api.post<Map<String, dynamic>>('/tools/$toolId/convert-to-stock', data: body);
    return _asMap(res.data);
  }

  Future<List<Map<String, dynamic>>> getUniforms({
    String search = '',
    String category = '',
    String size = '',
    String status = '',
  }) async {
    final res = await api.get<dynamic>(
      '/uniforms',
      queryParameters: <String, dynamic>{
        if (search.isNotEmpty) 'search': search,
        if (category.isNotEmpty && category != 'All') 'category': category,
        if (size.isNotEmpty && size != 'All') 'size': size,
        if (status.isNotEmpty && status != 'All') 'status': status,
      },
    );
    return _listOfMap(res.data);
  }

  Future<Map<String, dynamic>> postUniform(Map<String, dynamic> body) async {
    final res = await api.post<Map<String, dynamic>>('/uniforms', data: body);
    return _asMap(res.data);
  }

  Future<Map<String, dynamic>> patchUniform(int id, Map<String, dynamic> body) async {
    final res = await api.patch<Map<String, dynamic>>('/uniforms/$id', data: body);
    return _asMap(res.data);
  }

  Future<void> deleteUniform(int id) async {
    await api.delete<void>('/uniforms/$id');
  }

  Future<List<Map<String, dynamic>>> getOfficers() async {
    final res = await api.get<Map<String, dynamic>>('/officers/list');
    final data = _asMap(res.data);
    final rawList = data['officers'];
    return _listOfMap(rawList);
  }
}
