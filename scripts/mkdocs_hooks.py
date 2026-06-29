"""MkDocs build hook — surface the Obsidian example vault and repo-root docs inside the site.

The demo vault lives at `vault-image-toolbar/` and must stay a working Obsidian vault (the
`.obsidian` config, `npm run dev:vault`). We can't just symlink it into
`docs/`: the wikilink plugin resolves `[[…]]` by walking the docs tree with `os.walk`, which
does NOT follow symlinks, so every example wikilink would be left unresolved.

So we COPY the vault's feature pages + images into `docs/examples/` only WHILE building, and
remove them again when the process exits (`atexit`, so it covers both `build` and `serve`).
`vault-image-toolbar/` stays the single source — there is never a second copy committed to or left
lying in the repo. The one committed file in `docs/examples/` is `README.md`, the section
landing page; it is kept across builds. `.obsidian/`/`.claude*`, shell scripts and the
Obsidian-only "00 — Start here" intro are dropped from the copy so only reader pages ship (the
`README.md` ignore guards the committed landing page from being clobbered).

The same staging trick pulls a few repo-root documents (`CHANGELOG.md`, `LICENSE`) into the
site as real pages (`_SITE_PAGES`) so the docs can link to them in-site instead of 404-ing or
bouncing to GitHub; like the vault mirror they are staged at build time and removed on exit.
`on_page_markdown` then rewrites links to those files to their in-site page and sends links to
any OTHER repo file (plugin source) to its GitHub blob URL.
"""
from __future__ import annotations

import atexit
import os
import re
import shutil
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_DOCS = _ROOT / "docs"
_SRC = _ROOT / "vault-image-toolbar"
_DST = _DOCS / "examples"
# docs/examples/README.md is the committed section landing page (what this is + that the runtime
# works); it is kept across builds. Everything else in docs/examples/ is generated.
_KEEP = "README.md"
# Drop the per-vault Obsidian/agent config, shell scripts and the Obsidian-only "00 — Start here"
# intro; copy the feature pages + images. The README.md pattern guards the committed
# docs/examples/README.md landing page (the section's intro) from being clobbered by the copy.
_IGNORE = shutil.ignore_patterns(".obsidian", ".claude", ".claudian", "*.sh", "README.md", "00 *.md")

# Repo-root documents surfaced as in-site pages: repo path (relative to root) -> staged docs page.
# Staged into docs/ at build, removed on exit. Links to these resolve in-site (see on_page_markdown);
# any OTHER repo path (plugin source, the non-markdown LICENSE, vault-image-toolbar/) is sent to GitHub
# instead. README.md IS the site home (docs/index.md is generated from it, not committed) so the
# project overview has a single source — its own relative links are rewritten by on_page_markdown.
_SITE_PAGES = {"README.md": "index.md", "CHANGELOG.md": "changelog.md"}


def _clean() -> None:
    """Remove the generated pages/images but keep the committed landing page."""
    if _DST.exists():
        for entry in _DST.iterdir():
            if entry.name == _KEEP:
                continue
            shutil.rmtree(entry) if entry.is_dir() else entry.unlink()
    for staged in _SITE_PAGES.values():
        (_DOCS / staged).unlink(missing_ok=True)


# Always tear the mirror down on exit, even if the build raises or serve is interrupted.
atexit.register(_clean)

# The dev docs reference plugin source with workspace-root-relative links like
# `[main.ts](src/main.ts#L141)` (the CLAUDE.md code-reference convention). Those files are not
# part of the site, so they would 404. Rewrite any such link whose target is a real repo file
# OUTSIDE docs/ to its GitHub URL; line anchors (#L141, #L33-L38) already match GitHub's.
_GH = "https://github.com/Britz/obsidian-live-image-editor/"
_LINK_RE = re.compile(r"\]\((?P<t>[^)\s]+)\)")
_SKIP_RE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|/|#)")


def _slug(stem: str) -> str:
    """Vault page name -> unix-conformant slug: lowercase, no spaces, ASCII only.

    `01 — Rotate & flip` -> `01-rotate-flip`. Any run of non-`[a-z0-9]` (spaces, the em-dash,
    `&`, punctuation) collapses to a single hyphen; leading/trailing hyphens are trimmed.
    """
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")


def _slugify_examples() -> None:
    """Rename the copied vault pages to unix-conformant slugs and fix the wikilinks to them.

    The vault's reader pages ship with spaced, em-dashed Obsidian names (`02 — Crop.md`); the
    site wants clean URLs (`02-crop`). We rename the staged copies and rewrite every `[[…]]`
    wikilink/embed *target* in those copies from the old page name to its slug, so the roamlinks
    plugin still resolves them. The committed README.md is left untouched on disk (its wikilinks
    are already slugged at source); image embeds are untouched too — `images/` filenames are
    already conformant and never enter the map.
    """
    # Map every renamable page (the generated copies, NOT the kept README) old-stem -> slug.
    renames = {
        md: md.with_name(_slug(md.stem) + md.suffix)
        for md in _DST.glob("*.md")
        if md.name != _KEEP
    }
    stem_to_slug = {md.stem: dst.stem for md, dst in renames.items()}
    for src, dst in renames.items():
        src.rename(dst)
    # Rewrite `[[old stem` / `[[old stem|alias` targets across all staged pages (incl. README).
    link_re = re.compile(r"(!?\[\[)(?P<t>[^|\]#]+)")

    def repl(match: "re.Match[str]") -> str:
        slug = stem_to_slug.get(match.group("t").strip())
        return f"{match.group(1)}{slug}" if slug else match.group(0)

    for md in _DST.glob("*.md"):
        if md.name == _KEEP:  # committed README — slugged at source, never rewritten on disk
            continue
        text = md.read_text(encoding="utf-8")
        rewritten = link_re.sub(repl, text)
        if rewritten != text:
            md.write_text(rewritten, encoding="utf-8")


def on_pre_build(config, **kwargs) -> None:
    """Stage docs/examples/ + the repo-root site pages before MkDocs collects files (build-time only).

    Merges the feature pages + images in alongside the committed README.md (dirs_exist_ok), then
    slugifies the copied page filenames (and the wikilinks to them) to unix-conformant names, and
    copies the _SITE_PAGES repo-root docs (CHANGELOG, LICENSE) into docs/ as navigable pages.
    """
    _clean()
    if _SRC.exists():
        shutil.copytree(_SRC, _DST, ignore=_IGNORE, dirs_exist_ok=True)
        _slugify_examples()
    for repo_name, staged in _SITE_PAGES.items():
        src = _ROOT / repo_name
        if src.is_file():
            shutil.copyfile(src, _DOCS / staged)


def on_page_markdown(markdown: str, page, config, files) -> str:
    """Resolve repo-relative links: _SITE_PAGES → in-site page, other repo files → GitHub.

    Each link is resolved both page-relative (the Obsidian/MkDocs style, e.g. `../../CHANGELOG.md`)
    and repo-root-relative (the `src/main.ts` code-reference convention); the first that exists
    wins. Docs-internal targets are rewritten to a page-relative path (so the staged README — now
    docs/index.md — links to `development/…` rather than its committed `docs/development/…`).
    """
    docs_dir = Path(config["docs_dir"]).resolve()
    page_dir = (docs_dir / page.file.src_path).resolve().parent

    def repl(match: "re.Match[str]") -> str:
        target = match.group("t")
        if _SKIP_RE.match(target):
            return match.group(0)
        path_part, _, anchor = target.partition("#")
        if not path_part:
            return match.group(0)
        suffix = f"#{anchor}" if anchor else ""
        # Resolve page-relative first, then repo-root-relative; first that exists wins.
        resolved = next(
            (c for base in (page_dir, _ROOT) if (c := (base / path_part).resolve()).exists()),
            None,
        )
        if resolved is None:
            return match.group(0)
        # Docs-internal? Rewrite to a path relative to this page (no-op when already correct).
        if resolved == docs_dir or docs_dir in resolved.parents:
            rel = os.path.relpath(resolved, page_dir)
            return match.group(0) if rel == path_part else f"]({rel}{suffix})"
        if _ROOT not in resolved.parents:
            return match.group(0)
        rel_to_root = resolved.relative_to(_ROOT).as_posix()
        # A repo-root doc we surface in-site? Point at the staged page (relative to this page),
        # normalising the anchor from GitHub's slug (`a--b`) to MkDocs' (`a-b`).
        if rel_to_root in _SITE_PAGES:
            staged = docs_dir / _SITE_PAGES[rel_to_root]
            site_anchor = f"#{re.sub(r'-+', '-', anchor)}" if anchor else ""
            return f"]({os.path.relpath(staged, page_dir)}{site_anchor})"
        # Any other repo path → GitHub (tree for a directory, blob for a file).
        kind = "tree" if resolved.is_dir() else "blob"
        return f"]({_GH}{kind}/main/{rel_to_root}{suffix})"

    return _LINK_RE.sub(repl, markdown)
