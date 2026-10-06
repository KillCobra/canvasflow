import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:canvasflow/models/canvas_models.dart';
import 'package:canvasflow/services/slice_engine.dart';

void main() {
  group('Slide sizing', () {
    test('format default sizes are correct', () {
      expect(CanvasFormat.squarePost.defaultSlideSize, const Size(1080, 1080));
      expect(CanvasFormat.portraitPost.defaultSlideSize, const Size(1080, 1350));
      expect(CanvasFormat.story.defaultSlideSize, const Size(1080, 1920));
    });

    test('canvas size spans all slides', () {
      final size = SliceEngine.canvasSize(
          slideWidth: 1080, slideHeight: 1080, slideCount: 4);
      expect(size.width, 1080 * 4);
      expect(size.height, 1080);
    });

    test('each slide rect has the exact slide dimensions', () {
      for (var i = 0; i < 5; i++) {
        final r = SliceEngine.slideRect(
            index: i, slideWidth: 1080, slideHeight: 1350, slideCount: 5);
        expect(r.width, 1080);
        expect(r.height, 1350);
        expect(r.left, 1080.0 * i);
      }
    });

    test('out of range slide index throws', () {
      expect(
        () => SliceEngine.slideRect(
            index: 5, slideWidth: 1080, slideHeight: 1080, slideCount: 5),
        throwsRangeError,
      );
    });
  });

  group('Canvas-to-slide cropping', () {
    test('slideIndexForX maps coordinates to the right slide', () {
      expect(
          SliceEngine.slideIndexForX(x: 0, slideWidth: 1080, slideCount: 3), 0);
      expect(
          SliceEngine.slideIndexForX(x: 1079, slideWidth: 1080, slideCount: 3),
          0);
      expect(
          SliceEngine.slideIndexForX(x: 1080, slideWidth: 1080, slideCount: 3),
          1);
      expect(
          SliceEngine.slideIndexForX(x: 2160, slideWidth: 1080, slideCount: 3),
          2);
    });

    test('slideIndexForX clamps out-of-bounds coordinates', () {
      expect(
          SliceEngine.slideIndexForX(x: -50, slideWidth: 1080, slideCount: 3),
          0);
      expect(
          SliceEngine.slideIndexForX(
              x: 99999, slideWidth: 1080, slideCount: 3),
          2);
    });

    test('element fully inside one slide belongs to just that slide', () {
      final rect = Rect.fromLTWH(1150, 100, 400, 400); // within slide 1
      final slides = SliceEngine.slidesForRect(
          rect: rect, slideWidth: 1080, slideCount: 3);
      expect(slides, [1]);
    });

    test('element spanning a boundary belongs to both slides (seamless)', () {
      final rect = Rect.fromLTWH(980, 100, 400, 400); // crosses 1080 boundary
      final slides = SliceEngine.slidesForRect(
          rect: rect, slideWidth: 1080, slideCount: 3);
      expect(slides, [0, 1]);
    });

    test('wide element spanning all slides belongs to all', () {
      final rect = Rect.fromLTWH(0, 0, 1080 * 3, 500);
      final slides = SliceEngine.slidesForRect(
          rect: rect, slideWidth: 1080, slideCount: 3);
      expect(slides, [0, 1, 2]);
    });

    test('element ending exactly on a boundary does not spill to next slide',
        () {
      final rect = Rect.fromLTWH(540, 0, 540, 400); // ends exactly at 1080
      final slides = SliceEngine.slidesForRect(
          rect: rect, slideWidth: 1080, slideCount: 3);
      expect(slides, [0]);
    });

    test('rectInSlideSpace offsets correctly for the seam split', () {
      // Element at canvas x=980 spanning into slide 1.
      final canvasRect = Rect.fromLTWH(980, 100, 400, 400);
      // In slide 0 space, left stays 980.
      final inS0 = SliceEngine.rectInSlideSpace(
          canvasRect: canvasRect, slideIndex: 0, slideWidth: 1080);
      expect(inS0.left, 980);
      // In slide 1 space, left becomes 980 - 1080 = -100 (the part that
      // continues from the previous slide).
      final inS1 = SliceEngine.rectInSlideSpace(
          canvasRect: canvasRect, slideIndex: 1, slideWidth: 1080);
      expect(inS1.left, -100);
      expect(inS1.width, 400);
    });
  });

  group('Export boundary alignment', () {
    test('boundaries align cleanly with no gaps or overlaps', () {
      expect(
        SliceEngine.boundariesAlignCleanly(
            slideWidth: 1080, slideHeight: 1080, slideCount: 6),
        isTrue,
      );
    });

    test('alignment holds for custom non-integer sizes', () {
      expect(
        SliceEngine.boundariesAlignCleanly(
            slideWidth: 1033.5, slideHeight: 1291.0, slideCount: 4),
        isTrue,
      );
    });

    test('adjacent slide rects share the exact seam coordinate', () {
      final a = SliceEngine.slideRect(
          index: 0, slideWidth: 1080, slideHeight: 1080, slideCount: 2);
      final b = SliceEngine.slideRect(
          index: 1, slideWidth: 1080, slideHeight: 1080, slideCount: 2);
      expect(a.right, b.left); // no gap, no overlap at the seam
    });
  });
}
