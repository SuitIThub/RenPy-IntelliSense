# Ren'Py IntelliSense

[![Release workflow](https://github.com/SuitIThub/RenPy-IntelliSense/actions/workflows/release.yml/badge.svg)](https://github.com/SuitIThub/RenPy-IntelliSense/actions/workflows/release.yml)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![Visual Studio Marketplace](https://img.shields.io/badge/VS%20Marketplace-Suit--Ji.renpy--intellisense-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=Suit-Ji.renpy-intellisense)
[![Open VSX](https://img.shields.io/open-vsx/v/Suit-Ji/renpy-intellisense?label=Open%20VSX&logo=openvsx)](https://open-vsx.org/extension/Suit-Ji/renpy-intellisense)
[![GitHub release](https://img.shields.io/github/v/release/SuitIThub/RenPy-IntelliSense?logo=github&label=release)](https://github.com/SuitIThub/RenPy-IntelliSense/releases)

VS Code / Cursor extension for `.rpy` / `.rpym` files: hovers show **your** docstrings when present, plus optional excerpts and links from the [official Ren'Py manual](https://www.renpy.org/doc/html/) for engine symbols.

Licensed under the [MIT License](LICENSE). Release history: [CHANGELOG](CHANGELOG.md).

---

## What's New in 1.3.0

- **Class-aware docstring cross-references**: `:func:`method`` in a class docstring automatically resolves to that class's method
- **Flexible Sphinx role syntax**: Supports `:func:`get_name() -> str``, `:func:`add_event(event: :class:`Event`)`` with nested roles, and more
- **Improved link format**: Only symbol names are clickable; parameters and return types stay as plain text with nested type links
- **Link tooltips**: Hover over links to see `filename.rpy:line` instead of command URLs
- **Better hover resolution**: Symbols in docstrings now correctly resolve to class members

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
- `:func:`function_name`` or `:func:`function_name()`` - Link to a function
- `:meth:`ClassName.method`` - Link to a method
- `:attr:`attribute_name`` - Link to an attribute

**Flexible syntax** - signatures are supported:
- `:func:`get_type() -> str`` - only `get_type` is linked, `() -> str` shown as text
- `:func:`add_event(event: :class:`Event`)`` - nested type references become separate links

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

### Flexible Syntax

Cross-references support various signature formats:

| Syntax | Result |
|--------|--------|
| ```:func:`get_name` ``` | `get_name` (linked) |
| ```:func:`get_name()` ``` | `get_name` (linked) + `()` |
| ```:func:`get_name() -> str` ``` | `get_name` (linked) + `() -> str` |
| ```:func:`add(event: :class:`Event`)` ``` | `add` (linked) + `(event: ` + `Event` (linked) + `)` |

Only the symbol name becomes the link; parameters and return types are plain text with their own nested links.

### Class-Aware Resolution

Inside a class or method docstring, unqualified names automatically resolve to that class's members:

```python
class EventStorage:
    """
    Storage for events.
    
    Methods:
    - :func:`add_event()` - adds an event   # Resolves to EventStorage.add_event
    - :func:`get_events()` - retrieves all  # Resolves to EventStorage.get_events
    """
```

### Qualified Names

For duplicate names or cross-class references, use the full path:

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

## For Developers

### Building and Installing

1. Install dependencies: `npm install`
2. Compile: `npm run compile`
3. Regenerate the API index (optional): `npm run generate-index`
4. Press **F5** to run the extension, or package with `@vscode/vsce`

### Project Structure

- `src/` - TypeScript source files
- `data/doc-index.json` - Bundled Ren'Py API index
- `scripts/` - Build scripts for index generation
