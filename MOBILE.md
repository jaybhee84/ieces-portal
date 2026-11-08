# IECES Portal mobile apps

Android and iOS use the existing React screens and Supabase account/data.
The interface is bundled inside the app; no hosted website is needed to open it.
The launcher icon uses the desktop app artwork.

## Android APK

Install Node.js, Java 21 and the Android SDK (platform 36). Set `JAVA_HOME`
and `ANDROID_HOME`, then run:

```powershell
npm install
npm run mobile:apk
```

Install `android/app/build/outputs/apk/debug/app-debug.apk` on a test device.
This is a debug-signed APK for testing. Production distribution needs a release
signing key. Do not commit signing keys or passwords.

## GitHub builds

The **Android APK** workflow runs on pushes and pull requests to `main`, or
manually from **Actions → Android APK → Run workflow**. It runs the tests,
builds the Android app, and uploads an `IECES-Portal-Android-<run number>`
artifact. Download and extract the artifact to get `app-debug.apk`.

Version releases also run this workflow and attach the Android test APK to the
GitHub Release. Publication waits for both the Windows and Android builds.

No signing secrets are needed for these test APKs. Each fresh GitHub runner
generates a debug signing key, so installing a different build may require
uninstalling the previous app, which deletes its local data. Production updates
need a stable release signing key. The workflow does not publish store releases
or build iOS.

## iPhone/iPad

The native project is in `ios/App`. On a Mac with Xcode installed:

```sh
npm install
npm run mobile:ios
```

Select your signing team and device in Xcode. Building/signing iOS requires macOS;
an APK runs only on Android.

## Offline viewing

Sign in online first. Successful database reads are saved on this device for
that account. Reopen the app offline to view records already loaded with the
same filters/page. New searches, uncached pages, photos, exports requiring new
data, and first-time login need internet. Writes and uploads are blocked offline;
there is no queue of pending changes.

Offline access expires seven days after the last successful online sign-in/access
validation. Signing out deletes the saved records. Revoked server access cannot
be discovered offline; reconnecting checks access again.
Cached records remain in app storage: use a device screen lock. Android backup
is disabled. Removing the app also removes its local data.

Windows automatic updates are hidden on mobile. Native printing/sharing and
authenticated flows still need testing on real Android and iOS devices.

On phones, the school scene opens first. Swipe up or tap the up-arrow to sign in.
For superadmin sign-in, tap the school seal five times quickly; the app opens
the superadmin form. Your account must already have superadmin access.
Allow Camera when enrollment requests it. If previously denied, enable Camera
in the device settings for IECES Portal, then retry.
After regenerating icons, copy each density's ic_launcher.png to
ic_launcher_foreground.png as well; adaptive icons use that separate resource.

