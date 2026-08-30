(function (root) {
  "use strict";

  // ===================================================================
  //  What the parser has to get right.
  //
  //  The bundles under fixtures/ are written by flutter_bug_report's own
  //  builder at v0.3.1 — not by hand, and not by this project. If one of
  //  these fails after a package release, the format moved.
  //
  //  Runs in node (test/run.js) and in a browser (test.html) off the
  //  same file: load() is whatever the host can do.
  // ===================================================================

  var CASES = [
    "ordinary",
    "multiline_message",
    "multiline_description",
    "no_metadata",
    "truncated",
    "screenshot",
    "empty",
    "timeline"
  ];

  // The one case where the three renderings hold different entries.
  //
  // A bundle is trimmed to fit a byte limit, and the same entries take
  // more room as json than as text — so the json form kept two and the
  // text form kept five. Both are correct; they are not comparable.
  var UNEVEN = { truncated: true };

  function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;

    var ka = Object.keys(a);
    var kb = Object.keys(b);
    if (ka.length !== kb.length) return false;

    return ka.every(function (key) {
      return Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]);
    });
  }

  function show(value) {
    if (typeof value === "string") return JSON.stringify(value);
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  // ===== A very small harness =====

  function Runner() {
    this.results = [];
    this.group = "";
  }

  Runner.prototype.suite = function (name) {
    this.group = name;
  };

  Runner.prototype.record = function (what, error) {
    this.results.push({ group: this.group, what: what, error: error || null });
  };

  Runner.prototype.ok = function (value, what) {
    this.record(what, value ? null : "expected something truthy, got " + show(value));
  };

  Runner.prototype.eq = function (actual, expected, what) {
    this.record(what, actual === expected ? null : "expected " + show(expected) + ", got " + show(actual));
  };

  Runner.prototype.deep = function (actual, expected, what) {
    this.record(what, deepEqual(actual, expected) ? null : "expected " + show(expected) + ", got " + show(actual));
  };

  // Promise-returning, because most of what is asserted here is async.
  Runner.prototype.rejects = function (promise, what) {
    var self = this;

    return promise.then(function () {
      self.record(what, "expected it to be rejected, but it resolved");
    }, function () {
      self.record(what, null);
    });
  };

  // ===== The entries of a bundle, reduced to what is comparable =====

  function shape(bundle) {
    return bundle.entries.map(function (entry) {
      return {
        time: entry.time,
        level: entry.level,
        message: entry.message,
        error: entry.error,
        stackTrace: entry.stackTrace,
        extra: entry.extra
      };
    });
  }

  function bytesOf(text) {
    return new TextEncoder().encode(text);
  }

  function file(name, text) {
    return { name: name, bytes: bytesOf(text) };
  }

  // ===== A zip, built here =====
  //
  // The fixtures are all deflated, so the stored path and the checks
  // around it have nothing exercising them otherwise. Stored also means
  // this stays about thirty lines: no compressor, just the records.
  //
  // `bend` corrupts one thing on purpose — that is the point of having a
  // writer at all.
  function makeZip(files, bend) {
    var encoder = new TextEncoder();
    var locals = [];
    var directory = [];
    var offset = 0;

    files.forEach(function (entry) {
      var name = encoder.encode(entry.name);
      var data = encoder.encode(entry.text);
      var crc = root.FBR.unzip.crc32(data);

      var local = new Uint8Array(30 + name.length + data.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      locals.push(local);

      var claimed = bend === "size" ? data.length + 7 : data.length;

      var record = new Uint8Array(46 + name.length);
      var cv = new DataView(record.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, claimed, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      record.set(name, 46);
      directory.push(record);

      offset += local.length;
    });

    var size = directory.reduce(function (n, r) { return n + r.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, offset, true);

    var all = locals.concat(directory, [end]);
    var total = all.reduce(function (n, part) { return n + part.length; }, 0);
    var zip = new Uint8Array(total);
    var at = 0;

    all.forEach(function (part) {
      zip.set(part, at);
      at += part.length;
    });

    return zip;
  }

  // ===================================================================

  function run(load) {
    var t = new Runner();
    var P = root.FBR.parse;
    var loaded = {};

    function get(name) {
      return load(name).then(function (bytes) {
        loaded[name] = bytes;
        return bytes;
      });
    }

    // Everything under test, read once.
    var names = [
      "legacy/multiline_description.txt",
      "legacy/screenshot.txt",
      "legacy/screenshot.json"
    ];
    CASES.forEach(function (name) {
      names.push(name + ".txt", name + ".json", name + ".zip");
    });

    return Promise.all(names.map(get))
      .then(function () {
        // ===== Detection =====
        t.suite("detect");

        CASES.forEach(function (name) {
          t.eq(P.detect(loaded[name + ".zip"]), "zip", name + ".zip is a zip");
          t.eq(P.detect(loaded[name + ".json"]), "json", name + ".json is json");
          t.eq(P.detect(loaded[name + ".txt"]), "text", name + ".txt is text with a header");
        });

        t.eq(P.detect(bytesOf("2026-08-26T07:19:11.214967Z INFO    signed in\n")), "text-headerless",
          "a bare logs.txt is recognised without its header");
        t.eq(P.detect(bytesOf("hello, this is not a bundle")), "unknown", "prose is not a bundle");
        t.eq(P.detect(bytesOf("{\"a\":1}")), "json", "an object is json even if it is not a bundle");
        t.eq(P.detect(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2])), "png", "a png is a png");

        // ===== json =====
        t.suite("json");

        var ordinary = P.parseJson(new TextDecoder().decode(loaded["ordinary.json"]));

        t.eq(ordinary.entries.length, 5, "ordinary.json has five entries");
        t.eq(ordinary.report.description, "The client list was empty after I pressed refresh", "the description comes through");
        t.eq(ordinary.report.truncated, false, "ordinary is not truncated");
        t.eq(ordinary.report.metadata.app_version, "1.0.17+2185", "metadata comes through");
        t.eq(ordinary.exact, true, "json is the exact rendering");
        t.deep(ordinary.entries[1].extra, { status: 500, authorization: "Bearer «redacted»", ms: 1840 },
          "extra survives as an object, redaction mark included");
        t.eq(ordinary.entries[4].level, "error", "the last entry is the error");
        t.eq(ordinary.entries[4].error, "Bad state: clients came back null", "the error text is separate from the message");
        t.ok(/^#0\s+ClientsCubit\.load/.test(ordinary.entries[4].stackTrace), "the stack starts at frame zero");
        t.ok(/<asynchronous suspension>$/.test(ordinary.entries[4].stackTrace), "the suspension marker is kept");
        t.eq(ordinary.entries[3].message, "paid with card ************4242", "the masked card is left as written");

        var none = P.parseJson(new TextDecoder().decode(loaded["no_metadata.json"]));
        t.eq(none.report.metadata, null, "no metadata means null, not an empty object");
        t.eq(none.report.description, null, "an absent description is null");
        t.eq(none.entries[0].extra, null, "an absent extra is null");
        t.eq(none.entries[0].error, null, "an absent error is null");
        t.eq(none.entries[0].stackTrace, null, "an absent stack is null");

        var empty = P.parseJson(new TextDecoder().decode(loaded["empty.json"]));
        t.eq(empty.entries.length, 0, "a report with nothing logged is still a bundle");
        t.eq(empty.report.entryCount, 0, "and it counts zero");

        // ===== text =====
        t.suite("text");

        var ordinaryTxt = P.parseText(new TextDecoder().decode(loaded["ordinary.txt"]));

        t.eq(ordinaryTxt.source, "text", "the header is recognised");
        t.eq(ordinaryTxt.exact, false, "text is not the exact rendering and says so");
        t.eq(ordinaryTxt.entries.length, 5, "ordinary.txt has five entries");
        t.eq(ordinaryTxt.report.entryCount, 5, "entry_count is read as a number");
        t.eq(ordinaryTxt.report.truncated, false, "truncated is read as a boolean");
        t.deep(ordinaryTxt.report.metadata,
          { app_version: "1.0.17+2185", platform: "android", os_version: "Android 14" },
          "the metadata block is read whole");

        var multiline = P.parseText(new TextDecoder().decode(loaded["multiline_message.txt"]));
        t.eq(multiline.entries.length, 3, "an unindented multi-line message does not split into extra entries");
        t.eq(multiline.entries[1].message.split("\n").length, 3, "its three lines stay one message");
        t.ok(multiline.entries[1].message.indexOf("EXCEPTION CAUGHT BY WIDGETS LIBRARY") !== -1,
          "the banner is at the top of it");
        t.ok(multiline.entries[1].message.indexOf("RenderFlex overflowed") !== -1,
          "and the last line is still part of it");

        var wrapped = P.parseText(new TextDecoder().decode(loaded["multiline_description.txt"]));
        t.eq(wrapped.report.description, "I pressed refresh\nand then pay\nand the list was still empty",
          "a wrapped description is put back together");
        t.eq(wrapped.entries.length, 1, "and the entries after it are unaffected");

        var emptyTxt = P.parseText(new TextDecoder().decode(loaded["empty.txt"]));
        t.eq(emptyTxt.entries.length, 0, "a header with no entries under it parses to none");
        t.ok(emptyTxt.report.generatedAt, "and still has its generated_at");

        var bare = P.parseText("2026-08-26T07:19:11.214967Z INFO    signed in\n");
        t.eq(bare.source, "text-headerless", "a logs.txt on its own parses without a header");
        t.eq(bare.entries.length, 1, "and its entry is read");
        t.eq(bare.report.generatedAt, null, "with nothing claimed about the report");

        // ===== The two renderings agree =====
        t.suite("text and json agree");

        CASES.forEach(function (name) {
          if (UNEVEN[name]) return;

          var fromJson = P.parseJson(new TextDecoder().decode(loaded[name + ".json"]));
          var fromText = P.parseText(new TextDecoder().decode(loaded[name + ".txt"]));

          t.deep(shape(fromText), shape(fromJson), name + ": text reconstructs exactly what json states");
          t.eq(fromText.report.description, fromJson.report.description, name + ": same description");
          t.deep(fromText.report.metadata, fromJson.report.metadata, name + ": same metadata");
          t.eq(fromText.report.generatedAt, fromJson.report.generatedAt, name + ": same generated_at");
          t.eq(fromText.report.truncated, fromJson.report.truncated, name + ": same truncated flag");
        });

        // ===== zip =====
        t.suite("zip");

        return root.FBR.unzip.read(loaded["ordinary.zip"]).then(function (inside) {
          var names = inside.map(function (f) { return f.name; }).sort();
          t.deep(names, ["logs.txt", "report.json"], "a zip holds logs.txt and report.json");

          var logs = inside.filter(function (f) { return f.name === "logs.txt"; })[0];
          t.eq(P.detect(logs.bytes), "text-headerless", "the logs.txt inside a zip carries no header");

          return root.FBR.unzip.read(loaded["screenshot.zip"]);
        }).then(function (inside) {
          var names = inside.map(function (f) { return f.name; }).sort();
          t.deep(names, ["logs.txt", "report.json", "screenshot.png"], "a zip with a screenshot holds three files");
        });
      })
      .then(function () {
        // ===== Opening, end to end =====
        t.suite("open");

        var opens = CASES.map(function (name) {
          return P.open([{ name: name + ".zip", bytes: loaded[name + ".zip"] }]).then(function (bundle) {
            t.eq(bundle.source, "zip", name + ".zip opens as a zip");
            t.eq(bundle.exact, true, name + ".zip is read from its report.json, so it is exact");

            var fromJson = P.parseJson(new TextDecoder().decode(loaded[name + ".json"]));

            // The zip and the standalone json were built separately and
            // trimmed separately, so only the even cases match entry for
            // entry.
            if (!UNEVEN[name]) {
              t.deep(shape(bundle), shape(fromJson), name + ".zip holds the same entries as its json");
            }

            if (name === "screenshot") {
              t.ok(bundle.screenshot instanceof Uint8Array, "the screenshot comes out of the zip as bytes");
              t.eq(bundle.report.screenshot, "screenshot.png", "and the report names it");
              t.eq(bundle.notices.filter(function (n) {
                return n.text.indexOf("Ask for the .zip") !== -1;
              }).length, 0, "with no complaint about a missing image");
            }
          });
        });

        return Promise.all(opens);
      })
      .then(function () {
        // ===== What the reader is warned about =====
        t.suite("notices");

        return P.open([{ name: "truncated.json", bytes: loaded["truncated.json"] }]).then(function (bundle) {
          t.eq(bundle.report.truncated, true, "truncated is carried through");
          t.ok(bundle.notices.some(function (n) {
            return n.kind === "warn" && n.text.indexOf("beginning of the session is missing") !== -1;
          }), "and the reader is told the beginning is what went");

          return P.open([{ name: "ordinary.txt", bytes: loaded["ordinary.txt"] }]);
        }).then(function (bundle) {
          t.ok(bundle.notices.some(function (n) {
            return n.text.indexOf("Read from text") !== -1;
          }), "a text bundle says its field boundaries are inferred");

          return P.open([{ name: "screenshot.json", bytes: loaded["screenshot.json"] }]);
        }).then(function (bundle) {
          t.eq(bundle.report.screenshot, null, "0.3.1 json does not claim a screenshot it cannot carry");
          t.eq(bundle.notices.length, 0, "so there is nothing to warn about");

          // The text form of the same case, read on its own: the flag
          // has to survive the header parser, not just the json one.
          var text = P.parseText(new TextDecoder().decode(loaded["truncated.txt"]));
          t.eq(text.report.truncated, true, "a text bundle's truncated flag is read as true");
          t.eq(text.entries.length, 5, "and the text form kept five entries where the json kept two");

          // A count that disagrees with what is there. Nothing in the
          // fixtures can be damaged, so this one is built.
          return P.openText(JSON.stringify({
            report: { generated_at: "2026-08-26T07:19:11.214967Z", entry_count: 5, truncated: false },
            entries: [{ time: "2026-08-26T07:19:11.214967Z", level: "info", message: "signed in" }]
          }));
        }).then(function (bundle) {
          t.ok(bundle.notices.some(function (n) {
            return n.kind === "warn" && n.text.indexOf("counts 5 entries but 1 are here") !== -1;
          }), "a report counting more entries than it holds is called out as damaged");
        });
      })
      .then(function () {
        // ===== Bundles from before 0.3.1, which never stop existing =====
        t.suite("older bundles");

        // These are not an approximation of the old format. They came
        // out of the builder at tag v0.3.0, which is the only thing that
        // can say what the old format was.
        //
        // Exactly three files differ between v0.3.0 and v0.3.1 and these
        // are all of them; everything else the two versions write is
        // byte-identical. So the two shapes handled here are not the ones
        // that happened to be thought of — they are the complete set.
        var old = P.parseText(new TextDecoder().decode(loaded["legacy/multiline_description.txt"]));

        t.eq(old.report.description, "I pressed refresh\nand then pay\nand the list was still empty",
          "a v0.3.0 description wrapped without indentation is put back together");
        t.eq(old.report.entryCount, 1, "and the field after it is still read");
        t.eq(old.report.truncated, false, "and the one after that");
        t.deep(old.report.metadata,
          { app_version: "1.0.17+2185", platform: "android", os_version: "Android 14" },
          "and the metadata block below it is untouched");
        t.eq(old.entries.length, 1, "and so are the entries");

        // The same case as 0.3.1 writes it. Two renderings of one report,
        // and the reader must not be able to tell which they were sent.
        var now = P.parseText(new TextDecoder().decode(loaded["multiline_description.txt"]));
        t.eq(old.report.description, now.report.description,
          "0.3.0 and 0.3.1 wrapping read back identically");
        t.deep(shape(old), shape(now), "with the same entries under them");

        // The harder shape, which no fixture has because the builder
        // could not produce it: a continuation line that is a single word
        // and a colon, indistinguishable from a header field. Only a
        // description may swallow one.
        var shadow = P.parseText([
          "=== flutter_bug_report ===",
          "generated_at: 2026-08-26T07:19:11.214967Z",
          "description: I pressed pay",
          "then: nothing happened at all",
          "entry_count: 0",
          "truncated: false",
          "==================",
          ""
        ].join("\n"));

        t.eq(shadow.report.description, "I pressed pay\nthen: nothing happened at all",
          "a continuation that reads exactly like a field stays in the description");
        t.eq(shadow.report.entryCount, 0, "and the real field after it is still read");

        // v0.3.0 named a screenshot in text and json, where one can never
        // be. Both forms of the claim, from the builder that made it.
        var claimedText = P.parseText(new TextDecoder().decode(loaded["legacy/screenshot.txt"]));
        var claimedJson = P.parseJson(new TextDecoder().decode(loaded["legacy/screenshot.json"]));

        t.eq(claimedText.report.screenshot, "screenshot.png", "a v0.3.0 text bundle claims a screenshot");
        t.eq(claimedJson.report.screenshot, "screenshot.png", "and so does its json");
        t.eq(claimedText.report.description, "the button is off the screen",
          "and the field written after the claim is still read");

        return P.open([{ name: "screenshot.json", bytes: loaded["legacy/screenshot.json"] }]).then(function (bundle) {
          t.eq(bundle.screenshot, null, "nothing is found to go with the claim");
          t.ok(bundle.notices.some(function (n) {
            return n.text.indexOf("Ask for the .zip") !== -1;
          }), "so the reader is told to ask for the zip rather than left hunting");

          return P.open([{ name: "logs.txt", bytes: loaded["legacy/screenshot.txt"] }]);
        }).then(function (bundle) {
          t.ok(bundle.notices.some(function (n) {
            return n.text.indexOf("Ask for the .zip") !== -1;
          }), "and the same for the text form of the claim");

          // 0.3.1 makes no such claim, so there must be nothing to say.
          return P.open([{ name: "screenshot.txt", bytes: loaded["screenshot.txt"] }]);
        }).then(function (bundle) {
          t.eq(bundle.report.screenshot, null, "0.3.1 text claims no screenshot");
          t.eq(bundle.notices.filter(function (n) {
            return n.text.indexOf("Ask for the .zip") !== -1;
          }).length, 0, "and is not warned about one");
        });
      })
      .then(function () {
        // ===== Files that arrive in pieces =====
        t.suite("loose files");

        return root.FBR.unzip.read(loaded["screenshot.zip"]).then(function (inside) {
          // Somebody unzipped it, looked, and dragged all three in.
          return P.open(inside).then(function (bundle) {
            t.eq(bundle.source, "files", "three loose files make one bundle");
            t.eq(bundle.exact, true, "read from report.json, so exact");
            t.ok(bundle.screenshot instanceof Uint8Array, "the loose screenshot is attached");
            t.eq(bundle.entries.length, 1, "and the entries come from the json");

            // Only logs.txt survived the trip.
            var logs = inside.filter(function (f) { return f.name === "logs.txt"; });
            return P.open(logs);
          }).then(function (bundle) {
            t.eq(bundle.entries.length, 1, "a lone logs.txt still opens");
            t.eq(bundle.exact, false, "and is honest that it was read from text");
          });
        });
      })
      .then(function () {
        // ===== Files that are wrong =====
        t.suite("damaged and unwelcome");

        var png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);

        return t.rejects(P.open([{ name: "shot.png", bytes: png }]), "an image on its own is refused")
          .then(function () {
            return t.rejects(P.open([file("notes.txt", "just some prose about the bug")]),
              "prose is refused");
          })
          .then(function () {
            // A download that stopped early: the end record goes first.
            var cut = loaded["ordinary.zip"].slice(0, loaded["ordinary.zip"].length - 8);
            return t.rejects(P.open([{ name: "ordinary.zip", bytes: cut }]),
              "a zip missing its end record is refused");
          })
          .then(function () {
            // One byte of the compressed payload flipped. Usually the
            // DEFLATE stream itself objects, which is a fine way to
            // find out.
            var bent = loaded["ordinary.zip"].slice();
            bent[60] = bent[60] ^ 0xff;
            return t.rejects(P.open([{ name: "ordinary.zip", bytes: bent }]),
              "a zip whose payload was corrupted is refused");
          })
          .then(function () {
            // The checksum on its own. Corrupting the recorded CRC
            // rather than the payload means everything else about the
            // file is valid and inflates cleanly — so only the checksum
            // comparison can reject it. Without that test the CRC code
            // can be deleted and nothing here notices.
            var bent = loaded["ordinary.zip"].slice();
            var view = new DataView(bent.buffer, bent.byteOffset, bent.byteLength);

            var eocd = -1;
            for (var at = bent.length - 22; at >= 0 && eocd === -1; at--) {
              if (view.getUint32(at, true) === 0x06054b50) eocd = at;
            }

            var directory = view.getUint32(eocd + 16, true);
            view.setUint32(directory + 16, view.getUint32(directory + 16, true) ^ 0xffffffff, true);

            return t.rejects(P.open([{ name: "ordinary.zip", bytes: bent }]),
              "a zip whose contents no longer match its checksum is refused");
          })
          .then(function () {
            return t.rejects(P.open([]), "nothing at all is refused");
          })
          .then(function () {
            // A zip claiming a file is bigger than what came out of it.
            var wrong = makeZip([{ name: "report.json", text: "{\"entries\":[]}" }], "size");
            return t.rejects(P.open([{ name: "bent.zip", bytes: wrong }]),
              "a zip whose stated size does not match what it holds is refused");
          })
          .then(function () {
            return t.rejects(P.openText("{\"entries\": \"not an array\"}"),
              "json without an entries array is refused");
          });
      })
      .then(function () {
        // ===== A browser that cannot inflate =====
        //
        // Two different browsers land here and the reader must not be
        // able to tell which. One has no DecompressionStream; the other
        // has one that has never heard of "deflate-raw", which is every
        // Chrome between 80 and 102. Testing only the first leaves the
        // second showing a bare TypeError.
        t.suite("a browser that cannot inflate");

        var real = root.DecompressionStream;
        var advice = /Chrome 103[\s\S]*\.json or \.txt/;

        function broken(how) {
          if (how === "absent") delete root.DecompressionStream;
          else root.DecompressionStream = function () { throw new TypeError("Unsupported format"); };
        }

        function mended() {
          root.DecompressionStream = real;
        }

        function refusedWith(promise, what) {
          return promise.then(function () {
            t.record(what, "expected it to be rejected, but it resolved");
          }, function (error) {
            t.record(what, advice.test(error.message) ? null :
              "expected the advice about older browsers, got " + show(error.message));
          });
        }

        broken("absent");

        return refusedWith(
          P.open([{ name: "ordinary.zip", bytes: loaded["ordinary.zip"] }]),
          "a browser with no DecompressionStream is told which versions can, and what to ask for"
        ).then(function () {
          // The advice is only worth giving if it is true. Neither of the
          // forms it names goes near DecompressionStream, and this is
          // what keeps that so.
          return P.open([{ name: "ordinary.json", bytes: loaded["ordinary.json"] }]);
        }).then(function (bundle) {
          t.eq(bundle.entries.length, 5, "and the .json it recommends opens on that same browser");

          return P.open([{ name: "ordinary.txt", bytes: loaded["ordinary.txt"] }]);
        }).then(function (bundle) {
          t.eq(bundle.entries.length, 5, "and so does the .txt");

          // A zip of stored entries never inflates anything, so it opens
          // even here.
          var stored = makeZip([{ name: "report.json", text: JSON.stringify({
            report: { generated_at: "2026-08-26T07:19:11.214967Z", entry_count: 1, truncated: false },
            entries: [{ time: "2026-08-26T07:19:11.214967Z", level: "info", message: "signed in" }]
          }) }]);

          return P.open([{ name: "stored.zip", bytes: stored }]);
        }).then(function (bundle) {
          t.eq(bundle.entries.length, 1, "and an uncompressed zip needs no inflating at all");

          // The other browser: it has the constructor, and the
          // constructor throws.
          broken("throws");

          return refusedWith(
            P.open([{ name: "ordinary.zip", bytes: loaded["ordinary.zip"] }]),
            "a browser whose DecompressionStream rejects deflate-raw gets the same sentence, not a TypeError"
          );
        }).then(function () {
          mended();
          return P.open([{ name: "ordinary.zip", bytes: loaded["ordinary.zip"] }]);
        }).then(function (bundle) {
          t.eq(bundle.entries.length, 5, "and a browser that can inflate is unaffected");
        }, function (error) {
          mended();
          throw error;
        });
      })
      .then(function () {
        // ===== A zip that came from somewhere else =====
        t.suite("a zip from elsewhere");

        // Somebody unzipped a bundle on a Mac, read it, and zipped the
        // folder again. Finder stores small files uncompressed and puts
        // its own bookkeeping in beside them — neither of which the
        // bundle's own writer ever produces, and both of which turn up
        // in a ticket sooner or later.
        var body = JSON.stringify({
          report: { generated_at: "2026-08-26T07:19:11.214967Z", entry_count: 1, truncated: false },
          entries: [{ time: "2026-08-26T07:19:11.214967Z", level: "info", message: "signed in" }]
        });

        var refolded = makeZip([
          { name: "__MACOSX/", text: "" },
          { name: "__MACOSX/._logs.txt", text: " Mac OS X        " },
          { name: "logs.txt", text: "2026-08-26T07:19:11.214967Z INFO    signed in\n" },
          { name: "._report.json", text: " Mac OS X        " },
          { name: "report.json", text: body }
        ]);

        return root.FBR.unzip.read(refolded).then(function (inside) {
          var names = inside.map(function (f) { return f.name; }).sort();

          t.deep(names, ["logs.txt", "report.json"],
            "a re-zipped bundle drops the folders and the resource forks beside it");

          return P.open([{ name: "refolded.zip", bytes: refolded }]);
        }).then(function (bundle) {
          t.eq(bundle.entries.length, 1, "and what is left reads as a bundle");
          t.eq(bundle.entries[0].message, "signed in", "with its entry intact");
          t.eq(bundle.exact, true, "out of the report.json, not the logs.txt");
        });
      })
      .then(function () {
        // ===== Text that went through something =====
        t.suite("text that was handled");

        var text = new TextDecoder().decode(loaded["ordinary.txt"]);
        var clean = P.parseText(text);

        var crlf = P.parseText(text.replace(/\n/g, "\r\n"));
        t.deep(shape(crlf), shape(clean), "a bundle that went through a Windows client reads the same");

        var bom = P.parseText("﻿" + text);
        t.deep(shape(bom), shape(clean), "a byte-order mark from a text editor is ignored");
        t.eq(bom.report.generatedAt, clean.report.generatedAt, "and does not stick to the first field");

        // A continuation line that opens with a timestamp of its own —
        // an app logging what a server told it — must not be mistaken
        // for the start of an entry. The padded level is the only thing
        // that separates the two, so this is the test that the padding
        // in the boundary is load-bearing.
        var quoting = P.parseText([
          "2026-08-26T07:19:11.214967Z INFO    request failed",
          "2026-08-26T07:19:11.999999Z was the deadline the server gave",
          "2026-08-26T07:19:11.300000Z ERROR   gave up"
        ].join("\n"));

        t.eq(quoting.entries.length, 2, "a timestamp inside a message does not open an entry");
        t.eq(quoting.entries[0].message.split("\n").length, 2, "it stays part of the message it was written in");

        // The harder half of the same problem: a line carrying both a
        // timestamp and a level, which is what an app logs when it
        // repeats what an upstream service told it. Only the padding
        // says it was not written by the builder — one space after
        // ERROR where the builder always writes three.
        var requoted = P.parseText([
          "2026-08-26T07:19:11.214967Z ERROR   upstream failed",
          "2026-08-26T07:19:11.999999Z ERROR came from the upstream service",
          "2026-08-26T07:19:11.300000Z INFO    retrying"
        ].join("\n"));

        t.eq(requoted.entries.length, 2, "a quoted log line with the wrong padding does not open an entry");
        t.eq(requoted.entries[0].message.split("\n").length, 2, "it belongs to the entry that logged it");
        t.eq(requoted.entries[1].level, "info", "and the entry after it is still read correctly");

        // ===== The shape of a session =====
        //
        // Everything the density strip is going to be drawn from comes
        // out of here: times as numbers, in order, with the distance
        // between them meaning what it appears to mean.
        t.suite("time");

        var timeline = P.parseJson(new TextDecoder().decode(loaded["timeline.json"]));
        var timelineText = P.parseText(new TextDecoder().decode(loaded["timeline.txt"]));

        t.eq(timeline.entries.length, 14, "the timeline case has fourteen entries");
        t.ok(timeline.entries.every(function (e) { return typeof e.at === "number"; }),
          "every entry carries a time as a number");
        t.ok(timelineText.entries.every(function (e) { return typeof e.at === "number"; }),
          "including the ones read out of the text form");
        t.deep(timelineText.entries.map(function (e) { return e.at; }),
          timeline.entries.map(function (e) { return e.at; }),
          "and the two forms put them at the same instants");
        t.deep(shape(timelineText), shape(timeline), "and text and json agree on all of them");

        var ordered = timeline.entries.every(function (entry, i) {
          return i === 0 || entry.at >= timeline.entries[i - 1].at;
        });
        t.ok(ordered, "entries run oldest first");

        var gaps = timeline.entries.map(function (entry, i) {
          return i === 0 ? 0 : entry.at - timeline.entries[i - 1].at;
        });
        var widest = gaps.reduce(function (best, gap, i) {
          return gap > gaps[best] ? i : best;
        }, 0);

        t.eq(widest, 6, "the widest gap falls where the session went quiet");
        t.eq(gaps[widest], 31500, "and it is thirty-one and a half seconds wide");
        t.ok(gaps.filter(function (g, i) { return i > 0 && g < 1000; }).length >= 8,
          "while most of the session moves in well under a second");

        var errors = timeline.entries.filter(function (e) { return e.level === "error"; });
        t.eq(errors.length, 6, "the burst at the end is six errors");
        t.eq(errors[4].at - errors[0].at, 160, "five of them inside a sixth of a second");
        t.ok(timeline.entries[8].error.indexOf("TimeoutException") === 0,
          "and each carries its timeout as a separate error, not in the message");

        // Microseconds are cut, not rounded up into the next millisecond,
        // so a gap measured here is never wider than the one that happened.
        t.eq(timeline.entries[0].at, Date.parse("2026-08-26T07:19:11.214Z"),
          "sub-millisecond precision is dropped rather than guessed at");

        return t;
      });
  }

  root.FBRTests = { run: run, CASES: CASES };
})(typeof globalThis !== "undefined" ? globalThis : this);
