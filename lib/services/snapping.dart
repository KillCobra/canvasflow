import '../models/canvas_models.dart';

/// Snapping result: adjusted offset plus the guide lines to draw.
class SnapResult {
  SnapResult(this.dx, this.dy, this.guides);
  final double dx;
  final double dy;
  final List<SnapGuide> guides;
}

class SnapGuide {
  SnapGuide.vertical(this.position) : isVertical = true;
  SnapGuide.horizontal(this.position) : isVertical = false;
  final bool isVertical;
  final double position; // canvas coordinate
}

/// Computes snap adjustments for a moving element against slide centers,
/// slide boundaries, canvas edges, and other elements. All in canvas space.
class Snapper {
  Snapper(this.project, {this.threshold = 18});

  final CanvasProject project;
  final double threshold;

  SnapResult snap(CanvasElement moving, double proposedX, double proposedY) {
    final guides = <SnapGuide>[];
    double x = proposedX;
    double y = proposedY;

    final movingCenterX = proposedX + moving.width / 2;
    final movingCenterY = proposedY + moving.height / 2;

    // Candidate vertical lines (x): each slide center + each boundary + canvas mid.
    final vlines = <double>[];
    for (var i = 0; i < project.slideCount; i++) {
      vlines.add(project.slideWidth * i); // left boundary
      vlines.add(project.slideWidth * i + project.slideWidth / 2); // center
    }
    vlines.add(project.canvasWidth); // right edge

    // Horizontal lines (y): top, middle, bottom of slide.
    final hlines = <double>[
      0,
      project.slideHeight / 2,
      project.slideHeight,
    ];

    // Snap element center to vertical lines.
    double bestVDelta = threshold;
    for (final line in vlines) {
      final d = (movingCenterX - line).abs();
      if (d < bestVDelta) {
        bestVDelta = d;
        x = line - moving.width / 2;
        guides
          ..removeWhere((g) => g.isVertical)
          ..add(SnapGuide.vertical(line));
      }
    }

    double bestHDelta = threshold;
    for (final line in hlines) {
      final d = (movingCenterY - line).abs();
      if (d < bestHDelta) {
        bestHDelta = d;
        y = line - moving.height / 2;
        guides
          ..removeWhere((g) => !g.isVertical)
          ..add(SnapGuide.horizontal(line));
      }
    }

    return SnapResult(x, y, guides);
  }
}
