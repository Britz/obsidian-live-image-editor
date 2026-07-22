# Tables

An image embeds inside a table cell exactly the same way it does anywhere else — a wikilink or
Markdown embed, optionally followed by the portable `{…}` block. The one thing table syntax adds:
`|` is the column separator, so a native `|size` written inside a cell must be escaped as `\|`
(plain Markdown table syntax, nothing plugin-specific) or the parser would read it as a new column.
A `{…}` block needs no escaping and works in a cell exactly like it does on its own line.

One difference from a normal paragraph: inside a table cell the toolbar opens on **click**, not on
hover — click the image to bring it up.

## Four cases, side by side

A realistic table mixes image cells with ordinary text cells, so each row below carries one:
check that the row height follows the image, the text sits beside it, and neither pushes the
other out of its column. As on the other pages, the *italic* text is throwaway filler that only
exists to give the rows something to hold.

| Case                        | Image                                   | Text                                                                        |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Native size (escaped pipe)  | ![[sample-landscape.png\|90]]           | *Lorem ipsum dolor sit amet, consectetur adipiscing elit.*                   |
| Transform block             | ![[sample-portrait.png]]{width=120}     | *Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.*         |
| Markdown-form embed + block | ![](images/sample-square.png){width=90} | *Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.*        |
| Size + block combined       | ![[sample-square.png\|90]]{rotate=90}   | *Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.*     |

## Control embeds outside the table

The same images, embedded normally, for comparison:

![[sample-landscape.png|90]]

![](images/sample-portrait.png){width=120}
