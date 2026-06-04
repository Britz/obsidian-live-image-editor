import { ChangeSpec, Transaction } from "@codemirror/state";
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
 * large the `{…}` block is. It moves neither cursor nor scroll (D11): no `selection`,
 * no `scrollIntoView`; scroll is pinned in case a reflow nudged it.
 *
 * A caller with one logical edit must pass it as ONE `changes` spec (CM accepts an
 * array of ranges) so it stays a single transaction = a single undo step.
 */
export function writeSource(view: EditorView, changes: ChangeSpec): void {
  const { scrollTop, scrollLeft } = view.scrollDOM;
  view.dispatch({
    changes,
    annotations: [isolateHistory.of("full"), Transaction.userEvent.of(LIE_USER_EVENT)],
  });
  if (view.scrollDOM.scrollTop !== scrollTop) view.scrollDOM.scrollTop = scrollTop;
  if (view.scrollDOM.scrollLeft !== scrollLeft) view.scrollDOM.scrollLeft = scrollLeft;
}
