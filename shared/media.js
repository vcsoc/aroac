// Inspect bounded raster dimensions without decoding image pixels.
export function imageDimensions(bytes, mime) {
  if (mime === "image/png") {
    if (
      bytes.length < 33 ||
      String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
    )
      return null;
    const u = (o) =>
      bytes[o] * 16777216 +
      bytes[o + 1] * 65536 +
      bytes[o + 2] * 256 +
      bytes[o + 3];
    return { width: u(16), height: u(20) };
  }
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 255) return null;
      while (bytes[i + 1] === 255) i++;
      const marker = bytes[i + 1];
      if (marker === 0xda || marker === 0xd9) return null;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2;
        continue;
      }
      const length = bytes[i + 2] * 256 + bytes[i + 3];
      if (length < 2 || i + 2 + length > bytes.length) return null;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (length < 8) return null;
        return {
          height: bytes[i + 5] * 256 + bytes[i + 6],
          width: bytes[i + 7] * 256 + bytes[i + 8],
        };
      }
      i += length + 2;
    }
  }
  return null;
}
