# Ren'Py Documentation Hover

[![Release workflow](https://github.com/SuitIThub/RenPy-IntelliSense/actions/workflows/release.yml/badge.svg)](https://github.com/SuitIThub/RenPy-IntelliSense/actions/workflows/release.yml)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/Suit-Ji.renpy-intellisense?label=VS%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=Suit-Ji.renpy-intellisense)
[![Open VSX](https://img.shields.io/open-vsx/v/Suit-Ji/renpy-intellisense?label=Open%20VSX&logo=openvsx)](https://open-vsx.org/extension/Suit-Ji/renpy-intellisense)
[![GitHub release](https://img.shields.io/github/v/release/SuitIThub/RenPy-IntelliSense?logo=github&label=release)](https://github.com/SuitIThub/RenPy-IntelliSense/releases)

VS Code / Cursor extension for `.rpy` / `.rpym` files: hovers show **your** docstrings when present, plus optional excerpts and links from the [official Ren'Py manual](https://www.renpy.org/doc/html/) for engine symbols.

Licensed under the [MIT License](LICENSE). Release history: [CHANGELOG](CHANGELOG.md).

---

## Building and installing

1. Install dependencies: `npm install`
2. Compile: `npm run compile`
3. Regenerate the bundled API index (optional, after Ren'Py doc changes): `npm run generate-index`
4. Press **F5** in VS Code with this folder open (**Run Extension**), or package a `.vsix` with `@vscode/vsce` if you use it.

---

## Writing docstrings the extension will find

Put the docstring **directly under** the definition, with only blank lines or a lone `pass` / `...` / `breakpoint()` between them (those are skipped so the docstring can still be detected).

### Python blocks (`"""` or `'''`)

Use normal triple-quoted strings, optionally with `r` / `u` prefixes:

```python
def add_event(self, *events):
    """
    Adds events to storage.
    """

class MyScreen:
    '''Short class doc.'''
```

### Ren'Py script (outside `python:` blocks)

If the block is commented with `#`, you can document it like this:

- Start with `# """` (or `# '''`), use `#` on continuation lines if you like, and close with `"""` on its own line (with or without `#` on that line), **or**
- Use several consecutive `#` lines as a plain comment doc block (no triple quotes).

The extension strips leading `#` for display.

### What counts as a “definition”

The scanner looks for these forms (indentation and same-line decorators like `@staticmethod` are supported in the usual Python way):

| Kind        | Example start |
|------------|----------------|
| Function   | `def name(` / `async def name(` |
| Class      | `class Name:` |
| Label      | `label name:` |
| Define     | `define name =` |
| Default    | `default name =` |
| Screen     | `screen name:` |
| Transform  | `transform name:` |
| Image      | `image name` (first identifier) |

Hover resolves the symbol under the cursor to the **latest** matching definition **on or above** that line (so headers and bodies both work).

---

## Docstring conventions (formatting in hovers)

The extension turns your text into Markdown for the hover panel. These styles are recognized:

### Section titles (Google / NumPy–style)

Standalone lines such as:

`Args:`, `Arguments:`, `Parameters:`, `Returns:`, `Yields:`, `Raises:`, `Note` / `Notes:`, `Warning:`, `Example` / `Examples:`, `Attributes:`, `See Also:`

are turned into bold headings (e.g. **Parameters:**).

### Epydoc-style tags

| Input | Rendered roughly as |
|--------|----------------------|
| `@param name description` | Bullet with **`name`** |
| `@returns description` | **Returns:** … |
| `@yield description` | **Yields:** … |
| `@raise(s) Exc description` | Bullet with **`Exc`** |
| `@type name description` | Type line for **`name`** |

### Inline code

- Double backticks (reST style): `` ``code`` `` → `` `code` ``
- Ordinary single backticks work as usual in Markdown.

### Doctest lines

Lines starting with `>>> ` or `... ` are wrapped in a `text` code fence for readability.

---

## Cross-referencing other code

### Sphinx-style roles (recommended for cross-refs)

Use backticks and a role name. When the name can be resolved to a **workspace** definition (`.rpy` / `.rpym`), the extension turns it into a **clickable link** in hovers and completion details (a `command:` link handled by this extension, not a raw `file:` URL — those often show up as plain text in the hover UI). **Ctrl+click** / **Cmd+click** the link to **open the file and move the cursor** to the matching definition line. The small italic suffix (`class`, `function`, …) is the Sphinx role. If there is no matching target, the name stays as inline code with a role hint only.

| Pattern | Typical use |
|---------|-------------|
| `` :class:`ClassName` `` | Classes |
| `` :func:`function_name` `` | Functions |
| `` :meth:`method_name` `` | Methods (same as func for display) |
| `` :ref:`some_label` `` | Any symbol name you use consistently |

**Workspace index:** The extension scans all `*.rpy` / `*.rpym` files in the workspace (excluding `node_modules`, `.git`, and common virtualenv folders) and keeps an in-memory index. **Opening** or **saving** a file updates that file’s slice of the index; deleting a file removes it.

**Disambiguating duplicate names:** If the same simple name appears more than once in the workspace (e.g. two `add_event` methods), use a **qualified** name built from the enclosing class chain, like Sphinx’s dotted form:

| Pattern | Meaning |
|---------|---------|
| `` :meth:`FragmentStorage.add_event` `` | Method `add_event` on class `FragmentStorage` |
| `` :class:`Outer.Inner` `` | Nested class `Inner` inside `Outer` |

If a simple name is **unique** workspace-wide, it still resolves without the prefix. If it is **ambiguous** (multiple matches), the link is not created until you qualify it.

You can also use the Sphinx “display” form (only the part before `<` is used for matching):

`` :class:`MyClass <MyClass>` ``

Examples:

```python
def push_screen(self):
    """
    See :class:`MyOverlay` and :func:`restore_screen` for pairing calls.
    Opens the screen defined in :meth:`FragmentStorage.add_event`.
    """
```

### Labels (`label foo` / `label chapter.start`)

For `label a.b`, you can reference the full name or often the **last segment** (`b`), depending on how the label was stored.

### Markdown links

Normal Markdown links `[text](url)` are left as-is, so you can link to the [Ren'Py manual](https://www.renpy.org/doc/html/) or your own docs.

### Ren'Py engine symbols

Built-ins (`renpy.music.play`, `Character`, screen actions, etc.) are covered by the bundled index and online hover when enabled—not by local `:func:` roles.

---

## Settings (`renpyDocHover.*`)

| Setting | Default | Meaning |
|---------|---------|---------|
| `fetchOnline` | `true` | Fetch manual pages for excerpts (needs network). |
| `cacheSize` | `400` | How many fetched pages to keep in memory. |
| `preferLocalDocstring` | `true` | Show your docstring when available. |
| `showOnlineDocsWithLocal` | `true` | If the symbol is also in the manual, add the online excerpt below a horizontal rule. |

---

## Limitations

- Cross-refs use the **workspace index**; symbols in unsaved buffers in *other* files may be stale until those files are saved (the **current** file always uses the editor buffer).
- Very complex same-line decorators (nested parentheses) may not be detected; put decorators on previous lines.
- Docstring extraction follows Python/Ren'Py text structure; invalid indentation may confuse detection.

If something is wrong with hovers, check that the file is `.rpy` / `.rpym` and that the cursor is on the symbol you expect (including on the `def` / `class` line for that symbol).
