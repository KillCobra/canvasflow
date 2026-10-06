import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/canvas_models.dart';
import '../services/export_service.dart';
import '../theme/app_theme.dart';

/// Handles the export run with explicit progress, success, and error states.
/// Saves correctly-sized slide PNGs to the device's app storage. Does not claim
/// any direct social-platform posting (no such integration is implemented).
class ExportScreen extends StatefulWidget {
  const ExportScreen({
    super.key,
    required this.project,
    required this.decodedImages,
  });

  final CanvasProject project;
  final Map<String, ui.Image> decodedImages;

  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

enum _Phase { idle, requesting, exporting, success, error }

class _ExportScreenState extends State<ExportScreen> {
  _Phase _phase = _Phase.idle;
  int _done = 0;
  int _total = 0;
  String? _error;
  ExportResult? _result;

  Future<void> _start() async {
    setState(() {
      _phase = _Phase.requesting;
      _error = null;
    });

    // Request photo-add permission where applicable. On iOS this is the
    // "add to photos" permission; app-storage export below works regardless,
    // but we ask so a future "save to Photos" step is permitted.
    try {
      final status = await Permission.photosAddOnly.request();
      // We proceed even if limited/denied, since we export to app storage and
      // surface a clear message rather than failing hard.
      if (status.isPermanentlyDenied) {
        // Non-fatal; continue to app-storage export.
      }
    } catch (_) {
      // Permission plugin may be unavailable on some platforms; continue.
    }

    setState(() {
      _phase = _Phase.exporting;
      _total = widget.project.slideCount;
      _done = 0;
    });

    try {
      const svc = ExportService();
      final res = await svc.exportProject(
        widget.project,
        decodedImages: widget.decodedImages,
        onProgress: (c, t) {
          if (mounted) setState(() {
            _done = c;
            _total = t;
          });
        },
      );
      if (!mounted) return;
      setState(() {
        _phase = _Phase.success;
        _result = res;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _Phase.error;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Export')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(child: _buildBody()),
      ),
    );
  }

  Widget _buildBody() {
    switch (_phase) {
      case _Phase.idle:
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.download_outlined,
                size: 56, color: AppTheme.deepBlue),
            const SizedBox(height: 16),
            Text('Ready to export',
                style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              '${widget.project.slideCount} slides at '
              '${widget.project.slideWidth.round()}×'
              '${widget.project.slideHeight.round()} px will be saved to this '
              'device. Boundaries line up so the slides swipe seamlessly.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 28),
            FilledButton(onPressed: _start, child: const Text('Start export')),
          ],
        );
      case _Phase.requesting:
        return _progress('Preparing…', null);
      case _Phase.exporting:
        return _progress(
            'Exporting slide $_done of $_total…', _total == 0 ? null : _done / _total);
      case _Phase.success:
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_outline,
                size: 56, color: AppTheme.deepBlue),
            const SizedBox(height: 16),
            Text('Export complete',
                style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text('${_result?.files.length ?? 0} slides saved to:',
                style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.warmSurfaceAlt,
                borderRadius: BorderRadius.circular(10),
              ),
              child: SelectableText(_result?.directory ?? '',
                  style: const TextStyle(fontSize: 12),
                  textAlign: TextAlign.center),
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: () => Navigator.of(context).popUntil(
                  (r) => r.isFirst || r.settings.name == 'editor'),
              child: const Text('Done'),
            ),
          ],
        );
      case _Phase.error:
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 56, color: AppTheme.danger),
            const SizedBox(height: 16),
            Text('Export failed',
                style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              _error ?? 'Something went wrong while exporting.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppTheme.mutedText),
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Back')),
                const SizedBox(width: 12),
                FilledButton(
                    onPressed: _start, child: const Text('Try again')),
              ],
            ),
          ],
        );
    }
  }

  Widget _progress(String label, double? value) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 64,
          height: 64,
          child: CircularProgressIndicator(value: value),
        ),
        const SizedBox(height: 20),
        Text(label, style: Theme.of(context).textTheme.titleMedium),
      ],
    );
  }
}
