# flutter_bug_report — log viewer

A bug report from [`flutter_bug_report`](https://pub.dev/packages/flutter_bug_report)
arrives in a ticket as a `.zip`, a `.json` or a `.txt`. Somebody then has to
read it, which today means downloading the zip, unzipping it, and scrolling
`logs.txt` in a text editor.

This opens one instead: level filter, search, one key between the errors, the
metadata and the screenshot beside the log, and a strip along the top that
shows the shape of the session before you read a word of it.

**→ [Open a bundle](https://ahadjonovss.github.io/flutter_bug_report_viewer/)**

## Nothing leaves your machine

The page has no server to send anything to, and it does not rely on you
believing that. It ships a Content-Security-Policy with `connect-src 'none'`:
the browser itself refuses every fetch, XHR, WebSocket and beacon the page
could attempt. A page that cannot make a request cannot leak a log.

This is not decoration. A bundle is redacted on the device before it is
written, but it still carries an app's real output — and a `screenshot.png`
cannot be redacted at all.

Nothing is stored either. No history, no recent files, no IndexedDB. Close the
tab and it is gone.

## Offline

`viewer.html` is the whole thing as one file. Save it and it works with no
network and no server, which is the right way to read a bundle you would
rather not open on a connected machine.

## Running it

No build, no dependencies, no toolchain.

```
python3 -m http.server 8000     # or any static server
open http://localhost:8000/
```

`./make-single.sh` regenerates `viewer.html` from the sources. It is a
packaging step, not a build step — run it before a release and commit the
result.

## Tests

```
node test/run.js                # or open test.html in a browser
```

`parse.js` and `unzip.js` never touch the DOM, so they run in both.

The fixtures under `test/fixtures/` are written by the package's own builder,
not by hand, and are vendored from pinned commits recorded in
`test/fixtures/VENDORED_FROM`. `legacy/` holds what the builder at `v0.3.0`
emitted: bundles from 0.1.0–0.3.0 are published and will keep arriving in
tickets, so their two quirks — an unindented wrapped description, and a
screenshot named in a file that cannot contain one — are handled permanently.

## What it reads

| | |
|---|---|
| `.zip` | `logs.txt`, `report.json`, optionally `screenshot.png` |
| `.json` | `report` and `entries` |
| `.txt` | the header block, then one entry per line |

Detected by content, not by extension — a bundle arrives renamed, re-zipped, or
as a `logs.txt` somebody pulled out of the archive by hand. Loose files dropped
together are recombined into one report.

Text bundles are read on a best-effort basis and the page says so: a message
written through `debugPrint` can span several unindented lines, so where a
message ends and its error, extra and stack begin is inferred. The `.zip` and
`.json` forms are exact.

## Supporting it

The package and this viewer are written and maintained by one person. That is
the same reason there is no vendor in the loop, no account to make and nothing
measuring you — there is no company here to want any of it.

If it saved you an afternoon: **[tirikchilik.uz/ahadjonovss](https://tirikchilik.uz/ahadjonovss)**.
Optional, and nothing here is gated.

## Licence

MIT © [Samandar Ahadjonov](https://github.com/ahadjonovss)
