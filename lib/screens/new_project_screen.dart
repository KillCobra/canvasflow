import 'package:flutter/material.dart';
import '../models/canvas_models.dart';
import '../theme/app_theme.dart';

/// Choose a format, slide count, and start blank. Returns a [CanvasProject] via
/// Navigator.pop.
class NewProjectScreen extends StatefulWidget {
  const NewProjectScreen({super.key});

  @override
  State<NewProjectScreen> createState() => _NewProjectScreenState();
}

class _NewProjectScreenState extends State<NewProjectScreen> {
  CanvasFormat _format = CanvasFormat.squarePost;
  int _slides = 3;
  final _nameController = TextEditingController(text: 'Untitled');
  final _customW = TextEditingController(text: '1080');
  final _customH = TextEditingController(text: '1080');

  @override
  void dispose() {
    _nameController.dispose();
    _customW.dispose();
    _customH.dispose();
    super.dispose();
  }

  String? _validate() {
    if (_nameController.text.trim().isEmpty) return 'Give your project a name.';
    if (_slides < 2 || _slides > 10) return 'Choose between 2 and 10 slides.';
    if (_format == CanvasFormat.custom) {
      final w = double.tryParse(_customW.text);
      final h = double.tryParse(_customH.text);
      if (w == null || h == null || w < 200 || h < 200 || w > 4096 || h > 4096) {
        return 'Custom size must be 200–4096 px on each side.';
      }
    }
    return null;
  }

  void _create() {
    final err = _validate();
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
      return;
    }
    Size size;
    if (_format == CanvasFormat.custom) {
      size = Size(double.parse(_customW.text), double.parse(_customH.text));
    } else {
      size = _format.defaultSlideSize;
    }
    final now = DateTime.now();
    final project = CanvasProject(
      id: now.microsecondsSinceEpoch.toString(),
      name: _nameController.text.trim(),
      format: _format,
      slideCount: _slides,
      slideWidth: size.width,
      slideHeight: size.height,
      createdAt: now,
      updatedAt: now,
    );
    Navigator.of(context).pop(project);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New design')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Project name',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: 'e.g. Summer launch',
            ),
          ),
          const SizedBox(height: 24),
          Text('Format', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: CanvasFormat.values.map((f) {
              final selected = f == _format;
              return ChoiceChip(
                label: Text(f.label),
                selected: selected,
                onSelected: (_) => setState(() => _format = f),
                selectedColor: AppTheme.deepBlue,
                labelStyle: TextStyle(
                  color: selected ? Colors.white : AppTheme.inkText,
                  fontWeight: FontWeight.w600,
                ),
              );
            }).toList(),
          ),
          if (_format == CanvasFormat.custom) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _customW,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Width (px)', border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _customH,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Height (px)',
                        border: OutlineInputBorder()),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Slides', style: Theme.of(context).textTheme.titleMedium),
              Text('$_slides',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 18,
                      color: AppTheme.deepBlue)),
            ],
          ),
          Slider(
            value: _slides.toDouble(),
            min: 2,
            max: 10,
            divisions: 8,
            label: '$_slides',
            activeColor: AppTheme.deepBlue,
            onChanged: (v) => setState(() => _slides = v.round()),
          ),
          const Text('Carousels can have 2–10 slides.',
              style: TextStyle(color: AppTheme.mutedText)),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _create,
              child: const Text('Create blank canvas'),
            ),
          ),
        ],
      ),
    );
  }
}
