import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/services/storage_service.dart';
import '../../core/values/app_constants.dart';

class CertificatePrintWebViewPage extends StatefulWidget {
  const CertificatePrintWebViewPage({
    super.key,
    required this.certificateId,
    this.boardId,
    this.title = 'Print certificate',
  });

  final int certificateId;
  final String? boardId;
  final String title;

  @override
  State<CertificatePrintWebViewPage> createState() => _CertificatePrintWebViewPageState();
}

class _CertificatePrintWebViewPageState extends State<CertificatePrintWebViewPage> {
  late final WebViewController _controller;
  double _progress = 0;
  String? _pageError;

  String? get _printUrl {
    final token = Get.find<StorageService>().authToken?.trim();
    if (token == null || token.isEmpty) return null;
    final origin = AppConstants.resolvedWebAppOrigin;
    final t = Uri.encodeComponent(token);
    final boardId = widget.boardId?.trim();
    final path = boardId != null && boardId.isNotEmpty
        ? '$origin/certificate-print/${widget.certificateId}/boards/$boardId'
        : '$origin/certificate-print/${widget.certificateId}';
    return '$path?token=$t&embed=1';
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
        title: Text(widget.title, style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
        actions: [
          if (_printUrl != null)
            IconButton(
              tooltip: 'Open in browser',
              icon: const Icon(Icons.open_in_new_rounded),
              onPressed: _openExternal,
            ),
        ],
      ),
      body: _pageError != null && _printUrl == null
          ? Center(child: Text(_pageError!, style: GoogleFonts.inter()))
          : Stack(
              children: [
                WebViewWidget(controller: _controller),
                if (_progress < 1)
                  LinearProgressIndicator(value: _progress, backgroundColor: Colors.white24),
                if (_pageError != null && _printUrl != null)
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(_pageError!, style: GoogleFonts.inter(color: Colors.red)),
                    ),
                  ),
              ],
            ),
    );
  }
}
