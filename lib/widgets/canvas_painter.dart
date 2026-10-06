import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../models/canvas_models.dart';

/// Shared drawing logic for the continuous canvas. Both the editor preview and
/// the export pipeline use this so what you see matches what you export.
///
/// All drawing happens in canvas coordinates (export pixels). Callers set up
/// any translation/clipping (e.g. the exporter offsets by one slide width).
class CanvasRenderer {
  CanvasRenderer({
    required this.project,
    required this.decodedImages,
  });

  final CanvasProject project;

  /// Map of element id -> decoded image, prepared by the caller.
  final Map<String, ui.Image> decodedImages;

  /// Paints the background then every element in z-order.
  void paintCanvasContent(Canvas canvas) {
    _paintBackground(canvas);
    for (final el in project.elements) {
      _paintElement(canvas, el);
    }
  }

  void _paintBackground(Canvas canvas) {
    final full = Rect.fromLTWH(0, 0, project.canvasWidth, project.canvasHeight);
    if (project.backgroundGradientValue != null) {
      final shader = ui.Gradient.linear(
        full.topCenter,
        full.bottomCenter,
        [project.backgroundColor, Color(project.backgroundGradientValue!)],
      );
      canvas.drawRect(full, Paint()..shader = shader);
    } else {
      canvas.drawRect(full, Paint()..color = project.backgroundColor);
    }
  }

  void _paintElement(Canvas canvas, CanvasElement el) {
    canvas.save();
    // Rotate around the element center.
    final cx = el.x + el.width / 2;
    final cy = el.y + el.height / 2;
    canvas.translate(cx, cy);
    canvas.rotate(el.rotation);
    canvas.translate(-cx, -cy);

    switch (el.type) {
      case ElementType.image:
        _paintImage(canvas, el);
      case ElementType.shape:
        _paintShape(canvas, el);
      case ElementType.text:
        _paintText(canvas, el);
    }
    canvas.restore();
  }

  void _paintImage(Canvas canvas, CanvasElement el) {
    final img = decodedImages[el.id];
    final dst = el.rect;
    final paint = Paint()
      ..filterQuality = FilterQuality.high
      ..color = Color.fromRGBO(0, 0, 0, el.opacity);
    if (img == null) {
      // Placeholder when the image hasn't decoded yet / is missing.
      canvas.drawRect(dst, Paint()..color = const Color(0xFFE4DED3));
      return;
    }
    // Source crop (normalized -> pixels).
    final src = Rect.fromLTRB(
      el.cropLeft * img.width,
      el.cropTop * img.height,
      el.cropRight * img.width,
      el.cropBottom * img.height,
    );
    canvas.drawImageRect(img, src, dst, paint);
  }

  void _paintShape(Canvas canvas, CanvasElement el) {
    final paint = Paint()
      ..color = el.color.withOpacity(el.opacity)
      ..style = PaintingStyle.fill;
    final r = el.rect;
    switch (el.shapeKind ?? ShapeKind.rectangle) {
      case ShapeKind.rectangle:
        canvas.drawRect(r, paint);
      case ShapeKind.roundedRectangle:
        canvas.drawRRect(
            RRect.fromRectAndRadius(r, Radius.circular(el.cornerRadius)), paint);
      case ShapeKind.ellipse:
        canvas.drawOval(r, paint);
      case ShapeKind.line:
        final stroke = Paint()
          ..color = el.color.withOpacity(el.opacity)
          ..strokeWidth = el.height
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(
            Offset(r.left, r.center.dy), Offset(r.right, r.center.dy), stroke);
    }
  }

  void _paintText(Canvas canvas, CanvasElement el) {
    final tp = TextPainter(
      text: TextSpan(
        text: el.text ?? '',
        style: TextStyle(
          color: el.color.withOpacity(el.opacity),
          fontSize: el.fontSize,
          fontWeight: FontWeight.w600,
          height: 1.15,
        ),
      ),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    );
    tp.layout(maxWidth: el.width);
    tp.paint(canvas, Offset(el.x, el.y));
  }
}

/// A [CustomPainter] wrapper for live on-screen rendering of the whole canvas.
class CanvasContentPainter extends CustomPainter {
  CanvasContentPainter({
    required this.project,
    required this.decodedImages,
    required this.repaint,
  }) : super(repaint: repaint);

  final CanvasProject project;
  final Map<String, ui.Image> decodedImages;
  final Listenable repaint;

  @override
  void paint(Canvas canvas, Size size) {
    // size is the canvas size in canvas coordinates (scaled by the caller's
    // transform), so we draw 1:1 here.
    CanvasRenderer(project: project, decodedImages: decodedImages)
        .paintCanvasContent(canvas);
  }

  @override
  bool shouldRepaint(covariant CanvasContentPainter oldDelegate) => true;
}
