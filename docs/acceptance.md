# Acceptance

The first version is ready when every acceptance criterion in spec §20 can be verified
(step 12 of spec §21). This page lists, for each criterion, the automated tests that
check it on every push (CI). What tests can't do is checked by hand on production,
https://ourbasket-kohl.vercel.app: see [the end of this page](#checked-by-hand).

Test files: `e2e/…` is in [`tests/e2e`](../tests/e2e), `int/…` in
[`tests/integration`](../tests/integration), and unit tests sit next to their code in
`src`. Names in quotes are test titles, shortened.

## Sign-in

| Criterion | Checked by |
| --- | --- |
| An allowed Google user signs in | `int/auth` "allows the two configured emails when Google verified them"; `e2e/auth` "the Google button starts sign-in at Google" |
| A user who isn't on the allowlist can't get to the data | `int/auth` "rejects any other email", "blocks creating a user that is not on the allowlist"; `int/actions-auth` "a Google user who isn't on the allowlist" |
| A direct request to the server without permission is refused | `int/actions-auth`: every server action, signed out, goes to /login and changes nothing; `e2e/realtime` "the private channel is refused when signed out"; `e2e/auth` "a forged session cookie does not get in"; `e2e/export` "the print page needs a signed-in user" |
| A user removed from the allowlist is blocked on the next request | `int/current-user` "signs out a user whose email was removed from the allowlist"; `e2e/auth` "a user whose email is no longer allowed is signed out"; `int/actions-auth` |
| An allowed email that Google didn't verify is refused | `int/auth` "rejects an allowed email that Google did not verify" |
| The login page says what the app is and links to the privacy policy | `e2e/auth` "the login page says what the site is", "the privacy policy is public and linked from the login page" |

## The list and its products

| Criterion | Checked by |
| --- | --- |
| Both users see the same list | One list in the database by design (`list_state`); `e2e/realtime` "shows changes made on the other phone meanwhile" |
| A product added appears on the other user's phone in real time | `int/realtime` "sends the current revision"; the browser side by hand |
| Adding an existing product adds to its quantity, even from another category | `int/products` "adds to an existing product instead, in its own category"; `e2e/list` "adding a product that…" |
| Name, quantity and category can be edited | `e2e/list` "changes the name, quantity and category, which moves it"; `int/products` updateProduct |
| Renaming to an existing product's name is refused with a message | `e2e/list` "renaming to another product…"; `int/products` "refuses another product" |
| Quantity 0 (by `-` or typed) removes the product, not into history; undo brings it back | `e2e/list` "- at 1 deletes the product, and undo brings it back in its place", "a typed quantity is saved; 0 deletes"; `int/products` changeQuantity, setQuantity |
| Both users' `+`/`-` at the same moment all count | `int/products` "counts every press, even at the same moment"; `e2e/list` "+ and - change the quantity, and every press counts" |
| An edit that clashes with the other user's change is refused, without overwriting it | `e2e/list` "a save after someone else…"; `int/products` "refuses a save based on an older version" |
| Products can be checked and unchecked; a checked one moves to the bottom of its category | `e2e/list` "a checked product is crossed out and goes to the bottom"; `int/products` setChecked |
| Products can be searched | `e2e/list` "filters as you type, by category, even closed ones" |
| Products and categories can be reordered | `e2e/list` "moves a product within its category with the keyboard", "drags a product into another category"; `e2e/categories` "moves a category…" |

## Categories

| Criterion | Checked by |
| --- | --- |
| The default categories come from the seed, with emoji and color | `int/seed` "creates the 12 default categories in order, with names, emoji and colors"; `e2e/categories` "lists the default categories" |
| A regular category can be created, edited and deleted | `e2e/categories` "adds a category…", "edits a category…", "deleting asks first…" |
| Deleting a category asks first, with the number of products that go | `e2e/categories` "deleting asks first, says how many products go too, and can be cancelled" |
| Deleting a category deletes its products on the list | `int/categories` "deletes the category with its products, and leaves history alone" |
| "General" can't be deleted | `int/categories` "never deletes the system category"; `int/database` (a database trigger); `e2e/categories` "General marked and not deletable" |
| A product without a category goes to "General" | `int/products` "puts a product with no category, or a deleted one, in General"; `e2e/list` "an empty list invites the first product, which goes to General" |

## Update list and history

| Criterion | Checked by |
| --- | --- |
| Update list asks first | `e2e/update-list` "asks first, then records the checked products and removes them" |
| Only checked products go into history and off the list | `int/purchase` "records the checked products, in list order, removes them, and keeps the rest" |
| A product the other user unchecked before the confirmation stays | `int/purchase` "buys only what the user saw checked and is still checked"; `e2e/update-list` "a product unchecked on the other phone meanwhile stays" |
| Unchecked products stay on the list | `int/purchase` (as above) |
| Each update is a separate record with the date, products and quantities | `int/purchase`; `e2e/history` "a purchase made with update list appears, with its products by category" |
| A record's details can be viewed | `e2e/history` (as above) |
| A record's products can be added to the list | `e2e/history` "adds a purchase back to the list, merging…"; `int/history` addRecordToList |
| Adding from history adds to the quantities of products already listed | `int/history` "adds missing products to their categories, and adds up existing ones in theirs" |
| A record can be deleted, after a confirmation | `e2e/history` "deleting asks first, then removes only the history record" |
| History dates are in Israel time | `e2e/history` "shows purchases newest first, in Israel time" |
| Clearing the list asks first and makes no history record | `e2e/list` "asks first, then deletes every product and leaves history alone"; `int/products` clearList |

## Export

| Criterion | Checked by |
| --- | --- |
| Text to copy, by category, with their emoji | `e2e/export` "copies what is still to buy, by category"; `src/modules/export/export.test.ts` |
| Checked products are left out | `e2e/export` (as above); `export.test.ts` |
| A Hebrew, right-to-left page to print or save as PDF | `e2e/export` printing; "printing from an iPhone's home screen app" (a PDF shared from the app on the home screen) |
| The page has categories, quantities and boxes, and doesn't cut a product between pages | `e2e/export` "lists what is still to buy…", "never cuts a product or a category heading between pages", "continues a long list on more pages"; `src/modules/export/pdf-layout.test.ts` |

## Sync and devices

| Criterion | Checked by |
| --- | --- |
| Changes sync between the two users in real time | `int/realtime` "sends the current revision"; `e2e/realtime` "the private channel is given to a signed-in user" |
| After reconnecting, and coming back to the app, the data reloads from the server | `e2e/realtime` "coming back to the app" (5 tests) |
| An old or repeated event doesn't overwrite newer data | `src/modules/realtime/channel.test.ts` newRevision; `src/modules/list/view.test.ts` newerList; `e2e/list` "a typed quantity after a change elsewhere shows the latest one" |
| Usable on a phone and on a computer | Every e2e test runs on a desktop browser; those marked `@mobile` also on a phone-sized one |
| On a phone, every button and tap area is at least 44×44 | `e2e/accessibility` "has 44×44 touch targets", on every screen and dialog |
| The automatic accessibility check passes on every screen and dialog | `e2e/accessibility` (axe) |
| Installs as a PWA on Android and iPhone, with its name and icon, without the browser's bar | `e2e/pwa` (manifest, icons, links) |
| Offline: a notice is shown and no action is saved offline | `e2e/realtime` "says the app needs a connection, and catches up when it's back" |

## Checked by hand

On production, with the real Google sign-in, Pusher and phones: what CI can't run
(Pusher is off there, and its browsers aren't phones).

| Check                                                                                       | Result |
| ------------------------------------------------------------------------------------------- | ------ |
| Dor and Maayan sign in with Google, on their phones                                          | ✅ 2026-11-24 |
| A change on one phone shows on the other in real time                                        | ✅ 2026-11-24, 2–4 seconds |
| Added to the iPhone's home screen: its name and icon, opens without the browser's bar        | ✅ 2026-11-24 |
| Printing: from a computer, from Safari on the iPhone, and as a PDF from the home screen app | ✅ 2026-11-25 |
| Copy for WhatsApp, pasted in WhatsApp                                                       | PENDING |
| A Google account that isn't allowed is refused, with the message, in a private window       | PENDING |
| Offline (airplane mode): the notice shows, nothing can be saved; back online, it catches up | PENDING |
| Added to an Android phone's home screen                                                     | PENDING |
