import 'package:flutter_test/flutter_test.dart';
import 'package:canvasflow/models/canvas_models.dart';

void main() {
  CanvasProject sample() {
    final now = DateTime.parse('2026-01-01T10:00:00.000');
    return CanvasProject(
      id: 'p1',
      name: 'Test project',
      format: CanvasFormat.squarePost,
      slideCount: 3,
      slideWidth: 1080,
      slideHeight: 1080,
      createdAt: now,
      updatedAt: now,
      elements: [
        CanvasElement(
          id: 'e1',
          type: ElementType.text,
          x: 100,
          y: 200,
          width: 500,
          height: 120,
          text: 'Hello',
          fontSize: 48,
          colorValue: 0xFF1F3A5F,
        ),
        CanvasElement(
          id: 'e2',
          type: ElementType.shape,
          x: 980,
          y: 100,
          width: 400,
          height: 400,
          shapeKind: ShapeKind.ellipse,
          colorValue: 0xFF2E5A8F,
        ),
      ],
    );
  }

  group('Project saving (serialization round-trip)', () {
    test('project survives JSON round-trip intact', () {
      final p = sample();
      final restored = CanvasProject.fromJsonString(p.toJsonString());

      expect(restored.id, p.id);
      expect(restored.name, p.name);
      expect(restored.format, p.format);
      expect(restored.slideCount, p.slideCount);
      expect(restored.slideWidth, p.slideWidth);
      expect(restored.slideHeight, p.slideHeight);
      expect(restored.backgroundColorValue, p.backgroundColorValue);
      expect(restored.elements.length, 2);
    });

    test('element fields round-trip correctly', () {
      final p = sample();
      final restored = CanvasProject.fromJsonString(p.toJsonString());

      final text = restored.elements.firstWhere((e) => e.id == 'e1');
      expect(text.type, ElementType.text);
      expect(text.text, 'Hello');
      expect(text.fontSize, 48);
      expect(text.colorValue, 0xFF1F3A5F);

      final shape = restored.elements.firstWhere((e) => e.id == 'e2');
      expect(shape.type, ElementType.shape);
      expect(shape.shapeKind, ShapeKind.ellipse);
      expect(shape.x, 980);
    });

    test('canvas width/height derive from slide size and count', () {
      final p = sample();
      expect(p.canvasWidth, 1080 * 3);
      expect(p.canvasHeight, 1080);
    });

    test('slideRect returns correct band for each slide', () {
      final p = sample();
      expect(p.slideRect(0).left, 0);
      expect(p.slideRect(1).left, 1080);
      expect(p.slideRect(2).left, 2160);
    });
  });

  group('Element transforms', () {
    test('copyWith updates only the given fields', () {
      final e = sample().elements.first;
      final moved = e.copyWith(x: 300, y: 400);
      expect(moved.x, 300);
      expect(moved.y, 400);
      expect(moved.text, e.text); // unchanged
      expect(moved.id, e.id);
    });

    test('rect reflects position and size', () {
      final e = sample().elements.first;
      expect(e.rect.left, 100);
      expect(e.rect.top, 200);
      expect(e.rect.width, 500);
      expect(e.rect.height, 120);
    });
  });
}
