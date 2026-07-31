# FFmpeg build inputs

FFmpeg and FFprobe binaries are not committed to Shotlyx. Prepare only the
official target needed by the current build:

```text
resources/ffmpeg/
├── darwin-arm64/
│   ├── ffmpeg
│   └── ffprobe
├── win32-x64/
│   ├── ffmpeg.exe
│   └── ffprobe.exe
└── manifest.local.json
```

Do not rename an x64 binary into the ARM64 directory. The packaging verifier
reads the Mach-O or PE header and rejects mismatched architectures.

Copy `manifest.example.json` to `manifest.local.json` and record the exact
bundle version, HTTPS source URL, effective license, and SHA-256 checksum of
each file. Replace every placeholder; release packaging rejects missing or
invalid provenance.

Verify the current host bundle:

```bash
bun run --cwd apps/desktop verify:ffmpeg
```

Release commands require the provenance manifest automatically:

```bash
bun run dist:desktop:mac
bun run dist:desktop:win
```

If the chosen FFmpeg build enables GPL components, binary distributors must
provide the notices and corresponding source access required by that build's
license. Record the actual source used; do not copy an unverified URL or
checksum from another platform.
