import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import '../models/canvas_models.dart';

/// Persists projects as JSON files on-device and maintains a lightweight index
/// for the home screen. Imported media is referenced by on-device file paths
/// and copied into the app's documents directory so projects stay portable and
/// media remains local by default.
class ProjectStore {
  ProjectStore._();
  static final ProjectStore instance = ProjectStore._();

  Directory? _root;

  Future<Directory> _projectsDir() async {
    if (_root != null) return _root!;
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(docs.path, 'canvasflow', 'projects'));
    if (!await dir.exists()) await dir.create(recursive: true);
    _root = dir;
    return dir;
  }

  Future<Directory> mediaDir() async {
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(docs.path, 'canvasflow', 'media'));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  File _projectFile(Directory dir, String id) =>
      File(p.join(dir.path, '$id.json'));

  /// Autosave / save a project.
  Future<void> save(CanvasProject project) async {
    final dir = await _projectsDir();
    project.updatedAt = DateTime.now();
    await _projectFile(dir, project.id).writeAsString(project.toJsonString());
  }

  Future<CanvasProject?> load(String id) async {
    final dir = await _projectsDir();
    final f = _projectFile(dir, id);
    if (!await f.exists()) return null;
    return CanvasProject.fromJsonString(await f.readAsString());
  }

  Future<void> delete(String id) async {
    final dir = await _projectsDir();
    final f = _projectFile(dir, id);
    if (await f.exists()) await f.delete();
  }

  /// Duplicate a project under a new id and name.
  Future<CanvasProject> duplicate(CanvasProject source, String newId,
      {String? newName}) async {
    final copy = CanvasProject.fromJsonString(source.toJsonString());
    final now = DateTime.now();
    final dup = CanvasProject(
      id: newId,
      name: newName ?? '${source.name} copy',
      format: copy.format,
      slideCount: copy.slideCount,
      slideWidth: copy.slideWidth,
      slideHeight: copy.slideHeight,
      createdAt: now,
      updatedAt: now,
      elements: copy.elements,
      backgroundColorValue: copy.backgroundColorValue,
      backgroundGradientValue: copy.backgroundGradientValue,
    );
    await save(dup);
    return dup;
  }

  /// Returns summaries sorted by most-recently updated.
  Future<List<ProjectSummary>> listSummaries() async {
    final dir = await _projectsDir();
    final files = dir
        .listSync()
        .whereType<File>()
        .where((f) => f.path.endsWith('.json'));
    final out = <ProjectSummary>[];
    for (final f in files) {
      try {
        final j = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
        out.add(ProjectSummary(
          id: j['id'] as String,
          name: j['name'] as String,
          updatedAt: DateTime.parse(j['updatedAt'] as String),
          slideCount: (j['slideCount'] as num).toInt(),
          formatLabel: CanvasFormat.values
              .byName(j['format'] as String)
              .label,
        ));
      } catch (_) {
        // Skip unreadable/corrupt files rather than crashing the home screen.
      }
    }
    out.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return out;
  }

  /// Copies a picked image into the app media directory and returns the new
  /// local path, keeping all media on-device by default.
  Future<String> importMedia(String sourcePath, String id) async {
    final dir = await mediaDir();
    final ext = p.extension(sourcePath);
    final dest = File(p.join(dir.path, '$id$ext'));
    await File(sourcePath).copy(dest.path);
    return dest.path;
  }
}
