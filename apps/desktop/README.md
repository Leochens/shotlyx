# Shotlyx Desktop Packaging

The desktop app is packaged with `electron-builder`. Packaged builds embed the
Vite renderer output from `apps/renderer/dist` and load it through Electron's local
`app://shotlyx` protocol. Packaged builds do not start a localhost web server.

## Local packages

```sh
bun run --cwd apps/desktop dist:mac
bun run --cwd apps/desktop dist:win
```

`dist:all` runs both macOS and Windows targets from one command. Building Windows
installers on macOS can require Wine; a Windows CI runner is usually more
predictable. Local `dist:*` commands only write artifacts to
`apps/desktop/release`; they do not upload to GitHub Releases.

## GitHub updater

The updater uses GitHub Releases through `electron-updater` and the publish
configuration in `electron-builder.yml`.

```sh
GH_TOKEN=... bun run --cwd apps/desktop publish:mac
GH_TOKEN=... bun run --cwd apps/desktop publish:win
```

macOS auto-update requires a signed app. Set the normal Apple Developer signing
and notarization environment variables in CI before publishing release builds.
