import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export type SourceLocator = {
  page?: number;
  sectionPath: string[];
  paragraphIndex?: number;
  tableIndex?: number;
  rowIndex?: number;
  columnIndex?: number;
  sheetName?: string;
  cellRange?: string;
  charStart?: number;
  charEnd?: number;
};

export type KnowledgeBlock =
  | { type: "heading"; level: number; text: string; locator: SourceLocator }
  | { type: "paragraph"; text: string; locator: SourceLocator }
  | { type: "list_item"; level: number; marker: string; text: string; locator: SourceLocator }
  | {
      type: "table";
      headers: string[][];
      rows: string[][];
      locator: SourceLocator;
      rowLocators: SourceLocator[];
      formulaCells?: Array<{ cell: string; formula: string; displayedValue?: string }>;
    }
  | { type: "image"; altText?: string; hasExtractedText: boolean; locator: SourceLocator };

export type ParserFormat = "TXT" | "MD" | "DOCX" | "PDF" | "XLSX";
export type ParserDisposition = "READY_FOR_REVIEW" | "FAILED_REVIEW";
export type EmbeddedMediaDisposition = "KNOWLEDGE_CANDIDATE" | "DECORATIVE" | "EVALUATION_ONLY" | "EXCLUDED_SENSITIVE";

export type EmbeddedMedia = {
  entryName: string;
  disposition: EmbeddedMediaDisposition;
  reason: string;
};

export type ExtractionError = {
  code:
  | "UNSUPPORTED_FORMAT"
  | "SIZE_LIMIT_EXCEEDED"
  | "TEXT_ENCODING_FAILURE"
  | "PARSER_OR_ARCHIVE_FAILURE"
  | "ZIP_PATH_TRAVERSAL"
  | "PASSWORD_PROTECTED"
  | "MACRO_DETECTED"
  | "MALICIOUS_EMBEDDED_OBJECT"
  | "NO_EXTRACTED_TEXT"
  | "OCR_REQUIRED"
  | "PDF_CORRUPT"
  | "XLSX_MISSING_WORKBOOK"
  | "DOCX_MISSING_DOCUMENT_XML";
  detailRedacted?: string;
};

export type ExtractionReport = {
  parserName: "citychatbot-structure-parser";
  parserVersion: "1.0.0";
  format: ParserFormat;
  sourceSha256: string;
  inputByteLength: number;
  blockCount: number;
  textCharacterCount: number;
  tableCount: number;
  tableRowCount: number;
  paragraphCount: number;
  embeddedMediaCount: number;
  warnings: string[];
  errors: ExtractionError[];
  embeddedMedia: EmbeddedMedia[];
  disposition: ParserDisposition;
  requiresHumanReview: boolean;
  activeIndexEligible: false;
  deterministicKey: string;
};

export type ParseResult = {
  format: ParserFormat;
  blocks: KnowledgeBlock[];
  displayText: string;
  searchText: string;
  report: ExtractionReport;
};

export type ParseOptions = {
  filename: string;
  mimeType?: string;
  maxBytes?: number;
  maxZipEntries?: number;
  maxUncompressedBytes?: number;
  maxSheets?: number;
  maxRowsPerSheet?: number;
  maxCellsPerSheet?: number;
};

export class ParserError extends Error {
  constructor(public readonly code: ExtractionError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "ParserError";
  }
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_ZIP_ENTRIES = 2_000;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_SHEETS = 100;
const DEFAULT_MAX_ROWS_PER_SHEET = 100_000;
const DEFAULT_MAX_CELLS_PER_SHEET = 1_000_000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const normalizeDisplayText = (value: string): string => value.normalize("NFC").replace(/\r\n?/g, "\n");

export const normalizeSearchText = (value: string): string => {
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
  const arabicDigits = "0123456789";
  const normalized = value
    .normalize("NFKC")
    .replace(/[–—−]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[๐-๙]/g, (digit) => arabicDigits[thaiDigits.indexOf(digit)] ?? digit)
    .replace(/[ \t\f\v]+/g, " ");
  return normalized.split("\n").map((line) => line.trim()).join("\n").trim();
};

const blockText = (block: KnowledgeBlock): string => {
  if (block.type === "table") {
    return [...block.headers, ...block.rows].map((row) => row.join("\t")).join("\n");
  }
  if (block.type === "list_item") return `${block.marker} ${block.text}`;
  if (block.type === "image") return block.altText ?? "";
  return block.text;
};

const renderBlocks = (blocks: KnowledgeBlock[]): string => blocks.map(blockText).join("\n");

const makeReport = (
  format: ParserFormat,
  bytes: Uint8Array,
  blocks: KnowledgeBlock[],
  warnings: string[],
  errors: ExtractionError[],
  embeddedMedia: EmbeddedMedia[],
): ExtractionReport => {
  const displayText = renderBlocks(blocks);
  const tableBlocks = blocks.filter((block): block is Extract<KnowledgeBlock, { type: "table" }> => block.type === "table");
  const paragraphCount = blocks.filter((block) => block.type === "paragraph" || block.type === "heading" || block.type === "list_item").length;
  const normalizedWarnings = [...new Set(warnings)].sort();
  const normalizedErrors = [...errors].sort((left, right) => left.code.localeCompare(right.code));
  const normalizedMedia = [...embeddedMedia].sort((left, right) => left.entryName.localeCompare(right.entryName));
  const deterministicKey = sha256(JSON.stringify({ format, blocks, warnings: normalizedWarnings, errors: normalizedErrors, media: normalizedMedia }));
  return {
    parserName: "citychatbot-structure-parser",
    parserVersion: "1.0.0",
    format,
    sourceSha256: sha256(bytes),
    inputByteLength: bytes.byteLength,
    blockCount: blocks.length,
    textCharacterCount: displayText.length,
    tableCount: tableBlocks.length,
    tableRowCount: tableBlocks.reduce((count, table) => count + table.rows.length, 0),
    paragraphCount,
    embeddedMediaCount: normalizedMedia.length,
    warnings: normalizedWarnings,
    errors: normalizedErrors,
    embeddedMedia: normalizedMedia,
    disposition: normalizedErrors.length === 0 ? "READY_FOR_REVIEW" : "FAILED_REVIEW",
    requiresHumanReview: normalizedWarnings.length > 0 || normalizedMedia.length > 0,
    activeIndexEligible: false,
    deterministicKey,
  };
};

const makeResult = (format: ParserFormat, bytes: Uint8Array, blocks: KnowledgeBlock[], warnings: string[] = [], errors: ExtractionError[] = [], media: EmbeddedMedia[] = []): ParseResult => {
  const displayText = renderBlocks(blocks);
  const report = makeReport(format, bytes, blocks, warnings, errors, media);
  return {
    format,
    blocks,
    displayText,
    searchText: normalizeSearchText(displayText),
    report,
  };
};

const failedResult = (format: ParserFormat, bytes: Uint8Array, error: ExtractionError): ParseResult =>
  makeResult(format, bytes, [], [], [error]);

const textDecoder = (encoding: "utf-8" | "latin1", fatal: boolean): TextDecoder => new TextDecoder(encoding, { fatal });

const decodeUtf8 = (bytes: Uint8Array): string => {
  try {
    return normalizeDisplayText(textDecoder("utf-8", true).decode(bytes));
  } catch {
    throw new ParserError("TEXT_ENCODING_FAILURE", "source is not valid UTF-8");
  }
};

const asText = (value: string | undefined): string => normalizeDisplayText(value ?? "");

const locator = (sectionPath: string[], overrides: Partial<SourceLocator> = {}): SourceLocator => ({ sectionPath: [...sectionPath], ...overrides });

const parsePipeRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
};

const isMarkdownSeparator = (line: string): boolean =>
  parsePipeRow(line).length > 0 && parsePipeRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));

const parsePlainText = (bytes: Uint8Array, format: "TXT" | "MD"): ParseResult => {
  const text = decodeUtf8(bytes).replace(/\u0000/g, "");
  if (!text.trim()) return failedResult(format, bytes, { code: "NO_EXTRACTED_TEXT" });
  const lines = text.split("\n");
  const blocks: KnowledgeBlock[] = [];
  const warnings: string[] = [];
  let paragraphLines: string[] = [];
  let sectionPath: string[] = [];
  let paragraphIndex = 0;

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return;
    const value = paragraphLines.join("\n");
    if (value.trim()) {
      blocks.push({ type: "paragraph", text: value, locator: locator(sectionPath, { paragraphIndex }) });
      paragraphIndex += 1;
    }
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    if (format === "MD") {
      const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (heading) {
        flushParagraph();
        const level = heading[1]!.length;
        const headingText = heading[2]!.trim();
        sectionPath = [...sectionPath.slice(0, level - 1), headingText];
        blocks.push({ type: "heading", level, text: headingText, locator: locator(sectionPath, { paragraphIndex }) });
        paragraphIndex += 1;
        continue;
      }
      if (line.includes("|") && index + 1 < lines.length && isMarkdownSeparator(lines[index + 1]!)) {
        flushParagraph();
        const headers = [parsePipeRow(line)];
        const rows: string[][] = [];
        let rowIndex = index + 2;
        while (rowIndex < lines.length && lines[rowIndex]!.includes("|") && lines[rowIndex]!.trim()) {
          rows.push(parsePipeRow(lines[rowIndex]!));
          rowIndex += 1;
        }
        blocks.push({
          type: "table",
          headers,
          rows,
          locator: locator(sectionPath, { tableIndex: blocks.filter((block) => block.type === "table").length }),
          rowLocators: rows.map((_, row) => locator(sectionPath, { tableIndex: blocks.filter((block) => block.type === "table").length, rowIndex: row + 1 })),
        });
        index = rowIndex - 1;
        continue;
      }
      const list = /^(\s*)([-*+] |\d+[.)] )(.*)$/.exec(line);
      if (list) {
        flushParagraph();
        blocks.push({
          type: "list_item",
          level: Math.floor(list[1]!.length / 2),
          marker: list[2]!.trim(),
          text: list[3]!,
          locator: locator(sectionPath, { paragraphIndex }),
        });
        paragraphIndex += 1;
        continue;
      }
    }
    paragraphLines.push(line);
  }
  flushParagraph();
  if (format === "TXT") warnings.push("PLAIN_TEXT_STRUCTURE_INFERRED");
  return makeResult(format, bytes, blocks, warnings, [], []);
};

type XmlText = string;
type XmlNode = { name: string; attributes: Record<string, string>; children: Array<XmlNode | XmlText> };

const isXmlNode = (value: XmlNode | XmlText): value is XmlNode => typeof value !== "string";
const localName = (name: string): string => name.includes(":") ? name.slice(name.indexOf(":") + 1) : name;

const decodeXmlEntities = (value: string): string => value
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

const parseXml = (xml: string): XmlNode => {
  const root: XmlNode = { name: "#root", attributes: {}, children: [] };
  const stack: XmlNode[] = [root];
  let cursor = 0;
  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open < 0) {
      const text = decodeXmlEntities(xml.slice(cursor));
      if (text) stack[stack.length - 1]!.children.push(text);
      break;
    }
    if (open > cursor) {
      const text = decodeXmlEntities(xml.slice(cursor, open));
      if (text) stack[stack.length - 1]!.children.push(text);
    }
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end < 0) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "unterminated XML comment");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      if (end < 0) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "unterminated XML CDATA");
      stack[stack.length - 1]!.children.push(xml.slice(open + 9, end));
      cursor = end + 3;
      continue;
    }
    const close = xml.indexOf(">", open + 1);
    if (close < 0) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "unterminated XML tag");
    const raw = xml.slice(open + 1, close).trim();
    cursor = close + 1;
    if (!raw || raw.startsWith("?") || raw.startsWith("!")) continue;
    if (raw.startsWith("/")) {
      const expected = raw.slice(1).trim();
      const node = stack.pop();
      if (!node || node.name !== expected) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "XML tag nesting is invalid");
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const tagSource = selfClosing ? raw.slice(0, -1).trim() : raw;
    const tagMatch = /^([^\s]+)([\s\S]*)$/.exec(tagSource);
    if (!tagMatch) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "XML tag name is missing");
    const node: XmlNode = { name: tagMatch[1]!, attributes: {}, children: [] };
    const attributeSource = tagMatch[2] ?? "";
    const attributePattern = /([^\s=]+)\s*=\s*("[^"]*"|'[^']*')/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(attributeSource)) !== null) {
      node.attributes[attribute[1]!] = decodeXmlEntities(attribute[2]!.slice(1, -1));
    }
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "XML document is incomplete");
  const document = root.children.find(isXmlNode);
  if (!document) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "XML document has no root");
  return document;
};

const childNodes = (node: XmlNode, name: string): XmlNode[] => node.children.filter(isXmlNode).filter((child) => localName(child.name) === name);
const descendants = (node: XmlNode, name: string): XmlNode[] => {
  const result: XmlNode[] = [];
  for (const child of node.children) {
    if (!isXmlNode(child)) continue;
    if (localName(child.name) === name) result.push(child);
    result.push(...descendants(child, name));
  }
  return result;
};
const attr = (node: XmlNode, name: string): string | undefined => {
  const key = Object.keys(node.attributes).find((candidate) => candidate === name || localName(candidate) === name);
  return key ? node.attributes[key] : undefined;
};
const recursiveText = (node: XmlNode): string => node.children.map((child) => isXmlNode(child) ? recursiveText(child) : child).join("");

const little16 = (bytes: Uint8Array, offset: number): number => bytes[offset]! | (bytes[offset + 1]! << 8);
const little32 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;

type ZipEntry = { name: string; method: number; flags: number; compressedSize: number; uncompressedSize: number; localOffset: number };

class SafeZipArchive {
  private readonly entries = new Map<string, ZipEntry>();
  private readonly bytes: Uint8Array;
  private readonly maxUncompressedBytes: number;
  private uncompressedTotal = 0;

  constructor(bytes: Uint8Array, maxEntries = DEFAULT_MAX_ZIP_ENTRIES, maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES) {
    this.bytes = bytes;
    this.maxUncompressedBytes = maxUncompressedBytes;
    const endOfCentral = this.findEndOfCentralDirectory();
    if (endOfCentral < 0) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "ZIP central directory is missing");
    const entryCount = little16(bytes, endOfCentral + 10);
    const centralOffset = little32(bytes, endOfCentral + 16);
    let cursor = centralOffset;
    if (entryCount > maxEntries) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "ZIP entry count exceeds limit");
    for (let index = 0; index < entryCount; index += 1) {
      if (little32(bytes, cursor) !== 0x02014b50) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "ZIP central entry is invalid");
      const flags = little16(bytes, cursor + 8);
      const method = little16(bytes, cursor + 10);
      const compressedSize = little32(bytes, cursor + 20);
      const uncompressedSize = little32(bytes, cursor + 24);
      const nameLength = little16(bytes, cursor + 28);
      const extraLength = little16(bytes, cursor + 30);
      const commentLength = little16(bytes, cursor + 32);
      const localOffset = little32(bytes, cursor + 42);
      const name = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, "/");
      if (name.startsWith("/") || name.split("/").includes("..")) throw new ParserError("ZIP_PATH_TRAVERSAL", "ZIP entry path is unsafe");
      if ((flags & 0x1) !== 0) throw new ParserError("PASSWORD_PROTECTED", "encrypted ZIP entry requires a password");
      if (method !== 0 && method !== 8) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "ZIP compression method is unsupported");
      this.uncompressedTotal += uncompressedSize;
      if (this.uncompressedTotal > maxUncompressedBytes) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "ZIP expansion exceeds limit");
      this.entries.set(name, { name, method, flags, compressedSize, uncompressedSize, localOffset });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
  }

  names(): string[] {
    return [...this.entries.keys()].sort();
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  read(name: string): Uint8Array {
    const entry = this.entries.get(name);
    if (!entry) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", `ZIP entry ${name} is missing`);
    if (little32(this.bytes, entry.localOffset) !== 0x04034b50) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "ZIP local entry is invalid");
    const nameLength = little16(this.bytes, entry.localOffset + 26);
    const extraLength = little16(this.bytes, entry.localOffset + 28);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const compressed = this.bytes.subarray(start, start + entry.compressedSize);
    const output = entry.method === 0 ? compressed : new Uint8Array(inflateRawSync(Buffer.from(compressed)));
    if (output.byteLength !== entry.uncompressedSize) throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "ZIP size check failed");
    return output;
  }

  private findEndOfCentralDirectory(): number {
    for (let offset = this.bytes.byteLength - 22; offset >= Math.max(0, this.bytes.byteLength - 65_557); offset -= 1) {
      if (little32(this.bytes, offset) === 0x06054b50) return offset;
    }
    return -1;
  }
}

const parseParagraphText = (node: XmlNode): string => {
  const parts: string[] = [];
  const visit = (current: XmlNode): void => {
    const name = localName(current.name);
    if (name === "t" || name === "delText" || name === "instrText") {
      parts.push(recursiveText(current));
      return;
    }
    if (name === "tab") {
      parts.push("\t");
      return;
    }
    if (name === "br" || name === "cr") {
      parts.push("\n");
      return;
    }
    for (const child of current.children) if (isXmlNode(child)) visit(child);
  };
  visit(node);
  return normalizeDisplayText(parts.join(""));
};

const parseDocx = (bytes: Uint8Array, options: ParseOptions): ParseResult => {
  const warnings: string[] = [];
  const errors: ExtractionError[] = [];
  const media: EmbeddedMedia[] = [];
  const archive = new SafeZipArchive(bytes, options.maxZipEntries, options.maxUncompressedBytes);
  const names = archive.names();
  if (!archive.has("word/document.xml")) throw new ParserError("DOCX_MISSING_DOCUMENT_XML", "word/document.xml is missing");
  const macroEntries = names.filter((name) => /(?:vbaProject\.bin|\.vba$|\.xlsm$)/i.test(name));
  if (macroEntries.length > 0) errors.push({ code: "MACRO_DETECTED" });
  if (names.some((name) => name.startsWith("word/embeddings/"))) {
    errors.push({ code: "MALICIOUS_EMBEDDED_OBJECT", detailRedacted: "embedded OOXML object must be reviewed" });
  }
  for (const name of names.filter((entry) => entry.startsWith("word/media/") && !entry.endsWith("/"))) {
    media.push({ entryName: name, disposition: "KNOWLEDGE_CANDIDATE", reason: "image requires OCR/classification and owner review before indexing" });
  }
  if (media.length > 0) warnings.push("EMBEDDED_MEDIA_REVIEW");
  const documentXml = decodeUtf8(archive.read("word/document.xml"));
  const root = parseXml(documentXml);
  const body = descendants(root, "body")[0];
  if (!body) throw new ParserError("DOCX_MISSING_DOCUMENT_XML", "w:body is missing");
  const blocks: KnowledgeBlock[] = [];
  const sectionPath: string[] = [];
  let paragraphIndex = 0;
  let tableIndex = 0;
  let hasTrackedMarkup = false;
  const processChildren = (container: XmlNode): void => {
    for (const child of container.children) {
      if (!isXmlNode(child)) continue;
      const name = localName(child.name);
      if (["ins", "del", "moveFrom", "moveTo"].includes(name)) hasTrackedMarkup = true;
      if (name === "p") {
        const text = parseParagraphText(child);
        if (!text.trim()) continue;
        const properties = childNodes(child, "pPr")[0];
        const style = properties ? childNodes(properties, "pStyle")[0] : undefined;
        const outline = properties ? childNodes(properties, "outlineLvl")[0] : undefined;
        const numbering = properties ? childNodes(properties, "numPr")[0] : undefined;
        const styleName = style ? attr(style, "val") ?? "" : "";
        const level = outline ? Number(attr(outline, "val") ?? 0) + 1 : Number.parseInt(styleName.replace(/\D/g, ""), 10) || 1;
        const isHeading = /heading|title|subtitle/i.test(styleName) || outline !== undefined;
        const paragraphLocator = locator(sectionPath, { paragraphIndex });
        if (isHeading) {
          const boundedLevel = Math.max(1, Math.min(6, level));
          while (sectionPath.length >= boundedLevel) sectionPath.pop();
          sectionPath.push(text.trim());
          blocks.push({ type: "heading", level: boundedLevel, text, locator: locator(sectionPath, { paragraphIndex }) });
        } else if (numbering) {
          const listLevel = Number(attr(childNodes(numbering, "ilvl")[0] ?? numbering, "val") ?? 0);
          blocks.push({ type: "list_item", level: listLevel, marker: "•", text, locator: paragraphLocator });
        } else {
          blocks.push({ type: "paragraph", text, locator: paragraphLocator });
        }
        paragraphIndex += 1;
      } else if (name === "tbl") {
        const rows = descendants(child, "tr");
        const parsedRows = rows.map((row) => childNodes(row, "tc").map((cell) => {
          const paragraphs = descendants(cell, "p").map(parseParagraphText);
          return normalizeDisplayText(paragraphs.join("\n"));
        }));
        if (parsedRows.length === 0) {
          warnings.push("EMPTY_TABLE");
        } else {
          const currentTableIndex = tableIndex;
          const headers = [parsedRows[0]!];
          const dataRows = parsedRows.slice(1);
          blocks.push({
            type: "table",
            headers,
            rows: dataRows,
            locator: locator(sectionPath, { tableIndex: currentTableIndex }),
            rowLocators: dataRows.map((_, rowIndex) => locator(sectionPath, { tableIndex: currentTableIndex, rowIndex: rowIndex + 1 })),
          });
          tableIndex += 1;
        }
      } else if (name === "sdt" || name === "ins" || name === "moveTo" || name === "moveFrom" || name === "del") {
        processChildren(child);
      }
    }
  };
  processChildren(body);
  if (hasTrackedMarkup) warnings.push("TRACKED_REVISION_REVIEW");
  if (blocks.length === 0) errors.push({ code: "NO_EXTRACTED_TEXT" });
  if (options.mimeType && options.mimeType !== DOCX_MIME && !/\.docx$/i.test(options.filename)) warnings.push("MIME_EXTENSION_REVIEW");
  return makeResult("DOCX", bytes, blocks, warnings, errors, media);
};

const pdfLiteralText = (body: string): string => {
  const parts: string[] = [];
  const literalPattern = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = literalPattern.exec(body)) !== null) {
    const value = match[0]!.slice(1, -1)
      .replace(/\\([\\()])/g, "$1")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
    parts.push(value);
  }
  const hexPattern = /<([0-9a-f\s]+)>/gi;
  while ((match = hexPattern.exec(body)) !== null) {
    const hex = match[1]!.replace(/\s/g, "");
    if (hex.length % 2 === 0) parts.push(new TextDecoder("latin1").decode(Uint8Array.from(hex.match(/../g)!.map((pair) => Number.parseInt(pair, 16)))));
  }
  return normalizeDisplayText(parts.join(" "));
};

const parsePdf = (bytes: Uint8Array): ParseResult => {
  const latinSource = textDecoder("latin1", false).decode(bytes);
  let source = latinSource;
  try {
    const utf8Source = textDecoder("utf-8", true).decode(bytes);
    if (/[\u0e00-\u0e7f]/.test(utf8Source)) source = utf8Source;
  } catch {
    // Most binary PDFs are not valid UTF-8; the Latin-1 view remains the safe fallback.
  }
  if (!source.startsWith("%PDF-")) return failedResult("PDF", bytes, { code: "PDF_CORRUPT" });
  if (!source.includes("%%EOF")) return failedResult("PDF", bytes, { code: "PDF_CORRUPT" });
  if (/\/Encrypt\b/.test(source)) return failedResult("PDF", bytes, { code: "PASSWORD_PROTECTED" });
  const pageCount = Math.max(1, (source.match(/\/Type\s*\/Page\b/g) ?? []).length);
  const textObjects = [...source.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)].map((match) => pdfLiteralText(match[1] ?? "")).filter(Boolean);
  if (textObjects.length === 0 || textObjects.join(" ").trim().length < 3) {
    return makeResult("PDF", bytes, [], ["OCR_REQUIRED"], [{ code: "OCR_REQUIRED" }], []);
  }
  const warnings = pageCount > 1 ? ["PAGE_LOCATOR_COARSE"] : [];
  const blocks: KnowledgeBlock[] = [{ type: "paragraph", text: textObjects.join("\n"), locator: locator([], { page: 1, paragraphIndex: 0 }) }];
  return makeResult("PDF", bytes, blocks, warnings, [], []);
};

const parseXlsxCellValue = (cell: XmlNode, sharedStrings: string[]): { address: string; value: string; formula?: string; missingFormulaCache: boolean } => {
  const address = attr(cell, "r") ?? "";
  const formula = descendants(cell, "f")[0];
  const valueNode = descendants(cell, "v")[0];
  const inline = descendants(cell, "t")[0];
  const cellType = attr(cell, "t");
  let value = valueNode ? recursiveText(valueNode) : inline ? recursiveText(inline) : "";
  if (cellType === "s" && value !== "") value = sharedStrings[Number.parseInt(value, 10)] ?? value;
  const formulaText = formula ? recursiveText(formula) : undefined;
  return { address, value: normalizeDisplayText(value), formula: formulaText, missingFormulaCache: formulaText !== undefined && valueNode === undefined };
};

const parseXlsx = (bytes: Uint8Array, options: ParseOptions): ParseResult => {
  const archive = new SafeZipArchive(bytes, options.maxZipEntries, options.maxUncompressedBytes);
  if (!archive.has("xl/workbook.xml")) throw new ParserError("XLSX_MISSING_WORKBOOK", "xl/workbook.xml is missing");
  const warnings: string[] = [];
  const errors: ExtractionError[] = [];
  const names = archive.names();
  if (names.some((name) => /vbaProject\.bin$/i.test(name))) errors.push({ code: "MACRO_DETECTED" });
  const sharedStrings = archive.has("xl/sharedStrings.xml")
    ? descendants(parseXml(decodeUtf8(archive.read("xl/sharedStrings.xml"))), "si").map((item) => normalizeDisplayText(recursiveText(item)))
    : [];
  const workbook = parseXml(decodeUtf8(archive.read("xl/workbook.xml")));
  const sheets = descendants(workbook, "sheet");
  const worksheetNames = names.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort((left, right) => {
    const leftNumber = Number.parseInt(left.match(/sheet(\d+)/i)?.[1] ?? "0", 10);
    const rightNumber = Number.parseInt(right.match(/sheet(\d+)/i)?.[1] ?? "0", 10);
    return leftNumber - rightNumber;
  });
  if (worksheetNames.length > (options.maxSheets ?? DEFAULT_MAX_SHEETS)) {
    throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "XLSX sheet count exceeds limit");
  }
  const blocks: KnowledgeBlock[] = [];
  let tableIndex = 0;
  for (let sheetIndex = 0; sheetIndex < worksheetNames.length; sheetIndex += 1) {
    const sheetEntry = worksheetNames[sheetIndex]!;
    const sheetMetadata = sheets[sheetIndex];
    const sheetName = sheetMetadata ? attr(sheetMetadata, "name") ?? `Sheet${sheetIndex + 1}` : `Sheet${sheetIndex + 1}`;
    const sheetState = sheetMetadata ? attr(sheetMetadata, "state") : undefined;
    if (sheetState === "hidden" || sheetState === "veryHidden") {
      warnings.push("HIDDEN_SHEET_EXCLUDED");
      continue;
    }
    const sheetRoot = parseXml(decodeUtf8(archive.read(sheetEntry)));
    const rowNodes = descendants(sheetRoot, "row");
    if (rowNodes.length > (options.maxRowsPerSheet ?? DEFAULT_MAX_ROWS_PER_SHEET)) {
      throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "XLSX row count exceeds limit");
    }
    const rows: string[][] = [];
    const rowLocators: SourceLocator[] = [];
    const formulaCells: Array<{ cell: string; formula: string; displayedValue?: string }> = [];
    let cellCount = 0;
    for (const row of rowNodes) {
      if (attr(row, "hidden") === "1") {
        warnings.push("HIDDEN_ROW_EXCLUDED");
        continue;
      }
      const cells = childNodes(row, "c").map((cell) => parseXlsxCellValue(cell, sharedStrings));
      cellCount += cells.length;
      if (cellCount > (options.maxCellsPerSheet ?? DEFAULT_MAX_CELLS_PER_SHEET)) {
        throw new ParserError("PARSER_OR_ARCHIVE_FAILURE", "XLSX cell count exceeds limit");
      }
      if (cells.length === 0) continue;
      rows.push(cells.map((cell) => cell.value));
      const rowNumber = Number.parseInt(attr(row, "r") ?? "0", 10) || rows.length;
      rowLocators.push(locator([], { sheetName, rowIndex: rowNumber, cellRange: cells[0]?.address }));
      for (const cell of cells) {
        if (cell.formula) formulaCells.push({ cell: cell.address, formula: cell.formula, displayedValue: cell.value || undefined });
        if (cell.missingFormulaCache) warnings.push("FORMULA_CACHE_MISSING");
      }
    }
    if (rows.length === 0) continue;
    const headers = [rows[0]!];
    const dataRows = rows.slice(1);
    blocks.push({
      type: "table",
      headers,
      rows: dataRows,
      locator: locator([], { sheetName, tableIndex }),
      rowLocators: rowLocators.slice(1),
      formulaCells: formulaCells.length > 0 ? formulaCells : undefined,
    });
    tableIndex += 1;
  }
  if (blocks.length === 0) errors.push({ code: "NO_EXTRACTED_TEXT" });
  return makeResult("XLSX", bytes, blocks, warnings, errors, []);
};

const formatFromFilename = (filename: string): ParserFormat | undefined => {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "txt") return "TXT";
  if (extension === "md" || extension === "markdown") return "MD";
  if (extension === "docx") return "DOCX";
  if (extension === "pdf") return "PDF";
  if (extension === "xlsx") return "XLSX";
  return undefined;
};

export const parseDocument = (input: Uint8Array, options: ParseOptions): ParseResult => {
  const bytes = new Uint8Array(input);
  const format = formatFromFilename(options.filename) ?? (
    options.mimeType === DOCX_MIME ? "DOCX" : options.mimeType === XLSX_MIME ? "XLSX" : undefined
  );
  if (!format) return failedResult("TXT", bytes, { code: "UNSUPPORTED_FORMAT" });
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (bytes.byteLength > maxBytes) return failedResult(format, bytes, { code: "SIZE_LIMIT_EXCEEDED" });
  try {
    if (format === "TXT" || format === "MD") return parsePlainText(bytes, format);
    if (format === "DOCX") return parseDocx(bytes, options);
    if (format === "PDF") return parsePdf(bytes);
    return parseXlsx(bytes, options);
  } catch (error) {
    const parserError = error instanceof ParserError ? error : new ParserError("PARSER_OR_ARCHIVE_FAILURE", "parser failed safely");
    return failedResult(format, bytes, { code: parserError.code, detailRedacted: parserError.message.split(": ").slice(1).join(": ") || undefined });
  }
};

export const parserVersion = "1.0.0" as const;
