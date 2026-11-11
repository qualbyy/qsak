export interface RawRgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function encodeBmpRgba(img: RawRgbaImage): Uint8Array {
  const { width, height, data } = img;
  const rowSize = width * 4;
  const pixelSize = rowSize * height;
  const headerSize = 54;
  const out = new Uint8Array(headerSize + pixelSize);
  const view = new DataView(out.buffer);

  // BITMAPFILEHEADER
  out[0] = 0x42; // B
  out[1] = 0x4d; // M
  view.setUint32(2, out.length, true);
  view.setUint32(10, headerSize, true);

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true); // 32bpp BGRA
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, pixelSize, true);

  let dst = headerSize;
  for (let i = 0; i < data.length; i += 4) {
    out[dst++] = data[i + 2]; // B
    out[dst++] = data[i + 1]; // G
    out[dst++] = data[i];     // R
    out[dst++] = data[i + 3]; // A
  }
  return out;
}

export function encodeTgaRgba(img: RawRgbaImage): Uint8Array {
  const { width, height, data } = img;
  const header = new Uint8Array(18);
  const view = new DataView(header.buffer);
  header[2] = 2; // uncompressed true-color
  view.setUint16(12, width, true);
  view.setUint16(14, height, true);
  header[16] = 32; // 32bpp
  header[17] = 0x28; // top-left origin + 8-bit alpha

  const out = new Uint8Array(18 + width * height * 4);
  out.set(header, 0);
  let dst = 18;
  for (let i = 0; i < data.length; i += 4) {
    out[dst++] = data[i + 2]; // B
    out[dst++] = data[i + 1]; // G
    out[dst++] = data[i];     // R
    out[dst++] = data[i + 3]; // A
  }
  return out;
}

export function decodeTgaRgba(bytes: Uint8Array): RawRgbaImage {
  if (bytes.length < 18) throw new Error("Invalid TGA file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idLen = bytes[0];
  const colorMapType = bytes[1];
  const imageType = bytes[2];
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const bpp = bytes[16];
  const descriptor = bytes[17];

  if (colorMapType !== 0 || (imageType !== 2 && imageType !== 10)) {
    throw new Error("Only uncompressed or RLE true-color TGA images are supported");
  }
  if (bpp !== 24 && bpp !== 32) {
    throw new Error(`Unsupported TGA bit depth: ${bpp}`);
  }

  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const bytesPerPixel = bpp / 8;
  let offset = 18 + idLen;

  const writePixel = (idx: number, b: number, g: number, r: number, a: number) => {
    const p = idx * 4;
    rgba[p] = r;
    rgba[p + 1] = g;
    rgba[p + 2] = b;
    rgba[p + 3] = a;
  };

  if (imageType === 2) {
    for (let i = 0; i < pixelCount; i++) {
      const b = bytes[offset++];
      const g = bytes[offset++];
      const r = bytes[offset++];
      const a = bytesPerPixel === 4 ? bytes[offset++] : 255;
      writePixel(i, b, g, r, a);
    }
  } else {
    let i = 0;
    while (i < pixelCount && offset < bytes.length) {
      const packet = bytes[offset++];
      const count = (packet & 0x7f) + 1;
      if (packet & 0x80) {
        const b = bytes[offset++];
        const g = bytes[offset++];
        const r = bytes[offset++];
        const a = bytesPerPixel === 4 ? bytes[offset++] : 255;
        for (let k = 0; k < count && i < pixelCount; k++) {
          writePixel(i++, b, g, r, a);
        }
      } else {
        for (let k = 0; k < count && i < pixelCount; k++) {
          const b = bytes[offset++];
          const g = bytes[offset++];
          const r = bytes[offset++];
          const a = bytesPerPixel === 4 ? bytes[offset++] : 255;
          writePixel(i++, b, g, r, a);
        }
      }
    }
  }

  // Flip vertically if bottom-left origin (bit 5 of descriptor is 0)
  const topOrigin = (descriptor & 0x20) !== 0;
  if (!topOrigin) {
    const rowBytes = width * 4;
    const temp = new Uint8ClampedArray(rowBytes);
    for (let y = 0; y < Math.floor(height / 2); y++) {
      const topOff = y * rowBytes;
      const botOff = (height - 1 - y) * rowBytes;
      temp.set(rgba.subarray(topOff, topOff + rowBytes));
      rgba.copyWithin(topOff, botOff, botOff + rowBytes);
      rgba.set(temp, botOff);
    }
  }

  return { width, height, data: rgba };
}

export function decodeNetpbmRgba(bytes: Uint8Array): RawRgbaImage {
  let pos = 0;
  const readToken = (): string => {
    while (pos < bytes.length) {
      const ch = bytes[pos];
      if (ch === 35 /* # */) {
        while (pos < bytes.length && bytes[pos] !== 10) pos++;
      } else if (ch <= 32) {
        pos++;
      } else {
        break;
      }
    }
    const start = pos;
    while (pos < bytes.length && bytes[pos] > 32 && bytes[pos] !== 35) pos++;
    return new TextDecoder().decode(bytes.subarray(start, pos));
  };

  const magic = readToken();
  const width = Number.parseInt(readToken(), 10);
  const height = Number.parseInt(readToken(), 10);
  const maxVal = magic === "P1" || magic === "P4" ? 1 : Number.parseInt(readToken(), 10);

  if (!width || !height) throw new Error("Invalid Netpbm header");
  if (pos < bytes.length && bytes[pos] <= 32) pos++;

  const rgba = new Uint8ClampedArray(width * height * 4);
  const scale = maxVal > 0 ? 255 / maxVal : 1;

  if (magic === "P6") {
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = Math.round(bytes[pos++] * scale);
      rgba[i * 4 + 1] = Math.round(bytes[pos++] * scale);
      rgba[i * 4 + 2] = Math.round(bytes[pos++] * scale);
      rgba[i * 4 + 3] = 255;
    }
  } else if (magic === "P5") {
    for (let i = 0; i < width * height; i++) {
      const v = Math.round(bytes[pos++] * scale);
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
  } else if (magic === "P3") {
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = Math.round(Number.parseInt(readToken(), 10) * scale);
      rgba[i * 4 + 1] = Math.round(Number.parseInt(readToken(), 10) * scale);
      rgba[i * 4 + 2] = Math.round(Number.parseInt(readToken(), 10) * scale);
      rgba[i * 4 + 3] = 255;
    }
  } else if (magic === "P2") {
    for (let i = 0; i < width * height; i++) {
      const v = Math.round(Number.parseInt(readToken(), 10) * scale);
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
  } else {
    throw new Error(`Unsupported Netpbm variant: ${magic}`);
  }

  return { width, height, data: rgba };
}

export function decodeBaselineTiffRgba(bytes: Uint8Array): RawRgbaImage {
  if (bytes.length < 8) throw new Error("Invalid TIFF file");
  const le = bytes[0] === 0x49 && bytes[1] === 0x49;
  const be = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!le && !be) throw new Error("Invalid TIFF byte order");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint16(2, le);
  if (magic !== 42) throw new Error("Invalid TIFF magic number");

  const ifdOffset = view.getUint32(4, le);
  const entryCount = view.getUint16(ifdOffset, le);

  let width = 0;
  let height = 0;
  let compression = 1;
  let photometric = 2;
  let samplesPerPixel = 3;
  let stripOffsets: number[] = [];
  let stripByteCounts: number[] = [];
  let rowsPerStrip = 0;

  const readValues = (type: number, count: number, valOffset: number): number[] => {
    const typeSizes: Record<number, number> = { 1: 1, 3: 2, 4: 4 };
    const unit = typeSizes[type] ?? 4;
    const total = unit * count;
    const base = total <= 4 ? valOffset : view.getUint32(valOffset, le);
    const vals: number[] = [];
    for (let i = 0; i < count; i++) {
      const off = base + i * unit;
      if (unit === 1) vals.push(bytes[off]);
      else if (unit === 2) vals.push(view.getUint16(off, le));
      else vals.push(view.getUint32(off, le));
    }
    return vals;
  };

  for (let i = 0; i < entryCount; i++) {
    const off = ifdOffset + 2 + i * 12;
    const tag = view.getUint16(off, le);
    const type = view.getUint16(off + 2, le);
    const count = view.getUint32(off + 4, le);
    const valOff = off + 8;

    if (tag === 256) width = readValues(type, count, valOff)[0];
    else if (tag === 257) height = readValues(type, count, valOff)[0];
    else if (tag === 259) compression = readValues(type, count, valOff)[0];
    else if (tag === 262) photometric = readValues(type, count, valOff)[0];
    else if (tag === 273) stripOffsets = readValues(type, count, valOff);
    else if (tag === 277) samplesPerPixel = readValues(type, count, valOff)[0];
    else if (tag === 278) rowsPerStrip = readValues(type, count, valOff)[0];
    else if (tag === 279) stripByteCounts = readValues(type, count, valOff);
  }

  if (!width || !height || stripOffsets.length === 0) {
    throw new Error("Unsupported TIFF layout (tiled or empty)");
  }
  if (compression !== 1 && compression !== 32773) {
    throw new Error(`Unsupported TIFF compression (${compression}); uncompressed and PackBits TIFF are supported`);
  }

  if (!rowsPerStrip) rowsPerStrip = height;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let pixelIndex = 0;

  const decodePackBits = (src: Uint8Array): Uint8Array => {
    const out: number[] = [];
    let p = 0;
    while (p < src.length) {
      const n = (src[p++] << 24) >> 24;
      if (n >= 0) {
        const count = n + 1;
        for (let k = 0; k < count && p < src.length; k++) out.push(src[p++]);
      } else if (n !== -128) {
        const count = 1 - n;
        const val = src[p++];
        for (let k = 0; k < count; k++) out.push(val);
      }
    }
    return new Uint8Array(out);
  };

  for (let s = 0; s < stripOffsets.length; s++) {
    const start = stripOffsets[s];
    const len = stripByteCounts[s] ?? (bytes.length - start);
    const rawStrip = bytes.subarray(start, start + len);
    const strip = compression === 32773 ? decodePackBits(rawStrip) : rawStrip;

    for (let p = 0; p + samplesPerPixel <= strip.length && pixelIndex < width * height; p += samplesPerPixel) {
      const dst = pixelIndex * 4;
      if (samplesPerPixel === 1) {
        const g = photometric === 0 ? 255 - strip[p] : strip[p];
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = 255;
      } else if (samplesPerPixel >= 3) {
        rgba[dst] = strip[p];
        rgba[dst + 1] = strip[p + 1];
        rgba[dst + 2] = strip[p + 2];
        rgba[dst + 3] = samplesPerPixel >= 4 ? strip[p + 3] : 255;
      }
      pixelIndex++;
    }
  }

  return { width, height, data: rgba };
}

export function extractLargestIcoPayload(bytes: Uint8Array): { kind: "png" | "bmp"; payload: Uint8Array } {
  if (bytes.length < 6) throw new Error("Invalid ICO file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);
  if (count === 0 || bytes.length < 6 + count * 16) throw new Error("Empty ICO directory");

  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w = bytes[off] === 0 ? 256 : bytes[off];
    const h = bytes[off + 1] === 0 ? 256 : bytes[off + 1];
    const score = w * h;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const dirOff = 6 + bestIdx * 16;
  const size = view.getUint32(dirOff + 8, true);
  const offset = view.getUint32(dirOff + 12, true);
  const payload = bytes.subarray(offset, offset + size);

  const isPng =
    payload.length >= 8 &&
    payload[0] === 0x89 &&
    payload[1] === 0x50 &&
    payload[2] === 0x4e &&
    payload[3] === 0x47;
  return { kind: isPng ? "png" : "bmp", payload };
}

export function minifySvg(svgText: string): string {
  return (
    svgText
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<\?xml[\s\S]*?\?>/gi, "")
      .replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/>\s+</g, "><")
      .trim() + "\n"
  );
}
