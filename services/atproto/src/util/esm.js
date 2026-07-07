/**
 * ═══════════════════════════════════════════════════════════
 * ESM interop loader
 *
 * The AT-Protocol / IPLD toolchain (@atproto/crypto, @ipld/dag-cbor,
 * multiformats, @ipld/car) ships as ESM-only. This CommonJS codebase reaches
 * them via dynamic import(), cached after first load. Every consumer is async,
 * so the import cost is paid once on the first sign/encode.
 *
 * `dynImport` is a direct `import(specifier)`. It must NOT be hidden behind a
 * `new Function`/`eval` indirection: under Jest's `--experimental-vm-modules`
 * that detaches the import from this module's dynamic-import hook, so an
 * in-flight ESM link can resolve against a peer suite's torn-down VM and throw
 * "Test environment has been torn down" (BUG-009). A direct import() inherits
 * the current module's live binding. No transpiler in this repo rewrites
 * import() into require() (production is plain Node), so it stays a native
 * dynamic import in both plain Node and under Jest.
 * ═══════════════════════════════════════════════════════════
 */

const dynImport = (specifier) => import(specifier);

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
