# Reviews

Date: Jun 14, 2026
Version: 0.6.8
Commit: bd1141b
Failed

## Releases

- **Recommendation**: Release contains extra unsupported files
  - lie-runtime.js
  - All other files will not be downloaded by Obsidian.
- **Pass**: The `main.js` release asset has a verified GitHub artifact attestation.
- **Pass**: The `styles.css` release asset has a verified GitHub artifact attestation.

## Network requests

- **Pass**: No suspicious network patterns found.

## Behavior

- **Recommendation**: **Vault Enumeration**: Enumerates all files in the vault (`vault.getFiles`, `getMarkdownFiles`, etc.). Gives the plugin access to every file path in the vault.
- **Pass**: **Vault Read**: Reads individual vault files via the Obsidian API (`vault.read`, `vault.cachedRead`)
- **Pass**: **Vault Write**: Creates or modifies vault files via the Obsidian API (`vault.modify`, `vault.create`, etc.)

## Source code

- **Error**: Unsafe assignment to innerHTML
  - src/runtime.ts:79
- **Warning**: Use 'activeDocument' instead of 'document' for popout window compatibility.
  - src/anchored-submenu.ts:93, src/anchored-submenu.ts:105, src/anchored-submenu.ts:117, src/anchored-submenu.ts:207, src/anchored-submenu.ts:238, src/anchored-submenu.ts:241, src/anchored-submenu.ts:246, src/anchored-submenu.ts:268, src/caption-dom.ts:12, src/caption-dom.ts:35, src/class-panel.ts:46, src/class-panel.ts:91, src/class-panel.ts:101, src/class-panel.ts:116, src/class-panel.ts:124, src/crop-editor.ts:188, src/crop-editor.ts:201, src/crop-editor.ts:206, src/crop-editor.ts:211, src/crop-editor.ts:234, src/crop-editor.ts:235, src/crop-editor.ts:252, src/crop-editor.ts:288, src/crop-editor.ts:347, src/crop-editor.ts:348, src/editing-toolbar-integration.ts:157, src/export.ts:47, src/export.ts:113, src/filter-panel.ts:82, src/filter-panel.ts:147, src/filter-panel.ts:149, src/filter-panel.ts:157, src/filter-panel.ts:160, src/filter-panel.ts:165, src/filter-panel.ts:176, src/filter-panel.ts:186, src/filter-panel.ts:189, src/filter-panel.ts:214, src/filter-panel.ts:217, src/filter-panel.ts:221, src/filter-panel.ts:231, src/filter-panel.ts:300, src/live-preview.ts:41, src/live-preview.ts:44, src/live-preview.ts:77, src/live-preview.ts:130, src/live-preview.ts:144, src/live-preview.ts:152, src/live-preview.ts:156, src/live-preview.ts:167, src/live-preview.ts:208, src/live-preview.ts:220, src/live-preview.ts:245, src/live-preview.ts:256, src/live-preview.ts:257, src/live-preview.ts:267, src/live-preview.ts:268, src/main.ts:129, src/main.ts:150, src/main.ts:157, src/main.ts:158, src/main.ts:434, src/main.ts:466, src/main.ts:483, src/main.ts:499, src/main.ts:502, src/main.ts:1085, src/render-core.ts:290, src/render-core.ts:297, src/render-core.ts:299, src/runtime.ts:47, src/runtime.ts:47, src/runtime.ts:92, src/runtime.ts:97, src/runtime.ts:100, src/runtime.ts:101, src/size-submenu.ts:30, src/size-submenu.ts:33, src/size-submenu.ts:34, src/size-submenu.ts:42, src/size-submenu.ts:54, src/size-submenu.ts:87, src/size-submenu.ts:90, src/styles-injector.ts:39, src/styles-injector.ts:47, src/toolbar.ts:61, src/toolbar.ts:98, src/toolbar.ts:105, src/toolbar.ts:120, src/toolbar.ts:136, src/toolbar.ts:137, src/toolbar.ts:140, src/toolbar.ts:141, src/toolbar.ts:146, src/toolbar.ts:172, src/toolbar.ts:181, src/toolbar.ts:186, src/toolbar.ts:192, src/toolbar.ts:204, src/toolbar.ts:266, src/ui.ts:4
- **Warning**: Do not import Node.js builtin module "net"
  - src/dev-bridge.ts:2
- **Warning**: Passes unsafe values into typed parameters
  - @typescript-eslint/no-unsafe-argument
  - src/runtime-markdown.ts:30
- **Warning**: Use '.instanceOf(HTMLImageElement)' instead of 'instanceof HTMLImageElement' for cross-window safe type checking.
  - src/runtime.ts:53, src/runtime.ts:56
- **Warning**: Use '.instanceOf(Element)' instead of 'instanceof Element' for cross-window safe type checking.
  - src/runtime.ts:54
- **Warning**: Use '.instanceOf(Document)' instead of 'instanceof Document' for cross-window safe type checking.
  - src/runtime.ts:54
- **Warning**: Do not write to DOM directly using innerHTML/outerHTML property
  - src/runtime.ts:79
- **Recommendation**: `setWarning` is deprecated. Use {@link setDestructive} for a destructive button, or
`setDestructive().setCta()` for a destructive primary action.
  - src/settings.ts:55, src/settings.ts:283
- **Recommendation**: `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions } instead.
  - src/settings.ts:240, src/settings.ts:269, src/settings.ts:307, src/settings.ts:367

  ## CSS lint

- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - styles.css:183, styles.css:368, styles.css:369, styles.css:370, styles.css:371, styles.css:375, styles.css:379, styles.css:417, styles.css:434, styles.css:476, styles.css:514, styles.css:587
- **Warning**: Avoid :has — it can cause significant performance issues due to broad selector invalidation.
  - styles.css:200, styles.css:201, styles.css:202, styles.css:203, styles.css:212, styles.css:213, styles.css:214, styles.css:215, styles.css:216, styles.css:217, styles.css:218, styles.css:219, styles.css:220, styles.css:295, styles.css:296, styles.css:297, styles.css:298, styles.css:366, styles.css:367, styles.css:373, styles.css:374, styles.css:377, styles.css:378, styles.css:408, styles.css:410, styles.css:429, styles.css:430, styles.css:431, styles.css:432, styles.css:433, styles.css:434

  ## Dependencies

- **Pass**: No vulnerable dependencies found.
