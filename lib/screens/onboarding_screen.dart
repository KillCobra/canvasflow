import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_theme.dart';
import 'home_screen.dart';

/// Brief, account-free onboarding. Explains the app, then lets the user start
/// a project immediately (no sign-up).
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _pages = [
    _OnboardPage(
      icon: Icons.view_carousel_outlined,
      title: 'Design across slides',
      body:
          'Lay out photos and text on one continuous canvas. CanvasFlow keeps '
          'everything connected from the first slide to the last.',
    ),
    _OnboardPage(
      icon: Icons.auto_awesome_mosaic_outlined,
      title: 'Split into clean panels',
      body:
          'Export your canvas into correctly sized slides that line up at every '
          'seam — ready to swipe through as a carousel.',
    ),
    _OnboardPage(
      icon: Icons.lock_outline,
      title: 'Yours, on your device',
      body:
          'No account needed. Your photos and drafts stay on your device by '
          'default. Just start creating.',
    ),
  ];

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('seen_onboarding', true);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const HomeScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _pages.length - 1;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: TextButton(
                  onPressed: _finish,
                  child: const Text('Skip'),
                ),
              ),
            ),
            Expanded(
              child: PageView(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                children: _pages,
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_pages.length, (i) {
                final active = i == _page;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: active ? 22 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: active ? AppTheme.deepBlue : AppTheme.warmSurfaceAlt,
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    if (isLast) {
                      _finish();
                    } else {
                      _controller.nextPage(
                        duration: const Duration(milliseconds: 280),
                        curve: Curves.easeOut,
                      );
                    }
                  },
                  child: Text(isLast ? 'Start creating' : 'Next'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnboardPage extends StatelessWidget {
  const _OnboardPage(
      {required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: AppTheme.warmSurfaceAlt,
              borderRadius: BorderRadius.circular(28),
            ),
            child: Icon(icon, size: 56, color: AppTheme.deepBlue),
          ),
          const SizedBox(height: 32),
          Text(title,
              style: Theme.of(context).textTheme.headlineMedium,
              textAlign: TextAlign.center),
          const SizedBox(height: 16),
          Text(body,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
