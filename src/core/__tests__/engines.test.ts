import { gzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { detectFormat, detectTextFormat } from "../detect";
import { getActionsForFormat, replaceExt } from "../registry";
import { extractArchiveFiles, listArchiveEntries, packFilesToZip, rearchiveToZip } from "../../engines/archive";
import { md5Hex, sha256Hex } from "../../engines/hash";
import { convertPdfFile, getPdfPageCount, mergePdfFiles } from "../../engines/pdf";
import { convertTextToXlsx, convertXlsxToText } from "../../engines/spreadsheet";
import { convertTextFile, runTextOperation } from "../../engines/text";

describe("detectFormat & detectTextFormat", () => {
  it("detects PNG via magic bytes regardless of extension", async () => {
    const pngMagic = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00,
    ]);
    const res = await detectFormat("unknown.dat", pngMagic);
    expect(res.id).toBe("png");
    expect(res.category).toBe("image");
    expect(res.confidence).toBe("magic");
  });

  it("detects JSON and YAML heuristics", () => {
    expect(detectTextFormat('{"hello": "world"}').id).toBe("json");
    expect(detectTextFormat("name: qsak\nversion: 1\n").id).toBe("yaml");
    expect(detectTextFormat("API_KEY=secret\nPORT=8080\n").id).toBe("env");
  });
});

describe("text & crypto engine", () => {
  it("converts JSON -> YAML -> TOML -> JSON cleanly", async () => {
    const json = '{"name":"qsak","port":8080}';
    const yamlStr = await runTextOperation("json-to-yaml", json);
    expect(yamlStr).toContain("name: qsak");
    const backFromYaml = JSON.parse(await runTextOperation("yaml-to-json", yamlStr));
    expect(backFromYaml).toEqual({ name: "qsak", port: 8080 });

    const tomlStr = await runTextOperation("json-to-toml", json);
    const backFromToml = JSON.parse(await runTextOperation("toml-to-json", tomlStr));
    expect(backFromToml).toEqual({ name: "qsak", port: 8080 });
  });

  it("handles CSV, INI, .env, XML, Markdown, Base64, Hex, JWT, and hashes", async () => {
    const csv = "name,score\nalice,10\nbob,20";
    const jsonFromCsv = JSON.parse(await runTextOperation("csv-to-json", csv));
    expect(jsonFromCsv).toHaveLength(2);
    expect(jsonFromCsv[0]).toEqual({ name: "alice", score: 10 });

    const b64 = await runTextOperation("base64-encode", "привет qsak");
    expect(await runTextOperation("base64-decode", b64)).toBe("привет qsak");

    const hex = await runTextOperation("hex-encode", "qsak");
    expect(hex).toBe("7173616b");
    expect(await runTextOperation("hex-decode", hex)).toBe("qsak");

    // RFC 1321 test vector: md5("abc") = 900150983cd24fb0d6963f7d28e17f72
    expect(md5Hex(new TextEncoder().encode("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );

    const jwtHeader = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const jwtPayload = btoa(JSON.stringify({ sub: "42", admin: true }));
    const decodedJwt = JSON.parse(await runTextOperation("jwt-decode", `${jwtHeader}.${jwtPayload}.sig`));
    expect(decodedJwt.payload.sub).toBe("42");

    const converted = await convertTextFile(
      new TextEncoder().encode("# Hello\n"),
      "readme.md",
      "md",
      "html",
    );
    expect(converted.outputName).toBe("readme.html");
    expect(new TextDecoder().decode(converted.bytes)).toContain("<h1>Hello</h1>");
  });
});

describe("archive engine", () => {
  it("packs and lists zip entries", async () => {
    const zipped = packFilesToZip([
      { name: "hello.txt", bytes: new TextEncoder().encode("world") },
      { name: "dup/hello.txt", bytes: new TextEncoder().encode("two") },
    ]);
    const entries = await listArchiveEntries(zipped, "zip", "bundle.zip");
    expect(entries).toHaveLength(2);
    expect(entries[0].path).toBe("hello.txt");
    expect(entries[0].size).toBe(5);
  });

  it("extracts tar.gz and rearchives to zip", async () => {
    // Build minimal 1024-byte tar with one file "note.txt" containing "hi"
    const tar = new Uint8Array(1024 + 512);
    const enc = new TextEncoder();
    tar.set(enc.encode("note.txt"), 0);
    tar.set(enc.encode("0000644\0"), 100);
    tar.set(enc.encode("0000000\0"), 108);
    tar.set(enc.encode("0000000\0"), 116);
    tar.set(enc.encode("00000000002\0"), 124); // size = 2
    tar.set(enc.encode("00000000000\0"), 136);
    tar[156] = 48; // '0' regular file
    tar.set(enc.encode("hi"), 512);

    const tgz = gzipSync(tar);
    const extracted = await extractArchiveFiles(tgz, "tgz", "sample.tar.gz");
    expect(new TextDecoder().decode(extracted["note.txt"])).toBe("hi");

    const rezipped = await rearchiveToZip(tgz, "sample.tar.gz", "tgz");
    expect(rezipped.outputName).toBe("sample.zip");
  });
});

describe("pdf & spreadsheet engines", () => {
  it("rotates, splits, strips metadata, and merges PDFs", async () => {
    const doc = await PDFDocument.create();
    doc.setTitle("Secret Title");
    doc.addPage([200, 300]);
    doc.addPage([200, 300]);
    const pdfBytes = await doc.save();

    expect(await getPdfPageCount(pdfBytes)).toBe(2);

    const rotated = await convertPdfFile(pdfBytes, "sample.pdf", "pdf-rotate-90");
    expect(rotated.mime).toBe("application/pdf");

    const stripped = await convertPdfFile(pdfBytes, "sample.pdf", "pdf-strip-meta");
    const loadedStripped = await PDFDocument.load(stripped.bytes);
    expect(loadedStripped.getTitle()).toBe("");

    const splitZip = await convertPdfFile(pdfBytes, "sample.pdf", "pdf-split-zip");
    const splitEntries = await listArchiveEntries(splitZip.bytes, "zip", splitZip.outputName);
    expect(splitEntries).toHaveLength(2);

    const merged = await mergePdfFiles([
      { name: "a.pdf", bytes: pdfBytes },
      { name: "b.pdf", bytes: pdfBytes },
    ]);
    expect(await getPdfPageCount(merged.bytes)).toBe(4);
  });

  it("converts CSV -> XLSX -> JSON cleanly", async () => {
    const csvBytes = new TextEncoder().encode("name,role\nalice,admin\nbob,user\n");
    const xlsxRes = await convertTextToXlsx(csvBytes, "team.csv", "csv");
    expect(xlsxRes.outputName).toBe("team.xlsx");

    const jsonRes = await convertXlsxToText(xlsxRes.bytes, xlsxRes.outputName, "json");
    const rows = JSON.parse(new TextDecoder().decode(jsonRes.bytes));
    expect(rows).toEqual([
      { name: "alice", role: "admin" },
      { name: "bob", role: "user" },
    ]);
  });
});

describe("registry helpers", () => {
  it("resolves actions and replaces extension", () => {
    expect(getActionsForFormat("png").some((a) => a.target === "webp")).toBe(true);
    expect(getActionsForFormat("pdf").some((a) => a.target === "pdf-to-png-zip")).toBe(true);
    expect(getActionsForFormat("mp4").some((a) => a.target === "mp3")).toBe(true);
    expect(getActionsForFormat("7z").some((a) => a.target === "extract-zip")).toBe(true);
    expect(replaceExt("photo.png", "webp")).toBe("photo.webp");
  });
});
