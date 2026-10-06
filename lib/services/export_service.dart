import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../models/canvas_models.dart';
import '../widgets/canvas_painter.dart';

/// Result of an export run.
class ExportResult {
  ExportResult({required this.files, required this.directory});
  final List<String> files;
  final String directory;
}

/// Renders each slide of a project to a correctly-sized PNG by drawing the
/// continuous canvas offset so that only the target slide's band is captured.
///
/// Rendering goes through the same [CanvasRenderer] used on screen, guaranteeing
/// the exported slices match the editor preview exactly and that seams between
/// slides align (slide i draws the canvas translated by -i*slideWidth).
class ExportService {
  const ExportService();

  /// Exports all slides. [onProgress] reports (completed, total).
  Future<ExportResult> exportProject(
    CanvasProject project, {
    required Map<String, ui.Image> decodedImages,
    void Function(int completed, int total)? onProgress,
  }) async {
    final total = project.slideCount;
    if (total <= 0) {
      throw ArgumentError('Project has no slides to export.');
    }

    final outDir = await _exportDir(project);
    final files = <String>[];

    for (var i = 0; i < total; i++) {
      final bytes = await renderSlice(project, i, decodedImages);
      final file = File(p.join(outDir.path, 'slide_${i + 1}.png'));
      await file.writeAsBytes(bytes);
      files.add(file.path);
      onProgress?.call(i + 1, total);
    }

    return ExportResult(files: files, directory: outDir.path);
  }

  /// Renders a single slide to PNG bytes at full export resolution.
  Future<List<int>> renderSlice(
    CanvasProject project,
    int slideIndex,
    Map<String, ui.Image> decodedImages,
  ) async {
    final w = project.slideWidth;
    final h = project.slideHeight;

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder,
        Rect.fromLTWH(0, 0, w, h));

    // Translate so the chosen slide's band is at the origin, then clip to the
    // slide bounds. Elements crossing the boundary are naturally split.
    canvas.save();
    canvas.clipRect(Rect.fromLTWH(0, 0, w, h));
    canvas.translate(-project.slideWidth * slideIndex, 0);

    final renderer = CanvasRenderer(
      project: project,
      decodedImages: decodedImages,
    );
    renderer.paintCanvasContent(canvas);
    canvas.restore();

    final picture = recorder.endRecording();
    final image = await picture.toImage(w.round(), h.round());
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    picture.dispose();
    if (data == null) {
      throw StateError('Failed to encode slide ${slideIndex + 1}.');
    }
    return data.buffer.asUint8List();
  }

  Future<Directory> _exportDir(CanvasProject project) async {
    final base = await getApplicationDocumentsDirectory();
    final safeName = project.name.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    final dir = Directory(
        p.join(base.path, 'canvasflow', 'exports', '${safeName}_${project.id}'));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }
}
