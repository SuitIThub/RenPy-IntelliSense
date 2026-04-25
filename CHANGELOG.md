# Changelog

All notable changes to **Ren'Py IntelliSense** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
