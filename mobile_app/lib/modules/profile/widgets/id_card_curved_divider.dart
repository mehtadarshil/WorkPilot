import 'package:flutter/material.dart';

/// Horizontal rule with a centre V-notch (reference ID card layout).
class IdCardCurvedDivider extends StatelessWidget {
  const IdCardCurvedDivider({super.key, required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(double.infinity, 28),
      painter: _IdCardCurvedDividerPainter(color: color),
    );
  }
}

class _IdCardCurvedDividerPainter extends CustomPainter {
  _IdCardCurvedDividerPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final y = 10.0;
    final cx = size.width / 2;
    final notchDepth = 16.0;
    final gap = 36.0;

    final path = Path()
      ..moveTo(0, y)
      ..lineTo(cx - gap, y)
      ..lineTo(cx, y + notchDepth)
      ..lineTo(cx + gap, y)
      ..lineTo(size.width, y);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _IdCardCurvedDividerPainter old) => old.color != color;
}
