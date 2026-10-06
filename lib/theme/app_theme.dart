import 'package:flutter/material.dart';

/// CanvasFlow's original visual identity:
/// warm neutral surfaces, deep blue accents, restrained rounded controls,
/// legible type, generous spacing, accessible contrast and large touch targets.
class AppTheme {
  AppTheme._();

  // Palette (original).
  static const Color warmBackground = Color(0xFFF5F1E9);
  static const Color warmSurface = Color(0xFFFBF8F2);
  static const Color warmSurfaceAlt = Color(0xFFEDE6D8);
  static const Color deepBlue = Color(0xFF1F3A5F);
  static const Color deepBlueBright = Color(0xFF2E5A8F);
  static const Color inkText = Color(0xFF23201A);
  static const Color mutedText = Color(0xFF6B6457);
  static const Color danger = Color(0xFFA6412E);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: deepBlue,
      brightness: Brightness.light,
      primary: deepBlue,
      surface: warmSurface,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: warmBackground,
      textTheme: const TextTheme(
        headlineMedium: TextStyle(
            fontWeight: FontWeight.w700, color: inkText, letterSpacing: -0.3),
        titleLarge: TextStyle(fontWeight: FontWeight.w700, color: inkText),
        titleMedium: TextStyle(fontWeight: FontWeight.w600, color: inkText),
        bodyMedium: TextStyle(color: inkText, height: 1.4),
        bodySmall: TextStyle(color: mutedText),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: warmBackground,
        foregroundColor: inkText,
        elevation: 0,
        centerTitle: false,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: deepBlue,
          foregroundColor: Colors.white,
          minimumSize: const Size(64, 52), // large touch target
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: deepBlue,
          minimumSize: const Size(64, 52),
          side: const BorderSide(color: deepBlue, width: 1.5),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14)),
        ),
      ),
      cardTheme: CardTheme(
        color: warmSurface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: warmSurfaceAlt, width: 1),
        ),
      ),
      chipTheme: const ChipThemeData(
        backgroundColor: warmSurfaceAlt,
        labelStyle: TextStyle(color: inkText, fontWeight: FontWeight.w600),
        side: BorderSide.none,
      ),
      iconTheme: const IconThemeData(color: deepBlue),
      dividerColor: warmSurfaceAlt,
    );
  }
}
