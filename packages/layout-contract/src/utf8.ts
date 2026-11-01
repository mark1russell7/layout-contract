/**
 * This function writes the UTF-8 bytes of a string into `out`, from the index `at`, and gives the index after the last byte.
 * With no `out`, it writes nothing and gives the count of the bytes. A lone surrogate gives the 3 bytes of its code.
 * It reads the UTF-16 code units, so it makes no string for each character (L81: `sha256Hex` allocated 2 GB in one pair).
 */
export function utf8Write(text: string, out?: Uint8Array, at = 0): number {
  let n = at;
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) {
      if (out !== undefined) out[n] = c;
      n += 1;
    } else if (c < 0x800) {
      if (out !== undefined) {
        out[n] = 0xc0 | (c >> 6);
        out[n + 1] = 0x80 | (c & 63);
      }
      n += 2;
    } else if (c < 0x10000) {
      if (out !== undefined) {
        out[n] = 0xe0 | (c >> 12);
        out[n + 1] = 0x80 | ((c >> 6) & 63);
        out[n + 2] = 0x80 | (c & 63);
      }
      n += 3;
    } else {
      if (out !== undefined) {
        out[n] = 0xf0 | (c >> 18);
        out[n + 1] = 0x80 | ((c >> 12) & 63);
        out[n + 2] = 0x80 | ((c >> 6) & 63);
        out[n + 3] = 0x80 | (c & 63);
      }
      n += 4;
    }
  }
  return n;
}

/** This function gives the UTF-8 bytes of a string. The package has no runtime dependencies, thus it does not use `TextEncoder`. */
export function utf8(text: string): Uint8Array {
  const bytes = new Uint8Array(utf8Write(text));
  utf8Write(text, bytes);
  return bytes;
}
