import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "./parsers";

const CORPUS = resolve(process.cwd(), "doc_rag_test");

const parseFile = (filename: string) => {
  const bytes = new Uint8Array(readFileSync(resolve(CORPUS, filename)));
  return parseDocument(bytes, { filename });
};

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeStoredZip = (entries: Array<{ name: string; data: string | Uint8Array }>, flags = 0): Uint8Array => {
  const encoded = entries.map((entry) => ({ name: new TextEncoder().encode(entry.name), data: typeof entry.data === "string" ? new TextEncoder().encode(entry.data) : entry.data }));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of encoded) {
    const local = new Uint8Array(30 + entry.name.length + entry.data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, flags, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc32(entry.data), true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, entry.name.length, true);
    local.set(entry.name, 30);
    local.set(entry.data, 30 + entry.name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + entry.name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, flags, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc32(entry.data), true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, entry.name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(entry.name, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  const result = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of localParts) { result.set(part, cursor); cursor += part.length; }
  for (const part of centralParts) { result.set(part, cursor); cursor += part.length; }
  result.set(end, cursor);
  return result;
};

describe("structure-aware knowledge parsers", () => {
  it("parses every frozen corpus source without silent empty extraction", () => {
    const files = readdirSync(CORPUS).filter((file) => /\.(docx|txt)$/i.test(file)).sort();
    const results = files.map(parseFile);
    expect(results).toHaveLength(17);
    expect(results.filter((result) => result.format === "DOCX")).toHaveLength(16);
    expect(results.filter((result) => result.format === "TXT")).toHaveLength(1);
    for (const result of results) {
      expect(result.report.disposition).toBe("READY_FOR_REVIEW");
      expect(result.blocks.length).toBeGreaterThan(0);
      expect(result.displayText.length).toBeGreaterThan(0);
      expect(result.report.activeIndexEligible).toBe(false);
    }
  });

  it("matches a checked-in deterministic extraction golden summary for all corpus files", () => {
    const files = readdirSync(CORPUS).filter((file) => /\.(docx|txt)$/i.test(file)).sort();
    const summary = files.map((filename) => {
      const result = parseFile(filename);
      return {
        filename,
        format: result.format,
        blockCount: result.report.blockCount,
        paragraphCount: result.report.paragraphCount,
        tableCount: result.report.tableCount,
        tableRowCount: result.report.tableRowCount,
        textCharacterCount: result.report.textCharacterCount,
        warningCodes: result.report.warnings,
        errorCodes: result.report.errors.map((error) => error.code),
        deterministicKey: result.report.deterministicKey,
      };
    });
    expect(summary).toMatchSnapshot();
  });

  it("is deterministic and preserves the DOCX inline comparator/content-control text", () => {
    const filename = "กองสาธารณสุข (2).docx";
    const first = parseFile(filename);
    const second = parseFile(filename);
    expect(first.report.deterministicKey).toBe(second.report.deterministicKey);
    expect(JSON.stringify(first.blocks)).toBe(JSON.stringify(second.blocks));
    expect(first.displayText).toContain("≤ 6");
    expect(first.report.warnings).not.toContain("NO_EXTRACTED_TEXT");
  });

  it("keeps ordered tables, row locators, headings, lists, tabs and manual line breaks", () => {
    const markdown = new TextEncoder().encode("# บริการ\n\nถาม : เปิดเมื่อไร\nตอบ : 09:00\n\n- เอกสาร\n- ค่าธรรมเนียม\n\n| รายการ | ค่า |\n| --- | --- |\n| ถนน | 900 บาท/ม² |\n\nชื่อ\tหน่วยงาน\nบรรทัดสอง");
    const result = parseDocument(markdown, { filename: "fixture.md" });
    expect(result.blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "list_item", "list_item", "table", "paragraph"]);
    const table = result.blocks.find((block) => block.type === "table");
    expect(table).toMatchObject({ headers: [["รายการ", "ค่า"]], rows: [["ถนน", "900 บาท/ม²"]] });
    expect(result.displayText).toContain("ชื่อ\tหน่วยงาน\nบรรทัดสอง");
    expect(result.searchText).toContain("900 บาท/ม2");
  });

  it("parses formula/cached XLSX values and excludes hidden sheets/rows", () => {
    const workbook = "<workbook><sheets><sheet name=\"บริการ\" state=\"visible\"/><sheet name=\"ซ่อน\" state=\"hidden\"/></sheets></workbook>";
    const sheet = "<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>รายการ</t></is></c><c r=\"B1\" t=\"inlineStr\"><is><t>ค่า</t></is></c></row><row r=\"2\"><c r=\"A2\" t=\"inlineStr\"><is><t>ถนน</t></is></c><c r=\"B2\"><f>SUM(1,2)</f><v>3</v></c></row><row r=\"3\" hidden=\"1\"><c r=\"A3\" t=\"inlineStr\"><is><t>ลับ</t></is></c></row></sheetData></worksheet>";
    const bytes = writeStoredZip([
      { name: "xl/workbook.xml", data: workbook },
      { name: "xl/worksheets/sheet1.xml", data: sheet },
      { name: "xl/worksheets/sheet2.xml", data: "<worksheet><sheetData/></worksheet>" },
    ]);
    const result = parseDocument(bytes, { filename: "fixture.xlsx" });
    expect(result.report.disposition).toBe("READY_FOR_REVIEW");
    expect(result.report.warnings).toEqual(["HIDDEN_ROW_EXCLUDED", "HIDDEN_SHEET_EXCLUDED"]);
    const table = result.blocks[0];
    if (!table || table.type !== "table") throw new Error("expected XLSX table block");
    expect(table).toMatchObject({ type: "table", headers: [["รายการ", "ค่า"]], rows: [["ถนน", "3"]] });
    expect(table.formulaCells).toEqual([{ cell: "B2", formula: "SUM(1,2)", displayedValue: "3" }]);
  });

  it("fails safely for invalid text, password-protected archives, corrupt DOCX and scanned-only PDF", () => {
    const invalidText = parseDocument(new Uint8Array([0xff, 0xfe]), { filename: "bad.txt" });
    expect(invalidText.report.errors[0]?.code).toBe("TEXT_ENCODING_FAILURE");
    const passwordZip = writeStoredZip([{ name: "xl/workbook.xml", data: "<workbook/>" }], 1);
    expect(parseDocument(passwordZip, { filename: "locked.xlsx" }).report.errors[0]?.code).toBe("PASSWORD_PROTECTED");
    expect(parseDocument(new Uint8Array([1, 2, 3]), { filename: "bad.docx" }).report.errors[0]?.code).toBe("PARSER_OR_ARCHIVE_FAILURE");
    const scannedPdf = new TextEncoder().encode("%PDF-1.7\n/Type /Page\n/Subtype /Image\n%%EOF");
    expect(parseDocument(scannedPdf, { filename: "scan.pdf" }).report.errors[0]?.code).toBe("OCR_REQUIRED");
  });

  it("extracts text-layer PDF and rejects ZIP path traversal/macro DOCX before review", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj<< /Type /Page >>stream\nBT (ค่าธรรมเนียม 900 บาท) Tj ET\nendstream\n%%EOF");
    const parsedPdf = parseDocument(pdf, { filename: "service.pdf" });
    expect(parsedPdf.report.disposition).toBe("READY_FOR_REVIEW");
    expect(parsedPdf.displayText).toContain("900 บาท");
    const unsafe = writeStoredZip([{ name: "../evil.txt", data: "x" }]);
    expect(parseDocument(unsafe, { filename: "unsafe.xlsx" }).report.errors[0]?.code).toBe("ZIP_PATH_TRAVERSAL");
    const macroDocx = writeStoredZip([
      { name: "word/document.xml", data: "<document><body><p><r><t>safe</t></r></p></body></document>" },
      { name: "word/vbaProject.bin", data: "not executable" },
    ]);
    expect(parseDocument(macroDocx, { filename: "macro.docx" }).report.errors.map((error) => error.code)).toContain("MACRO_DETECTED");
  });
});
