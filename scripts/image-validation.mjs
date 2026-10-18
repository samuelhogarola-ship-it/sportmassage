import path from "node:path";

const TYPES = Object.freeze({
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
});

function dimensionsPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  let offset = 8; let idat = false; let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); if (offset + 12 + length > bytes.length) return null;
    const type = bytes.toString("ascii", offset + 4, offset + 8); if (type === "IDAT") idat = true;
    offset += 12 + length; if (type === "IEND") { ended = true; break; }
  }
  if (!idat || !ended || offset !== bytes.length) return null;
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
function dimensionsGif(bytes) {
  if (bytes.length < 14 || !["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)) || bytes[bytes.length - 1] !== 0x3b || !bytes.includes(0x2c, 10)) return null;
  return [bytes.readUInt16LE(6), bytes.readUInt16LE(8)];
}
function dimensionsJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length < 7) return null;
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    }
    offset += length;
  }
  return null;
}
function readUInt24LE(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }
function dimensionsWebp(bytes) {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.readUInt32LE(16) + 20 > bytes.length) return null;
  const type = bytes.toString("ascii", 12, 16);
  if (type === "VP8X") return [1 + readUInt24LE(bytes, 24), 1 + readUInt24LE(bytes, 27)];
  if (type === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
  }
  if (type === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  }
  return null;
}

export function validateImage({ filename, bytes, declaredMime, maxWidth = 6000, maxHeight = 6000, maxPixels = 24_000_000 }) {
  const extension = path.extname(String(filename)).slice(1).toLowerCase();
  const expectedMime = TYPES[extension];
  if (!expectedMime || !Buffer.isBuffer(bytes)) throw new Error("Unsupported image format");
  if (declaredMime && declaredMime.toLowerCase() !== expectedMime) throw new Error("Image MIME and extension disagree");
  const parser = expectedMime === "image/png" ? dimensionsPng : expectedMime === "image/gif" ? dimensionsGif : expectedMime === "image/jpeg" ? dimensionsJpeg : dimensionsWebp;
  const dimensions = parser(bytes);
  if (!dimensions || dimensions.some((value) => !Number.isInteger(value) || value < 1)) throw new Error("Image bytes are malformed");
  const [width, height] = dimensions;
  if (width > maxWidth || height > maxHeight || width * height > maxPixels) throw new Error("Image dimensions are too large");
  return { mime: expectedMime, width, height };
}
