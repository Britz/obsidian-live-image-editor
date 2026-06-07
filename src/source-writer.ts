import { ChangeSpec, EditorSelection, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { isolateHistory } from "@codemirror/commands";

// The userEvent tag stamped on every plugin source-write. Lets listeners (e.g. the
// normalization change-listener, Slice 2) recognise — and ignore — the plugin's OWN
// edits, so a write can never re-trigger the writer in a loop.
export const LIE_USER_EVENT = "lie.transform";

/**
 * The single funnel for every plugin edit to the document (AD1 — the edit direction).
 * Dispatches the change as ONE CodeMirror transaction, ISOLATED in history
 * (`isolateHistory.of("full")`) so each plugin edit is exactly one undo step: never
 * merged with adjacent typing or another plugin edit, never split — regardless of how
 * large the `{…}` block is. Scroll is pinned in case a reflow nudged it.
 *
 * `cursor` (D11): a single-image toolbar edit moves the cursor onto the edited image's
 * line; bulk writers (multi-select, link normalization) pass nothing and leave it. The
 * cursor is set in a SEPARATE prior selection-only transaction (`addToHistory: false`)
 * so it becomes the change transaction's `startSelection` — that is what CM6 restores
 * (with `scrollIntoView`) on undo. Setting `selection` ON the change transaction would
 * NOT help: undo uses the selection from BEFORE the change, so without this the cursor
 * sits at offset 0 and cmd+Z scrolls to the document top.
 *
 * A caller with one logical edit must pass it as ONE `changes` spec (CM accepts an
 * array of ranges) so it stays a single transaction = a single undo step.
 */
export function writeSource(view: EditorView, changes: ChangeSpec, cursor?: number): void {
  const { scrollTop, scrollLeft } = view.scrollDOM;
  if (cursor !== undefined) {
    view.dispatch({
      selection: EditorSelection.cursor(cursor),
      annotations: Transaction.addToHistory.of(false),
    });
  }
  view.dispatch({
    changes,
    annotations: [isolateHistory.of("full"), Transaction.userEvent.of(LIE_USER_EVENT)],
  });
  if (view.scrollDOM.scrollTop !== scrollTop) view.scrollDOM.scrollTop = scrollTop;
  if (view.scrollDOM.scrollLeft !== scrollLeft) view.scrollDOM.scrollLeft = scrollLeft;
}
