import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../models/canvas_models.dart';
import '../theme/app_theme.dart';
import '../widgets/canvas_painter.dart';
import 'export_screen.dart';

/// Slide-by-slide preview. Shows each slide exactly as it will export (same
/// renderer), lets the user swipe through, and proceeds to export.
class PreviewScreen extends StatefulWidget {
  const PreviewScreen({
    super.key,
    required this.project,
    required this.decodedImages,
  });

  final CanvasProject project;
  final Map<String, ui.Image> decodedImages;

  @override
  State<PreviewScreen> createState() => _PreviewScreenState();
}

class _PreviewScreenState extends State<PreviewScreen> {
  final _page = PageController(viewportFraction: 0.82);
  int _index = 0;

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.project;
    return Scaffold(
      appBar: AppBar(title: const Text('Preview')),
      body: Column(
        children: [
          const SizedBox(height: 12),
          Text('Slide ${_index + 1} of ${p.slideCount}',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Expanded(
            child: PageView.builder(
              controller: _page,
              itemCount: p.slideCount,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (_, i) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                  child: _SlidePreview(
                    project: p,
                    slideIndex: i,
                    decodedImages: widget.decodedImages,
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ExportScreen(
                        project: p,
                        decodedImages: widget.decodedImages,
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.download_outlined),
                label: Text('Export ${p.slideCount} slides'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Renders a single slide to screen using the shared renderer, clipped to the
/// slide band — a faithful preview of the exported file.
class _SlidePreview extends StatelessWidget {
  const _SlidePreview({
    required this.project,
    required this.slideIndex,
    required this.decodedImages,
  });

  final CanvasProject project;
  final int slideIndex;
  final Map<String, ui.Image> decodedImages;

  @override
  Widget build(BuildContext context) {
    final aspect = project.slideWidth / project.slideHeight;
    return Center(
      child: AspectRatio(
        aspectRatio: aspect,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.warmSurfaceAlt, width: 2),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: project.slideWidth,
              height: project.slideHeight,
              child: ClipRect(
                child: CustomPaint(
                  size: Size(project.slideWidth, project.slideHeight),
                  painter: _SlicePainter(
                    project: project,
                    slideIndex: slideIndex,
                    decodedImages: decodedImages,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Paints one slide by translating the continuous canvas by -slideWidth*index.
class _SlicePainter extends CustomPainter {
  _SlicePainter({
    required this.project,
    required this.slideIndex,
    required this.decodedImages,
  });

  final CanvasProject project;
  final int slideIndex;
  final Map<String, ui.Image> decodedImages;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.clipRect(Rect.fromLTWH(0, 0, size.width, size.height));
    canvas.translate(-project.slideWidth * slideIndex, 0);
    CanvasRenderer(project: project, decodedImages: decodedImages)
        .paintCanvasContent(canvas);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _SlicePainter old) =>
      old.slideIndex != slideIndex || old.project != project;
}
