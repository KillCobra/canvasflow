import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/canvas_models.dart';
import '../services/project_store.dart';
import '../services/snapping.dart';
import '../state/editor_controller.dart';
import '../theme/app_theme.dart';
import '../widgets/canvas_painter.dart';
import 'preview_screen.dart';

/// The editor: zoomable/pannable continuous canvas with visible slide
/// boundaries, element manipulation, snapping guides, undo/redo, layer order,
/// fit-to-screen, and entry to preview/export.
class EditorScreen extends StatefulWidget {
  const EditorScreen({super.key, required this.project});
  final CanvasProject project;

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends State<EditorScreen> {
  late final EditorController _c = EditorController(widget.project);
  final _transform = TransformationController();
  final _picker = ImagePicker();
  List<SnapGuide> _activeGuides = [];
  bool _loadingImages = true;

  @override
  void initState() {
    super.initState();
    _decodeExistingImages();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitToScreen());
  }

  @override
  void dispose() {
    _c.saveNow();
    _c.dispose();
    _transform.dispose();
    super.dispose();
  }

  Future<void> _decodeExistingImages() async {
    for (final el in widget.project.elements) {
      if (el.type == ElementType.image && el.imagePath != null) {
        try {
          final bytes = await File(el.imagePath!).readAsBytes();
          final img = await decodeImageFromList(bytes);
          _c.decodedImages[el.id] = img;
        } catch (_) {
          // Missing media: element renders as placeholder.
        }
      }
    }
    if (mounted) setState(() => _loadingImages = false);
    _c.notifyListeners();
  }

  // ---- Canvas transform helpers ----

  void _fitToScreen() {
    final media = MediaQuery.of(context);
    final availW = media.size.width - 24;
    final availH = media.size.height - 320; // leave room for toolbars
    final cw = widget.project.canvasWidth;
    final ch = widget.project.canvasHeight;
    final scale = (availW / cw).clamp(0.01, 4.0);
    // Center vertically within available height.
    final scaledH = ch * scale;
    final ty = (availH - scaledH) / 2;
    _transform.value = Matrix4.identity()
      ..translate(12.0, ty < 0 ? 0.0 : ty + 70)
      ..scale(scale);
    setState(() {});
  }

  double get _scale => _transform.value.getMaxScaleOnAxis();

  // ---- Element gestures ----

  void _onElementPanStart(CanvasElement el) {
    _c.select(el.id);
  }

  void _onElementPanUpdate(CanvasElement el, DragUpdateDetails d) {
    final delta = d.delta / _scale;
    var nx = el.x + delta.dx;
    var ny = el.y + delta.dy;
    final snap = Snapper(widget.project).snap(el, nx, ny);
    nx = snap.dx;
    ny = snap.dy;
    _activeGuides = snap.guides;
    _c.updateTransform(el.id, x: nx, y: ny);
    setState(() {});
  }

  void _onElementPanEnd() {
    _activeGuides = [];
    _c.commit();
    setState(() {});
  }

  Future<void> _addPhoto() async {
    try {
      final XFile? picked =
          await _picker.pickImage(source: ImageSource.gallery, imageQuality: 95);
      if (picked == null) return;
      final localPath =
          await ProjectStore.instance.importMedia(picked.path, _newId());
      final bytes = await File(localPath).readAsBytes();
      final img = await decodeImageFromList(bytes);
      final idBefore = _c.project.elements.length;
      _c.addImage(localPath, img);
      // Associate decoded image with the new element id.
      final newEl = _c.project.elements[idBefore];
      _c.decodedImages[newEl.id] = img;
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not add photo: $e')),
      );
    }
  }

  String _newId() => DateTime.now().microsecondsSinceEpoch.toString();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.project.name,
            maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            tooltip: 'Undo',
            onPressed: _c.canUndo ? () => setState(_c.undo) : null,
            icon: const Icon(Icons.undo),
          ),
          IconButton(
            tooltip: 'Redo',
            onPressed: _c.canRedo ? () => setState(_c.redo) : null,
            icon: const Icon(Icons.redo),
          ),
          IconButton(
            tooltip: 'Fit to screen',
            onPressed: _fitToScreen,
            icon: const Icon(Icons.fit_screen_outlined),
          ),
          FilledButton.icon(
            onPressed: _openPreview,
            icon: const Icon(Icons.ios_share, size: 18),
            label: const Text('Export'),
            style: FilledButton.styleFrom(
                minimumSize: const Size(0, 40),
                padding: const EdgeInsets.symmetric(horizontal: 14)),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              color: AppTheme.warmSurfaceAlt.withOpacity(0.4),
              child: _loadingImages
                  ? const Center(child: CircularProgressIndicator())
                  : _buildCanvas(),
            ),
          ),
          _buildInspector(),
          _buildToolbar(),
        ],
      ),
    );
  }

  Widget _buildCanvas() {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        return InteractiveViewer(
          transformationController: _transform,
          minScale: 0.05,
          maxScale: 5,
          constrained: false,
          boundaryMargin: const EdgeInsets.all(2000),
          child: SizedBox(
            width: widget.project.canvasWidth,
            height: widget.project.canvasHeight,
            child: GestureDetector(
              onTap: () => _c.select(null),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Canvas content (background + elements) via painter.
                  CustomPaint(
                    size: Size(widget.project.canvasWidth,
                        widget.project.canvasHeight),
                    painter: CanvasContentPainter(
                      project: widget.project,
                      decodedImages: _c.decodedImages,
                      repaint: _c,
                    ),
                  ),
                  // Interactive hit targets + selection handles per element.
                  for (final el in widget.project.elements)
                    _buildElementHandle(el),
                  // Slide boundary overlay.
                  CustomPaint(
                    size: Size(widget.project.canvasWidth,
                        widget.project.canvasHeight),
                    painter: _BoundaryPainter(
                      project: widget.project,
                      guides: _activeGuides,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildElementHandle(CanvasElement el) {
    final selected = el.id == _c.selectedId;
    return Positioned(
      left: el.x,
      top: el.y,
      width: el.width,
      height: el.height,
      child: Transform.rotate(
        angle: el.rotation,
        child: GestureDetector(
          onTap: () => _c.select(el.id),
          onPanStart: (_) => _onElementPanStart(el),
          onPanUpdate: (d) => _onElementPanUpdate(el, d),
          onPanEnd: (_) => _onElementPanEnd(),
          child: Container(
            decoration: BoxDecoration(
              border: selected
                  ? Border.all(color: AppTheme.deepBlueBright, width: 2 / _scale)
                  : null,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInspector() {
    final el = _c.selected;
    if (el == null) {
      return const SizedBox(
        height: 56,
        child: Center(
          child: Text('Tap an element to edit · pinch to zoom · drag to pan',
              style: TextStyle(color: AppTheme.mutedText)),
        ),
      );
    }
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      color: AppTheme.warmSurface,
      child: Row(
        children: [
          _InspectorButton(
              icon: Icons.flip_to_front, label: 'Forward', onTap: () => setState(_c.bringForward)),
          _InspectorButton(
              icon: Icons.flip_to_back, label: 'Back', onTap: () => setState(_c.sendBackward)),
          _InspectorButton(
              icon: Icons.copy_outlined, label: 'Duplicate', onTap: () => setState(_c.duplicateSelected)),
          if (el.type == ElementType.text)
            _InspectorButton(
                icon: Icons.edit_outlined, label: 'Edit', onTap: () => _editText(el)),
          if (el.type != ElementType.image)
            _InspectorButton(
                icon: Icons.palette_outlined, label: 'Color', onTap: () => _pickColor(el)),
          _InspectorButton(
              icon: Icons.rotate_right, label: 'Rotate', onTap: () {
            _c.updateTransform(el.id, rotation: el.rotation + 0.0872665); // 5°
            _c.commit();
            setState(() {});
          }),
          const Spacer(),
          _InspectorButton(
              icon: Icons.delete_outline,
              label: 'Delete',
              color: AppTheme.danger,
              onTap: () => setState(_c.deleteSelected)),
        ],
      ),
    );
  }

  Widget _buildToolbar() {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        color: AppTheme.warmSurface,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _ToolButton(icon: Icons.add_photo_alternate_outlined, label: 'Photo', onTap: _addPhoto),
            _ToolButton(icon: Icons.title, label: 'Text', onTap: () {
              _c.addText('Your text');
              setState(() {});
            }),
            _ToolButton(icon: Icons.category_outlined, label: 'Shape', onTap: _addShapeSheet),
            _ToolButton(icon: Icons.format_color_fill, label: 'Background', onTap: _backgroundSheet),
            _ToolButton(icon: Icons.layers_outlined, label: 'Slides', onTap: _openPreview),
          ],
        ),
      ),
    );
  }

  // ---- Dialogs / sheets ----

  Future<void> _editText(CanvasElement el) async {
    final c = TextEditingController(text: el.text);
    final result = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Edit text'),
        content: TextField(controller: c, autofocus: true, maxLines: 3),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, c.text), child: const Text('Save')),
        ],
      ),
    );
    if (result != null) {
      _c.updateText(el.id, result);
      setState(() {});
    }
  }

  final _palette = const [
    0xFF1F3A5F, 0xFF2E5A8F, 0xFF23201A, 0xFFF5F1E9,
    0xFFEDE6D8, 0xFFA6412E, 0xFFFBF8F2, 0xFF6B6457,
  ];

  Future<void> _pickColor(CanvasElement el) async {
    await showModalBottomSheet(
      context: context,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Wrap(
          spacing: 12,
          runSpacing: 12,
          children: _palette.map((cv) {
            return GestureDetector(
              onTap: () {
                _c.updateColor(el.id, cv);
                setState(() {});
                Navigator.pop(context);
              },
              child: Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: Color(cv),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppTheme.warmSurfaceAlt),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Future<void> _addShapeSheet() async {
    await showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final k in ShapeKind.values)
              ListTile(
                leading: const Icon(Icons.category_outlined),
                title: Text(_shapeLabel(k)),
                onTap: () {
                  _c.addShape(k);
                  setState(() {});
                  Navigator.pop(context);
                },
              ),
          ],
        ),
      ),
    );
  }

  String _shapeLabel(ShapeKind k) => switch (k) {
        ShapeKind.rectangle => 'Rectangle',
        ShapeKind.roundedRectangle => 'Rounded rectangle',
        ShapeKind.ellipse => 'Ellipse',
        ShapeKind.line => 'Line',
      };

  Future<void> _backgroundSheet() async {
    await showModalBottomSheet(
      context: context,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Background color',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: _palette.map((cv) {
                return GestureDetector(
                  onTap: () {
                    _c.setBackground(cv);
                    setState(() {});
                    Navigator.pop(context);
                  },
                  child: Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      color: Color(cv),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppTheme.warmSurfaceAlt),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openPreview() async {
    await _c.saveNow();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PreviewScreen(
          project: widget.project,
          decodedImages: _c.decodedImages,
        ),
      ),
    );
  }
}

class _InspectorButton extends StatelessWidget {
  const _InspectorButton(
      {required this.icon,
      required this.label,
      required this.onTap,
      this.color});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 22, color: color ?? AppTheme.deepBlue),
            const SizedBox(height: 2),
            Text(label,
                style: TextStyle(
                    fontSize: 10, color: color ?? AppTheme.mutedText)),
          ],
        ),
      ),
    );
  }
}

class _ToolButton extends StatelessWidget {
  const _ToolButton(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: AppTheme.deepBlue, size: 26),
            const SizedBox(height: 4),
            Text(label,
                style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.inkText,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

/// Draws slide boundary lines, slide numbers, and active snap guides.
class _BoundaryPainter extends CustomPainter {
  _BoundaryPainter({required this.project, required this.guides});
  final CanvasProject project;
  final List<SnapGuide> guides;

  @override
  void paint(Canvas canvas, Size size) {
    final boundary = Paint()
      ..color = AppTheme.deepBlue.withOpacity(0.5)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    for (var i = 1; i < project.slideCount; i++) {
      final x = project.slideWidth * i;
      canvas.drawLine(Offset(x, 0), Offset(x, project.canvasHeight), boundary);
    }
    // Outer frame.
    canvas.drawRect(
        Rect.fromLTWH(0, 0, project.canvasWidth, project.canvasHeight),
        boundary);

    // Snap guides (brighter).
    final guidePaint = Paint()
      ..color = AppTheme.danger
      ..strokeWidth = 2;
    for (final g in guides) {
      if (g.isVertical) {
        canvas.drawLine(Offset(g.position, 0),
            Offset(g.position, project.canvasHeight), guidePaint);
      } else {
        canvas.drawLine(Offset(0, g.position),
            Offset(project.canvasWidth, g.position), guidePaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _BoundaryPainter old) =>
      old.guides != guides;
}


