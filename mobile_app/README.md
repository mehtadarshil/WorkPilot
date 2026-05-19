# WorkPilot mobile app

Flutter field app for WorkPilot CRM.

## API URL

| Build mode | API base URL |
|------------|----------------|
| **Debug** (`flutter run`) | `http://10.0.2.2:4000/api` on Android emulator, `http://127.0.0.1:4000/api` on iOS simulator |
| **Release** (`flutter build --release`, store) | `https://api.work-pilot.co/api` |

Override any mode:

```bash
flutter run --dart-define=API_BASE_URL=https://staging.example/api
```

Physical device on the same Wi‑Fi as your laptop (debug only):

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:4000/api
```

## Verify production API

```bash
curl -s https://api.work-pilot.co/api/health
```

Expected: `{"status":"ok",...}`
