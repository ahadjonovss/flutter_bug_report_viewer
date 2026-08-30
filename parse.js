(function (root) {
  "use strict";

  // ===================================================================
  //  Reading a flutter_bug_report bundle.
  //
  //  Three renderings of the same thing: a zip holding both, a json
  //  object, and a text document. All three come out of here as one
  //  shape, so nothing downstream has to know which arrived.
  //
  //  Nothing in this file touches the DOM. It runs in a test as easily
  //  as in the page, which is the only way the text parser below is
  //  going to stay correct.
  // ===================================================================

  var LEVELS = ["debug", "info", "warning", "error"];

  // The header fields the builder writes, in the order it writes them.
  // Used to tell a new field from a line of a description that happens to
  // read like one — see readHeader.
  var FIELDS = ["generated_at", "description", "entry_count", "truncated", "screenshot", "metadata"];

  // How a level is written in a text bundle: upper case, padded to seven
  // so every message starts at the same column.
  function label(level) {
    return (level.toUpperCase() + "       ").slice(0, 7);
  }

  // The entry boundary, and the whole basis of the text parser.
  //
  // Anchored on the timestamp *and* the exact padding, never on
  // indentation: the builder writes a message raw, and a message that
  // arrived through debugPrint can be a Flutter error banner spanning
  // several unindented lines. Indentation cannot say where an entry ends.
  // Demanding the padding is what stops a line that merely quotes a
  // timestamp from being mistaken for the start of one.
  var ENTRY = new RegExp(
    "^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{1,6}Z) (" +
    LEVELS.map(label).join("|") +
    ") (.*)$"
  );

  var HEADER_OPEN = "=== flutter_bug_report ===";
  var HEADER_CLOSE = /^={3,}$/;

  // A field at the top of the header block: no indentation, snake_case,
  // a colon.
  var FIELD = /^([a-z_][a-z0-9_]*):[ ]?(.*)$/;

  // A stack frame, once the two-space indent is off. The suspension
  // marker is a frame for our purposes: the builder keeps it, and it is
  // the line that explains a gap in the trace.
  var FRAME = /^(#\d+\s|<asynchronous suspension>$|<\.\.\.\s|<\.\.\.>$)/;

  var PNG = [0x89, 0x50, 0x4e, 0x47];
  var ZIP = [0x50, 0x4b];

  function starts(bytes, signature) {
    if (bytes.length < signature.length) return false;
    for (var i = 0; i < signature.length; i++) {
      if (bytes[i] !== signature[i]) return false;
    }
    return true;
  }

  function decode(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  // \r\n from a bundle that went through a Windows mail client, and the
  // byte-order mark a text editor adds when it saves one.
  function lines(text) {
    return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  }

  // An entry's time as a number, for measuring the distance between two
  // of them.
  //
  // The bundle writes microseconds and a Date holds milliseconds, so the
  // tail is cut here rather than left to an engine to be lenient about.
  // Precision beyond a millisecond is not something a reader is going to
  // act on; a thirty-second gap in the middle of a session is.
  function epoch(time) {
    if (typeof time !== "string") return null;

    var value = Date.parse(time.replace(/\.(\d{3})\d+Z$/, ".$1Z"));

    return isNaN(value) ? null : value;
  }

  function indented(line) {
    return line.slice(0, 2) === "  ";
  }

  function dedent(line) {
    return indented(line) ? line.slice(2) : line;
  }

  // ===================================================================
  //  Text
  // ===================================================================

  // Everything up to the rule of equals signs.
  //
  // Two kinds of continuation live in here. `metadata:` opens a block of
  // indented `key: value` pairs. A description can also wrap, because the
  // sheet takes four lines — indented since 0.3.1, and bare in every
  // bundle written before it, which is why an unrecognised line falls
  // through to the field above rather than being dropped.
  function readHeader(all, from) {
    var report = { metadata: null };
    var raw = {};
    var key = null;
    var at = from;

    for (; at < all.length; at++) {
      var line = all[at];

      if (HEADER_CLOSE.test(line)) {
        at++;
        break;
      }

      var field = FIELD.exec(line);

      // A known field always opens a new one. An unknown one does too,
      // so a field added to the format later is not swallowed — except
      // while a description is open, since that is the only free-text
      // field and the only place a stray `word: value` can legitimately
      // appear.
      if (field && (FIELDS.indexOf(field[1]) !== -1 || key !== "description")) {
        key = field[1];
        raw[key] = field[2];
        if (key === "metadata") report.metadata = {};
        continue;
      }

      if (key === null) continue;

      if (key === "metadata" && indented(line)) {
        var pair = FIELD.exec(dedent(line));
        if (pair) report.metadata[pair[1]] = pair[2];
        continue;
      }

      raw[key] += "\n" + dedent(line);
    }

    report.generatedAt = raw.generated_at || null;
    report.description = raw.description || null;
    report.entryCount = raw.entry_count === undefined ? null : Number(raw.entry_count);
    report.truncated = raw.truncated === "true";
    report.screenshot = raw.screenshot || null;

    return { report: report, next: at };
  }

  // The lines that followed an entry's own line, sorted back into the
  // fields they were written from.
  //
  // Best-effort, and knowingly so. The builder writes extra, then error,
  // then frames, each indented two spaces — but an unindented run at the
  // front is the rest of a multi-line message, and there is no marker
  // separating error from extra beyond their shape.
  function readTail(entry, rest) {
    var i = 0;
    while (i < rest.length && !indented(rest[i])) {
      entry.message += "\n" + rest[i];
      i++;
    }

    var tail = rest.slice(i).map(dedent);

    // Frames come last, so they are taken from the back. Anything that
    // stops matching ends the trace.
    var end = tail.length;
    while (end > 0 && FRAME.test(tail[end - 1])) end--;

    if (end < tail.length) entry.stackTrace = tail.slice(end).join("\n");

    var head = tail.slice(0, end);

    // extra is written as one line of compact JSON. Joined progressively
    // anyway, because a value inside it can carry a newline of its own.
    if (head.length && head[0].charAt(0) === "{") {
      for (var take = 1; take <= head.length; take++) {
        var parsed = asObject(head.slice(0, take).join("\n"));
        if (parsed !== undefined) {
          entry.extra = parsed;
          head = head.slice(take);
          break;
        }
      }
    }

    if (head.length) entry.error = head.join("\n");
  }

  // undefined rather than null when it is not an object: null is a value
  // the log itself can hold.
  function asObject(text) {
    try {
      var value = JSON.parse(text);
      return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
    } catch (e) {
      return undefined;
    }
  }

  function readEntries(all, from) {
    var entries = [];
    var open = null;
    var rest = [];

    function close() {
      if (!open) return;
      while (rest.length && rest[rest.length - 1] === "") rest.pop();
      if (rest.length) readTail(open, rest);
      entries.push(open);
      open = null;
      rest = [];
    }

    for (var at = from; at < all.length; at++) {
      var match = ENTRY.exec(all[at]);

      if (match) {
        close();
        open = {
          index: entries.length,
          time: match[1],
          at: epoch(match[1]),
          level: match[2].trim().toLowerCase(),
          message: match[3],
          error: null,
          stackTrace: null,
          extra: null
        };
        continue;
      }

      if (open) rest.push(all[at]);
    }

    close();

    return entries;
  }

  function parseText(text) {
    var all = lines(text);
    var at = 0;

    while (at < all.length && all[at].trim() === "") at++;

    var header = all[at] === HEADER_OPEN
      ? readHeader(all, at + 1)
      : { report: { generatedAt: null, description: null, entryCount: null, truncated: false, screenshot: null, metadata: null }, next: at };

    return {
      source: all[at] === HEADER_OPEN ? "text" : "text-headerless",
      report: header.report,
      entries: readEntries(all, header.next),
      exact: false
    };
  }

  // ===================================================================
  //  JSON
  // ===================================================================

  function parseJson(text) {
    var whole;

    try {
      whole = JSON.parse(text);
    } catch (e) {
      throw new Error("This looks like JSON but does not parse: " + e.message);
    }

    if (!whole || typeof whole !== "object") throw new Error("This JSON is not a bundle.");
    if (!Array.isArray(whole.entries)) throw new Error("This JSON has no 'entries' array, so it is not a bundle.");

    var head = whole.report && typeof whole.report === "object" ? whole.report : {};

    return {
      source: "json",
      report: {
        generatedAt: head.generated_at || null,
        description: head.description || null,
        entryCount: head.entry_count === undefined ? null : head.entry_count,
        truncated: head.truncated === true,
        screenshot: head.screenshot || null,
        metadata: head.metadata && typeof head.metadata === "object" ? head.metadata : null
      },
      entries: whole.entries.map(function (row, index) {
        row = row && typeof row === "object" ? row : {};

        return {
          index: index,
          time: typeof row.time === "string" ? row.time : null,
          at: epoch(row.time),
          level: typeof row.level === "string" ? row.level.toLowerCase() : "info",
          message: typeof row.message === "string" ? row.message : "",
          error: typeof row.error === "string" ? row.error : null,
          stackTrace: typeof row.stack_trace === "string" ? row.stack_trace : null,
          extra: row.extra && typeof row.extra === "object" ? row.extra : null
        };
      }),
      exact: true
    };
  }

  // ===================================================================
  //  What kind of file is this
  // ===================================================================

  // By content, never by extension. A bundle arrives renamed, re-zipped,
  // or as a logs.txt somebody pulled out of the archive by hand, and the
  // name it carries by then says nothing.
  function detect(bytes) {
    if (starts(bytes, ZIP)) return "zip";
    if (starts(bytes, PNG)) return "png";

    var text;
    try {
      text = decode(bytes);
    } catch (e) {
      return "unknown";
    }

    var trimmed = text.replace(/^﻿/, "").replace(/^\s+/, "");

    if (trimmed.charAt(0) === "{") return asObject(trimmed) ? "json" : "unknown";
    if (trimmed.indexOf(HEADER_OPEN) === 0) return "text";

    var all = lines(trimmed);
    for (var i = 0; i < all.length; i++) {
      if (all[i].trim() === "") continue;
      return ENTRY.test(all[i]) ? "text-headerless" : "unknown";
    }

    return "unknown";
  }

  // ===================================================================
  //  Putting one together
  // ===================================================================

  function note(bundle, kind, text) {
    bundle.notices.push({ kind: kind, text: text });
  }

  // What is true of a bundle whichever way it arrived.
  function finish(bundle) {
    bundle.notices = bundle.notices || [];
    bundle.screenshot = bundle.screenshot || null;

    if (bundle.report.truncated) {
      note(bundle, "warn",
        "This bundle was cut to fit a limit. The beginning of the session is missing — " +
        "what you are reading is the end of it.");
    }

    var counted = bundle.report.entryCount;
    if (counted !== null && counted !== bundle.entries.length) {
      note(bundle, "warn",
        "The report counts " + counted + " entries but " + bundle.entries.length + " are here. " +
        "The file is damaged or was cut short.");
    }

    if (bundle.report.screenshot && !bundle.screenshot) {
      note(bundle, "note",
        "A screenshot was attached to this report, but it is not in this file — only a .zip can carry one. " +
        "Ask for the .zip form.");
    }

    if (!bundle.exact) {
      note(bundle, "note",
        "Read from text. Where a message ends and its error, extra and stack begin is inferred; " +
        "the .zip and .json forms say so exactly.");
    }

    var unknown = {};
    bundle.entries.forEach(function (entry) {
      if (LEVELS.indexOf(entry.level) === -1) unknown[entry.level] = true;
    });

    Object.keys(unknown).forEach(function (level) {
      note(bundle, "note", "This bundle carries a level this viewer does not know: '" + level + "'.");
    });

    return bundle;
  }

  function fromBytes(bytes, kind) {
    var bundle =
      kind === "json" ? parseJson(decode(bytes)) :
      parseText(decode(bytes));

    bundle.notices = [];

    return bundle;
  }

  // A bundle in pieces: logs.txt, report.json and screenshot.png, either
  // out of a zip or dropped together by somebody who unzipped it first.
  //
  // report.json wins where both are present. It is the exact rendering,
  // and logs.txt is the same entries with their edges rubbed off.
  function combine(files, source) {
    var screenshot = null;
    var json = null;
    var txt = null;

    files.forEach(function (file) {
      var kind = detect(file.bytes);

      if (kind === "png") screenshot = screenshot || file.bytes;
      else if (kind === "json") json = json || file.bytes;
      else if (kind === "text" || kind === "text-headerless") txt = txt || file.bytes;
    });

    if (!json && !txt) throw new Error("Nothing in here is a log. Expected logs.txt or report.json.");

    var bundle = fromBytes(json || txt, json ? "json" : "text");

    bundle.source = source;
    bundle.screenshot = screenshot;

    // The text form carries no header inside a zip, so where a bundle
    // came in as pieces and only logs.txt was readable, the report is
    // whatever report.json would have said — nothing.
    return bundle;
  }

  // The entry point. Takes what was dropped, gives back one bundle.
  //
  // Every input is { name, bytes }. Names are used for nothing but the
  // label at the top of the page; what a file is gets decided by reading
  // it.
  function open(files) {
    return Promise.resolve().then(function () {
      if (!files || !files.length) throw new Error("Nothing was dropped.");

      var zip = files.filter(function (file) {
        return detect(file.bytes) === "zip";
      });

      if (zip.length) {
        return root.FBR.unzip.read(zip[0].bytes).then(function (inside) {
          if (!inside.length) throw new Error("That zip is empty.");
          return finish(combine(inside, "zip"));
        });
      }

      if (files.length > 1) return finish(combine(files, "files"));

      var only = files[0];
      var kind = detect(only.bytes);

      if (kind === "png") {
        throw new Error("That is an image on its own. Drop it together with logs.txt or report.json, or drop the whole .zip.");
      }

      if (kind === "unknown") {
        throw new Error("This is not a flutter_bug_report bundle. Expected a .zip, a .json, or a log in text form.");
      }

      return finish(fromBytes(only.bytes, kind));
    });
  }

  // Pasted straight out of a terminal or an attachment preview, which is
  // where a log is about as often as it is in a file.
  function openText(text) {
    return Promise.resolve().then(function () {
      var bytes = new TextEncoder().encode(text);
      var kind = detect(bytes);

      if (kind !== "json" && kind !== "text" && kind !== "text-headerless") {
        throw new Error("That does not read like a bundle or a log.");
      }

      return finish(fromBytes(bytes, kind));
    });
  }

  root.FBR = root.FBR || {};
  root.FBR.parse = {
    open: open,
    openText: openText,
    detect: detect,
    parseText: parseText,
    parseJson: parseJson,
    LEVELS: LEVELS,
    ENTRY: ENTRY
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
