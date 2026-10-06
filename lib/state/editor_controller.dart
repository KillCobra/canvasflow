import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../models/canvas_models.dart';
import '../services/project_store.dart';

/// Holds the live editing state for one project: selection, undo/redo history,
/// decoded image cache, and autosave. UI listens via [ChangeNotifier].
class EditorController extends ChangeNotifier {
  EditorController(this.project) {
    _pushHistory();
  }

  final CanvasProject project;
  final _uuid = const Uuid();

  String? selectedId;
  final Map<String, ui.Image> decodedImages = {};

  // Undo/redo as JSON snapshots of the element list + background.
  final List<String> _undo = [];
  final List<String> _redo = [];
  static const int _historyLimit = 60;

  bool get canUndo => _undo.length > 1;
  bool get canRedo => _redo.isNotEmpty;

  CanvasElement? get selected {
    if (selectedId == null) return null;
    for (final e in project.elements) {
      if (e.id == selectedId) return e;
    }
    return null;
  }

  // ---- History ----

  String _snapshot() => project.toJsonString();

  void _pushHistory() {
    _undo.add(_snapshot());
    if (_undo.length > _historyLimit) _undo.removeAt(0);
    _redo.clear();
  }

  /// Call after any committed mutation.
  void commit() {
    _pushHistory();
    _autosave();
    notifyListeners();
  }

  void undo() {
    if (!canUndo) return;
    _redo.add(_undo.removeLast());
    _restore(_undo.last);
  }

  void redo() {
    if (!canRedo) return;
    final s = _redo.removeLast();
    _undo.add(s);
    _restore(s);
  }

  void _restore(String snapshot) {
    final restored = CanvasProject.fromJsonString(snapshot);
    project.elements
      ..clear()
      ..addAll(restored.elements);
    project.backgroundColorValue = restored.backgroundColorValue;
    project.backgroundGradientValue = restored.backgroundGradientValue;
    if (selectedId != null &&
        !project.elements.any((e) => e.id == selectedId)) {
      selectedId = null;
    }
    _autosave();
    notifyListeners();
  }

  // ---- Autosave (debounced) ----

  bool _savePending = false;
  Future<void> _autosave() async {
    if (_savePending) return;
    _savePending = true;
    await Future<void>.delayed(const Duration(milliseconds: 400));
    _savePending = false;
    await ProjectStore.instance.save(project);
  }

  Future<void> saveNow() => ProjectStore.instance.save(project);

  // ---- Selection ----

  void select(String? id) {
    selectedId = id;
    notifyListeners();
  }

  // ---- Mutations (each ends with commit()) ----

  void addImage(String imagePath, ui.Image decoded) {
    final id = _uuid.v4();
    // Fit new image to roughly one slide, centered on slide 0.
    final w = project.slideWidth * 0.8;
    final aspect = decoded.height / decoded.width;
    final h = w * aspect;
    final el = CanvasElement(
      id: id,
      type: ElementType.image,
      x: (project.slideWidth - w) / 2,
      y: (project.slideHeight - h) / 2,
      width: w,
      height: h,
      imagePath: imagePath,
    );
    decodedImages[id] = decoded;
    project.elements.add(el);
    selectedId = id;
    commit();
  }

  void addText(String text) {
    final id = _uuid.v4();
    final w = project.slideWidth * 0.7;
    final el = CanvasElement(
      id: id,
      type: ElementType.text,
      x: (project.slideWidth - w) / 2,
      y: project.slideHeight * 0.4,
      width: w,
      height: 120,
      text: text,
      fontSize: project.slideWidth * 0.08,
      colorValue: 0xFF1F3A5F,
    );
    project.elements.add(el);
    selectedId = id;
    commit();
  }

  void addShape(ShapeKind kind) {
    final id = _uuid.v4();
    final s = project.slideWidth * 0.4;
    final el = CanvasElement(
      id: id,
      type: ElementType.shape,
      x: (project.slideWidth - s) / 2,
      y: (project.slideHeight - s) / 2,
      width: s,
      height: kind == ShapeKind.line ? 12 : s,
      shapeKind: kind,
      colorValue: 0xFF2E5A8F,
      cornerRadius: kind == ShapeKind.roundedRectangle ? 48 : 0,
    );
    project.elements.add(el);
    selectedId = id;
    commit();
  }

  /// Live transform during a drag (no history push until [commit]).
  void updateTransform(String id,
      {double? x, double? y, double? width, double? height, double? rotation}) {
    final i = project.elements.indexWhere((e) => e.id == id);
    if (i < 0) return;
    final e = project.elements[i];
    project.elements[i] = e.copyWith(
      x: x, y: y, width: width, height: height, rotation: rotation,
    );
    notifyListeners();
  }

  void updateText(String id, String text) {
    final i = project.elements.indexWhere((e) => e.id == id);
    if (i < 0) return;
    project.elements[i] = project.elements[i].copyWith(text: text);
    commit();
  }

  void updateColor(String id, int colorValue) {
    final i = project.elements.indexWhere((e) => e.id == id);
    if (i < 0) return;
    project.elements[i] = project.elements[i].copyWith(colorValue: colorValue);
    commit();
  }

  void setBackground(int colorValue, {int? gradient}) {
    project.backgroundColorValue = colorValue;
    project.backgroundGradientValue = gradient;
    commit();
  }

  void duplicateSelected() {
    final e = selected;
    if (e == null) return;
    final id = _uuid.v4();
    final copy = CanvasElement.fromJson(e.toJson())
      ..x = e.x + project.slideWidth * 0.04
      ..y = e.y + project.slideHeight * 0.04;
    final dup = CanvasElement.fromJson(copy.toJson());
    // Preserve a distinct id.
    final withId = CanvasElement(
      id: id,
      type: dup.type,
      x: dup.x,
      y: dup.y,
      width: dup.width,
      height: dup.height,
      rotation: dup.rotation,
      imagePath: dup.imagePath,
      cropLeft: dup.cropLeft,
      cropTop: dup.cropTop,
      cropRight: dup.cropRight,
      cropBottom: dup.cropBottom,
      text: dup.text,
      fontSize: dup.fontSize,
      colorValue: dup.colorValue,
      shapeKind: dup.shapeKind,
      cornerRadius: dup.cornerRadius,
      opacity: dup.opacity,
    );
    if (e.type == ElementType.image && decodedImages[e.id] != null) {
      decodedImages[id] = decodedImages[e.id]!;
    }
    project.elements.add(withId);
    selectedId = id;
    commit();
  }

  void deleteSelected() {
    if (selectedId == null) return;
    project.elements.removeWhere((e) => e.id == selectedId);
    selectedId = null;
    commit();
  }

  void bringForward() {
    final i = project.elements.indexWhere((e) => e.id == selectedId);
    if (i < 0 || i == project.elements.length - 1) return;
    final e = project.elements.removeAt(i);
    project.elements.insert(i + 1, e);
    commit();
  }

  void sendBackward() {
    final i = project.elements.indexWhere((e) => e.id == selectedId);
    if (i <= 0) return;
    final e = project.elements.removeAt(i);
    project.elements.insert(i - 1, e);
    commit();
  }
}
