import 'package:uuid/uuid.dart';
import '../models/canvas_models.dart';

/// Original starter templates, generated in code (no third-party assets).
/// Each builds a [CanvasProject] with placeholder shapes/text the user replaces.
/// Grouped by use case for the home screen.
class TemplateDef {
  TemplateDef({
    required this.key,
    required this.title,
    required this.useCase,
    required this.format,
    required this.slideCount,
    required this.build,
  });

  final String key;
  final String title;
  final String useCase;
  final CanvasFormat format;
  final int slideCount;
  final CanvasProject Function(String id) build;
}

class Templates {
  static final _uuid = const Uuid();

  static List<TemplateDef> all() => [
        _blank(),
        _storySequence(),
        _featureTriptych(),
        _quoteCarousel(),
        _photoBand(),
      ];

  /// Groups for the home screen.
  static Map<String, List<TemplateDef>> grouped() {
    final out = <String, List<TemplateDef>>{};
    for (final t in all()) {
      out.putIfAbsent(t.useCase, () => []).add(t);
    }
    return out;
  }

  static CanvasProject _base(
    String id, {
    required String name,
    required CanvasFormat format,
    required int slides,
    int bg = 0xFFF5F1E9,
    int? gradient,
    List<CanvasElement> elements = const [],
  }) {
    final size = format.defaultSlideSize;
    final now = DateTime.now();
    return CanvasProject(
      id: id,
      name: name,
      format: format,
      slideCount: slides,
      slideWidth: size.width,
      slideHeight: size.height,
      createdAt: now,
      updatedAt: now,
      backgroundColorValue: bg,
      backgroundGradientValue: gradient,
      elements: List.of(elements),
    );
  }

  static TemplateDef _blank() => TemplateDef(
        key: 'blank',
        title: 'Blank canvas',
        useCase: 'Start fresh',
        format: CanvasFormat.squarePost,
        slideCount: 3,
        build: (id) => _base(id,
            name: 'Untitled', format: CanvasFormat.squarePost, slides: 3),
      );

  static TemplateDef _quoteCarousel() => TemplateDef(
        key: 'quote',
        title: 'Quote carousel',
        useCase: 'Words & stories',
        format: CanvasFormat.portraitPost,
        slideCount: 3,
        build: (id) {
          final p = _base(id,
              name: 'Quote carousel',
              format: CanvasFormat.portraitPost,
              slides: 3,
              bg: 0xFF1F3A5F);
          final w = p.slideWidth;
          final h = p.slideHeight;
          for (var i = 0; i < 3; i++) {
            p.elements.add(CanvasElement(
              id: _uuid.v4(),
              type: ElementType.text,
              x: w * i + w * 0.12,
              y: h * 0.42,
              width: w * 0.76,
              height: h * 0.2,
              text: i == 0 ? 'Your headline' : 'Add your words here',
              fontSize: w * 0.085,
              colorValue: 0xFFF5F1E9,
            ));
          }
          return p;
        },
      );

  static TemplateDef _featureTriptych() => TemplateDef(
        key: 'triptych',
        title: 'Three-panel feature',
        useCase: 'Products & showcases',
        format: CanvasFormat.squarePost,
        slideCount: 3,
        build: (id) {
          final p = _base(id,
              name: 'Three-panel feature',
              format: CanvasFormat.squarePost,
              slides: 3,
              bg: 0xFFEDE6D8);
          final w = p.slideWidth;
          final h = p.slideHeight;
          for (var i = 0; i < 3; i++) {
            p.elements.add(CanvasElement(
              id: _uuid.v4(),
              type: ElementType.shape,
              shapeKind: ShapeKind.roundedRectangle,
              x: w * i + w * 0.1,
              y: h * 0.12,
              width: w * 0.8,
              height: h * 0.6,
              colorValue: 0xFFFBF8F2,
              cornerRadius: 36,
            ));
            p.elements.add(CanvasElement(
              id: _uuid.v4(),
              type: ElementType.text,
              x: w * i + w * 0.1,
              y: h * 0.78,
              width: w * 0.8,
              height: h * 0.12,
              text: 'Feature ${i + 1}',
              fontSize: w * 0.06,
              colorValue: 0xFF1F3A5F,
            ));
          }
          return p;
        },
      );

  static TemplateDef _photoBand() => TemplateDef(
        key: 'photoband',
        title: 'Seamless photo band',
        useCase: 'Photo stories',
        format: CanvasFormat.squarePost,
        slideCount: 4,
        build: (id) {
          final p = _base(id,
              name: 'Seamless photo band',
              format: CanvasFormat.squarePost,
              slides: 4,
              bg: 0xFF23201A);
          final h = p.slideHeight;
          // One wide placeholder spanning all slides to demonstrate the seam.
          p.elements.add(CanvasElement(
            id: _uuid.v4(),
            type: ElementType.shape,
            shapeKind: ShapeKind.rectangle,
            x: 0,
            y: h * 0.2,
            width: p.canvasWidth,
            height: h * 0.6,
            colorValue: 0xFF2E5A8F,
            opacity: 0.5,
          ));
          return p;
        },
      );

  static TemplateDef _storySequence() => TemplateDef(
        key: 'story',
        title: 'Story sequence',
        useCase: 'Stories',
        format: CanvasFormat.story,
        slideCount: 3,
        build: (id) => _base(id,
            name: 'Story sequence',
            format: CanvasFormat.story,
            slides: 3,
            bg: 0xFFF5F1E9,
            gradient: 0xFFEDE6D8),
      );
}
