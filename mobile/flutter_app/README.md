# KidsLoc Flutter app

## Android

- Application ID: `br.com.kidsloc.app`
- Flutter SDK: `3.47.9`

Install dependencies without changing the committed dependency lock:

```bash
flutter pub get --enforce-lockfile
```

Run on an Android device or emulator:

```bash
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Build a debug APK for internal testing:

```bash
flutter build apk --debug
```

The APK is generated at `build/app/outputs/flutter-apk/app-debug.apk`.

Use only the Supabase publishable key in the client. Never embed a service-role or secret key in the app.
