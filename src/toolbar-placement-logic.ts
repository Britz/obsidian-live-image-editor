export type ToolbarPresentation = "above" | "inset";

/** Decides whether the static inset toolbar would obscure too much of its image. */
export function toolbarPresentation(imageHeight: number, toolbarHeight: number): ToolbarPresentation | null {
  if (!Number.isFinite(imageHeight) || !Number.isFinite(toolbarHeight) || imageHeight <= 0 || toolbarHeight <= 0) return null;
  return (toolbarHeight + 8) / imageHeight > 0.6 ? "above" : "inset";
}
