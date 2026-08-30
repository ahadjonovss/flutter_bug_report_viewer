// Runs the parser's assertions outside a browser.
//
//   node test/run.js
//
// No dependencies and no runner: node has had TextDecoder, Response and
// DecompressionStream since 18, which is everything parse.js and unzip.js
// use. The same cases run in the page through test.html.

"use strict";

var fs = require("fs");
var path = require("path");

require("../unzip.js");
require("../parse.js");
require("./cases.js");

var here = path.join(__dirname, "fixtures");

function load(name) {
  return Promise.resolve(new Uint8Array(fs.readFileSync(path.join(here, name))));
}

globalThis.FBRTests.run(load).then(function (t) {
  var failed = t.results.filter(function (r) { return r.error; });
  var group = null;

  t.results.forEach(function (r) {
    if (r.group !== group) {
      group = r.group;
      process.stdout.write("\n  " + group + "\n");
    }
    process.stdout.write(
      (r.error ? "  ✗ " : "  ✓ ") + r.what +
      (r.error ? "\n      " + r.error : "") + "\n"
    );
  });

  process.stdout.write(
    "\n" + (t.results.length - failed.length) + " of " + t.results.length + " passed" +
    (failed.length ? ", " + failed.length + " failed" : "") + "\n\n"
  );

  process.exit(failed.length ? 1 : 0);
}, function (error) {
  process.stderr.write("\nthe run itself broke: " + (error && error.stack || error) + "\n");
  process.exit(1);
});
