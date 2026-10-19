/*
 * ZoeWeb — DDT4All-compatible ECU engine (independent reimplementation).
 *
 * Parses a DDT4All ECU definition (the JSON files DDT4All / DDT2000 use) and
 * decodes/encodes its parameters, so ZoeWeb can drive ANY Renault ECU the same
 * way DDT4All does — through our own ELM327/ISO-TP layer, with a nicer UI.
 *
 * The proprietary ECU database is NOT shipped; the user loads their own files.
 *
 * DDT JSON shape (see cedricp/ddt4all):
 *   obd: { send_id, recv_id, protocol, funcaddr }
 *   endian: "big" | "little"
 *   requests: [ { name, sentbytes, replybytes,
 *                 sendbyte_dataitems|receivebyte_dataitems: { <item>: {firstbyte, bitoffset} } } ]
 *   data: { <item>: { comment, unit, scaled, step, offset, divideby, signed,
 *                     bitscount, bytescount, bytesascii, lists:{k:label} } }
 */

const hexToBytes = h => {
  h = (h || '').replace(/\s/g, '');
  const out = [];
  for (let i = 0; i + 2 <= h.length; i += 2) out.push(parseInt(h.substring(i, i + 2), 16));
  return out;
};
const bytesToHex = b => b.map(x => (x & 0xff).toString(16).padStart(2, '0')).join('');

export class DdtEcu {
  constructor(json, fileName = '') {
    this.demoOnly = json.demoOnly === true; // EspaceWeb synthetic fixtures never reach hardware.
    this.name = json.ecuname || fileName.replace(/\.json$/i, '');
    this.fileName = fileName;
    this.obd = json.obd || {};
    this.endian = (json.endian || 'big').toLowerCase();
    this.dataitems = json.data || {};
    this.requests = json.requests || [];
    this.autoidents = json.autoidents || [];
    this.protocol = this.obd.protocol || 'CAN';
    this.toIdHex = (this.obd.send_id || '').toLowerCase();     // request id
    this.fromIdHex = (this.obd.recv_id || '').toLowerCase();   // response id
  }

  /** An ECU handle the ELM327 driver / Uds understand. */
  handle() {
    return {
      toIdHex: this.toIdHex,
      fromIdHex: this.fromIdHex,
      isExtended: this.fromIdHex.length > 3,
      sessionRequestId: '10c0',
      name: this.name,
      mnemonic: this.name,
    };
  }

  /** Requests split into readable (22/21) and writable (2E/3B) sets. */
  reads() { return this.requests.filter(r => /^(22|21)/i.test(r.sentbytes || '') && r.receivebyte_dataitems); }
  writes() { return this.requests.filter(r => /^(2e|3b)/i.test(r.sentbytes || '') && r.sendbyte_dataitems); }

  itemDef(name) { return this.dataitems[name] || {}; }

  /** Extract the raw integer (or ASCII string) of one dataitem from a response. */
  _extract(bytes, def, pos) {
    // EspaceWeb: bounds, MSB bit offsets, signed 32-bit values and per-item endian.
    const fb = (pos.firstbyte || 1) - 1;
    const width = def.bitscount || (def.bytescount || 1) * 8;
    const offset = pos.bitoffset || 0;
    const count = def.bytesascii ? (def.bytescount || Math.ceil(width / 8)) : Math.ceil((width + offset) / 8);
    if (!Number.isInteger(fb) || fb < 0 || width < 1 || width > 1024 || offset < 0 || offset > 7 || fb + count > bytes.length) {
      throw new Error('DDT response too short or invalid item dimensions');
    }
    if (def.bytesascii) return { ascii: String.fromCharCode(...bytes.slice(fb, fb + count)).replace(/\0/g, '').trim() };
    const endian = String(pos.endian || this.endian).toLowerCase();
    if (endian === 'little' && (offset !== 0 || width % 8 !== 0)) {
      throw new Error('Packed little-endian DDT fields are not verified in this version');
    }
    let chunk = bytes.slice(fb, fb + count);
    if (endian === 'little') chunk.reverse();
    let integer = chunk.reduce((v, x) => v * 256n + BigInt(x), 0n);
    if (endian !== 'little') integer >>= BigInt(count * 8 - offset - width);
    integer &= (1n << BigInt(width)) - 1n;
    if (def.signed && integer >= (1n << BigInt(width - 1))) integer -= 1n << BigInt(width);
    if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new Error('DDT integer exceeds exact JavaScript range; use raw response');
    }
    return { raw: Number(integer) };
  }

  /** Format one dataitem to a display value {value, unit, enum}. */
  _format(name, ext) {
    const def = this.itemDef(name);
    if (ext.ascii != null) return { value: ext.ascii || '—', unit: '', kind: 'text' };
    let raw = ext.raw;
    if (def.lists) {
      const label = def.lists[String(raw)];
      return { value: label ?? `raw ${raw}`, unit: '', raw, kind: 'enum', enum: def.lists };
    }
    if (def.scaled || def.step != null || def.offset != null || def.divideby) {
      let v = raw * (def.step != null ? def.step : 1) + (def.offset != null ? def.offset : 0);
      if (def.divideby) v /= def.divideby;
      const dec = (def.step && def.step < 1) ? 2 : 0;
      return { value: v.toFixed(dec), unit: def.unit || '', raw, kind: 'num' };
    }
    return { value: String(raw), unit: def.unit || '', raw, kind: 'num' };
  }

  /** Decode every dataitem of a read request from its response hex. */
  decode(req, respHex) {
    const bytes = hexToBytes(respHex);
    const items = req.receivebyte_dataitems || {};
    return Object.entries(items).map(([name, pos]) => {
      const ext = this._extract(bytes, this.itemDef(name), pos);
      const f = this._format(name, ext);
      return { name, comment: this.itemDef(name).comment || '', ...f };
    });
  }

  /** Reverse a display value to a raw integer for writing. */
  toRaw(name, input) {
    const def = this.itemDef(name);
    if (def.lists) return parseInt(input, 10);
    let raw = parseFloat(input);
    if (def.divideby) raw *= def.divideby;
    raw -= (def.offset != null ? def.offset : 0);
    if (def.step) raw /= def.step;
    return Math.round(raw);
  }

  /** Build the request hex for a write, placing rawValue into the template. */
  buildWrite(req, name, rawValue) {
    const bytes = hexToBytes(req.sentbytes);
    const pos = (req.sendbyte_dataitems || {})[name];
    const def = this.itemDef(name);
    const fb = (pos.firstbyte || 1) - 1;
    while (bytes.length <= fb) bytes.push(0);
    if (def.bytescount) {
      for (let i = 0; i < def.bytescount; i++) {
        const shift = (def.bytescount - 1 - i) * 8;
        const b = (rawValue >> shift) & 0xff;
        bytes[fb + (this.endian === 'little' ? def.bytescount - 1 - i : i)] = b;
      }
    } else if (def.bitscount && def.bitscount <= 8 && pos.bitoffset != null) {
      const lo = pos.bitoffset - def.bitscount + 1;
      const mask = ((1 << def.bitscount) - 1) << Math.max(0, lo);
      bytes[fb] = (bytes[fb] & ~mask) | ((rawValue << Math.max(0, lo)) & mask);
    } else {
      bytes[fb] = rawValue & 0xff;
    }
    return bytesToHex(bytes);
  }
}

/** Parse a loaded file's text into a DdtEcu (throws on bad JSON). */
export function parseDdt(text, fileName) {
  const json = JSON.parse(text);
  if (!json.obd || !Array.isArray(json.requests)) throw new Error('not a DDT4All ECU file (missing obd/requests)');
  return new DdtEcu(json, fileName);
}
