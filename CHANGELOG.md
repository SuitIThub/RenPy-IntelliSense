# Changelog

All notable changes to **Ren'Py IntelliSense** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-04-25

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
