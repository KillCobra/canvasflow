import 'dart:convert';
import 'package:flutter/material.dart';

/// Supported output formats. Each defines a per-slide pixel size and the
/// aspect ratio used when laying out the continuous canvas.
enum CanvasFormat {
  squarePost,
  portraitPost,
  story,
  custom,
}

extension CanvasFormatInfo on CanvasFormat {
  String get label => switch (this) {
        CanvasFormat.squarePost => 'Square Post',
        CanvasFormat.portraitPost => 'Portrait Post',
        CanvasFormat.story => 'Story',
        CanvasFormat.custom => 'Custom',
      };

  /// Default per-slide export size in pixels.
  Size get defaultSlideSize => switch (this) {
        CanvasFormat.squarePost => const Size(1080, 1080),
        CanvasFormat.portraitPost => const Size(1080, 1350),
        CanvasFormat.story => const Size(1080, 1920),
        CanvasFormat.custom => const Size(1080, 1080),
      };
}

/// The kind of element placed on the canvas.
enum ElementType { image, text, shape }

/// Shape variants for decorative/shape elements.
enum ShapeKind { rectangle, ellipse, roundedRectangle, line }

/// A single editable element on the continuous canvas.
///
/// Position/size are stored in *canvas coordinates* (not screen pixels),
/// where the canvas width spans all slides. This keeps the model resolution
/// independent — the editor and the exporter both map from canvas space.
class CanvasElement {
  CanvasElement({
    required this.id,
    required this.type,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    this.rotation = 0.0,
    this.imagePath,
    this.cropLeft = 0.0,
    this.cropTop = 0.0,
    this.cropRight = 1.0,
    this.cropBottom = 1.0,
    this.text,
    this.fontSize = 48,
    this.colorValue = 0xFF1F3A5F,
    this.shapeKind,
    this.cornerRadius = 0,
    this.opacity = 1.0,
  });

  final String id;
  final ElementType type;

  // Transform (canvas coordinates).
  double x;
  double y;
  double width;
  double height;
  double rotation; // radians

  // Image element.
  String? imagePath;
  double cropLeft, cropTop, cropRight, cropBottom; // normalized 0..1

  // Text element.
  String? text;
  double fontSize;

  // Shared styling.
  int colorValue; // ARGB
  ShapeKind? shapeKind;
  double cornerRadius;
  double opacity;

  Color get color => Color(colorValue);

  Rect get rect => Rect.fromLTWH(x, y, width, height);

  CanvasElement copyWith({
    double? x,
    double? y,
    double? width,
    double? height,
    double? rotation,
    String? text,
    double? fontSize,
    int? colorValue,
    double? cornerRadius,
    double? opacity,
    double? cropLeft,
    double? cropTop,
    double? cropRight,
    double? cropBottom,
  }) {
    return CanvasElement(
      id: id,
      type: type,
      x: x ?? this.x,
      y: y ?? this.y,
      width: width ?? this.width,
      height: height ?? this.height,
      rotation: rotation ?? this.rotation,
      imagePath: imagePath,
      cropLeft: cropLeft ?? this.cropLeft,
      cropTop: cropTop ?? this.cropTop,
      cropRight: cropRight ?? this.cropRight,
      cropBottom: cropBottom ?? this.cropBottom,
      text: text ?? this.text,
      fontSize: fontSize ?? this.fontSize,
      colorValue: colorValue ?? this.colorValue,
      shapeKind: shapeKind,
      cornerRadius: cornerRadius ?? this.cornerRadius,
      opacity: opacity ?? this.opacity,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type.name,
        'x': x,
        'y': y,
        'width': width,
        'height': height,
        'rotation': rotation,
        'imagePath': imagePath,
        'cropLeft': cropLeft,
        'cropTop': cropTop,
        'cropRight': cropRight,
        'cropBottom': cropBottom,
        'text': text,
        'fontSize': fontSize,
        'colorValue': colorValue,
        'shapeKind': shapeKind?.name,
        'cornerRadius': cornerRadius,
        'opacity': opacity,
      };

  factory CanvasElement.fromJson(Map<String, dynamic> j) => CanvasElement(
        id: j['id'] as String,
        type: ElementType.values.byName(j['type'] as String),
        x: (j['x'] as num).toDouble(),
        y: (j['y'] as num).toDouble(),
        width: (j['width'] as num).toDouble(),
        height: (j['height'] as num).toDouble(),
        rotation: (j['rotation'] as num?)?.toDouble() ?? 0,
        imagePath: j['imagePath'] as String?,
        cropLeft: (j['cropLeft'] as num?)?.toDouble() ?? 0,
        cropTop: (j['cropTop'] as num?)?.toDouble() ?? 0,
        cropRight: (j['cropRight'] as num?)?.toDouble() ?? 1,
        cropBottom: (j['cropBottom'] as num?)?.toDouble() ?? 1,
        text: j['text'] as String?,
        fontSize: (j['fontSize'] as num?)?.toDouble() ?? 48,
        colorValue: (j['colorValue'] as num?)?.toInt() ?? 0xFF1F3A5F,
        shapeKind: j['shapeKind'] == null
            ? null
            : ShapeKind.values.byName(j['shapeKind'] as String),
        cornerRadius: (j['cornerRadius'] as num?)?.toDouble() ?? 0,
        opacity: (j['opacity'] as num?)?.toDouble() ?? 1.0,
      );
}

/// A project is a continuous canvas divided into N slides of a chosen format,
/// with an ordered list of elements and a background.
class CanvasProject {
  CanvasProject({
    required this.id,
    required this.name,
    required this.format,
    required this.slideCount,
    required this.slideWidth,
    required this.slideHeight,
    required this.createdAt,
    required this.updatedAt,
    List<CanvasElement>? elements,
    this.backgroundColorValue = 0xFFF5F1E9, // warm neutral
    this.backgroundGradientValue,
  }) : elements = elements ?? [];

  final String id;
  String name;
  CanvasFormat format;
  int slideCount;

  /// Per-slide export dimensions in pixels.
  double slideWidth;
  double slideHeight;

  DateTime createdAt;
  DateTime updatedAt;

  List<CanvasElement> elements;
  int backgroundColorValue;
  int? backgroundGradientValue; // optional second stop for a vertical gradient

  /// Total canvas size spanning all slides, in canvas coordinates
  /// (we use export pixels as the canvas unit for a 1:1 export mapping).
  double get canvasWidth => slideWidth * slideCount;
  double get canvasHeight => slideHeight;

  Color get backgroundColor => Color(backgroundColorValue);

  /// The x-range in canvas coordinates covered by [slideIndex].
  Rect slideRect(int slideIndex) =>
      Rect.fromLTWH(slideWidth * slideIndex, 0, slideWidth, slideHeight);

  CanvasProject copyMeta({String? name, DateTime? updatedAt}) {
    return CanvasProject(
      id: id,
      name: name ?? this.name,
      format: format,
      slideCount: slideCount,
      slideWidth: slideWidth,
      slideHeight: slideHeight,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      elements: elements,
      backgroundColorValue: backgroundColorValue,
      backgroundGradientValue: backgroundGradientValue,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'format': format.name,
        'slideCount': slideCount,
        'slideWidth': slideWidth,
        'slideHeight': slideHeight,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'backgroundColorValue': backgroundColorValue,
        'backgroundGradientValue': backgroundGradientValue,
        'elements': elements.map((e) => e.toJson()).toList(),
      };

  String toJsonString() => jsonEncode(toJson());

  factory CanvasProject.fromJson(Map<String, dynamic> j) => CanvasProject(
        id: j['id'] as String,
        name: j['name'] as String,
        format: CanvasFormat.values.byName(j['format'] as String),
        slideCount: (j['slideCount'] as num).toInt(),
        slideWidth: (j['slideWidth'] as num).toDouble(),
        slideHeight: (j['slideHeight'] as num).toDouble(),
        createdAt: DateTime.parse(j['createdAt'] as String),
        updatedAt: DateTime.parse(j['updatedAt'] as String),
        backgroundColorValue:
            (j['backgroundColorValue'] as num?)?.toInt() ?? 0xFFF5F1E9,
        backgroundGradientValue:
            (j['backgroundGradientValue'] as num?)?.toInt(),
        elements: (j['elements'] as List<dynamic>)
            .map((e) => CanvasElement.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  factory CanvasProject.fromJsonString(String s) =>
      CanvasProject.fromJson(jsonDecode(s) as Map<String, dynamic>);
}

/// Lightweight record for the home-screen project list (no element payload).
class ProjectSummary {
  ProjectSummary({
    required this.id,
    required this.name,
    required this.updatedAt,
    required this.slideCount,
    required this.formatLabel,
  });

  final String id;
  final String name;
  final DateTime updatedAt;
  final int slideCount;
  final String formatLabel;
}
