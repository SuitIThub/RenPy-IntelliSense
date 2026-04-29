/**
 * Ren'Py: `label .child:` is relative to the previously defined label name.
 * @see https://www.renpy.org/doc/html/label.html
 */
export class LabelContextTracker {
  private lastAbsoluteQualified: string | null = null;

  /** Reset when starting a new file scan. */
  reset(): void {
    this.lastAbsoluteQualified = null;
  }

  /**
   * @param rawName label name from the line (may start with `.`)
   * @returns qualified full name and a short name (last segment) for indexing.
   */
  qualify(rawName: string): { qualified: string; simple: string } {
    let qualified: string;
    if (rawName.startsWith(".")) {
      qualified =
        this.lastAbsoluteQualified !== null && this.lastAbsoluteQualified.length > 0
          ? `${this.lastAbsoluteQualified}${rawName}`
          : rawName.startsWith(".")
            ? rawName.slice(1)
            : rawName;
    } else {
      qualified = rawName;
      this.lastAbsoluteQualified = qualified;
    }
    const simple = qualified.includes(".") ? qualified.split(".").pop()! : qualified;
    return { qualified, simple };
  }
}
