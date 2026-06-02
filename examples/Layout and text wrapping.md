# Layout & text wrapping

Tests the preset **layout** classes (`lie-left`, `lie-right`, `lie-center`,
`lie-inline`) against real body text — so floats, centring and inline placement can
be checked with text wrapping around the image. Apply these from the toolbar's
**Layout** group (the `layout-list` icon). **Should** = what a correct render shows.

## Float left — `lie-left`

**Should:** the image floats to the **left**, the paragraph text wraps down its
**right** side, with a small gap between image and text.

![](images/sample-square.png){.lie-left style="width: 180px;"}
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute
irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia
deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus, eget gravida
quam venenatis nec. Maecenas eget condimentum velit, sit amet feugiat lectus.

## Float right — `lie-right`

**Should:** the image floats to the **right**, the text wraps down its **left** side.

![](images/sample-square.png){.lie-right style="width: 180px;"}
Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas
sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione
voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit
amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut
labore et dolore magnam aliquam quaerat voluptatem.

## Centered — `lie-center`

**Should:** the image is a **centered block** on its own line (equal margins left and
right); text sits above and below, not beside it.

![](images/sample-landscape.png){.lie-center style="width: 320px;"}

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint
occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt
mollitia animi, id est laborum et dolorum fuga.

## Inline — `lie-inline`

**Should:** the image sits **inline within the text line** (icon-sized), aligned with
the surrounding words, not breaking onto its own line.

Here is some text with an inline marker ![](images/sample-square.png){.lie-inline style="width: 22px;"} right in the middle of the sentence, and the words continue normally afterwards as if nothing happened.

## Float left, long text (wrap-around clears)

**Should:** text wraps the floated image, then **continues full-width** below once it
clears the image's bottom.

![](images/sample-portrait.png){.lie-left style="width: 140px;"}
Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil
molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.
Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe
eveniet ut et voluptates repudiandae sint et molestiae non recusandae. Itaque earum
rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias
consequatur aut perferendis doloribus asperiores repellat. Nam libero tempore, cum
soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat
facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Et harum quidem
rerum facilis est et expedita distinctio.

## Hardest case — rotated, float right, text wraps

**Should:** the image is **rotated 90°** AND **floats right**, with the paragraph text
wrapping down its **left** side. The rotated bounding box (not the pre-rotation width)
is what the text flows around; no overflow, no clipped band.

![](images/sample-landscape.png){.lie-right .lie-img style="--lie-rotate: 90deg; width: 200px;"}
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure
dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
mollit anim id est laborum. Curabitur pretium tincidunt lacus, eget gravida quam
venenatis nec. Maecenas eget condimentum velit, sit amet feugiat lectus.

## Hardest case — cropped, float right, text wraps

**Should:** the **cropped** image floats **right**, text wraps down its **left** side;
the cut is sharp (no overflow past the crop edges) even while floated and wrapped.

![](images/sample-square.png){.lie-right .lie-img style="--lie-crop: 150 250 700 500 0 1; width: 220px;"}
Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas
sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione
voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit
amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut
labore et dolore magnam aliquam quaerat voluptatem.
