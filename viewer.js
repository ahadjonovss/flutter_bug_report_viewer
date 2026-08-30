(function () {
  "use strict";

  // ===================================================================
  //  The page.
  //
  //  Everything that knows what a bundle is lives in parse.js; this file
  //  only draws one. It never builds markup from a string — a bundle
  //  carries an app's real output, including whatever a server put in a
  //  response body, and text from a log goes into the document as text
  //  or not at all.
  // ===================================================================

  var LEVELS = ["debug", "info", "warning", "error"];

  // How much of a pause is worth interrupting the log to point at. Below
  // a second or two everything looks like a gap and nothing is one.
  var GAP = 2000;

  // Rows are appended in batches as the reader scrolls. A bundle is
  // bounded to 256KB by default but the limit is the caller's to raise,
  // and laying out ten thousand rows before the first one can be read is
  // a poor trade for a file somebody opened to look at one error.
  var CHUNK = 400;

  var el = {};
  ["drop", "picker", "fail", "view", "strip", "canvas", "search", "chips", "meta",
   "zone", "copy", "close", "banners", "log", "side"].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var bundle = null;
  var shown = [];        // the entries passing the filter, in order
  var drawn = 0;         // how many of them are in the document
  var muted = {};
  var needle = "";
  var utc = false;
  var here = -1;         // the entry the reader was last sent to
  var name = "";
  var shotUrl = null;

  // ===== Small DOM helpers =====

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ===== Writing log text into the page =====

  // A search hit, marked without letting the log's own text become
  // markup: the text goes in as text and the marks are built around it.
  function mark(target, text, hunt) {
    if (!text) return;

    if (!hunt) {
      target.appendChild(document.createTextNode(text));
      return;
    }

    var lower = text.toLowerCase();
    var from = 0;

    for (;;) {
      var hit = lower.indexOf(hunt, from);
      if (hit === -1) break;

      target.appendChild(document.createTextNode(text.slice(from, hit)));
      target.appendChild(make("mark", null, text.slice(hit, hit + hunt.length)));
      from = hit + hunt.length;
    }

    target.appendChild(document.createTextNode(text.slice(from)));
  }

  // What the redactor leaves behind. Two shapes, and they mean different
  // things — see redaction() below.
  var REDACTION = /«redacted»|\*{4,}\d{2,4}/g;

  function barred(target, className, text, why) {
    var span = make("span", "red " + className, text);
    span.title = why;
    target.appendChild(span);
  }

  // A value that was taken away entirely reads as a filled bar: there is
  // nothing to read and it is visibly nothing.
  //
  // A card number is not the same case. The redactor keeps the last four
  // digits deliberately — it checks Luhn first, so an invoice number is
  // not starred by accident — because those four are what lets somebody
  // match a payment to a transaction. Barring them along with the rest
  // would throw away the part the package went to trouble to keep.
  function redaction(target, text) {
    if (text.charAt(0) !== "*") {
      barred(target, "red--full", text, "A value was removed before this bundle was written.");
      return;
    }

    var stars = text.match(/^\*+/)[0];

    barred(target, "red--mask", stars, "Digits removed before this bundle was written.");
    if (text.length > stars.length) {
      barred(target, "red--keep", text.slice(stars.length),
        "Kept on purpose: the last digits of a card, so a payment can still be matched.");
    }
  }

  function write(target, text, hunt) {
    var from = 0;
    var match;

    REDACTION.lastIndex = 0;

    while ((match = REDACTION.exec(text)) !== null) {
      mark(target, text.slice(from, match.index), hunt);
      redaction(target, match[0]);
      from = match.index + match[0].length;
    }

    mark(target, text.slice(from), hunt);
  }

  function countRedactions(entries) {
    var n = 0;

    entries.forEach(function (entry) {
      var text = entry.message + " " + (entry.error || "") + " " +
        (entry.extra ? JSON.stringify(entry.extra) : "");
      var found = text.match(REDACTION);
      if (found) n += found.length;
    });

    return n;
  }

  // ===== extra, as a tree =====

  function leaf(value, hunt) {
    var span = make("span");

    if (typeof value === "string") {
      span.className = "json__str";
      write(span, '"' + value + '"', hunt);
      return span;
    }

    span.className = value === null ? "json__null" :
      typeof value === "number" ? "json__num" : "json__bool";
    span.textContent = String(value);

    return span;
  }

  function key(label, hunt) {
    var span = make("span", "json__key");
    write(span, label, hunt);
    span.appendChild(document.createTextNode(": "));
    return span;
  }

  function node(value, hunt, depth, label) {
    if (value === null || typeof value !== "object") {
      var line = make("div", "json__line");
      if (label !== null) line.appendChild(key(label, hunt));
      line.appendChild(leaf(value, hunt));
      return line;
    }

    var isArray = Array.isArray(value);
    var keys = isArray ? null : Object.keys(value);
    var count = isArray ? value.length : keys.length;
    var open = isArray ? "[" : "{";
    var shut = isArray ? "]" : "}";

    if (!count) {
      var flat = make("div", "json__line");
      if (label !== null) flat.appendChild(key(label, hunt));
      flat.appendChild(make("span", "json__punct", open + shut));
      return flat;
    }

    var box = make("details", "json__box");
    box.open = depth < 2 || count <= 4;

    var head = make("summary", "json__line");
    if (label !== null) head.appendChild(key(label, hunt));
    head.appendChild(make("span", "json__punct", open));
    head.appendChild(make("span", "json__size", count === 1 ? "1 item" : count + " items"));
    box.appendChild(head);

    var kids = make("div", "json__children");
    (isArray ? value : keys).forEach(function (item) {
      kids.appendChild(node(isArray ? item : value[item], hunt, depth + 1, isArray ? null : item));
    });
    box.appendChild(kids);

    var tail = make("div", "json__line");
    tail.appendChild(make("span", "json__punct", shut));
    box.appendChild(tail);

    return box;
  }

  // ===== Time =====

  function two(n) { return n < 10 ? "0" + n : String(n); }
  function three(n) { return n < 10 ? "00" + n : n < 100 ? "0" + n : String(n); }

  function clock(entry) {
    if (entry.at === null || entry.at === undefined) return "";

    var d = new Date(entry.at);
    var h = utc ? d.getUTCHours() : d.getHours();
    var m = utc ? d.getUTCMinutes() : d.getMinutes();
    var s = utc ? d.getUTCSeconds() : d.getSeconds();

    return two(h) + ":" + two(m) + ":" + two(s) + "." + three(utc ? d.getUTCMilliseconds() : d.getMilliseconds());
  }

  function stamp(iso) {
    if (!iso) return "—";

    var at = Date.parse(iso.replace(/\.(\d{3})\d+Z$/, ".$1Z"));
    if (isNaN(at)) return iso;

    var d = new Date(at);

    if (utc) {
      return d.getUTCFullYear() + "-" + two(d.getUTCMonth() + 1) + "-" + two(d.getUTCDate()) +
        " " + two(d.getUTCHours()) + ":" + two(d.getUTCMinutes()) + ":" + two(d.getUTCSeconds()) + " UTC";
    }

    var offset = -d.getTimezoneOffset();
    var sign = offset < 0 ? "-" : "+";
    var abs = Math.abs(offset);

    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) +
      " " + two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds()) +
      " UTC" + sign + two(Math.floor(abs / 60)) + ":" + two(abs % 60);
  }

  function spell(ms) {
    if (ms < 1000) return ms + "ms";
    if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
    if (ms < 3600000) return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
    return Math.floor(ms / 3600000) + "h " + Math.round((ms % 3600000) / 60000) + "m";
  }

  // ===== A row =====

  function matches(entry) {
    if (!needle) return true;

    var hay = (entry.message + " " + (entry.error || "") + " " + (entry.stackTrace || "") + " " +
      (entry.extra ? JSON.stringify(entry.extra) : "")).toLowerCase();

    return hay.indexOf(needle) !== -1;
  }

  function detail(entry) {
    var box = make("div", "detail");

    if (entry.extra) {
      box.appendChild(make("span", "detail__label", "extra"));
      var tree = make("div", "json");
      tree.appendChild(node(entry.extra, needle, 0, null));
      box.appendChild(tree);
    }

    if (entry.error) {
      box.appendChild(make("span", "detail__label", "error"));
      var err = make("div", "detail__error");
      write(err, entry.error, needle);
      box.appendChild(err);
    }

    if (entry.stackTrace) {
      box.appendChild(make("span", "detail__label", "stack"));
      var stack = make("div", "detail__stack");
      write(stack, entry.stackTrace, needle);
      box.appendChild(stack);
    }

    return box;
  }

  function row(entry) {
    var line = make("div", "row row--" + (LEVELS.indexOf(entry.level) === -1 ? "debug" : entry.level));
    line.setAttribute("data-index", String(entry.index));

    line.appendChild(make("span", "row__time", clock(entry)));
    line.appendChild(make("span", "row__level", entry.level));

    var body = make("span", "row__body");
    write(body, entry.message, needle);

    var has = entry.extra || entry.error || entry.stackTrace;

    if (has) {
      // Collapsed by default, which is how a log is read: down the
      // messages first, into one of them second. It also keeps a
      // collapsed row a fixed height, which is what makes appending
      // thousands of them cheap.
      var toggle = make("span", "row__more", "  ▸ " + [
        entry.extra ? "extra" : null,
        entry.error ? "error" : null,
        entry.stackTrace ? "stack" : null
      ].filter(Boolean).join(" · "));

      body.appendChild(toggle);

      var open = false;
      var panel = null;

      toggle.addEventListener("click", function () {
        open = !open;

        if (open) {
          panel = detail(entry);
          body.appendChild(panel);
          toggle.textContent = "  ▾";
        } else {
          if (panel) body.removeChild(panel);
          panel = null;
          toggle.textContent = "  ▸ " + [
            entry.extra ? "extra" : null,
            entry.error ? "error" : null,
            entry.stackTrace ? "stack" : null
          ].filter(Boolean).join(" · ");
        }
      });
    }

    line.appendChild(body);

    return line;
  }

  // ===== Filling the log =====

  function more(count) {
    var upto = Math.min(shown.length, drawn + count);
    var fragment = document.createDocumentFragment();

    for (var i = drawn; i < upto; i++) {
      var entry = shown[i];
      var before = i > 0 ? shown[i - 1] : null;

      if (before && before.at !== null && entry.at !== null && entry.at - before.at >= GAP) {
        fragment.appendChild(make("div", "gap", spell(entry.at - before.at) + " with nothing logged"));
      }

      fragment.appendChild(row(entry));
    }

    el.log.appendChild(fragment);
    drawn = upto;
  }

  function paint() {
    clear(el.log);
    drawn = 0;

    shown = bundle.entries.filter(function (entry) {
      return !muted[entry.level] && matches(entry);
    });

    // The cut goes at the top because the top is where the loss is. A
    // limit takes the beginning of a session, not the end.
    if (bundle.report.truncated) {
      el.log.appendChild(make("div", "cut",
        "⌃ the beginning of this session was cut to fit a limit — the log starts mid-session"));
    }

    if (!shown.length) {
      el.log.appendChild(make("p", "empty", bundle.entries.length ? "Nothing matches that." : "This report was filed before anything was logged."));
    } else {
      more(CHUNK);
    }

    el.meta.textContent = shown.length === bundle.entries.length
      ? name + " · " + shown.length + " lines"
      : name + " · " + shown.length + " of " + bundle.entries.length;

    strip();
    remember();
  }

  // ===== The density strip =====

  function hue(level) {
    var style = getComputedStyle(document.documentElement);
    return style.getPropertyValue("--" + level).trim() || "#888";
  }

  var colours = null;

  function strip() {
    var canvas = el.canvas;
    var box = el.strip.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(box.width * ratio));
    canvas.height = Math.max(1, Math.floor(box.height * ratio));

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);

    if (!colours) {
      colours = {};
      LEVELS.forEach(function (level) { colours[level] = hue(level); });
    }

    var timed = shown.filter(function (e) { return typeof e.at === "number"; });
    if (timed.length < 1) return;

    var first = timed[0].at;
    var last = timed[timed.length - 1].at;
    var span = last - first;

    var w = box.width;
    var h = box.height;
    var pad = 6;

    // Placed by time, not by position in the list. A session that went
    // quiet for half a minute has to leave a hole here — that hole is
    // the single most useful thing on the page.
    function xOf(at) {
      return span === 0 ? w / 2 : pad + ((at - first) / span) * (w - pad * 2);
    }

    var tall = { debug: .34, info: .5, warning: .72, error: 1 };

    // Errors last, so a burst of them is never hidden under the polling
    // that surrounds it.
    LEVELS.forEach(function (level) {
      ctx.fillStyle = colours[level];
      ctx.globalAlpha = level === "debug" ? .55 : .85;

      timed.forEach(function (entry) {
        if (entry.level !== level) return;

        var height = (tall[level] || .5) * (h - 12);
        ctx.fillRect(Math.round(xOf(entry.at)), h - 6 - height, 2, height);
      });
    });

    ctx.globalAlpha = 1;

    el.strip.__map = { first: first, span: span, w: w, pad: pad, timed: timed };
    marker();
  }

  // Which slice of the session is on screen.
  function marker() {
    var map = el.strip.__map;
    var old = el.strip.querySelector(".strip__span");
    if (old) el.strip.removeChild(old);

    if (!map || !map.timed.length) return;

    var rows = el.log.querySelectorAll(".row");
    if (!rows.length) return;

    var top = el.log.scrollTop;
    var bottom = top + el.log.clientHeight;
    var lo = null;
    var hi = null;

    for (var i = 0; i < rows.length; i++) {
      var y = rows[i].offsetTop;
      if (y + rows[i].offsetHeight >= top && y <= bottom) {
        var at = bundle.entries[Number(rows[i].getAttribute("data-index"))].at;
        if (typeof at === "number") {
          if (lo === null) lo = at;
          hi = at;
        }
      }
    }

    if (lo === null) return;

    var xa = map.span === 0 ? map.pad : map.pad + ((lo - map.first) / map.span) * (map.w - map.pad * 2);
    var xb = map.span === 0 ? map.w - map.pad : map.pad + ((hi - map.first) / map.span) * (map.w - map.pad * 2);

    var band = make("div", "strip__span");
    band.style.left = Math.max(0, xa - 1) + "px";
    band.style.width = Math.max(2, xb - xa + 2) + "px";
    el.strip.appendChild(band);
  }

  // ===== Going somewhere =====

  function reveal(index) {
    var place = shown.findIndex(function (entry) { return entry.index === index; });
    if (place === -1) return;

    while (drawn <= place) more(CHUNK);

    var target = el.log.querySelector('.row[data-index="' + index + '"]');
    if (!target) return;

    var was = el.log.querySelector(".row.is-here");
    if (was) was.classList.remove("is-here");

    target.classList.add("is-here");
    el.log.scrollTop = target.offsetTop - el.log.clientHeight / 3;
    here = index;
    marker();
  }

  // The reason somebody opened the file. One key, both directions.
  function jump(step) {
    var errors = shown.filter(function (entry) { return entry.level === "error"; });
    if (!errors.length) return;

    var at = errors.findIndex(function (entry) { return entry.index === here; });
    var next = at === -1
      ? (step > 0 ? 0 : errors.length - 1)
      : (at + step + errors.length) % errors.length;

    reveal(errors[next].index);
  }

  // ===== The panel =====

  function facts(rows) {
    var table = make("table", "facts");

    rows.forEach(function (pair) {
      if (pair[1] === null || pair[1] === undefined || pair[1] === "") return;

      var tr = make("tr");
      tr.appendChild(make("td", null, pair[0]));
      tr.appendChild(make("td", null, String(pair[1])));
      table.appendChild(tr);
    });

    return table;
  }

  function panel() {
    clear(el.side);

    var report = bundle.report;

    if (report.description) {
      el.side.appendChild(make("p", "side__desc", report.description));
    }

    el.side.appendChild(make("h2", null, "report"));
    el.side.appendChild(facts([
      ["filed", stamp(report.generatedAt)],
      ["entries", bundle.entries.length],
      ["truncated", report.truncated ? "yes — the start is missing" : "no"],
      ["read from", bundle.exact ? bundle.source + " (exact)" : bundle.source + " (inferred)"]
    ]));

    var hidden = countRedactions(bundle.entries);
    if (hidden) {
      el.side.appendChild(make("h2", null, "redaction"));
      el.side.appendChild(facts([
        ["values hidden", hidden + " — the redactor ran before this was written"]
      ]));
    }

    if (report.metadata) {
      el.side.appendChild(make("h2", null, "metadata"));
      el.side.appendChild(facts(Object.keys(report.metadata).map(function (k) {
        return [k, report.metadata[k]];
      })));
    }

    if (bundle.screenshot) {
      el.side.appendChild(make("h2", null, "screenshot"));

      if (shotUrl) URL.revokeObjectURL(shotUrl);
      shotUrl = URL.createObjectURL(new Blob([bundle.screenshot], { type: "image/png" }));

      var img = make("img", "shot");
      img.src = shotUrl;
      img.alt = "The screen as the reporter saw it";
      img.addEventListener("click", function () { lightbox(shotUrl); });
      el.side.appendChild(img);
    }

    var keys = make("div", "keys");
    [["n / p", "next / previous error"], ["/", "search"], ["u", "local or UTC"], ["esc", "clear"]]
      .forEach(function (pair) {
        var line = make("div");
        line.appendChild(make("b", null, pair[0] + "  "));
        line.appendChild(document.createTextNode(pair[1]));
        keys.appendChild(line);
      });
    el.side.appendChild(keys);
  }

  function lightbox(url) {
    var box = make("div", "lightbox");
    var img = make("img");
    img.src = url;
    box.appendChild(img);
    box.addEventListener("click", function () { document.body.removeChild(box); });
    document.body.appendChild(box);
  }

  // ===== Banners =====

  function banners() {
    clear(el.banners);

    bundle.notices.forEach(function (notice) {
      var line = make("div", "banner banner--" + notice.kind);
      line.appendChild(make("span", "banner__mark", notice.kind === "warn" ? "!" : "i"));
      line.appendChild(make("span", null, notice.text));
      el.banners.appendChild(line);
    });
  }

  // ===== Chips =====

  function chips() {
    clear(el.chips);

    var counts = {};
    bundle.entries.forEach(function (entry) {
      counts[entry.level] = (counts[entry.level] || 0) + 1;
    });

    Object.keys(counts).sort(function (a, b) {
      return LEVELS.indexOf(a) - LEVELS.indexOf(b);
    }).forEach(function (level) {
      var chip = make("button", "chip chip--" + level + (muted[level] ? "" : " is-on"), level + " " + counts[level]);
      chip.type = "button";
      chip.addEventListener("click", function () {
        muted[level] = !muted[level];
        chip.classList.toggle("is-on", !muted[level]);
        paint();
      });
      el.chips.appendChild(chip);
    });
  }

  // ===== The URL =====

  // Only how the log is being looked at. Never any of the log: a URL
  // ends up in browser history, in a chat message, in whatever the
  // person pastes it into, and none of those are places a customer's
  // data should go.
  function remember() {
    var query = [];
    if (needle) query.push("q=" + encodeURIComponent(needle));

    var off = LEVELS.filter(function (level) { return muted[level]; });
    if (off.length) query.push("hide=" + off.join(","));
    if (utc) query.push("utc=1");

    history.replaceState(null, "", query.length ? "?" + query.join("&") : location.pathname);
  }

  function recall() {
    var query = new URLSearchParams(location.search);

    needle = (query.get("q") || "").trim().toLowerCase();
    el.search.value = query.get("q") || "";
    utc = query.get("utc") === "1";
    el.zone.classList.toggle("is-on", utc);
    el.zone.textContent = utc ? "UTC" : "local";

    (query.get("hide") || "").split(",").forEach(function (level) {
      if (level) muted[level] = true;
    });
  }

  // ===== Opening =====

  function complain(message) {
    el.fail.textContent = message;
    el.fail.classList.remove("is-hidden");
  }

  function show(next, label) {
    bundle = next;
    name = label;
    here = -1;

    el.fail.classList.add("is-hidden");
    el.drop.classList.add("is-hidden");
    el.view.classList.remove("is-hidden");

    banners();
    chips();
    panel();
    paint();

    el.log.scrollTop = 0;
    el.log.focus();
  }

  function read(file) {
    return file.arrayBuffer().then(function (buffer) {
      return { name: file.name, bytes: new Uint8Array(buffer) };
    });
  }

  function take(files) {
    var list = Array.prototype.slice.call(files);
    if (!list.length) return;

    el.fail.classList.add("is-hidden");

    Promise.all(list.map(read))
      .then(function (parts) { return window.FBR.parse.open(parts); })
      .then(function (next) {
        show(next, list.length === 1 ? list[0].name : list.length + " files");
      })
      .catch(function (error) { complain(error.message || String(error)); });
  }

  function shut() {
    bundle = null;
    shown = [];
    drawn = 0;
    muted = {};
    needle = "";
    here = -1;

    if (shotUrl) { URL.revokeObjectURL(shotUrl); shotUrl = null; }

    el.search.value = "";
    el.picker.value = "";
    clear(el.log);
    clear(el.side);
    clear(el.banners);
    clear(el.chips);

    el.view.classList.add("is-hidden");
    el.drop.classList.remove("is-hidden");
    history.replaceState(null, "", location.pathname);
  }

  // ===== Wiring =====

  el.picker.addEventListener("change", function () { take(el.picker.files); });

  ["dragenter", "dragover"].forEach(function (kind) {
    document.addEventListener(kind, function (event) {
      event.preventDefault();
      el.drop.classList.add("is-over");
    });
  });

  ["dragleave", "drop"].forEach(function (kind) {
    document.addEventListener(kind, function (event) {
      event.preventDefault();
      el.drop.classList.remove("is-over");
    });
  });

  document.addEventListener("drop", function (event) {
    if (event.dataTransfer && event.dataTransfer.files.length) take(event.dataTransfer.files);
  });

  // A log is in a clipboard about as often as it is in a file — pasted
  // out of a terminal, or out of an attachment preview.
  document.addEventListener("paste", function (event) {
    if (event.target === el.search) return;

    var text = event.clipboardData && event.clipboardData.getData("text");
    if (!text || !text.trim()) return;

    window.FBR.parse.openText(text)
      .then(function (next) { show(next, "pasted"); })
      .catch(function (error) { complain(error.message || String(error)); });
  });

  var typing = null;
  el.search.addEventListener("input", function () {
    clearTimeout(typing);
    typing = setTimeout(function () {
      needle = el.search.value.trim().toLowerCase();
      if (bundle) paint();
    }, 120);
  });

  el.log.addEventListener("scroll", function () {
    if (drawn < shown.length && el.log.scrollTop + el.log.clientHeight > el.log.scrollHeight - 600) {
      more(CHUNK);
    }
    marker();
  });

  el.strip.addEventListener("click", function (event) {
    var map = el.strip.__map;
    if (!map || !map.timed.length) return;

    var box = el.strip.getBoundingClientRect();
    var want = map.first + ((event.clientX - box.left - map.pad) / (map.w - map.pad * 2)) * map.span;

    var best = map.timed[0];
    map.timed.forEach(function (entry) {
      if (Math.abs(entry.at - want) < Math.abs(best.at - want)) best = entry;
    });

    reveal(best.index);
  });

  el.zone.addEventListener("click", function () {
    utc = !utc;
    el.zone.classList.toggle("is-on", utc);
    el.zone.textContent = utc ? "UTC" : "local";
    if (bundle) { panel(); paint(); }
  });

  el.close.addEventListener("click", shut);

  el.copy.addEventListener("click", function () {
    var text = shown.map(function (entry) {
      var head = (entry.time || "") + " " + entry.level.toUpperCase() + " " + entry.message;
      if (entry.extra) head += "\n  " + JSON.stringify(entry.extra);
      if (entry.error) head += "\n  " + entry.error;
      if (entry.stackTrace) head += "\n  " + entry.stackTrace.split("\n").join("\n  ");
      return head;
    }).join("\n");

    navigator.clipboard.writeText(text).then(function () {
      el.copy.textContent = "Copied";
      setTimeout(function () { el.copy.textContent = "Copy"; }, 1200);
    }, function () {
      el.copy.textContent = "Cannot";
      setTimeout(function () { el.copy.textContent = "Copy"; }, 1200);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.target === el.search) {
      if (event.key === "Escape") {
        el.search.value = "";
        needle = "";
        if (bundle) paint();
        el.log.focus();
      }
      return;
    }

    if (!bundle) return;

    if (event.key === "/") { event.preventDefault(); el.search.focus(); return; }
    if (event.key === "n" || event.key === "j") { event.preventDefault(); jump(1); return; }
    if (event.key === "p" || event.key === "k") { event.preventDefault(); jump(-1); return; }
    if (event.key === "u") { el.zone.click(); return; }
    if (event.key === "Escape") { shut(); }
  });

  var resizing = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizing);
    resizing = setTimeout(function () { if (bundle) strip(); }, 120);
  });

  recall();
})();
