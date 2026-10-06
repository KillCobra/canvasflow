import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'theme/app_theme.dart';
import 'screens/onboarding_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final seenOnboarding = prefs.getBool('seen_onboarding') ?? false;
  runApp(CanvasFlowApp(seenOnboarding: seenOnboarding));
}

class CanvasFlowApp extends StatelessWidget {
  const CanvasFlowApp({super.key, required this.seenOnboarding});

  final bool seenOnboarding;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CanvasFlow',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: seenOnboarding ? const HomeScreen() : const OnboardingScreen(),
    );
  }
}
