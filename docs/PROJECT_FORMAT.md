# `.shotlyx` Project Format

The alpha project format is a visible directory:

```text
<name>-<project-id>.shotlyx/
├── project.json
└── media/
    └── managed/
```

`project.json` contains:

- `formatVersion`
- `savedAt`
- `project`: editor project state
- `media.assets`: media metadata

Writes use a temporary file and backup swap, and writes for the same project are
serialized.

## Media locations

Managed media:

```json
{ "mode": "managed" }
```

Linked media:

```json
{
	"mode": "linked",
	"sourcePath": "/absolute/path/to/source.mov"
}
```

The transient `missing` flag used by the UI is not persisted. Relinking changes
the source path. Consolidating copies the source file into `media/managed` and
changes the location to managed.

Native file-picker imports are linked by default. Files produced by Shotlyx,
clipboard/paste imports, and drag-and-drop imports are managed.

## Compatibility

`v0.1.0-alpha.1` uses format version 1 for the outer desktop document while the
inner editor project maintains its own migration version. Do not edit
`project.json` while Shotlyx is writing the project. Back up the entire
`.shotlyx` directory before manual changes.
