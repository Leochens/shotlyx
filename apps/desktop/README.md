# Shotlyx Desktop

The desktop app is packaged with `electron-builder`. Packaged builds embed the
Vite renderer output from `apps/renderer/dist` and load it through Electron's local
`app://shotlyx` protocol. Packaged builds do not start a localhost web server.

## Preview packages

```sh
bun run --cwd apps/desktop dist:mac
bun run --cwd apps/desktop dist:win
```

The alpha targets macOS ARM64 and Windows x64. These commands write unsigned,
non-notarized preview artifacts to `apps/desktop/release`; they never upload
artifacts or contact a release service. Build the Windows target on Windows.
