"""MkDocs build hook — surface the Obsidian example vault inside the site.

The demo vault lives at `example-vault/` and must stay a working Obsidian vault (the
`.obsidian` config, `npm run dev:vault`). We can't just symlink it into
`docs/`: the wikilink plugin resolves `[[…]]` by walking the docs tree with `os.walk`, which
does NOT follow symlinks, so every example wikilink would be left unresolved.

So we COPY the vault's feature pages + images into `docs/examples/` only WHILE building, and
remove them again when the process exits (`atexit`, so it covers both `build` and `serve`).
`example-vault/` stays the single source — there is never a second copy committed to or left
lying in the repo. The one committed file in `docs/examples/` is `README.md`, the section
landing page; it is kept across builds. `.obsidian/`, shell scripts and the Obsidian-only
"00 — Start here" intro are dropped from the copy so only reader pages ship (the `README.md`
ignore guards the committed landing page from being clobbered).
"""
from __future__ import annotations

import atexit
import re
import shutil
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_SRC = _ROOT / "example-vault"
_DST = _ROOT / "docs" / "examples"
# docs/examples/README.md is the committed section landing page (what this is + that the runtime
# works); it is kept across builds. Everything else in docs/examples/ is generated.
_KEEP = "README.md"
# Drop the per-vault Obsidian config, shell scripts and the Obsidian-only "00 — Start here" intro;
# copy the feature pages + images. The README.md pattern guards the committed docs/examples/README.md
# landing page (the section's intro) from being clobbered by the copy.
_IGNORE = shutil.ignore_patterns(".obsidian", "*.sh", "README.md", "00 *.md")


def _clean() -> None:
    """Remove the generated pages/images but keep the committed landing page."""
    if not _DST.exists():
        return
    for entry in _DST.iterdir():
        if entry.name == _KEEP:
            continue
        shutil.rmtree(entry) if entry.is_dir() else entry.unlink()


# Always tear the mirror down on exit, even if the build raises or serve is interrupted.
atexit.register(_clean)

# The dev docs reference plugin source with workspace-root-relative links like
# `[main.ts](src/main.ts#L141)` (the CLAUDE.md code-reference convention). Those files are not
# part of the site, so they would 404. Rewrite any such link whose target is a real repo file
# OUTSIDE docs/ to its GitHub blob URL; line anchors (#L141, #L33-L38) already match GitHub's.
_GH_BLOB = "https://github.com/Britz/obsidian-live-image-editor/blob/main/"
_LINK_RE = re.compile(r"\]\((?P<t>[^)\s]+)\)")
_SKIP_RE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|/|#)")


def on_pre_build(config, **kwargs) -> None:
    """Stage docs/examples/ from the real vault before MkDocs collects files (build-time only).

    Merges the feature pages + images in alongside the committed README.md (dirs_exist_ok).
    """
    _clean()
    if _SRC.exists():
        shutil.copytree(_SRC, _DST, ignore=_IGNORE, dirs_exist_ok=True)


def on_page_markdown(markdown: str, page, config, files) -> str:
    """Point repo-source links (outside docs/) at GitHub; leave docs-internal links to MkDocs."""
    docs_dir = Path(config["docs_dir"]).resolve()
    page_dir = (docs_dir / page.file.src_path).resolve().parent

    def repl(match: "re.Match[str]") -> str:
        target = match.group("t")
        if _SKIP_RE.match(target):
            return match.group(0)
        path_part, _, anchor = target.partition("#")
        if not path_part:
            return match.group(0)
        # A real docs-internal link? Leave it for MkDocs to resolve.
        docs_candidate = (page_dir / path_part).resolve()
        if docs_candidate.exists() and docs_dir in docs_candidate.parents:
            return match.group(0)
        # A real repo file outside docs/? Send it to GitHub.
        repo_candidate = (_ROOT / path_part).resolve()
        if (
            repo_candidate.is_file()
            and _ROOT in repo_candidate.parents
            and docs_dir not in repo_candidate.parents
        ):
            rel = repo_candidate.relative_to(_ROOT).as_posix()
            url = _GH_BLOB + rel + (f"#{anchor}" if anchor else "")
            return f"]({url})"
        return match.group(0)

    return _LINK_RE.sub(repl, markdown)
