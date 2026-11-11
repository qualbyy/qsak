import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { detectFormat, detectTextFormat } from "../detect";
import { checkFileLimits, checkUrlCountLimit, getDefaultLimits } from "../limits";
import { getActionsForFormat } from "../registry";
import { inferFileNameFromUrl, isUrlListContent, parseUrlList } from "../urlImporter";
import { extractEpubToText } from "../../engines/ebook";
import { decodeNetpbmRgba, decodeTgaRgba, encodeBmpRgba, encodeTgaRgba, minifySvg } from "../../engines/imageCodecs";
import { convertTextFile, runTextOperation } from "../../engines/text";

describe("URL importer & link list parsing", () => {
  it("parses URL lists with comments, blank lines, markdown links, and deduplication", () => {
    const raw = `
      # comment line
      // another comment
      https://example.com/a.png
      https://example.com/a.png
      [dataset](https://example.com/data.csv)
      not-a-valid-url
      ftp://unsupported.example/file.zip
      data:text/plain;base64,aGVsbG8=
    `;
    const parsed = parseUrlList(raw);
    expect(parsed.urls).toEqual([
      "https://example.com/a.png",
      "https://example.com/data.csv",
      "data:text/plain;base64,aGVsbG8=",
    ]);
    expect(parsed.invalidLines).toHaveLength(2);
  });

  it("detects link list files and infers filenames cleanly", () => {
    expect(isUrlListContent("links.txt", "https://a.com/1.png\nhttps://a.com/2.jpg\n")).toBe(true);
    expect(isUrlListContent("notes.txt", "hello world\njust a note\n")).toBe(false);
    expect(isUrlListContent("batch.urls", "https://a.com/x\n")).toBe(true);

    expect(inferFileNameFromUrl("https://cdn.example.com/avatar", "image/webp", null)).toBe("avatar.webp");
    expect(
      inferFileNameFromUrl("https://cdn.example.com/dl?id=1", "application/pdf", 'attachment; filename="report.pdf"'),
    ).toBe("report.pdf");
  });
});

describe("Limits guard", () => {
  it("enforces file size, batch count, total queue size, and URL count", () => {
    const limits = { ...getDefaultLimits(false), maxFileSizeMb: 10, maxBatchFiles: 2, maxTotalQueueMb: 15, maxUrlCount: 3 };

    expect(checkFileLimits(5 * 1024 * 1024, 0, 0, limits).ok).toBe(true);
    expect(checkFileLimits(11 * 1024 * 1024, 0, 0, limits)).toMatchObject({ ok: false, reason: "file-size" });
    expect(checkFileLimits(1024, 2, 0, limits)).toMatchObject({ ok: false, reason: "batch-count" });
    expect(checkFileLimits(8 * 1024 * 1024, 1, 8 * 1024 * 1024, limits)).toMatchObject({ ok: false, reason: "total-size" });
    expect(checkUrlCountLimit(4, limits)).toMatchObject({ ok: false, reason: "url-count" });
  });
});

describe("Extended format detection & conversions", () => {
  it("detects JSONL, TSV, SRT, VTT, properties, BMP, TIFF, AIFF, FLV", async () => {
    expect(detectTextFormat('{"a":1}\n{"a":2}\n').id).toBe("jsonl");
    expect(detectTextFormat("col1\tcol2\n1\t2\n").id).toBe("tsv");
    expect(detectTextFormat("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHi").id).toBe("vtt");
    expect(detectTextFormat("1\n00:00:01,000 --> 00:00:03,000\nHi").id).toBe("srt");
    expect(detectTextFormat("server.port=8080\nspring.name=qsak").id).toBe("properties");

    const bmp = new Uint8Array([0x42, 0x4d, 0, 0, 0, 0]);
    expect((await detectFormat("raw.dat", bmp)).id).toBe("bmp");

    const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0]);
    expect((await detectFormat("scan.dat", tiff)).id).toBe("tiff");
  });

  it("converts JSONL, TSV, properties, SQL INSERT, SRT/VTT, and SHA-512", async () => {
    const jsonl = '{"id":1,"name":"alice"}\n{"id":2,"name":"bob"}\n';
    const jsonArr = JSON.parse(await runTextOperation("jsonl-to-json", jsonl));
    expect(jsonArr).toHaveLength(2);
    expect(await runTextOperation("json-to-jsonl", JSON.stringify(jsonArr))).toContain('{"id":1,"name":"alice"}');

    const sql = await runTextOperation("json-to-sql", JSON.stringify(jsonArr));
    expect(sql).toContain('INSERT INTO "records" ("id", "name") VALUES (1, \'alice\');');

    const tsv = "name\tage\nalice\t30\n";
    const fromTsv = JSON.parse(await runTextOperation("tsv-to-json", tsv));
    expect(fromTsv[0]).toEqual({ name: "alice", age: 30 });

    const props = "app.name=qsak\napp.port=8080\n";
    const fromProps = JSON.parse(await runTextOperation("properties-to-json", props));
    expect(fromProps["app.name"]).toBe("qsak");

    const srt = "1\n00:00:01,500 --> 00:00:03,000\nHello world\n";
    const vtt = await runTextOperation("srt-to-vtt", srt);
    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("00:00:01.500 --> 00:00:03.000");
    expect(await runTextOperation("vtt-to-srt", vtt)).toContain("00:00:01,500 --> 00:00:03,000");

    const plainFromSrt = await convertTextFile(new TextEncoder().encode(srt), "sub.srt", "srt", "txt");
    expect(new TextDecoder().decode(plainFromSrt.bytes).trim()).toBe("Hello world");

    const sha512 = await runTextOperation("hash-sha512", "abc");
    expect(sha512).toHaveLength(128);
  });

  it("encodes/decodes pure-TS image codecs (BMP, TGA, Netpbm, SVG minify)", () => {
    const img = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) };
    const bmp = encodeBmpRgba(img);
    expect(bmp[0]).toBe(0x42);
    expect(bmp[1]).toBe(0x4d);

    const tga = encodeTgaRgba(img);
    const decodedTga = decodeTgaRgba(tga);
    expect(decodedTga.width).toBe(2);
    expect(Array.from(decodedTga.data.slice(0, 4))).toEqual([255, 0, 0, 255]);

    const ppm = new TextEncoder().encode("P3\n1 1\n255\n10 20 30\n");
    const decodedPpm = decodeNetpbmRgba(ppm);
    expect(Array.from(decodedPpm.data)).toEqual([10, 20, 30, 255]);

    expect(minifySvg('<!-- comment -->\n<svg>  <rect />  </svg>')).toBe("<svg><rect /></svg>\n");
  });

  it("extracts text from EPUB and registers targets for new formats", () => {
    const epubBytes = zipSync({
      "OEBPS/ch1.xhtml": new TextEncoder().encode("<html><body><h1>Chapter 1</h1><p>Hello EPUB</p></body></html>"),
    });
    const txt = extractEpubToText(epubBytes, "book.epub");
    expect(txt.outputName).toBe("book.txt");
    expect(new TextDecoder().decode(txt.bytes)).toContain("Hello EPUB");

    expect(getActionsForFormat("mkv").some((a) => a.target === "mp4")).toBe(true);
    expect(getActionsForFormat("opus").some((a) => a.target === "mp3")).toBe(true);
    expect(getActionsForFormat("tiff").some((a) => a.target === "png")).toBe(true);
    expect(getActionsForFormat("cbz").some((a) => a.target === "cbz-to-pdf")).toBe(true);
  });
});
