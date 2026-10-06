import 'package:flutter/material.dart';
import '../models/canvas_models.dart';
import '../services/project_store.dart';
import '../services/templates.dart';
import '../theme/app_theme.dart';
import 'new_project_screen.dart';
import 'editor_screen.dart';

/// Home: "New design", recent projects, and original starter templates grouped
/// by use case.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<ProjectSummary> _recent = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    final list = await ProjectStore.instance.listSummaries();
    if (!mounted) return;
    setState(() {
      _recent = list;
      _loading = false;
    });
  }

  Future<void> _openProject(String id) async {
    final project = await ProjectStore.instance.load(id);
    if (project == null || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => EditorScreen(project: project)),
    );
    _refresh();
  }

  Future<void> _newDesign() async {
    final created = await Navigator.of(context).push<CanvasProject>(
      MaterialPageRoute(builder: (_) => const NewProjectScreen()),
    );
    if (created != null && mounted) {
      await ProjectStore.instance.save(created);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => EditorScreen(project: created)),
      );
      _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final grouped = Templates.grouped();
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              title: const Text('CanvasFlow',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22)),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              sliver: SliverToBoxAdapter(
                child: _NewDesignCard(onTap: _newDesign),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
              sliver: SliverToBoxAdapter(
                child: Text('Recent projects',
                    style: Theme.of(context).textTheme.titleLarge),
              ),
            ),
            if (_loading)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            else if (_recent.isEmpty)
              const SliverToBoxAdapter(child: _EmptyRecent())
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.separated(
                  itemCount: _recent.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _RecentTile(
                    summary: _recent[i],
                    onTap: () => _openProject(_recent[i].id),
                    onChanged: _refresh,
                  ),
                ),
              ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
              sliver: SliverToBoxAdapter(
                child: Text('Starter templates',
                    style: Theme.of(context).textTheme.titleLarge),
              ),
            ),
            for (final entry in grouped.entries) ...[
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                sliver: SliverToBoxAdapter(
                  child: Text(entry.key,
                      style: Theme.of(context).textTheme.titleMedium),
                ),
              ),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 150,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: entry.value.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 12),
                    itemBuilder: (_, i) => _TemplateCard(
                      def: entry.value[i],
                      onTap: () async {
                        final id = DateTime.now()
                            .microsecondsSinceEpoch
                            .toString();
                        final project = entry.value[i].build(id);
                        await ProjectStore.instance.save(project);
                        if (!mounted) return;
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                              builder: (_) =>
                                  EditorScreen(project: project)),
                        );
                        _refresh();
                      },
                    ),
                  ),
                ),
              ),
            ],
            const SliverToBoxAdapter(child: SizedBox(height: 32)),
          ],
        ),
      ),
    );
  }
}

class _NewDesignCard extends StatelessWidget {
  const _NewDesignCard({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: AppTheme.deepBlue,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.15),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.add, color: Colors.white, size: 30),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text('New design',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w700)),
                  SizedBox(height: 4),
                  Text('Pick a format and start a canvas',
                      style: TextStyle(color: Colors.white70)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Colors.white70),
          ],
        ),
      ),
    );
  }
}

class _EmptyRecent extends StatelessWidget {
  const _EmptyRecent();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: AppTheme.warmSurface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppTheme.warmSurfaceAlt),
        ),
        child: Column(
          children: [
            const Icon(Icons.folder_open_outlined,
                size: 42, color: AppTheme.mutedText),
            const SizedBox(height: 12),
            Text('No projects yet',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text('Create your first design to see it here.',
                style: TextStyle(color: AppTheme.mutedText),
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _RecentTile extends StatelessWidget {
  const _RecentTile(
      {required this.summary, required this.onTap, required this.onChanged});
  final ProjectSummary summary;
  final VoidCallback onTap;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: AppTheme.warmSurfaceAlt,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.dashboard_customize_outlined,
              color: AppTheme.deepBlue),
        ),
        title: Text(summary.name,
            maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
            '${summary.formatLabel} · ${summary.slideCount} slides'),
        trailing: PopupMenuButton<String>(
          onSelected: (v) => _handle(context, v),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'rename', child: Text('Rename')),
            PopupMenuItem(value: 'duplicate', child: Text('Duplicate')),
            PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
        ),
        onTap: onTap,
      ),
    );
  }

  Future<void> _handle(BuildContext context, String action) async {
    switch (action) {
      case 'rename':
        final name = await _promptName(context, summary.name);
        if (name != null && name.trim().isNotEmpty) {
          final proj = await ProjectStore.instance.load(summary.id);
          if (proj != null) {
            proj.name = name.trim();
            await ProjectStore.instance.save(proj);
            onChanged();
          }
        }
      case 'duplicate':
        final proj = await ProjectStore.instance.load(summary.id);
        if (proj != null) {
          final id = DateTime.now().microsecondsSinceEpoch.toString();
          await ProjectStore.instance.duplicate(proj, id);
          onChanged();
        }
      case 'delete':
        final ok = await _confirmDelete(context, summary.name);
        if (ok == true) {
          await ProjectStore.instance.delete(summary.id);
          onChanged();
        }
    }
  }

  Future<String?> _promptName(BuildContext context, String current) {
    final c = TextEditingController(text: current);
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Rename project'),
        content: TextField(
          controller: c,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Project name'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, c.text),
              child: const Text('Save')),
        ],
      ),
    );
  }

  Future<bool?> _confirmDelete(BuildContext context, String name) {
    return showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete project?'),
        content: Text('"$name" will be permanently removed from this device.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTheme.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

class _TemplateCard extends StatelessWidget {
  const _TemplateCard({required this.def, required this.onTap});
  final TemplateDef def;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 130,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.warmSurface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.warmSurfaceAlt),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 70,
              decoration: BoxDecoration(
                color: AppTheme.warmSurfaceAlt,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Center(
                  child: Icon(Icons.auto_awesome_outlined,
                      color: AppTheme.deepBlue)),
            ),
            const SizedBox(height: 10),
            Text(def.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 13)),
            Text('${def.slideCount} slides',
                style: const TextStyle(
                    color: AppTheme.mutedText, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
