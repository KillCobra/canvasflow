import 'package:flutter/material.dart';

/// Pure, dependency-free geometry for mapping a continuous canvas into
/// individual slide crops. Kept free of Flutter widgets and plugins so it is
/// trivially unit-testable.
///
/// The continuous canvas is `slideWidth * slideCount` wide and `slideHeight`
/// tall, measured in export pixels. Slide `i` occupies the horizontal band
/// `[i*slideWidth, (i+1)*slideWidth)`.
class SliceEngine {
  const SliceEngine();

  /// Returns the canvas-space rectangle for a given slide index.
  /// Throws [RangeError] if the index is out of bounds.
  static Rect slideRect({
    required int index,
    required double slideWidth,
    required double slideHeight,
    required int slideCount,
  }) {
    if (index < 0 || index >= slideCount) {
      throw RangeError.index(index, List.filled(slideCount, 0), 'index');
    }
    return Rect.fromLTWH(slideWidth * index, 0, slideWidth, slideHeight);
  }

  /// The full continuous-canvas size for a project configuration.
  static Size canvasSize({
    required double slideWidth,
    required double slideHeight,
    required int slideCount,
  }) =>
      Size(slideWidth * slideCount, slideHeight);

  /// Which slide index contains a given canvas-space x coordinate.
  /// Clamps to the valid range so points exactly on the right edge map to
  /// the last slide rather than overflowing.
  static int slideIndexForX({
    required double x,
    required double slideWidth,
    required int slideCount,
  }) {
    final i = (x / slideWidth).floor();
    if (i < 0) return 0;
    if (i >= slideCount) return slideCount - 1;
    return i;
  }

  /// Given an element's canvas rectangle, returns the set of slide indices it
  /// overlaps. An element spanning a slide boundary belongs to multiple slides,
  /// which is exactly how a "seamless" carousel panel is produced.
  static List<int> slidesForRect({
    required Rect rect,
    required double slideWidth,
    required int slideCount,
  }) {
    if (rect.width <= 0 || rect.height <= 0) return const [];
    final first = slideIndexForX(
        x: rect.left, slideWidth: slideWidth, slideCount: slideCount);
    // Use a hair inside the right edge so an element ending exactly on a
    // boundary does not count the next (empty) slide.
    final rightProbe = rect.right - 1e-6;
    final last = slideIndexForX(
        x: rightProbe, slideWidth: slideWidth, slideCount: slideCount);
    return [for (var i = first; i <= last; i++) i];
  }

  /// Translates a canvas-space rectangle into the local coordinate space of a
  /// single slide (origin at the slide's top-left). The returned rect may have
  /// negative origin or extend beyond the slide bounds when the element spans
  /// the boundary — the renderer clips to the slide, producing the seam-aligned
  /// split.
  static Rect rectInSlideSpace({
    required Rect canvasRect,
    required int slideIndex,
    required double slideWidth,
  }) {
    final dx = slideWidth * slideIndex;
    return Rect.fromLTWH(
        canvasRect.left - dx, canvasRect.top, canvasRect.width, canvasRect.height);
  }

  /// Verifies that slide crops tile the canvas with no gaps or overlaps.
  /// Used by tests to guarantee export boundaries align cleanly.
  static bool boundariesAlignCleanly({
    required double slideWidth,
    required double slideHeight,
    required int slideCount,
    double epsilon = 1e-6,
  }) {
    for (var i = 0; i < slideCount - 1; i++) {
      final a = slideRect(
          index: i,
          slideWidth: slideWidth,
          slideHeight: slideHeight,
          slideCount: slideCount);
      final b = slideRect(
          index: i + 1,
          slideWidth: slideWidth,
          slideHeight: slideHeight,
          slideCount: slideCount);
      // Right edge of a must equal left edge of b (no gap, no overlap).
      if ((a.right - b.left).abs() > epsilon) return false;
      if ((a.height - b.height).abs() > epsilon) return false;
    }
    return true;
  }
}
