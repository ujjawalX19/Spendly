# ═══════════════════════════════════════════════════════════════
# Vittova ProGuard Rules
# ═══════════════════════════════════════════════════════════════

# ─── Capacitor Core ───────────────────────────────────────────
# Keep all Capacitor plugin classes and their annotations
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-dontwarn com.getcapacitor.**

# ─── Capacitor Bridge & WebView ───────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ─── Custom Vittova Plugins ──────────────────────────────────
# UPI Notification Plugin — must not be obfuscated since Capacitor
# resolves plugin classes by name via reflection.
-keep class com.spendly.app.UpiNotificationPlugin { *; }
-keep class com.spendly.app.PaymentNotificationListener { *; }
-keep class com.spendly.app.PaymentNotificationParser { *; }
-keep class com.spendly.app.PaymentNotificationParser$* { *; }
-keep class com.spendly.app.MainActivity { *; }

# ─── AndroidX / Support Libraries ────────────────────────────
-keep class androidx.core.content.FileProvider { *; }
-keep class androidx.webkit.** { *; }
-dontwarn androidx.**

# ─── Preserve line numbers for crash reporting ───────────────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ─── Prevent stripping of Capacitor plugin annotations ───────
-keepattributes *Annotation*
