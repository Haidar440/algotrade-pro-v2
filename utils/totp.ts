// Pure Typescript TOTP Generator (SHA-1)
// Removes the need for external libraries like 'otpauth'

const keyChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32tohex(base32: string): string {
  let base32chars = keyChars;   
  let bits = '';
  let hex = '';

  for (let i = 0; i < base32.length; i++) {
    let val = base32chars.indexOf(base32.charAt(i).toUpperCase());
    if (val === -1) throw new Error("Invalid TOTP Secret Character");
    bits += val.toString(2).padStart(5, '0');
  }

  for (let i = 0; i + 4 <= bits.length; i += 4) {
    let chunk = bits.substr(i, 4);
    hex = hex + parseInt(chunk, 2).toString(16);
  }
  return hex;
}

function hex2buf(hex: string): Uint8Array {
    const len = hex.length;
    const buf = new Uint8Array(len / 2);
    for (let i = 0; i < len; i += 2) {
        buf[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return buf;
}

export const generateTOTP = async (secret: string): Promise<string> => {
  try {
      const epoch = Math.round(new Date().getTime() / 1000.0);
      const time = Math.floor(epoch / 30).toString(16).padStart(16, '0');
      
      const keyHex = base32tohex(secret);
      const key = hex2buf(keyHex);
      const msg = hex2buf(time);

      // Web Crypto API (Native in all modern browsers)
      const cryptoKey = await window.crypto.subtle.importKey(
          'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
      );
      const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, msg);
      const hmac = new Uint8Array(signature);
      
      const offset = hmac[hmac.length - 1] & 0xf;
      const code = ((hmac[offset] & 0x7f) << 24) |
          ((hmac[offset + 1] & 0xff) << 16) |
          ((hmac[offset + 2] & 0xff) << 8) |
          (hmac[offset + 3] & 0xff);

      return (code % 1000000).toString().padStart(6, '0');
  } catch (e) {
      console.error("TOTP Generation Failed:", e);
      throw new Error("Invalid Secret Key format");
  }
};