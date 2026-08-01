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

On an Apple Silicon development machine with Homebrew FFmpeg installed, build
a portable local bundle before packaging:

```bash
bun run --cwd apps/desktop prepare:ffmpeg:mac
```

This copies FFmpeg, FFprobe, and their non-system runtime libraries into the
ignored `darwin-arm64/` build-input directory, rewrites Mach-O references to
bundle-relative paths, ad-hoc signs the prepared binaries, and writes
`manifest.local.json`. The script reads the exact version, source URL, and
effective license from the locally installed Homebrew formula; it does not
download anything.

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
