# Reviews

Date: Jun 25, 2026
Version: 0.6.10
Commit: 5aae54e
Completed

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

- **Warning**: Do not import Node.js builtin module "net"
  - src/dev-bridge.ts:2
- **Warning**: Use 'activeDocument' instead of 'document' for popout window compatibility.
  - src/runtime.ts:47, src/runtime.ts:47, src/runtime.ts:98, src/runtime.ts:103, src/runtime.ts:106, src/runtime.ts:107
- **Warning**: Use '.instanceOf(HTMLImageElement)' instead of 'instanceof HTMLImageElement' for cross-window safe type checking.
  - src/runtime.ts:53, src/runtime.ts:56
- **Warning**: Use '.instanceOf(Element)' instead of 'instanceof Element' for cross-window safe type checking.
  - src/runtime.ts:54
- **Warning**: Use '.instanceOf(Document)' instead of 'instanceof Document' for cross-window safe type checking.
  - src/runtime.ts:54
- **Recommendation**: `setWarning` is deprecated. Use {@link setDestructive} for a destructive button, or
`setDestructive().setCta()` for a destructive primary action.
  - src/settings.ts:55, src/settings.ts:283
- **Recommendation**: `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions } instead.
  - src/settings.ts:240, src/settings.ts:269, src/settings.ts:307, src/settings.ts:367

## CSS lint

- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - styles.css:183, styles.css:373, styles.css:374, styles.css:375, styles.css:376, styles.css:380, styles.css:384, styles.css:422, styles.css:439, styles.css:482, styles.css:521
- **Warning**: Avoid :has — it can cause significant performance issues due to broad selector invalidation.
  - styles.css:200, styles.css:201, styles.css:202, styles.css:203, styles.css:212, styles.css:213, styles.css:214, styles.css:215, styles.css:216, styles.css:217, styles.css:218, styles.css:219, styles.css:220, styles.css:295, styles.css:296, styles.css:297, styles.css:298, styles.css:371, styles.css:372, styles.css:378, styles.css:379, styles.css:382, styles.css:383, styles.css:413, styles.css:415, styles.css:434, styles.css:435, styles.css:436, styles.css:437, styles.css:438, styles.css:439

## Dependencies

- **Pass**: No vulnerable dependencies found.

