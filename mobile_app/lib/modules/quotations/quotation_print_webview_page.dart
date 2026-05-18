import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/services/storage_service.dart';
import '../../core/values/app_constants.dart';

/// Same document as web dashboard “Print layout” (`QuotationPrintTemplate` via Next `/quotation-print/[id]`).
class QuotationPrintWebViewPage extends StatefulWidget {
  const QuotationPrintWebViewPage({super.key, required this.quotationId});

  final int quotationId;

  @override
  State<QuotationPrintWebViewPage> createState() => _QuotationPrintWebViewPageState();
}

class _QuotationPrintWebViewPageState extends State<QuotationPrintWebViewPage> {
  late final WebViewController _controller;
  double _progress = 0;
  String? _pageError;

  String? get _printUrl {
    final token = Get.find<StorageService>().authToken?.trim();
    if (token == null || token.isEmpty) return null;
    final origin = AppConstants.resolvedWebAppOrigin;
    final t = Uri.encodeComponent(token);
    return '$origin/quotation-print/${widget.quotationId}?token=$t';
  }

  @override
  void initState() {
    super.initState();
    final url = _printUrl;
    if (url == null) {
      _pageError = 'Not signed in — cannot load print layout.';
      _controller = WebViewController();
      return;
    }
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (mounted) setState(() => _progress = p / 100.0);
          },
          onWebResourceError: (err) {
            if (mounted) {
              setState(() => _pageError = err.description.isNotEmpty ? err.description : 'Failed to load page');
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(url));
  }

  Future<void> _openExternal() async {
    final u = _printUrl;
    if (u == null) return;
    final uri = Uri.parse(u);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text('Print layout', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
        actions: [
          if (_printUrl != null)
            IconButton(
              tooltip: 'Open in browser',
              icon: const Icon(Icons.open_in_new_rounded),
              onPressed: _openExternal,
            ),
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _pageError != null || _printUrl == null
                ? null
                : () => _controller.reload(),
          ),
        ],
      ),
      body: _pageError != null && _printUrl == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(_pageError!, textAlign: TextAlign.center, style: GoogleFonts.inter(color: Colors.red)),
              ),
            )
          : Stack(
              children: [
                WebViewWidget(controller: _controller),
                if (_progress > 0 && _progress < 1)
                  LinearProgressIndicator(value: _progress, minHeight: 2),
                if (_pageError != null && _printUrl != null)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: Material(
                      color: Colors.amber.shade100,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(_pageError!, style: GoogleFonts.inter(fontSize: 12)),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
