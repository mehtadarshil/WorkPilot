import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/values/app_colors.dart';
import '../../core/values/app_constants.dart';
import 'stock_tools_controller.dart';
import '../customers/customer_tabs/image_viewer_helper.dart';

class StockToolsView extends GetView<StockToolsController> {
  const StockToolsView({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: AppColors.slate900,
        appBar: AppBar(
          title: Text(
            'Stock & Tools',
            style: GoogleFonts.outfit(fontWeight: FontWeight.bold),
          ),
          backgroundColor: AppColors.slate900,
          elevation: 0,
          foregroundColor: Colors.white,
          actions: [
            IconButton(
              icon: const Icon(Icons.settings_outlined),
              onPressed: () => _showSettingsSheet(context),
            ),
          ],
          bottom: TabBar(
            onTap: (index) {
              final tabs = ['stock', 'tools', 'uniforms', 'analytics'];
              controller.activeTab.value = tabs[index];
            },
            indicatorColor: AppColors.primary,
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.slate400,
            labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.w600, fontSize: 13),
            tabs: const [
              Tab(text: 'Stock', icon: Icon(Icons.inventory_2_outlined, size: 20)),
              Tab(text: 'Tools', icon: Icon(Icons.build_outlined, size: 20)),
              Tab(text: 'Uniforms', icon: Icon(Icons.checkroom_outlined, size: 20)),
              Tab(text: 'Analytics', icon: Icon(Icons.bar_chart_outlined, size: 20)),
            ],
          ),
        ),
        body: TabBarView(
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _buildStockTab(context),
            _buildToolsTab(context),
            _buildUniformsTab(context),
            _buildAnalyticsTab(context),
          ],
        ),
      ),
    );
  }

  // Helper secure image widget
  Widget _buildSecureImage(BuildContext context, String? url, {required String category, double size = 60}) {
    if (url == null || url.trim().isEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: AppColors.slate500.withOpacity(0.2),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Icon(Icons.image_not_supported_outlined, color: AppColors.slate400, size: 24),
      );
    }

    var baseUrl = AppConstants.apiBaseUrl;
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 4);
    } else if (baseUrl.endsWith('/api/')) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 5);
    }
    final fullUrl = '$baseUrl$url';

    return GestureDetector(
      onTap: () {
        openFullscreenImage(
          context,
          fullUrl,
          headers: {
            'Authorization': 'Bearer ${controller.authToken}',
            'X-WorkPilot-Client': 'mobile',
          },
        );
      },
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: AppColors.slate500.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.slate500.withOpacity(0.2)),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            fullUrl,
            headers: {
              'Authorization': 'Bearer ${controller.authToken}',
              'X-WorkPilot-Client': 'mobile',
            },
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) {
              return const Icon(Icons.broken_image_outlined, color: Colors.redAccent, size: 24);
            },
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return const Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary)));
            },
          ),
        ),
      ),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STOCK TAB
  // ──────────────────────────────────────────────────────────────────────────

  Widget _buildStockTab(BuildContext context) {
    return Column(
      children: [
        _buildStockFilters(context),
        Expanded(
          child: Obx(() {
            if (controller.loadingStock.value) {
              return const Center(child: CircularProgressIndicator(color: AppColors.primary));
            }
            if (controller.stockItems.isEmpty) {
              return Center(child: Text('No stock items found', style: GoogleFonts.outfit(color: AppColors.slate400)));
            }
            return RefreshIndicator(
              onRefresh: () => controller.fetchStock(),
              color: AppColors.primary,
              child: ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: controller.stockItems.length,
                itemBuilder: (context, index) {
                  final item = controller.stockItems[index];
                  final itemId = item['id'] as int;
                  final name = item['name'] as String? ?? '';
                  final mpn = item['mpn'] as String? ?? '';
                  final qty = item['quantity'] as int? ?? 0;
                  final category = item['category'] as String? ?? 'General';
                  final quality = item['quality'] as String? ?? 'New';
                  final loc = item['location'] as String? ?? 'Store';
                  final img = item['image_url'] as String?;

                  return Card(
                    color: AppColors.slate900.withOpacity(0.4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: AppColors.slate500.withOpacity(0.15)),
                    ),
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(10.0),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildSecureImage(context, img, category: 'stock-photos'),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                if (mpn.isNotEmpty)
                                  Text(
                                    'MPN: $mpn',
                                    style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 12),
                                  ),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: [
                                    _buildChip(category, AppColors.primary.withOpacity(0.1), AppColors.primary),
                                    _buildChip(quality, Colors.blue.withOpacity(0.1), Colors.blue),
                                    _buildChip(loc, Colors.orange.withOpacity(0.1), Colors.orange),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                '$qty pcs',
                                style: GoogleFonts.outfit(
                                  color: qty <= 5 ? Colors.redAccent : Colors.greenAccent,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                              const SizedBox(height: 8),
                              PopupMenuButton<String>(
                                icon: const Icon(Icons.more_vert, color: AppColors.slate400),
                                color: AppColors.slate900,
                                onSelected: (val) {
                                  if (val == 'edit') {
                                    _showStockFormSheet(context, item: item);
                                  } else if (val == 'delete') {
                                    _confirmDeleteStock(itemId);
                                  } else if (val == 'convert') {
                                    _showConvertToToolDialog(context, item);
                                  }
                                },
                                itemBuilder: (context) => [
                                  const PopupMenuItem(value: 'edit', child: Text('Edit', style: TextStyle(color: Colors.white))),
                                  const PopupMenuItem(value: 'convert', child: Text('Convert to Tool', style: TextStyle(color: Colors.white))),
                                  const PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Colors.redAccent))),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            );
          }),
        ),
        Padding(
          padding: const EdgeInsets.all(12.0),
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size(double.infinity, 48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.add, color: Colors.white),
            label: Text('Add Stock Item', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
            onPressed: () => _showStockFormSheet(context),
          ),
        ),
      ],
    );
  }

  Widget _buildStockFilters(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: AppColors.slate900.withOpacity(0.5),
      child: Column(
        children: [
          TextField(
            onChanged: (val) => controller.stockSearch.value = val,
            style: GoogleFonts.outfit(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Search Stock (name, MPN)...',
              hintStyle: GoogleFonts.outfit(color: AppColors.slate500),
              prefixIcon: const Icon(Icons.search, color: AppColors.slate500),
              filled: true,
              fillColor: AppColors.slate500.withOpacity(0.1),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Obx(() => _buildDropdown(
                  value: controller.stockCategoryFilter.value,
                  items: ['All', ...controller.stockCategories],
                  label: 'Category',
                  onChanged: (val) => controller.stockCategoryFilter.value = val ?? 'All',
                )),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Obx(() => _buildDropdown(
                  value: controller.stockLocationFilter.value,
                  items: ['All', ...controller.locations],
                  label: 'Location',
                  onChanged: (val) => controller.stockLocationFilter.value = val ?? 'All',
                )),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TOOLS TAB
  // ──────────────────────────────────────────────────────────────────────────

  Widget _buildToolsTab(BuildContext context) {
    return Column(
      children: [
        _buildToolsFilters(context),
        Expanded(
          child: Obx(() {
            if (controller.loadingTools.value) {
              return const Center(child: CircularProgressIndicator(color: AppColors.primary));
            }
            if (controller.tools.isEmpty) {
              return Center(child: Text('No tools found', style: GoogleFonts.outfit(color: AppColors.slate400)));
            }
            return RefreshIndicator(
              onRefresh: () => controller.fetchTools(),
              color: AppColors.primary,
              child: ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: controller.tools.length,
                itemBuilder: (context, index) {
                  final tool = controller.tools[index];
                  final toolId = tool['id'] as int;
                  final name = tool['name'] as String? ?? '';
                  final qty = tool['quantity'] as int? ?? 1;
                  final category = tool['category'] as String? ?? 'Other';
                  final status = tool['status'] as String? ?? 'available';
                  final loc = tool['location'] as String? ?? 'Store';
                  final assigned = tool['assigned_officer_name'] as String?;
                  final img = tool['image_url'] as String?;

                  Color statusColor = Colors.green;
                  if (status == 'in_use') statusColor = Colors.blue;
                  if (status == 'missing') statusColor = Colors.red;
                  if (status == 'damaged') statusColor = Colors.orange;

                  return Card(
                    color: AppColors.slate900.withOpacity(0.4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: AppColors.slate500.withOpacity(0.15)),
                    ),
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(10.0),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildSecureImage(context, img, category: 'tool-photos'),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: [
                                    _buildChip(category, AppColors.primary.withOpacity(0.1), AppColors.primary),
                                    _buildChip(status.replaceAll('_', ' ').capitalizeFirst!, statusColor.withOpacity(0.1), statusColor),
                                    _buildChip(loc, Colors.orange.withOpacity(0.1), Colors.orange),
                                  ],
                                ),
                                if (assigned != null && assigned.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    'Assigned to: $assigned',
                                    style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 12, fontWeight: FontWeight.w500),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                'Qty: $qty',
                                style: GoogleFonts.outfit(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 12),
                              PopupMenuButton<String>(
                                icon: const Icon(Icons.more_vert, color: AppColors.slate400),
                                color: AppColors.slate900,
                                onSelected: (val) {
                                  if (val == 'edit') {
                                    _showToolFormSheet(context, tool: tool);
                                  } else if (val == 'delete') {
                                    _confirmDeleteTool(toolId);
                                  } else if (val == 'convert') {
                                    _showConvertToStockDialog(context, tool);
                                  }
                                },
                                itemBuilder: (context) => [
                                  const PopupMenuItem(value: 'edit', child: Text('Edit', style: TextStyle(color: Colors.white))),
                                  const PopupMenuItem(value: 'convert', child: Text('Convert to Stock', style: TextStyle(color: Colors.white))),
                                  const PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Colors.redAccent))),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            );
          }),
        ),
        Padding(
          padding: const EdgeInsets.all(12.0),
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size(double.infinity, 48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.add, color: Colors.white),
            label: Text('Add Tool', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
            onPressed: () => _showToolFormSheet(context),
          ),
        ),
      ],
    );
  }

  Widget _buildToolsFilters(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: AppColors.slate900.withOpacity(0.5),
      child: Column(
        children: [
          TextField(
            onChanged: (val) => controller.toolSearch.value = val,
            style: GoogleFonts.outfit(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Search Tools...',
              hintStyle: GoogleFonts.outfit(color: AppColors.slate500),
              prefixIcon: const Icon(Icons.search, color: AppColors.slate500),
              filled: true,
              fillColor: AppColors.slate500.withOpacity(0.1),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Obx(() => _buildDropdown(
                  value: controller.toolCategoryFilter.value,
                  items: ['All', ...controller.toolCategories],
                  label: 'Category',
                  onChanged: (val) => controller.toolCategoryFilter.value = val ?? 'All',
                )),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Obx(() => _buildDropdown(
                  value: controller.toolStatusFilter.value,
                  items: const ['All', 'available', 'in_use', 'missing', 'damaged'],
                  label: 'Status',
                  onChanged: (val) => controller.toolStatusFilter.value = val ?? 'All',
                )),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UNIFORMS TAB
  // ──────────────────────────────────────────────────────────────────────────

  Widget _buildUniformsTab(BuildContext context) {
    return Column(
      children: [
        _buildUniformsFilters(context),
        Expanded(
          child: Obx(() {
            if (controller.loadingUniforms.value) {
              return const Center(child: CircularProgressIndicator(color: AppColors.primary));
            }
            if (controller.uniforms.isEmpty) {
              return Center(child: Text('No uniforms found', style: GoogleFonts.outfit(color: AppColors.slate400)));
            }
            return RefreshIndicator(
              onRefresh: () => controller.fetchUniforms(),
              color: AppColors.primary,
              child: ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: controller.uniforms.length,
                itemBuilder: (context, index) {
                  final item = controller.uniforms[index];
                  final id = item['id'] as int;
                  final name = item['name'] as String? ?? '';
                  final qty = item['quantity'] as int? ?? 1;
                  final category = item['category'] as String? ?? 'Jacket';
                  final size = item['size'] as String? ?? 'M';
                  final status = item['status'] as String? ?? 'available';
                  final loc = item['location'] as String? ?? 'Store';
                  final notes = item['notes'] as String? ?? '';
                  final assigned = item['assigned_officer_name'] as String?;
                  final img = item['image_url'] as String?;

                  Color statusColor = Colors.green;
                  if (status == 'issued') statusColor = Colors.blue;
                  if (status == 'lost') statusColor = Colors.red;
                  if (status == 'damaged') statusColor = Colors.orange;

                  return Card(
                    color: AppColors.slate900.withOpacity(0.4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: AppColors.slate500.withOpacity(0.15)),
                    ),
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(10.0),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildSecureImage(context, img, category: 'uniform-photos'),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: [
                                    _buildChip(category, AppColors.primary.withOpacity(0.1), AppColors.primary),
                                    _buildChip('Size: $size', Colors.blue.withOpacity(0.1), Colors.blue),
                                    _buildChip(status.capitalizeFirst!, statusColor.withOpacity(0.1), statusColor),
                                    _buildChip(loc, Colors.orange.withOpacity(0.1), Colors.orange),
                                  ],
                                ),
                                if (assigned != null && assigned.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    'Issued to: $assigned',
                                    style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 12, fontWeight: FontWeight.w500),
                                  ),
                                ],
                                if (notes.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    notes,
                                    style: GoogleFonts.outfit(color: AppColors.slate500, fontSize: 12, fontStyle: FontStyle.italic),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                'Qty: $qty',
                                style: GoogleFonts.outfit(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 12),
                              PopupMenuButton<String>(
                                icon: const Icon(Icons.more_vert, color: AppColors.slate400),
                                color: AppColors.slate900,
                                onSelected: (val) {
                                  if (val == 'edit') {
                                    _showUniformFormSheet(context, item: item);
                                  } else if (val == 'delete') {
                                    _confirmDeleteUniform(id);
                                  }
                                },
                                itemBuilder: (context) => [
                                  const PopupMenuItem(value: 'edit', child: Text('Edit', style: TextStyle(color: Colors.white))),
                                  const PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Colors.redAccent))),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            );
          }),
        ),
        Padding(
          padding: const EdgeInsets.all(12.0),
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size(double.infinity, 48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.add, color: Colors.white),
            label: Text('Add Uniform Item', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
            onPressed: () => _showUniformFormSheet(context),
          ),
        ),
      ],
    );
  }

  Widget _buildUniformsFilters(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: AppColors.slate900.withOpacity(0.5),
      child: Column(
        children: [
          TextField(
            onChanged: (val) => controller.uniformSearch.value = val,
            style: GoogleFonts.outfit(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Search Uniforms...',
              hintStyle: GoogleFonts.outfit(color: AppColors.slate500),
              prefixIcon: const Icon(Icons.search, color: AppColors.slate500),
              filled: true,
              fillColor: AppColors.slate500.withOpacity(0.1),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Obx(() => _buildDropdown(
                  value: controller.uniformCategoryFilter.value,
                  items: ['All', ...controller.uniformCategories],
                  label: 'Category',
                  onChanged: (val) => controller.uniformCategoryFilter.value = val ?? 'All',
                )),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Obx(() => _buildDropdown(
                  value: controller.uniformSizeFilter.value,
                  items: ['All', ...controller.uniformSizes],
                  label: 'Size',
                  onChanged: (val) => controller.uniformSizeFilter.value = val ?? 'All',
                )),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Obx(() => _buildDropdown(
                  value: controller.uniformStatusFilter.value,
                  items: const ['All', 'available', 'issued', 'retired', 'lost', 'damaged'],
                  label: 'Status',
                  onChanged: (val) => controller.uniformStatusFilter.value = val ?? 'All',
                )),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ANALYTICS TAB
  // ──────────────────────────────────────────────────────────────────────────

  Widget _buildAnalyticsTab(BuildContext context) {
    return Obx(() {
      if (controller.loadingAnalytics.value) {
        return const Center(child: CircularProgressIndicator(color: AppColors.primary));
      }
      final data = controller.analytics;
      if (data.isEmpty) {
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.bar_chart_rounded, size: 64, color: AppColors.slate500),
              const SizedBox(height: 12),
              Text('No stats loaded', style: GoogleFonts.outfit(color: AppColors.slate400)),
            ],
          ),
        );
      }

      final stockCount = data['stockCount'] ?? 0;
      final lowStock = data['lowStockCount'] ?? 0;
      final outStock = data['outOfStockCount'] ?? 0;
      final toolsCount = data['toolsCount'] ?? 0;
      final tByStatus = data['toolsByStatus'] as Map? ?? {};
      final uniformsCount = data['uniformsCount'] ?? 0;
      final uByStatus = data['uniformsByStatus'] as Map? ?? {};
      final catStats = data['categoryStats'] as List? ?? [];

      return RefreshIndicator(
        onRefresh: () => controller.fetchAnalytics(),
        color: AppColors.primary,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Stock Metrics', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _buildMetricCard('Total Items', '$stockCount', Colors.blue)),
                const SizedBox(width: 8),
                Expanded(child: _buildMetricCard('Low Stock', '$lowStock', Colors.orange)),
                const SizedBox(width: 8),
                Expanded(child: _buildMetricCard('Out of Stock', '$outStock', Colors.red)),
              ],
            ),
            const SizedBox(height: 24),
            Text('Tools & Equipment', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.slate500.withOpacity(0.08),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.slate500.withOpacity(0.15)),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Total Tools registered:', style: GoogleFonts.outfit(color: Colors.white)),
                      Text('$toolsCount', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                    ],
                  ),
                  const Divider(color: AppColors.slate500, height: 24),
                  _buildStatusRow('Available', '${tByStatus['available'] ?? 0}', Colors.green),
                  _buildStatusRow('In Use', '${tByStatus['in_use'] ?? 0}', Colors.blue),
                  _buildStatusRow('Damaged', '${tByStatus['damaged'] ?? 0}', Colors.orange),
                  _buildStatusRow('Missing', '${tByStatus['missing'] ?? 0}', Colors.red),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text('Uniforms Tracker', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.slate500.withOpacity(0.08),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.slate500.withOpacity(0.15)),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Total Uniform items:', style: GoogleFonts.outfit(color: Colors.white)),
                      Text('$uniformsCount', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                    ],
                  ),
                  const Divider(color: AppColors.slate500, height: 24),
                  _buildStatusRow('Available', '${uByStatus['available'] ?? 0}', Colors.green),
                  _buildStatusRow('Issued', '${uByStatus['issued'] ?? 0}', Colors.blue),
                  _buildStatusRow('Damaged', '${uByStatus['damaged'] ?? 0}', Colors.orange),
                  _buildStatusRow('Retired', '${uByStatus['retired'] ?? 0}', AppColors.slate400),
                  _buildStatusRow('Lost', '${uByStatus['lost'] ?? 0}', Colors.red),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text('Stock Consumption by Category', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            ...catStats.map((item) {
              final cat = item['category'] as String? ?? 'General';
              final used = item['total_used'] as int? ?? 0;
              final current = item['current_stock'] as int? ?? 0;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.slate500.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(cat, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.w600)),
                    Text(
                      'Stock: $current  |  Used: $used',
                      style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 13),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      );
    });
  }

  Widget _buildMetricCard(String title, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          Text(title, style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 12), textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(value, style: GoogleFonts.outfit(color: color, fontWeight: FontWeight.bold, fontSize: 20)),
        ],
      ),
    );
  }

  Widget _buildStatusRow(String label, String value, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text(label, style: GoogleFonts.outfit(color: AppColors.slate300)),
            ],
          ),
          Text(value, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FORMS & DIALOGS
  // ──────────────────────────────────────────────────────────────────────────

  void _showSettingsSheet(BuildContext context) {
    final locC = TextEditingController(text: controller.locations.join('\n'));
    final stockC = TextEditingController(text: controller.stockCategories.join('\n'));
    final toolC = TextEditingController(text: controller.toolCategories.join('\n'));
    final uniC = TextEditingController(text: controller.uniformCategories.join('\n'));
    final uniSzC = TextEditingController(text: controller.uniformSizes.join('\n'));

    Get.bottomSheet(
      Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: AppColors.slate900,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Manage Lists & Options', style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Get.back(),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 12),
                children: [
                  _buildSettingsField('Locations (one per line)', locC),
                  _buildSettingsField('Stock Categories (one per line)', stockC),
                  _buildSettingsField('Tool Categories (one per line)', toolC),
                  _buildSettingsField('Uniform Categories (one per line)', uniC),
                  _buildSettingsField('Uniform Sizes (one per line)', uniSzC),
                ],
              ),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () async {
                final locs = locC.text.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
                final stockCats = stockC.text.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
                final toolCats = toolC.text.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
                final uniCats = uniC.text.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
                final uniSizes = uniSzC.text.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();

                if (locs.isEmpty || stockCats.isEmpty || toolCats.isEmpty || uniCats.isEmpty || uniSizes.isEmpty) {
                  Get.snackbar('Error', 'Lists cannot be empty');
                  return;
                }
                await controller.saveSettings(
                  locs: locs,
                  stockCats: stockCats,
                  toolCats: toolCats,
                  uniCats: uniCats,
                  uniSizes: uniSizes,
                );
                Get.back();
              },
              child: Text('Save Options', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
            ),
          ],
        ),
      ),
      isScrollControlled: true,
      ignoreSafeArea: false,
    );
  }

  Widget _buildSettingsField(String label, TextEditingController textC) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.outfit(color: AppColors.slate400, fontWeight: FontWeight.bold, fontSize: 13)),
          const SizedBox(height: 6),
          TextField(
            controller: textC,
            style: GoogleFonts.outfit(color: Colors.white),
            maxLines: 4,
            decoration: InputDecoration(
              filled: true,
              fillColor: AppColors.slate500.withOpacity(0.08),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.slate500.withOpacity(0.2))),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.primary)),
            ),
          ),
        ],
      ),
    );
  }

  // Stock Add/Edit Form Sheet
  void _showStockFormSheet(BuildContext context, {Map<String, dynamic>? item}) {
    controller.clearImage();
    final isEdit = item != null;
    final nameC = TextEditingController(text: isEdit ? (item['name'] ?? '') : '');
    final mpnC = TextEditingController(text: isEdit ? (item['mpn'] ?? '') : '');

    // Parse existing locations list or set defaults
    final List<Map<String, dynamic>> rawLocations = [];
    if (isEdit && item['locations'] is List) {
      for (final l in item['locations']) {
        if (l is Map) {
          rawLocations.add({
            'location': l['location'] as String? ?? 'Store',
            'quantity': (l['quantity'] as num?)?.toInt() ?? 0,
          });
        }
      }
    }
    if (rawLocations.isEmpty) {
      rawLocations.add({
        'location': isEdit ? (item['location'] ?? 'Store') : 'Store',
        'quantity': isEdit ? (item['quantity'] as num?)?.toInt() ?? 0 : 0,
      });
    }

    final formLocs = rawLocations.obs;
    final selectedQuality = (isEdit ? (item['quality'] ?? 'New') : 'New').obs;
    final selectedCategory = (isEdit ? (item['category'] ?? controller.stockCategories[0]) : controller.stockCategories[0]).obs;

    Get.bottomSheet(
      Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: AppColors.slate900,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(isEdit ? 'Edit Stock Item' : 'Add Stock Item', style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Get.back(),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 12),
                children: [
                  _buildInput('Item Name*', nameC),
                  _buildInput('MPN', mpnC),
                  Obx(() => _buildDropdownField('Category', selectedCategory.value, controller.stockCategories, (val) => selectedCategory.value = val!)),
                  Obx(() => _buildDropdownField('Quality', selectedQuality.value, const ['New', 'Used - Good', 'Used - Fair', 'Damaged'], (val) => selectedQuality.value = val!)),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Stock Quantities by Location', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
                      IconButton(
                        icon: const Icon(Icons.add_circle_outline, color: AppColors.primary),
                        onPressed: () {
                          formLocs.add({'location': controller.locations[0], 'quantity': 0});
                        },
                      ),
                    ],
                  ),
                  Obx(() => ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: formLocs.length,
                    itemBuilder: (context, idx) {
                      final l = formLocs[idx];
                      final qtyC = TextEditingController(text: '${l['quantity']}');
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8.0),
                        child: Row(
                          children: [
                            Expanded(
                              flex: 2,
                              child: _buildDropdown(
                                value: l['location'],
                                items: controller.locations,
                                label: 'Loc',
                                onChanged: (val) {
                                  if (val != null) {
                                    formLocs[idx] = {'location': val, 'quantity': l['quantity']};
                                  }
                                },
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: TextField(
                                controller: qtyC,
                                keyboardType: TextInputType.number,
                                style: GoogleFonts.outfit(color: Colors.white),
                                decoration: const InputDecoration(labelText: 'Qty', labelStyle: TextStyle(color: AppColors.slate400)),
                                onChanged: (val) {
                                  final q = int.tryParse(val) ?? 0;
                                  formLocs[idx] = {'location': l['location'], 'quantity': q};
                                },
                              ),
                            ),
                            if (formLocs.length > 1)
                              IconButton(
                                icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                                onPressed: () => formLocs.removeAt(idx),
                              ),
                          ],
                        ),
                      );
                    },
                  )),
                  const SizedBox(height: 16),
                  _buildPhotoSelectorSection(),
                ],
              ),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () async {
                if (nameC.text.trim().isEmpty) {
                  Get.snackbar('Error', 'Name is required');
                  return;
                }
                final ok = await controller.saveStockItem(
                  id: isEdit ? (item['id'] as int) : null,
                  name: nameC.text,
                  mpn: mpnC.text,
                  quality: selectedQuality.value,
                  locs: formLocs.toList(),
                  category: selectedCategory.value,
                );
                if (ok) Get.back();
              },
              child: Text(isEdit ? 'Save Changes' : 'Create Item', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
            ),
          ],
        ),
      ),
      isScrollControlled: true,
      ignoreSafeArea: false,
    );
  }

  // Tools Add/Edit Form Sheet
  void _showToolFormSheet(BuildContext context, {Map<String, dynamic>? tool}) {
    controller.clearImage();
    final isEdit = tool != null;
    final nameC = TextEditingController(text: isEdit ? (tool['name'] ?? '') : '');
    final qtyC = TextEditingController(text: isEdit ? '${tool['quantity'] ?? 1}' : '1');

    final selectedCategory = (isEdit ? (tool['category'] ?? controller.toolCategories[0]) : controller.toolCategories[0]).obs;
    final selectedStatus = (isEdit ? (tool['status'] ?? 'available') : 'available').obs;
    final selectedLocation = (isEdit ? (tool['location'] ?? controller.locations[0]) : controller.locations[0]).obs;
    final selectedOfficer = (isEdit && tool['assigned_officer_id'] != null ? '${tool['assigned_officer_id']}' : '').obs;

    Get.bottomSheet(
      Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: AppColors.slate900,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(isEdit ? 'Edit Tool' : 'Add Tool', style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Get.back(),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 12),
                children: [
                  _buildInput('Tool Name*', nameC),
                  _buildInput('Quantity*', qtyC, isNumber: true),
                  Obx(() => _buildDropdownField('Category', selectedCategory.value, controller.toolCategories, (val) => selectedCategory.value = val!)),
                  Obx(() => _buildDropdownField('Status', selectedStatus.value, const ['available', 'in_use', 'missing', 'damaged'], (val) => selectedStatus.value = val!)),
                  Obx(() => _buildDropdownField('Location', selectedLocation.value, controller.locations, (val) => selectedLocation.value = val!)),
                  Obx(() {
                    final offList = <DropdownMenuItem<String>>[
                      const DropdownMenuItem(value: '', child: Text('Unassigned', style: TextStyle(color: Colors.white))),
                      ...controller.officers.map((o) => DropdownMenuItem(
                        value: '${o['id']}',
                        child: Text(o['full_name'] ?? '', style: const TextStyle(color: Colors.white)),
                      )),
                    ];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Assigned Officer', style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 13, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 6),
                          DropdownButtonFormField<String>(
                            value: selectedOfficer.value,
                            items: offList,
                            dropdownColor: AppColors.slate900,
                            decoration: const InputDecoration(border: OutlineInputBorder()),
                            onChanged: (val) => selectedOfficer.value = val ?? '',
                          ),
                        ],
                      ),
                    );
                  }),
                  _buildPhotoSelectorSection(),
                ],
              ),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () async {
                if (nameC.text.trim().isEmpty) {
                  Get.snackbar('Error', 'Name is required');
                  return;
                }
                final qty = int.tryParse(qtyC.text) ?? 1;
                final ok = await controller.saveToolItem(
                  id: isEdit ? (tool['id'] as int) : null,
                  name: nameC.text,
                  category: selectedCategory.value,
                  quantity: qty,
                  status: selectedStatus.value,
                  location: selectedLocation.value,
                  assignedOfficerId: selectedOfficer.isEmpty ? null : int.tryParse(selectedOfficer.value),
                );
                if (ok) Get.back();
              },
              child: Text(isEdit ? 'Save Changes' : 'Create Tool', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
            ),
          ],
        ),
      ),
      isScrollControlled: true,
      ignoreSafeArea: false,
    );
  }

  // Uniform Add/Edit Form Sheet
  void _showUniformFormSheet(BuildContext context, {Map<String, dynamic>? item}) {
    controller.clearImage();
    final isEdit = item != null;
    final nameC = TextEditingController(text: isEdit ? (item['name'] ?? '') : '');
    final qtyC = TextEditingController(text: isEdit ? '${item['quantity'] ?? 1}' : '1');
    final notesC = TextEditingController(text: isEdit ? (item['notes'] ?? '') : '');

    final selectedCategory = (isEdit ? (item['category'] ?? controller.uniformCategories[0]) : controller.uniformCategories[0]).obs;
    final selectedSize = (isEdit ? (item['size'] ?? controller.uniformSizes[0]) : controller.uniformSizes[0]).obs;
    final selectedStatus = (isEdit ? (item['status'] ?? 'available') : 'available').obs;
    final selectedLocation = (isEdit ? (item['location'] ?? controller.locations[0]) : controller.locations[0]).obs;
    final selectedOfficer = (isEdit && item['assigned_officer_id'] != null ? '${item['assigned_officer_id']}' : '').obs;

    Get.bottomSheet(
      Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: AppColors.slate900,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(isEdit ? 'Edit Uniform Item' : 'Add Uniform Item', style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Get.back(),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 12),
                children: [
                  _buildInput('Item Name*', nameC),
                  _buildInput('Quantity*', qtyC, isNumber: true),
                  Obx(() => _buildDropdownField('Category', selectedCategory.value, controller.uniformCategories, (val) => selectedCategory.value = val!)),
                  Obx(() => _buildDropdownField('Size', selectedSize.value, controller.uniformSizes, (val) => selectedSize.value = val!)),
                  Obx(() => _buildDropdownField('Status', selectedStatus.value, const ['available', 'issued', 'retired', 'lost', 'damaged'], (val) => selectedStatus.value = val!)),
                  Obx(() => _buildDropdownField('Location', selectedLocation.value, controller.locations, (val) => selectedLocation.value = val!)),
                  Obx(() {
                    final offList = <DropdownMenuItem<String>>[
                      const DropdownMenuItem(value: '', child: Text('Unassigned', style: TextStyle(color: Colors.white))),
                      ...controller.officers.map((o) => DropdownMenuItem(
                        value: '${o['id']}',
                        child: Text(o['full_name'] ?? '', style: const TextStyle(color: Colors.white)),
                      )),
                    ];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Issued to Officer', style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 13, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 6),
                          DropdownButtonFormField<String>(
                            value: selectedOfficer.value,
                            items: offList,
                            dropdownColor: AppColors.slate900,
                            decoration: const InputDecoration(border: OutlineInputBorder()),
                            onChanged: (val) => selectedOfficer.value = val ?? '',
                          ),
                        ],
                      ),
                    );
                  }),
                  _buildInput('Notes/Issue Remarks', notesC, isMultiline: true),
                  _buildPhotoSelectorSection(),
                ],
              ),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () async {
                if (nameC.text.trim().isEmpty) {
                  Get.snackbar('Error', 'Name is required');
                  return;
                }
                final qty = int.tryParse(qtyC.text) ?? 1;
                final ok = await controller.saveUniformItem(
                  id: isEdit ? (item['id'] as int) : null,
                  name: nameC.text,
                  category: selectedCategory.value,
                  size: selectedSize.value,
                  status: selectedStatus.value,
                  location: selectedLocation.value,
                  quantity: qty,
                  assignedOfficerId: selectedOfficer.isEmpty ? null : int.tryParse(selectedOfficer.value),
                  notes: notesC.text,
                );
                if (ok) Get.back();
              },
              child: Text(isEdit ? 'Save Changes' : 'Create Uniform', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
            ),
          ],
        ),
      ),
      isScrollControlled: true,
      ignoreSafeArea: false,
    );
  }

  // Converters dialogs
  void _showConvertToToolDialog(BuildContext context, Map<String, dynamic> item) {
    final qtyC = TextEditingController(text: '1');
    Get.dialog(
      AlertDialog(
        backgroundColor: AppColors.slate900,
        title: Text('Convert to Tool', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Convert some units of ${item['name']} into a tracked tool/equipment.', style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: qtyC,
              style: GoogleFonts.outfit(color: Colors.white),
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Conversion Quantity', labelStyle: TextStyle(color: AppColors.slate400)),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text('Cancel', style: TextStyle(color: Colors.white))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: () async {
              final q = int.tryParse(qtyC.text) ?? 1;
              if (q < 1) return;
              final ok = await controller.convertStockToTool(item['id'] as int, q);
              if (ok) Get.back();
            },
            child: const Text('Convert', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showConvertToStockDialog(BuildContext context, Map<String, dynamic> tool) {
    final qtyC = TextEditingController(text: '1');
    final selectedCategory = controller.stockCategories[0].obs;
    final selectedQuality = 'Used - Good'.obs;

    Get.dialog(
      AlertDialog(
        backgroundColor: AppColors.slate900,
        title: Text('Convert to Stock', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('De-register tool/equipment ${tool['name']} and move it to consumables stock.', style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 13)),
              const SizedBox(height: 12),
              TextField(
                controller: qtyC,
                style: GoogleFonts.outfit(color: Colors.white),
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Conversion Quantity', labelStyle: TextStyle(color: AppColors.slate400)),
              ),
              const SizedBox(height: 12),
              Obx(() => _buildDropdownField('Stock Category', selectedCategory.value, controller.stockCategories, (val) => selectedCategory.value = val!)),
              Obx(() => _buildDropdownField('Stock Quality', selectedQuality.value, const ['New', 'Used - Good', 'Used - Fair', 'Damaged'], (val) => selectedQuality.value = val!)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text('Cancel', style: TextStyle(color: Colors.white))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: () async {
              final q = int.tryParse(qtyC.text) ?? 1;
              if (q < 1) return;
              final ok = await controller.convertToolToStock(
                toolId: tool['id'] as int,
                quantity: q,
                category: selectedCategory.value,
                quality: selectedQuality.value,
              );
              if (ok) Get.back();
            },
            child: const Text('Convert', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  // Confirmers
  void _confirmDeleteStock(int id) {
    Get.dialog(
      AlertDialog(
        backgroundColor: AppColors.slate900,
        title: const Text('Delete Stock Item', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: const Text('Are you sure you want to delete this stock item? This will also remove its transaction logs.', style: TextStyle(color: AppColors.slate400)),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text('Cancel', style: TextStyle(color: Colors.white))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () {
              controller.deleteStockItem(id);
              Get.back();
            },
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteTool(int id) {
    Get.dialog(
      AlertDialog(
        backgroundColor: AppColors.slate900,
        title: const Text('Delete Tool', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: const Text('Are you sure you want to delete this tool registration?', style: TextStyle(color: AppColors.slate400)),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text('Cancel', style: TextStyle(color: Colors.white))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () {
              controller.deleteToolItem(id);
              Get.back();
            },
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteUniform(int id) {
    Get.dialog(
      AlertDialog(
        backgroundColor: AppColors.slate900,
        title: const Text('Delete Uniform Item', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: const Text('Are you sure you want to delete this uniform item registration?', style: TextStyle(color: AppColors.slate400)),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text('Cancel', style: TextStyle(color: Colors.white))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () {
              controller.deleteUniformItem(id);
              Get.back();
            },
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  // Helpers widgets for forms
  Widget _buildInput(String label, TextEditingController textC, {bool isMultiline = false, bool isNumber = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          TextField(
            controller: textC,
            keyboardType: isNumber ? TextInputType.number : (isMultiline ? TextInputType.multiline : TextInputType.text),
            maxLines: isMultiline ? 3 : 1,
            style: GoogleFonts.outfit(color: Colors.white),
            decoration: InputDecoration(
              filled: true,
              fillColor: AppColors.slate500.withOpacity(0.08),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDropdownField(String label, String value, List<String> items, ValueChanged<String?> onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          _buildDropdown(value: value, items: items, label: label, onChanged: onChanged),
        ],
      ),
    );
  }

  Widget _buildDropdown({
    required String value,
    required List<String> items,
    required String label,
    required ValueChanged<String?> onChanged,
  }) {
    final list = items.map((i) => DropdownMenuItem(value: i, child: Text(i, style: const TextStyle(color: Colors.white)))).toList();
    if (!items.contains(value) && value.isNotEmpty) {
      list.insert(0, DropdownMenuItem(value: value, child: Text(value, style: const TextStyle(color: Colors.white))));
    }
    return DropdownButtonFormField<String>(
      value: value.isEmpty ? null : value,
      items: list,
      dropdownColor: AppColors.slate900,
      decoration: const InputDecoration(
        border: OutlineInputBorder(),
        contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      ),
      onChanged: onChanged,
    );
  }

  Widget _buildPhotoSelectorSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Photo Upload', style: GoogleFonts.outfit(color: AppColors.slate400, fontSize: 13, fontWeight: FontWeight.bold)),
        const SizedBox(height: 6),
        Obx(() {
          if (controller.base64Image.isNotEmpty) {
            return Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: AppColors.slate500.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
              child: Row(
                children: [
                  const Icon(Icons.image, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(child: Text(controller.imageFilename.value, style: const TextStyle(color: Colors.white), overflow: TextOverflow.ellipsis)),
                  IconButton(icon: const Icon(Icons.delete_outline, color: Colors.redAccent), onPressed: () => controller.clearImage()),
                ],
              ),
            );
          }
          return Row(
            children: [
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.slate500.withOpacity(0.2)),
                icon: const Icon(Icons.camera_alt, color: Colors.white, size: 18),
                label: const Text('Camera', style: TextStyle(color: Colors.white)),
                onPressed: () => controller.pickImage(ImageSource.camera),
              ),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.slate500.withOpacity(0.2)),
                icon: const Icon(Icons.photo_library, color: Colors.white, size: 18),
                label: const Text('Gallery', style: TextStyle(color: Colors.white)),
                onPressed: () => controller.pickImage(ImageSource.gallery),
              ),
            ],
          );
        }),
      ],
    );
  }

  Widget _buildChip(String text, Color bgColor, Color textColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: GoogleFonts.outfit(color: textColor, fontSize: 11, fontWeight: FontWeight.bold),
      ),
    );
  }
}
