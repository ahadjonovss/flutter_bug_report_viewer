#!/bin/sh
# Builds viewer.html — the whole viewer as one file, to be saved and opened
# later with no server and no network at all.
#
# Not a build step: index.html and the files beside it are the thing that is
# developed and served, and this only glues them together for the download.
# Run it before a release; the output is committed.
set -e
cd "$(dirname "$0")"

awk '
  /<link rel="stylesheet"/ {
    print "<style>"
    while ((getline line < "style.css") > 0) print line
    close("style.css")
    print "</style>"
    next
  }
  /<script src="/ {
    match($0, /src="[^"]+"/)
    file = substr($0, RSTART + 5, RLENGTH - 6)
    print "<script>"
    while ((getline line < file) > 0) print line
    close(file)
    print "</" "script>"
    next
  }
  { print }
' index.html |
# Inlining costs the two 'self' source lists, because a page with no separate
# files has nothing to allow but itself. connect-src 'none' is untouched, and
# it is the one that matters: a page that cannot make a request cannot leak a
# log no matter what its own script does.
sed -e "s|script-src 'self';|script-src 'unsafe-inline';|" \
    -e "s|style-src 'self';|style-src 'unsafe-inline';|" > viewer.html

printf 'viewer.html  %s bytes\n' "$(wc -c < viewer.html | tr -d ' ')"
