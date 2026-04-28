import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:video_player/video_player.dart';
import 'package:video_thumbnail/video_thumbnail.dart';

import '../../core/values/app_colors.dart';

/// Preview frame for extra-submission videos (Bearer URL); shows play affordance on top.
class AuthVideoPosterTile extends StatefulWidget {
  const AuthVideoPosterTile({
    super.key,
    required this.url,
    required this.token,
    required this.onTap,
  });

  final String url;
  final String token;
  final VoidCallback onTap;

  @override
  State<AuthVideoPosterTile> createState() => _AuthVideoPosterTileState();
}

class _AuthVideoPosterTileState extends State<AuthVideoPosterTile> {
  Uint8List? _thumb;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final b = await VideoThumbnail.thumbnailData(
        video: widget.url,
        headers: {'Authorization': 'Bearer ${widget.token}'},
        imageFormat: ImageFormat.JPEG,
        maxWidth: 176,
        maxHeight: 176,
        timeMs: 800,
        quality: 42,
      );
      if (!mounted) return;
      setState(() {
        _thumb = (b != null && b.isNotEmpty) ? b : null;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _thumb = null;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: 88,
          height: 88,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (_thumb != null)
                Image.memory(
                  _thumb!,
                  fit: BoxFit.cover,
                  width: 88,
                  height: 88,
                  gaplessPlayback: true,
                )
              else
                ColoredBox(color: AppColors.whiteOverlay(0.08)),
              if (_loading)
                const Center(
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              if (!_loading)
                Center(
                  child: Icon(
                    Icons.play_circle_fill_rounded,
                    color: Colors.white.withValues(alpha: 0.9),
                    size: 40,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class ExtraSubmissionVideoDialog extends StatefulWidget {
  const ExtraSubmissionVideoDialog({
    super.key,
    required this.url,
    required this.token,
  });

  final String url;
  final String token;

  @override
  State<ExtraSubmissionVideoDialog> createState() => _ExtraSubmissionVideoDialogState();
}

class _ExtraSubmissionVideoDialogState extends State<ExtraSubmissionVideoDialog> {
  late final VideoPlayerController _video;
  ChewieController? _chewie;
  String? _error;

  @override
  void initState() {
    super.initState();
    _video = VideoPlayerController.networkUrl(
      Uri.parse(widget.url),
      httpHeaders: {'Authorization': 'Bearer ${widget.token}'},
    );
    _video.initialize().then((_) {
      if (!mounted) return;
      _chewie = ChewieController(
        videoPlayerController: _video,
        autoPlay: true,
        looping: false,
        showControls: true,
        allowFullScreen: true,
        allowMuting: true,
        deviceOrientationsOnEnterFullScreen: const [
          DeviceOrientation.portraitUp,
          DeviceOrientation.portraitDown,
          DeviceOrientation.landscapeLeft,
          DeviceOrientation.landscapeRight,
        ],
        deviceOrientationsAfterFullScreen: const [DeviceOrientation.portraitUp],
        materialProgressColors: ChewieProgressColors(
          playedColor: AppColors.primary,
          handleColor: AppColors.primary,
          backgroundColor: AppColors.whiteOverlay(0.2),
          bufferedColor: AppColors.whiteOverlay(0.35),
        ),
      );
      setState(() {});
    }).catchError((_) {
      if (!mounted) return;
      setState(() => _error = 'Could not load this video.');
    });
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _video.dispose();
    SystemChrome.setPreferredOrientations(const [DeviceOrientation.portraitUp]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width * 0.92;
    return AlertDialog(
      backgroundColor: const Color(0xFF0f172a),
      contentPadding: const EdgeInsets.all(8),
      content: SizedBox(
        width: w,
        child: _error != null
            ? Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(color: AppColors.slate300, fontSize: 15),
                ),
              )
            : _chewie == null
                ? const SizedBox(
                    height: 200,
                    child: Center(
                      child: CircularProgressIndicator(color: AppColors.primary),
                    ),
                  )
                : AspectRatio(
                    aspectRatio: _video.value.aspectRatio > 0.01 ? _video.value.aspectRatio : 16 / 9,
                    child: Chewie(controller: _chewie!),
                  ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text('Close', style: GoogleFonts.inter(color: AppColors.slate300)),
        ),
      ],
    );
  }
}
