/**
 * Screen language keywords, properties, and actions.
 */

export interface ScreenKeyword {
  name: string;
  snippet?: string;
  documentation: string;
  kind: "displayable" | "property" | "action" | "statement";
}

export const SCREEN_DISPLAYABLES: ScreenKeyword[] = [
  { name: "text", snippet: "text \"${1:text}\"", documentation: "Displays text.", kind: "displayable" },
  { name: "image", snippet: "image \"${1:image}\"", documentation: "Displays an image.", kind: "displayable" },
  { name: "imagebutton", snippet: "imagebutton:\n    idle \"${1:idle}\"\n    hover \"${2:hover}\"\n    action ${3:NullAction()}", documentation: "An image that acts as a button.", kind: "displayable" },
  { name: "textbutton", snippet: "textbutton \"${1:label}\" action ${2:NullAction()}", documentation: "A button with text.", kind: "displayable" },
  { name: "button", snippet: "button:\n    action ${1:NullAction()}\n    $0", documentation: "A generic button container.", kind: "displayable" },
  { name: "bar", snippet: "bar value ${1:value}", documentation: "Displays a horizontal bar.", kind: "displayable" },
  { name: "vbar", snippet: "vbar value ${1:value}", documentation: "Displays a vertical bar.", kind: "displayable" },
  { name: "slider", snippet: "slider value ${1:value}", documentation: "A draggable slider.", kind: "displayable" },
  { name: "vslider", snippet: "vslider value ${1:value}", documentation: "A vertical draggable slider.", kind: "displayable" },
  { name: "label", snippet: "label \"${1:text}\"", documentation: "A non-interactive text label.", kind: "displayable" },
  { name: "null", snippet: "null", documentation: "An empty displayable for spacing.", kind: "displayable" },
  { name: "add", snippet: "add ${1:displayable}", documentation: "Adds a displayable to the screen.", kind: "displayable" },
  { name: "timer", snippet: "timer ${1:delay} action ${2:NullAction()}", documentation: "Fires an action after a delay.", kind: "displayable" },
  { name: "key", snippet: "key \"${1:key}\" action ${2:NullAction()}", documentation: "Binds a key to an action.", kind: "displayable" },
  { name: "input", snippet: "input:\n    value ${1:value}", documentation: "A text input field.", kind: "displayable" },
  { name: "mousearea", snippet: "mousearea:\n    $0", documentation: "Detects mouse hover and clicks.", kind: "displayable" },
  { name: "drag", snippet: "drag:\n    $0", documentation: "A draggable displayable.", kind: "displayable" },
  { name: "draggroup", snippet: "draggroup:\n    $0", documentation: "Groups drags for interaction.", kind: "displayable" },
  { name: "viewport", snippet: "viewport:\n    scrollbars \"${1|both,vertical,horizontal|}\"\n    $0", documentation: "A scrollable viewport.", kind: "displayable" },
  { name: "vpgrid", snippet: "vpgrid:\n    cols ${1:3}\n    $0", documentation: "A scrollable grid.", kind: "displayable" },
  { name: "side", snippet: "side \"${1:c}\":\n    $0", documentation: "Arranges displayables by side.", kind: "displayable" },
  { name: "grid", snippet: "grid ${1:cols} ${2:rows}:\n    $0", documentation: "Arranges displayables in a grid.", kind: "displayable" },
  { name: "hbox", snippet: "hbox:\n    $0", documentation: "Arranges displayables horizontally.", kind: "displayable" },
  { name: "vbox", snippet: "vbox:\n    $0", documentation: "Arranges displayables vertically.", kind: "displayable" },
  { name: "fixed", snippet: "fixed:\n    $0", documentation: "Overlays displayables at fixed positions.", kind: "displayable" },
  { name: "frame", snippet: "frame:\n    $0", documentation: "A frame with a background.", kind: "displayable" },
  { name: "window", snippet: "window:\n    $0", documentation: "A window container.", kind: "displayable" },
  { name: "transform", snippet: "transform:\n    $0", documentation: "Applies a transform to children.", kind: "displayable" },
  { name: "hotspot", snippet: "hotspot (${1:x}, ${2:y}, ${3:w}, ${4:h}) action ${5:NullAction()}", documentation: "A clickable hotspot region.", kind: "displayable" },
  { name: "hotbar", snippet: "hotbar (${1:x}, ${2:y}, ${3:w}, ${4:h}) value ${5:value}", documentation: "A bar defined by hotspot.", kind: "displayable" },
  { name: "imagemap", snippet: "imagemap:\n    ground \"${1:ground}\"\n    $0", documentation: "An image-based interface.", kind: "displayable" },
];

export const SCREEN_PROPERTIES: ScreenKeyword[] = [
  // Layout properties
  { name: "style", documentation: "The style to apply to this displayable.", kind: "property" },
  { name: "style_prefix", documentation: "Prefix for automatic style names.", kind: "property" },
  { name: "style_suffix", documentation: "Suffix for automatic style names.", kind: "property" },
  { name: "at", documentation: "Transform to apply to the displayable.", kind: "property" },
  { name: "id", documentation: "Unique identifier for the displayable.", kind: "property" },
  { name: "default", documentation: "If True, this button is selected by default.", kind: "property" },

  // Position properties
  { name: "xpos", documentation: "X position.", kind: "property" },
  { name: "ypos", documentation: "Y position.", kind: "property" },
  { name: "pos", documentation: "Position as (x, y) tuple.", kind: "property" },
  { name: "xanchor", documentation: "X anchor point.", kind: "property" },
  { name: "yanchor", documentation: "Y anchor point.", kind: "property" },
  { name: "anchor", documentation: "Anchor as (x, y) tuple.", kind: "property" },
  { name: "xalign", documentation: "X alignment (0.0 to 1.0).", kind: "property" },
  { name: "yalign", documentation: "Y alignment (0.0 to 1.0).", kind: "property" },
  { name: "align", documentation: "Alignment as (x, y) tuple.", kind: "property" },
  { name: "xcenter", documentation: "X center position.", kind: "property" },
  { name: "ycenter", documentation: "Y center position.", kind: "property" },
  { name: "xoffset", documentation: "X offset.", kind: "property" },
  { name: "yoffset", documentation: "Y offset.", kind: "property" },
  { name: "offset", documentation: "Offset as (x, y) tuple.", kind: "property" },
  { name: "xmaximum", documentation: "Maximum width.", kind: "property" },
  { name: "ymaximum", documentation: "Maximum height.", kind: "property" },
  { name: "maximum", documentation: "Maximum size as (w, h) tuple.", kind: "property" },
  { name: "xminimum", documentation: "Minimum width.", kind: "property" },
  { name: "yminimum", documentation: "Minimum height.", kind: "property" },
  { name: "minimum", documentation: "Minimum size as (w, h) tuple.", kind: "property" },
  { name: "xsize", documentation: "Fixed width.", kind: "property" },
  { name: "ysize", documentation: "Fixed height.", kind: "property" },
  { name: "xysize", documentation: "Fixed size as (w, h) tuple.", kind: "property" },
  { name: "xfill", documentation: "If True, fills available horizontal space.", kind: "property" },
  { name: "yfill", documentation: "If True, fills available vertical space.", kind: "property" },
  { name: "area", documentation: "Area as (x, y, w, h) tuple.", kind: "property" },

  // Box properties
  { name: "spacing", documentation: "Space between children in boxes.", kind: "property" },
  { name: "first_spacing", documentation: "Space before the first child.", kind: "property" },
  { name: "box_reverse", documentation: "If True, reverses child order.", kind: "property" },
  { name: "box_wrap", documentation: "If True, wraps children to new lines.", kind: "property" },
  { name: "box_wrap_spacing", documentation: "Spacing between wrapped rows/columns.", kind: "property" },

  // Text properties
  { name: "text_style", documentation: "Style for text content.", kind: "property" },
  { name: "substitute", documentation: "If True, substitutes text variables.", kind: "property" },
  { name: "slow", documentation: "If True, enables slow text display.", kind: "property" },
  { name: "slow_cps", documentation: "Characters per second for slow text.", kind: "property" },
  { name: "slow_cps_multiplier", documentation: "Multiplier for slow text speed.", kind: "property" },

  // Button properties
  { name: "action", documentation: "Action to perform when clicked.", kind: "property" },
  { name: "clicked", documentation: "Action when clicked (alias for action).", kind: "property" },
  { name: "hovered", documentation: "Action when mouse enters.", kind: "property" },
  { name: "unhovered", documentation: "Action when mouse leaves.", kind: "property" },
  { name: "alternate", documentation: "Action for right-click or long press.", kind: "property" },
  { name: "selected", documentation: "If True, button appears selected.", kind: "property" },
  { name: "sensitive", documentation: "If False, button is disabled.", kind: "property" },
  { name: "keysym", documentation: "Keyboard shortcut for the button.", kind: "property" },
  { name: "alternate_keysym", documentation: "Keyboard shortcut for alternate action.", kind: "property" },
  { name: "focus_mask", documentation: "Mask for focus detection.", kind: "property" },

  // Viewport properties
  { name: "scrollbars", documentation: "\"vertical\", \"horizontal\", or \"both\".", kind: "property" },
  { name: "draggable", documentation: "If True, viewport can be dragged.", kind: "property" },
  { name: "mousewheel", documentation: "If True, responds to mouse wheel.", kind: "property" },
  { name: "arrowkeys", documentation: "If True, responds to arrow keys.", kind: "property" },
  { name: "pagekeys", documentation: "If True, responds to page up/down.", kind: "property" },
  { name: "edgescroll", documentation: "Scroll speed when mouse near edge.", kind: "property" },
  { name: "xadjustment", documentation: "Adjustment object for x scrolling.", kind: "property" },
  { name: "yadjustment", documentation: "Adjustment object for y scrolling.", kind: "property" },
  { name: "xinitial", documentation: "Initial x scroll position.", kind: "property" },
  { name: "yinitial", documentation: "Initial y scroll position.", kind: "property" },
  { name: "child_size", documentation: "Size of the viewport's child.", kind: "property" },

  // Grid properties
  { name: "cols", documentation: "Number of columns in a grid.", kind: "property" },
  { name: "rows", documentation: "Number of rows in a grid.", kind: "property" },
  { name: "transpose", documentation: "If True, fills by column instead of row.", kind: "property" },

  // Bar properties
  { name: "value", documentation: "The value for bars/sliders.", kind: "property" },
  { name: "range", documentation: "The range for the bar value.", kind: "property" },
  { name: "adjustment", documentation: "Adjustment object for the bar.", kind: "property" },
  { name: "changed", documentation: "Function called when value changes.", kind: "property" },
  { name: "released", documentation: "Function called when released.", kind: "property" },

  // Image properties
  { name: "idle", documentation: "Image when not interacted.", kind: "property" },
  { name: "hover", documentation: "Image when mouse hovers.", kind: "property" },
  { name: "selected_idle", documentation: "Image when selected and idle.", kind: "property" },
  { name: "selected_hover", documentation: "Image when selected and hovered.", kind: "property" },
  { name: "insensitive", documentation: "Image when disabled.", kind: "property" },
  { name: "auto", documentation: "Base name for automatic image variants.", kind: "property" },

  // Input properties
  { name: "length", documentation: "Maximum input length.", kind: "property" },
  { name: "allow", documentation: "Allowed characters.", kind: "property" },
  { name: "exclude", documentation: "Excluded characters.", kind: "property" },
  { name: "prefix", documentation: "Text before input.", kind: "property" },
  { name: "suffix", documentation: "Text after input.", kind: "property" },
  { name: "copypaste", documentation: "If True, enables copy/paste.", kind: "property" },
  { name: "pixel_width", documentation: "Width in pixels.", kind: "property" },
];

export const SCREEN_ACTIONS: ScreenKeyword[] = [
  // Navigation actions
  { name: "Jump", snippet: "Jump(\"${1:label}\")", documentation: "Jumps to a label, ending the current interaction.", kind: "action" },
  { name: "Call", snippet: "Call(\"${1:label}\")", documentation: "Calls a label, returning when it ends.", kind: "action" },
  { name: "Return", snippet: "Return(${1:value})", documentation: "Returns from a call, optionally with a value.", kind: "action" },
  { name: "Show", snippet: "Show(\"${1:screen}\")", documentation: "Shows a screen.", kind: "action" },
  { name: "Hide", snippet: "Hide(\"${1:screen}\")", documentation: "Hides a screen.", kind: "action" },
  { name: "ShowMenu", snippet: "ShowMenu(\"${1:screen}\")", documentation: "Shows a game menu screen.", kind: "action" },
  { name: "MainMenu", snippet: "MainMenu()", documentation: "Returns to the main menu.", kind: "action" },
  { name: "Start", snippet: "Start(\"${1:label}\")", documentation: "Starts the game at a label.", kind: "action" },
  { name: "Quit", snippet: "Quit()", documentation: "Quits the game.", kind: "action" },

  // Variable actions
  { name: "SetVariable", snippet: "SetVariable(\"${1:var}\", ${2:value})", documentation: "Sets a variable to a value.", kind: "action" },
  { name: "SetDict", snippet: "SetDict(${1:dict}, \"${2:key}\", ${3:value})", documentation: "Sets a dictionary key.", kind: "action" },
  { name: "SetField", snippet: "SetField(${1:obj}, \"${2:field}\", ${3:value})", documentation: "Sets an object field.", kind: "action" },
  { name: "SetLocalVariable", snippet: "SetLocalVariable(\"${1:var}\", ${2:value})", documentation: "Sets a local variable.", kind: "action" },
  { name: "SetScreenVariable", snippet: "SetScreenVariable(\"${1:var}\", ${2:value})", documentation: "Sets a screen variable.", kind: "action" },
  { name: "ToggleVariable", snippet: "ToggleVariable(\"${1:var}\")", documentation: "Toggles a boolean variable.", kind: "action" },
  { name: "ToggleDict", snippet: "ToggleDict(${1:dict}, \"${2:key}\")", documentation: "Toggles a dictionary boolean.", kind: "action" },
  { name: "ToggleField", snippet: "ToggleField(${1:obj}, \"${2:field}\")", documentation: "Toggles an object field.", kind: "action" },
  { name: "ToggleLocalVariable", snippet: "ToggleLocalVariable(\"${1:var}\")", documentation: "Toggles a local boolean.", kind: "action" },
  { name: "ToggleScreenVariable", snippet: "ToggleScreenVariable(\"${1:var}\")", documentation: "Toggles a screen boolean.", kind: "action" },

  // Flow control
  { name: "If", snippet: "If(${1:condition}, ${2:true_action}, ${3:false_action})", documentation: "Conditional action.", kind: "action" },
  { name: "NullAction", snippet: "NullAction()", documentation: "Does nothing.", kind: "action" },
  { name: "Function", snippet: "Function(${1:func})", documentation: "Calls a Python function.", kind: "action" },
  { name: "Confirm", snippet: "Confirm(\"${1:message}\", ${2:yes_action})", documentation: "Shows a confirmation dialog.", kind: "action" },
  { name: "Notify", snippet: "Notify(\"${1:message}\")", documentation: "Shows a notification.", kind: "action" },

  // Audio actions
  { name: "Play", snippet: "Play(\"${1:channel}\", \"${2:file}\")", documentation: "Plays audio on a channel.", kind: "action" },
  { name: "Stop", snippet: "Stop(\"${1:channel}\")", documentation: "Stops audio on a channel.", kind: "action" },
  { name: "Queue", snippet: "Queue(\"${1:channel}\", \"${2:file}\")", documentation: "Queues audio on a channel.", kind: "action" },
  { name: "SetMute", snippet: "SetMute(\"${1:channel}\", ${2:True})", documentation: "Mutes/unmutes a channel.", kind: "action" },
  { name: "SetMixer", snippet: "SetMixer(\"${1:mixer}\", ${2:volume})", documentation: "Sets mixer volume.", kind: "action" },

  // Save/Load actions
  { name: "FileSave", snippet: "FileSave(${1:slot})", documentation: "Saves to a slot.", kind: "action" },
  { name: "FileLoad", snippet: "FileLoad(${1:slot})", documentation: "Loads from a slot.", kind: "action" },
  { name: "FileDelete", snippet: "FileDelete(${1:slot})", documentation: "Deletes a save slot.", kind: "action" },
  { name: "FileAction", snippet: "FileAction(${1:slot})", documentation: "Saves or loads depending on context.", kind: "action" },
  { name: "QuickSave", snippet: "QuickSave()", documentation: "Quick saves the game.", kind: "action" },
  { name: "QuickLoad", snippet: "QuickLoad()", documentation: "Quick loads the game.", kind: "action" },

  // Preference actions
  { name: "Preference", snippet: "Preference(\"${1:pref}\", ${2:value})", documentation: "Sets a preference.", kind: "action" },
  { name: "SetVoiceMute", snippet: "SetVoiceMute(${1:True})", documentation: "Mutes/unmutes voice.", kind: "action" },

  // Rollback actions
  { name: "Rollback", snippet: "Rollback()", documentation: "Rolls back one interaction.", kind: "action" },
  { name: "RollbackToIdentifier", snippet: "RollbackToIdentifier(${1:id})", documentation: "Rolls back to a specific identifier.", kind: "action" },

  // Gallery/Replay actions
  { name: "Replay", snippet: "Replay(\"${1:label}\")", documentation: "Replays a scene.", kind: "action" },
  { name: "EndReplay", snippet: "EndReplay()", documentation: "Ends a replay.", kind: "action" },

  // Other actions
  { name: "OpenURL", snippet: "OpenURL(\"${1:url}\")", documentation: "Opens a URL in a browser.", kind: "action" },
  { name: "CopyToClipboard", snippet: "CopyToClipboard(\"${1:text}\")", documentation: "Copies text to clipboard.", kind: "action" },
  { name: "ShowTransient", snippet: "ShowTransient(\"${1:screen}\")", documentation: "Shows a transient screen.", kind: "action" },
  { name: "Screenshot", snippet: "Screenshot()", documentation: "Takes a screenshot.", kind: "action" },
  { name: "InvertSelected", snippet: "InvertSelected(${1:action})", documentation: "Inverts selection state of an action.", kind: "action" },
  { name: "SelectedIf", snippet: "SelectedIf(${1:condition})", documentation: "Makes the button selected if condition is true.", kind: "action" },
  { name: "SensitiveIf", snippet: "SensitiveIf(${1:condition})", documentation: "Makes the button sensitive if condition is true.", kind: "action" },
];

export const SCREEN_STATEMENTS: ScreenKeyword[] = [
  { name: "use", snippet: "use ${1:screen}", documentation: "Includes another screen.", kind: "statement" },
  { name: "transclude", documentation: "Placeholder for transcluded content.", kind: "statement" },
  { name: "default", snippet: "default ${1:var} = ${2:value}", documentation: "Defines a screen-local variable with default value.", kind: "statement" },
  { name: "python", snippet: "python:\n    $0", documentation: "Executes Python code.", kind: "statement" },
  { name: "if", snippet: "if ${1:condition}:\n    $0", documentation: "Conditional display.", kind: "statement" },
  { name: "elif", snippet: "elif ${1:condition}:\n    $0", documentation: "Else-if branch.", kind: "statement" },
  { name: "else", snippet: "else:\n    $0", documentation: "Else branch.", kind: "statement" },
  { name: "for", snippet: "for ${1:item} in ${2:items}:\n    $0", documentation: "Loop over items.", kind: "statement" },
  { name: "showif", snippet: "showif ${1:condition}:\n    $0", documentation: "Shows/hides with transition.", kind: "statement" },
  { name: "on", snippet: "on \"${1:event}\" action ${2:NullAction()}", documentation: "Handles screen events.", kind: "statement" },
  { name: "tag", snippet: "tag ${1:tag}", documentation: "Sets the screen's tag.", kind: "statement" },
  { name: "zorder", snippet: "zorder ${1:0}", documentation: "Sets the screen's z-order.", kind: "statement" },
  { name: "modal", snippet: "modal ${1:True}", documentation: "Makes the screen modal.", kind: "statement" },
  { name: "variant", snippet: "variant \"${1:variant}\"", documentation: "Defines a screen variant.", kind: "statement" },
  { name: "style_prefix", snippet: "style_prefix \"${1:prefix}\"", documentation: "Sets the style prefix for children.", kind: "statement" },
];

export const ALL_SCREEN_KEYWORDS = [
  ...SCREEN_DISPLAYABLES,
  ...SCREEN_PROPERTIES,
  ...SCREEN_ACTIONS,
  ...SCREEN_STATEMENTS,
];
