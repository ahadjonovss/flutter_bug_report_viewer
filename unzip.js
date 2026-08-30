(function (root) {
  "use strict";

  // ===================================================================
  //  A ZIP reader for bug-report bundles.
  //
  //  Small on purpose. A bundle holds two or three files, is bounded to
  //  256KB before compression, and is written by one encoder, so none of
  //  zip64, encryption or spanning can appear in one. What can appear is
  //  a bundle somebody unzipped, looked at, and zipped again — which is
  //  why this reads the central directory at the end of the file rather
  //  than the local headers.
  //
  //  A local header may carry zeroed sizes and defer them to a data
  //  descriptor after the payload; the central directory never does. It
  //  is the one place in a zip where the sizes are always right.
  //
  //  Inflating is the browser's job: DecompressionStream has been in
  //  every engine since 2023, and shipping a second implementation of
  //  DEFLATE to save that dependency would be the wrong trade.
  // ===================================================================

  var LOCAL = 0x04034b50;
  var CENTRAL = 0x02014b50;
  var EOCD = 0x06054b50;

  // A zip's end record carries a comment of up to 65535 bytes, so the
  // signature can be that far from the end and no further.
  var EOCD_MAX = 65557;

  var STORED = 0;
  var DEFLATE = 8;

  // 0xFFFFFFFF in a size field means "look in the zip64 extra field".
  // A bundle cannot reach 4GB, so seeing it means this is not one.
  var ZIP64 = 0xffffffff;

  function fail(message) {
    var error = new Error(message);
    error.name = "ZipError";
    throw error;
  }

  // ===== CRC-32 =====

  // Checked rather than trusted: a bundle that was truncated in transit —
  // a half-finished download, a mail gateway that cut the attachment —
  // still unzips into something that looks like a log. The checksum is
  // what tells the reader they are looking at a damaged file instead of
  // letting them draw conclusions from half a session.
  var table = null;

  function crc32(bytes) {
    if (!table) {
      table = new Int32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c;
      }
    }

    var crc = -1;
    for (var i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
    }

    return (crc ^ -1) >>> 0;
  }

  // ===== Finding the end =====

  function findEocd(view, length) {
    var earliest = Math.max(0, length - EOCD_MAX);

    // Backwards: the comment is the only thing that can follow the record,
    // and the last match is the real one.
    for (var at = length - 22; at >= earliest; at--) {
      if (view.getUint32(at, true) === EOCD) return at;
    }

    return -1;
  }

  // ===== Reading the directory =====

  function readCentral(view, bytes, start, count) {
    var files = [];
    var at = start;

    for (var i = 0; i < count; i++) {
      if (at + 46 > bytes.length) fail("The zip's directory runs past the end of the file.");
      if (view.getUint32(at, true) !== CENTRAL) fail("The zip's directory is not where the file says it is.");

      var method = view.getUint16(at + 10, true);
      var crc = view.getUint32(at + 16, true);
      var compressed = view.getUint32(at + 20, true);
      var uncompressed = view.getUint32(at + 24, true);
      var nameLength = view.getUint16(at + 28, true);
      var extraLength = view.getUint16(at + 30, true);
      var commentLength = view.getUint16(at + 32, true);
      var offset = view.getUint32(at + 42, true);

      if (compressed === ZIP64 || uncompressed === ZIP64 || offset === ZIP64) {
        fail("This is a zip64 archive. A bug-report bundle is never one, so this file is something else.");
      }

      files.push({
        name: text(bytes.subarray(at + 46, at + 46 + nameLength)),
        method: method,
        crc: crc,
        compressed: compressed,
        uncompressed: uncompressed,
        offset: offset
      });

      at += 46 + nameLength + extraLength + commentLength;
    }

    return files;
  }

  // Names are UTF-8 whenever bit 11 is set, which the builder sets and
  // every modern archiver sets. Decoding as UTF-8 regardless is right for
  // ASCII names too, and every name in a bundle is ASCII.
  function text(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  // ===== Reading one file's bytes =====

  function locate(view, bytes, file) {
    var at = file.offset;

    if (at + 30 > bytes.length) fail("An entry in the zip points past the end of the file.");
    if (view.getUint32(at, true) !== LOCAL) fail("An entry in the zip is missing its header.");

    // Only the name and extra lengths are read from here. Everything else
    // came from the directory, where it is reliable.
    var nameLength = view.getUint16(at + 26, true);
    var extraLength = view.getUint16(at + 28, true);
    var from = at + 30 + nameLength + extraLength;

    if (from + file.compressed > bytes.length) fail("An entry in the zip is cut short. The file is incomplete.");

    return bytes.subarray(from, from + file.compressed);
  }

  // Said in one place, because there are two ways to arrive at it and the
  // reader should not be able to tell which of them happened.
  //
  // The advice at the end has to stay true: neither the json nor the text
  // path goes anywhere near DecompressionStream, so a reader sent back to
  // ask for one of those forms gets a form that actually opens.
  var NO_INFLATE =
    "This browser cannot decompress a zip. Chrome 103, Safari 16.4, Firefox 113 or newer can — " +
    "or ask for the .json or .txt form of the bundle instead.";

  function inflate(payload) {
    var stream;

    // Two browsers fail here and only one of them is obvious.
    //
    // The first has no DecompressionStream at all. The second has one and
    // has never heard of "deflate-raw": Chrome carried gzip and deflate
    // for twenty-odd versions before raw landed in 103, and on those the
    // constructor throws. Testing only for the global lets that second
    // browser through the guard and hands the reader a bare TypeError in
    // place of the sentence written for exactly this moment.
    try {
      if (typeof DecompressionStream === "undefined") throw new Error("no DecompressionStream");
      stream = new DecompressionStream("deflate-raw");
    } catch (e) {
      return Promise.reject(new Error(NO_INFLATE));
    }

    var writer = stream.writable.getWriter();

    // Both ends of the stream reject when the payload is not valid
    // DEFLATE, and an unhandled one of those takes the process down in
    // node and logs an error in the page. The read side is the one that
    // carries the failure onward, so the write side is quietened here.
    writer.write(payload).catch(function () {});
    writer.close().catch(function () {});

    return new Response(stream.readable).arrayBuffer().then(function (buffer) {
      return new Uint8Array(buffer);
    }, function () {
      throw new Error("A file inside the zip is not valid compressed data. The bundle is damaged.");
    });
  }

  function extract(view, bytes, file) {
    var payload = locate(view, bytes, file);

    var raw =
      file.method === STORED ? Promise.resolve(payload) :
      file.method === DEFLATE ? inflate(payload) :
      Promise.reject(new Error("'" + file.name + "' uses a compression method this reader does not know."));

    return raw.then(function (content) {
      if (content.length !== file.uncompressed) {
        fail("'" + file.name + "' did not decompress to the size the zip claims. The file is damaged.");
      }

      if (crc32(content) !== file.crc) {
        fail("'" + file.name + "' failed its checksum. The file is damaged or was cut in transit.");
      }

      return { name: file.name, bytes: content };
    });
  }

  // ===== The one entry point =====

  // Takes the bundle's bytes, gives back every file in it. Directories and
  // the junk a Mac leaves behind are dropped here rather than by every
  // caller: a zip that has been through Finder carries __MACOSX entries
  // that are not part of the bundle and never were.
  function read(input) {
    return Promise.resolve().then(function () {
      var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

      if (bytes.length < 22) fail("This file is too small to be a zip.");

      var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var eocd = findEocd(view, bytes.length);

      if (eocd === -1) fail("This does not end like a zip. If it was downloaded, the download may be incomplete.");

      var count = view.getUint16(eocd + 10, true);
      var offset = view.getUint32(eocd + 16, true);

      if (offset === ZIP64) fail("This is a zip64 archive. A bug-report bundle is never one.");

      var wanted = readCentral(view, bytes, offset, count).filter(function (file) {
        return !/\/$/.test(file.name) && file.name.indexOf("__MACOSX/") !== 0 &&
          file.name.split("/").pop().indexOf("._") !== 0;
      });

      return Promise.all(wanted.map(function (file) {
        return extract(view, bytes, file);
      }));
    });
  }

  root.FBR = root.FBR || {};
  root.FBR.unzip = { read: read, crc32: crc32 };
})(typeof globalThis !== "undefined" ? globalThis : this);
