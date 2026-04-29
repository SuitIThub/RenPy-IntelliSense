# Changelog

All notable changes to **Ren'Py IntelliSense** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-04-29

### Fixed

- **Docstring markdown rendering**: Docstrings from indented class/function definitions now render markdown correctly. The issue was that leading whitespace from source indentation was preserved, which prevented markdown headings (like `### Parameters:`) from rendering properly. Docstrings are now dedented before markdown processing.

## [1.2.0] - 2026-04-25

### Added

- **Project-wide symbol resolution with Ren'Py `$` local scope rules**: definitions from other files are now used across hover, cross-reference links, completion docs, and signature help; `$ var = ...` (`variable_local`) remains file-local only.
- **Receiver/type inference for chained calls**: member calls like `obj.add_event(...)` can resolve to class-qualified methods via assignment analysis (`var = ClassName(...)`, `var = factory(...)` with return hints), including cross-file variable definitions.
- **Inheritance-aware method resolution**: subclass instances now resolve inherited methods from superclasses (e.g. `FragmentStorage` -> `EventStorage.add_event`).
- **Class hierarchy links in hover**: class hovers include a clickable hierarchy chain to jump to parent classes quickly.
- **Label hierarchy links in hover**: dotted labels (including relative sublabels) now show a clickable parent chain (e.g. `a.b.c -> a.b -> a`).

### Changed

- **Hover header format**: the header now shows the symbol kind (`method`, `function`, `class`, `label`, etc.) and uses a larger clickable link target for faster navigation.
- **Definition indexing robustness**: class/method qualification is now stable across blank/comment-only lines, improving qualified method lookup in real-world files.
- **Relative label qualification**: `label .child:` now links to the latest previous non-relative label (Ren'Py-correct base context), not the latest label overall.

## [1.1.4] - 2026-04-25

### Fixed

- **Member hover on `$` lines**: the receiver to the left of `.method` is parsed as the expression ending at the dot (not the whole line prefix), so cases like `$ aona = Person["key"].get_renpy_char()` resolve to `Person.get_renpy_char` instead of failing on `$ … = …`.
- **Hover word range**: identifier expansion no longer crosses `.`, so the hovered token is `get_renpy_char` (not `.get_renpy_char`), which restores correct detection of the `.` before the method for member-chain resolution.

### Added

- **Hover resolution for chained member access** (e.g. `Person["key"].get_renpy_char()`): resolves the method or attribute against the receiver expression (trailing `[...]` subscripts stripped from the receiver so indexed lookups match class-qualified defs like `Person.get_renpy_char`).
- **Ren'Py sublabels** (`label .child:`): labels starting with `.` are stored and matched as children of the previous label (full dotted name), consistent with Ren'Py’s relative label rules.

## [1.1.3] - 2026-04-25

### Added

- **`renpy` language contribution** in `package.json` for `.rpy` and `.rpym`, so the editor can bind Ren'Py scripts to a dedicated language id instead of Python.
- **Command: “Ren'Py IntelliSense: Apply recommended workspace settings”** — merges `files.associations` and `python.analysis.exclude` into `.vscode/settings.json` for the first workspace folder.

### Changed

- **Hover, completion, and signature-help providers** now register only for `language: renpy` (`file` and `untitled` schemes), not for `python`, reducing duplicate IntelliSense when the language id is Ren'Py.
- **Activation events**: removed `onLanguage:python`; added `workspaceContains` for `**/*.rpy` and `**/*.rpym` so the extension can load in Ren'Py projects before a file is opened.

## [1.1.2] - 2026-04-25

### Added

- **Ren'Py `$` script assignments**: Lines like `$ var1 = 1` are indexed as local variable definitions. Hover and docstring detection treat comment blocks above them like other variable-like definitions, and resolution prefers the nearest previous `$` assignment in the file (not the first global-style assignment elsewhere).

### Changed

- **Hover header layout**: The clickable symbol in local-definition hovers uses a larger heading (`##`), with relative file path and line number shown on a smaller subtitle line underneath.

## [1.1.1] - 2026-04-25

### Fixed

- Variable hover now prefers the original initialization for variable-like symbols and no longer includes unrelated later assignments.
- Multi-line `#` comment blocks above variable-like definitions are now rendered as separate lines in hover output.
- Signature help now correctly handles commas inside nested type/default expressions (for example `Dict[str, EventStorage]`) when splitting and highlighting parameters.
- Signature help now resolves ambiguous callees more reliably by falling back to nearest local and indexed candidates when unique global resolution is unavailable.
- Signature help now maps keyword arguments to the correct formal parameter even when `*args` appears earlier in the signature.
- Active parameter detection now works reliably when the cursor is inside an already written call (including cursor positions inside keyword names and around `=`).
- Signature argument binding was refactored to a structured parser/matcher for formal vs call arguments, improving accuracy across mixed positional and keyword argument calls.
- Signature help now supports nested calls by returning a signature stack for all currently open calls, with the innermost call marked as active.

## [1.1.0] - 2026-04-25

### Added

- **Comment-as-docstring support**: Comment blocks (`#` lines) directly above variable definitions (`define`, `default`, or plain Python assignments) are now recognized as docstrings.
- **Plain Python variable support**: Variables assigned with `=` (not just `define`/`default`) are now indexed and can have docstrings.
- **Class signature enhancement**: Signature help for classes now shows `class ClassName(param1, param2)` by combining the class name with `__init__` parameters.
- **Active parameter highlighting**: When typing function/method calls, the current parameter is highlighted in the signature help popup.
- **ATL keyword completions**: Context-aware completions for ATL (Animation and Transformation Language) properties (`xpos`, `ypos`, `alpha`, `zoom`, `rotate`, etc.), statements (`pause`, `repeat`, `parallel`, `block`, etc.), and warpers (`linear`, `ease`, `easein`, `easeout`, etc.) when inside transform blocks.
- **Screen language completions**: Context-aware completions for screen displayables (`text`, `button`, `vbox`, `hbox`, `viewport`, etc.), properties (`action`, `style`, `xalign`, etc.), actions (`Jump`, `Call`, `SetVariable`, `Show`, `Hide`, etc.), and statements (`use`, `if`, `for`, etc.) when inside screen blocks.
- **Persistent variable tracking**: Auto-complete suggestions for `persistent.*` variables based on usage across the workspace.

### Changed

- Improved signature help parameter parsing to correctly handle nested parentheses, brackets, and braces in default values.

## [1.0.3] - 2026-04-03

### Added

- Changelog file for Visual Studio Marketplace and Open VSX changelog tabs.

### Changed

- README: links to the MIT license and this changelog.

## [1.0.2] - 2026-04-03

### Fixed

- Visual Studio Marketplace badge link in README.md.

### Changed

- README updates.

## [1.0.1] - 2026-04-03

### Added

- Extension icon (`Ren'Py.png`) for marketplace listings.

## [1.0.0] - 2026-04-03

### Changed

- Package name and extension identifier to `renpy-intellisense`; display name **Ren'Py IntelliSense**.

## [0.1.0] - 2026-04-03

### Added

- Initial release: documentation hovers for `.rpy` and `.rpym`, local docstrings, bundled Ren'Py manual index, optional online excerpts, signature help, completions, and the cross-reference command.
- GitHub Actions release workflow (GitHub Releases, Visual Studio Marketplace, Open VSX), MIT license and repository metadata, README badges, publisher **Suit-Ji**.
