import 'package:flutter/material.dart';
import '../../../core/values/app_colors.dart';

void openFullscreenImage(BuildContext context, String url, {Map<String, String>? headers}) {
  showDialog<void>(
    context: context,
    builder: (ctx) {
      final mq = MediaQuery.of(ctx);
      return Dialog(
        backgroundColor: Colors.black.withOpacity(0.9),
        insetPadding: const EdgeInsets.all(8),
        child: SizedBox(
          width: mq.size.width,
          height: mq.size.height,
          child: Column(
            children: [
              SafeArea(
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: CircleAvatar(
                      backgroundColor: Colors.black45,
                      radius: 20,
                      child: IconButton(
                        icon: Icon(Icons.close_rounded, color: Colors.white, size: 20),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: InteractiveViewer(
                  minScale: 0.5,
                  maxScale: 6,
                  child: Center(
                    child: Image.network(
                      url,
                      fit: BoxFit.contain,
                      headers: headers,
                      loadingBuilder: (_, child, prog) {
                        if (prog == null) return child;
                        return const Center(child: CircularProgressIndicator(color: AppColors.primary));
                      },
                      errorBuilder: (_, __, ___) => const Center(
                        child: Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
