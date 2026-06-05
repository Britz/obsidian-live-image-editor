# Layout, float & wrap

The toolbar's **Layout** group toggles alignment — **left** / **right** float (text wraps around
the image), **center** (a centered block on its own line), and **inline** (icon-sized, flowing in
the text). Float and wrap work in **both** Live Preview and Reading view. Alignment is stored as a
faithful `align=` key.

## Float left — `align=left`

The image floats left; the paragraph wraps down its right side.

![](images/sample-square.png){align=left width=180}
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore
et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse
cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus, eget
gravida quam venenatis nec. Maecenas eget condimentum velit, sit amet feugiat lectus.

## Float right — `align=right`

The image floats right; the text wraps down its left side.

![](images/sample-square.png){align=right width=180}
Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium,
totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta
sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia
consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui
dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi.

## Centered — `align=center`

A centered block on its own line; text sits above and below, not beside it.

![](images/sample-landscape.png){align=center width=320}

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum
deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non
provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum.

## Inline — `.lie-inline`

The image sits inline within the line ![](images/sample-square.png){.lie-inline style="height: 1.2em"}
icon-sized, aligned with the surrounding words, not breaking onto its own line.

## Hardest case — rotated, floated right, text wraps

Rotated 90° **and** floated right; the text wraps the rotated bounding box, no clipped band.

![](images/sample-landscape.png){align=right rotate=90 width=200}
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore
et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse
cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus, eget
gravida quam venenatis nec. Maecenas eget condimentum velit, sit amet feugiat lectus.

## Hardest case — cropped, floated right, text wraps

A square crop, floated right; the cut stays sharp while floated and wrapped.

![](images/sample-square.png){align=right transform="translate(-50%, -50%) scale(2)" aspect-ratio=1/1 width=200}
Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium,
totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta
sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia
consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est.
