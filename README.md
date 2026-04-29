# Ren'Py IntelliSense

[![Release workflow](https://github.com/SuitIThub/RenPy-IntelliSense/actions/workflows/release.yml/badge.svg)](https://github.com/SuitIThub/RenPy-IntelliSense/actions/workflows/release.yml)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/Suit-Ji.renpy-intellisense?label=VS%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=Suit-Ji.renpy-intellisense)
[![Open VSX](https://img.shields.io/open-vsx/v/Suit-Ji/renpy-intellisense?label=Open%20VSX&logo=openvsx)](https://open-vsx.org/extension/Suit-Ji/renpy-intellisense)
[![GitHub release](https://img.shields.io/github/v/release/SuitIThub/RenPy-IntelliSense?logo=github&label=release)](https://github.com/SuitIThub/RenPy-IntelliSense/releases)

VS Code / Cursor extension for `.rpy` / `.rpym` files: hovers show **your** docstrings when present, plus optional excerpts and links from the [official Ren'Py manual](https://www.renpy.org/doc/html/) for engine symbols.

Licensed under the [MIT License](LICENSE). Release history: [CHANGELOG](CHANGELOG.md).

---

## What's New in 1.2.0

- **Project-wide symbol resolution** with correct Ren'Py `$` local behavior (`$` assignments stay file-local; other definitions are available across files)
- **Chained member resolution with receiver inference** (e.g. `storage.add_event(...)` resolves from assignments and return-type hints)
- **Inheritance-aware method lookup** (subclass instances can resolve methods defined in superclasses)
- **Improved hover UX** with kind-aware headers (e.g. `(method)`, `(class)`), larger clickable headers, clickable class hierarchy links, and clickable label hierarchy links
- **Ren'Py-correct relative sublabel base tracking** (`label .child:` resolves against the latest previous non-relative label)

---

## Setup (avoid Python / Pylance on `.rpy`)

VS Code merges results from **every** provider registered for a document’s **language id**. If `.rpy` files are treated as **Python**, Pylance can still contribute hovers and completions alongside this extension.

**Recommended:**

1. Map Ren'Py scripts to the `renpy` language id (this extension contributes that id for `.rpy` / `.rpym`).
2. Tell Python analysis to ignore Ren'Py files.

**Option A — command (workspace folder required)**  
Run **“Ren'Py IntelliSense: Apply recommended workspace settings”** from the Command Palette. It creates or updates `.vscode/settings.json` with the keys below.

**Option B — manual `settings.json`**

```json
{
  "files.associations": {
    "*.rpy": "renpy",
    "*.rpym": "renpy"
  },
  "python.analysis.exclude": [
    "**/*.rpy",
    "**/*.rpym"
  ]
}
```

After changing associations, **reload the window** or **reopen** `.rpy` files so the language mode updates.

---

## Features

### Hover Documentation

Hover over any symbol to see:
- Your local docstrings (from triple-quoted strings or comment blocks)
- Excerpts from the official Ren'Py documentation (optional, requires network)
- Clickable links to jump to definitions

### Signature Help

When typing function or class calls, see the signature with:
- Full parameter list
- **Active parameter highlighting** - the current parameter is highlighted as you type
- For classes, shows `class ClassName(param1, param2)` by combining the class name with `__init__` parameters

### Smart Completions

Context-aware completions for:
- **Your symbols**: Classes, functions, labels, screens, transforms, images, and variables
- **Ren'Py built-ins**: All documented engine symbols
- **ATL keywords**: Properties (`xpos`, `alpha`, `zoom`, `rotate`), statements (`pause`, `repeat`, `parallel`), and warpers (`linear`, `ease`, `easein`) when inside transforms
- **Screen language**: Displayables (`text`, `button`, `vbox`), properties (`action`, `style`), and actions (`Jump`, `SetVariable`, `Show`) when inside screens
- **Persistent variables**: Auto-complete for `persistent.*` based on usage in your project

### Cross-References

Use Sphinx-style roles in docstrings to create clickable links:
- `:class:`ClassName`` - Link to a class
- `:func:`function_name`` - Link to a function
- `:meth:`ClassName.method`` - Link to a method

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `renpyDocHover.fetchOnline` | `true` | Fetch documentation from renpy.org (needs network) |
| `renpyDocHover.cacheSize` | `400` | Number of fetched pages to cache in memory |
| `renpyDocHover.preferLocalDocstring` | `true` | Show your docstrings when available |
| `renpyDocHover.showOnlineDocsWithLocal` | `true` | Show online docs alongside local docstrings |

---

## Writing Docstrings

The extension recognizes docstrings in several formats.

### Triple-Quoted Strings (Python style)

```python
def add_event(self, *events):
    """
    Adds events to storage.
    
    @param events: Events to add
    """

class MyScreen:
    '''Short class doc.'''
```

### Comment Blocks Above Variables

Comment blocks directly above variable definitions are treated as docstrings:

```renpy
# Configuration for the main character.
# Controls appearance and behavior.
define mc = Character("Alex")

# Tracks whether the player has completed the tutorial.
default tutorial_done = False
```

### Ren'Py Script Comments

For code outside `python:` blocks, use `#` comments:

```renpy
# """
# This is a docstring for the label below.
# """
label start:
    pass
```

Or use consecutive `#` lines as a plain comment block.

### Supported Definition Types

| Kind | Example |
|------|---------|
| Function | `def name(` / `async def name(` |
| Class | `class Name:` |
| Label | `label name:` |
| Define | `define name =` |
| Default | `default name =` |
| Screen | `screen name:` |
| Transform | `transform name:` |
| Image | `image name` |
| Variable | `name =` (plain Python assignment) |

---

## Docstring Formatting

The extension converts your docstrings to Markdown for display.

### Section Headers

These are rendered as bold headings:
`Args:`, `Parameters:`, `Returns:`, `Yields:`, `Raises:`, `Note:`, `Warning:`, `Example:`, `Attributes:`, `See Also:`

### Epydoc Tags

| Tag | Rendered as |
|-----|-------------|
| `@param name desc` | Bullet with **`name`** |
| `@returns desc` | **Returns:** ... |
| `@raises Exc desc` | Bullet with **`Exc`** |
| `@type name desc` | Type line for **`name`** |

### Code Formatting

- Double backticks: ``` ``code`` ``` → `` `code` ``
- Single backticks work as normal Markdown
- Lines starting with `>>> ` are wrapped in code fences

---

## Cross-Reference Links

### Sphinx-Style Roles

Reference other code in your docstrings with clickable links:

```python
def push_screen(self):
    """
    See :class:`MyOverlay` and :func:`restore_screen` for pairing.
    Uses :meth:`FragmentStorage.add_event` internally.
    """
```

**Ctrl+click** / **Cmd+click** links to jump to the definition.

### Qualified Names

For duplicate names, use the full path:

| Pattern | Meaning |
|---------|---------|
| `:meth:`FragmentStorage.add_event`` | Method on specific class |
| `:class:`Outer.Inner`` | Nested class |

### Workspace Index

The extension indexes all `.rpy` / `.rpym` files in your workspace. The index updates when files are opened, saved, or deleted.

---

## Limitations

- Cross-refs use the workspace index; unsaved changes in other files may be stale until saved
- Complex same-line decorators with nested parentheses may not be detected; put decorators on separate lines
- Invalid indentation may confuse docstring detection

---

### Go to Definition

Press **F12** or **Ctrl+Click** on any symbol to jump to its definition. Works across files in your workspace.

### Find All References

Press **Shift+F12** to find all usages of a symbol across your project.

### Outline View

The sidebar Outline panel shows all symbols in the current file:
- Classes, functions, and methods
- Labels and screens
- Transforms and images
- Variables and constants

---

## For Developers

### Architecture

This extension is built as a **Language Server Protocol (LSP)** implementation, providing:

- **Editor-agnostic**: The server can be used with any LSP-compatible editor
- **Better performance**: Incremental parsing and separate process
- **Maintainable**: Clear separation between client (VS Code) and server logic

### Building and Installing

This is a pnpm monorepo with three packages:

```
packages/
  shared/    # Shared types and constants
  server/    # Language Server implementation
  client/    # VS Code client extension
```

**Setup:**

1. Install pnpm: `npm install -g pnpm`
2. Install dependencies: `pnpm install`
3. Compile all packages: `pnpm run compile`
4. Regenerate the API index (optional): `npm run generate-index`
5. Press **F5** to run the extension in development mode

**Packaging:**

```bash
# Package for distribution
pnpm run compile
cd packages/client
npx @vscode/vsce package
```

### Project Structure

```
packages/
  shared/src/           # Shared types (IndexedSymbol, DefKind, etc.)
  server/src/
    server.ts           # LSP server entry point
    analysis/           # Symbol scanning, inference, docstring extraction
    features/           # LSP feature handlers (hover, completion, etc.)
    data/               # ATL/screen keywords, doc links
  client/src/
    extension.ts        # VS Code client
data/
  doc-index.json        # Bundled Ren'Py API index
scripts/
  generate-index.mjs    # Index generation script
```

### Legacy Source

The original single-package source is preserved in `src/` for reference during migration.
