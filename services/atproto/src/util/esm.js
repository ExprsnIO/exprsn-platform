/**
 * ═══════════════════════════════════════════════════════════
 * ESM interop loader
 *
 * The AT-Protocol / IPLD toolchain (@atproto/crypto, @ipld/dag-cbor,
 * multiformats, @ipld/car) ships as ESM-only. This CommonJS codebase reaches
 * them via dynamic import(), cached after first load. Every consumer is async,
 * so the import cost is paid once on the first sign/encode.
 *
 * `dynImport` uses the Function constructor so test transpilers (Jest/Babel)
 * can't rewrite the import() into a require() — it always runs as a native
 * dynamic import, in both plain Node and under Jest.
 * ═══════════════════════════════════════════════════════════
 */

// eslint-disable-next-line no-new-func
const dynImport = new Function('specifier', 'return import(specifier)');

let cache = null;
let decodeFirstFn = null;

async function load() {
  if (cache) return cache;
  const [crypto, dagCbor, cidMod, u8a] = await Promise.all([
    dynImport('@atproto/crypto'),
    dynImport('@ipld/dag-cbor'),
    dynImport('multiformats/cid'),
    dynImport('uint8arrays'),
  ]);
  cache = {
    crypto,
    dagCbor,
    CID: cidMod.CID,
    toString: u8a.toString,
    fromString: u8a.fromString,
  };
  return cache;
}

/**
 * Lazily build a `decodeFirst(bytes) → [value, remainder]` for splitting the two
 * back-to-back dag-cbor objects in a firehose frame. Kept SEPARATE from load()
 * so the common sign/verify path never imports `cborg` (its ESM exports map
 * trips Jest's experimental-vm-modules linker; only the raw firehose needs it).
 */
async function loadDecodeFirst() {
  if (decodeFirstFn) return decodeFirstFn;
  const [dagCbor, cborg] = await Promise.all([
    dynImport('@ipld/dag-cbor'),
    dynImport('cborg'),
  ]);
  decodeFirstFn = (bytes) => cborg.decodeFirst(bytes, dagCbor.decodeOptions);
  return decodeFirstFn;
}

module.exports = { load, loadDecodeFirst, dynImport };
