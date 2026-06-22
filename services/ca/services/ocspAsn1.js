/**
 * ═══════════════════════════════════════════════════════════════════════
 * ASN.1 helpers for OCSP (RFC 6960) and CRL (RFC 5280) DER structures
 * ═══════════════════════════════════════════════════════════════════════
 *
 * node-forge has no OCSP support and no CRL builder, so the DER
 * structures are constructed/parsed manually with forge.asn1.
 */

const forge = require('node-forge');
const nodeCrypto = require('crypto');
const { asn1, pki } = forge;

const OIDS = {
  sha1: '1.3.14.3.2.26',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha384: '2.16.840.1.101.3.4.2.2',
  sha512: '2.16.840.1.101.3.4.2.3',
  sha256WithRSAEncryption: '1.2.840.113549.1.1.11',
  ocspBasic: '1.3.6.1.5.5.7.48.1.1',
  ocspNonce: '1.3.6.1.5.5.7.48.1.2',
  cRLNumber: '2.5.29.20',
  cRLReason: '2.5.29.21',
  authorityKeyIdentifier: '2.5.29.35'
};

/** Map of OCSP responseStatus codes (RFC 6960 §4.2.1) */
const OCSP_RESPONSE_STATUS = {
  successful: 0,
  malformedRequest: 1,
  internalError: 2,
  tryLater: 3,
  sigRequired: 5,
  unauthorized: 6
};

// ─────────────────────────────────────────────────────────────────────────
// Generic DER node builders
// ─────────────────────────────────────────────────────────────────────────

function seq(items) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, items);
}

function ctx(tag, constructed, value) {
  return asn1.create(asn1.Class.CONTEXT_SPECIFIC, tag, constructed, value);
}

function oidNode(oid) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes());
}

function nullNode() {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, '');
}

function octetString(bytes) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, bytes);
}

function enumerated(intValue) {
  return asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.ENUMERATED,
    false,
    asn1.integerToDer(intValue).getBytes()
  );
}

function integerNode(intValue) {
  return asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.INTEGER,
    false,
    asn1.integerToDer(intValue).getBytes()
  );
}

/**
 * INTEGER from a (possibly large) hex string, preserving positive sign.
 */
function integerFromHex(hex) {
  let normalized = hex.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (normalized.length % 2 !== 0) {
    normalized = '0' + normalized;
  }
  if (normalized.length === 0) {
    normalized = '00';
  }
  // Ensure positive INTEGER (prepend 0x00 if high bit set)
  if (parseInt(normalized.substring(0, 2), 16) >= 0x80) {
    normalized = '00' + normalized;
  }
  return asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.INTEGER,
    false,
    forge.util.hexToBytes(normalized)
  );
}

/**
 * BIT STRING with zero unused bits from a Buffer or binary string.
 */
function bitString(bytes) {
  const binary = Buffer.isBuffer(bytes) ? bytes.toString('binary') : bytes;
  return asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.BITSTRING,
    false,
    String.fromCharCode(0x00) + binary
  );
}

/**
 * AlgorithmIdentifier for sha256WithRSAEncryption with NULL params.
 */
function sha256WithRsaAlgorithmIdentifier() {
  return seq([oidNode(OIDS.sha256WithRSAEncryption), nullNode()]);
}

/**
 * GeneralizedTime node (YYYYMMDDHHMMSSZ).
 */
function generalizedTime(date) {
  const d = new Date(date);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const value =
    pad(d.getUTCFullYear(), 4) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z';
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.GENERALIZEDTIME, false, value);
}

/**
 * RFC 5280 Time CHOICE: UTCTime before 2050, GeneralizedTime after.
 */
function timeNode(date) {
  const d = new Date(date);
  if (d.getUTCFullYear() >= 2050) {
    return generalizedTime(d);
  }
  return asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.UTCTIME,
    false,
    asn1.dateToUtcTime(d)
  );
}

function toDerBuffer(asn1Object) {
  return Buffer.from(asn1.toDer(asn1Object).getBytes(), 'binary');
}

/**
 * Sign DER bytes with RSASSA-PKCS1-v1_5 / SHA-256 using node:crypto.
 * @param {Object} tbsAsn1 - forge asn1 object to encode and sign
 * @param {string} privateKeyPem - signer private key PEM
 * @returns {Buffer} signature
 */
function signTbs(tbsAsn1, privateKeyPem) {
  const tbsDer = toDerBuffer(tbsAsn1);
  return nodeCrypto.createSign('sha256').update(tbsDer).sign(privateKeyPem);
}

// ─────────────────────────────────────────────────────────────────────────
// Issuer hash computation (RFC 6960 CertID)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute issuerNameHash and issuerKeyHash (hex, lowercase) for a CA cert.
 *
 * issuerNameHash: hash of DER-encoded subject Name of the issuer cert.
 * issuerKeyHash:  hash of the subjectPublicKey BIT STRING content
 *                 (i.e. DER RSAPublicKey for RSA keys), per RFC 6960.
 *
 * @param {Object|string} caCert - forge certificate or PEM
 * @returns {{sha1: {nameHash, keyHash}, sha256: {nameHash, keyHash}}}
 */
function computeIssuerHashes(caCert) {
  const cert = typeof caCert === 'string' ? pki.certificateFromPem(caCert) : caCert;

  const nameDer = Buffer.from(
    asn1.toDer(pki.distinguishedNameToAsn1(cert.subject)).getBytes(),
    'binary'
  );
  const keyDer = Buffer.from(
    asn1.toDer(pki.publicKeyToRSAPublicKey(cert.publicKey)).getBytes(),
    'binary'
  );

  const hash = (algo, buf) => nodeCrypto.createHash(algo).update(buf).digest('hex');

  return {
    sha1: {
      nameHash: hash('sha1', nameDer),
      keyHash: hash('sha1', keyDer)
    },
    sha256: {
      nameHash: hash('sha256', nameDer),
      keyHash: hash('sha256', keyDer)
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────
// OCSP request parsing (RFC 6960 §4.1.1)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse a DER OCSPRequest.
 *
 * @param {Buffer} derBuffer
 * @returns {{requests: Object[], nonce: string|null}}
 *   requests: [{ hashAlgorithm, issuerNameHash, issuerKeyHash,
 *                serialNumber, certIdAsn1 }]
 *   nonce: raw extnValue bytes (binary string) to echo back, or null
 */
function parseOcspRequest(derBuffer) {
  const top = asn1.fromDer(forge.util.createBuffer(derBuffer.toString('binary')));

  if (!top.value || !top.value.length) {
    throw new Error('Empty OCSPRequest');
  }

  const tbsRequest = top.value[0];
  let requestList = null;
  let nonce = null;

  for (const element of tbsRequest.value) {
    if (
      element.tagClass === asn1.Class.UNIVERSAL &&
      element.type === asn1.Type.SEQUENCE
    ) {
      // requestList ::= SEQUENCE OF Request
      requestList = element;
    } else if (element.tagClass === asn1.Class.CONTEXT_SPECIFIC && element.type === 2) {
      // requestExtensions [2] EXPLICIT Extensions
      const extensionsSeq = element.value && element.value[0];
      if (extensionsSeq && Array.isArray(extensionsSeq.value)) {
        for (const ext of extensionsSeq.value) {
          try {
            const extOid = asn1.derToOid(ext.value[0].value);
            if (extOid === OIDS.ocspNonce) {
              // Last element is the OCTET STRING extnValue
              // (skip optional critical BOOLEAN in the middle)
              const extnValue = ext.value[ext.value.length - 1];
              nonce = typeof extnValue.value === 'string'
                ? extnValue.value
                : asn1.toDer(extnValue.value[0]).getBytes();
            }
          } catch (e) {
            // Ignore unparseable extension
          }
        }
      }
    }
  }

  if (!requestList) {
    throw new Error('OCSPRequest has no requestList');
  }

  const requests = [];
  for (const request of requestList.value) {
    const certId = request.value[0];
    const [hashAlgorithm, issuerNameHash, issuerKeyHash, serialNumber] = certId.value;

    requests.push({
      hashAlgorithm: asn1.derToOid(hashAlgorithm.value[0].value),
      issuerNameHash: forge.util.bytesToHex(issuerNameHash.value).toLowerCase(),
      issuerKeyHash: forge.util.bytesToHex(issuerKeyHash.value).toLowerCase(),
      serialNumber: forge.util.bytesToHex(serialNumber.value).toLowerCase(),
      certIdAsn1: certId
    });
  }

  return { requests, nonce };
}

// ─────────────────────────────────────────────────────────────────────────
// OCSP response building (RFC 6960 §4.2.1)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a status-only OCSPResponse (no responseBytes).
 * @param {number} statusCode - OCSP_RESPONSE_STATUS value
 * @returns {Buffer} DER OCSPResponse
 */
function buildStatusOnlyResponse(statusCode) {
  return toDerBuffer(seq([enumerated(statusCode)]));
}

/**
 * Build a signed, successful OCSPResponse containing a BasicOCSPResponse.
 *
 * @param {Object} options
 * @param {string} options.signerCertPem - responder certificate PEM
 * @param {string} options.signerKeyPem - responder private key PEM
 * @param {string[]} [options.extraCertPems] - additional chain certs
 * @param {Object[]} options.singleResponses
 *   [{ certIdAsn1, status: 'good'|'revoked'|'unknown',
 *      revokedAt, reasonCode, thisUpdate, nextUpdate }]
 * @param {string|null} [options.nonce] - raw extnValue bytes to echo
 * @returns {Buffer} DER OCSPResponse
 */
function buildOcspResponse(options) {
  const {
    signerCertPem,
    signerKeyPem,
    extraCertPems = [],
    singleResponses,
    nonce = null
  } = options;

  const signerCert = pki.certificateFromPem(signerCertPem);

  const responses = singleResponses.map(sr => {
    let certStatus;
    if (sr.status === 'good') {
      // good [0] IMPLICIT NULL — primitive context tag 0, empty
      certStatus = ctx(0, false, '');
    } else if (sr.status === 'revoked') {
      // revoked [1] IMPLICIT RevokedInfo
      const revokedInfo = [generalizedTime(sr.revokedAt || new Date())];
      if (sr.reasonCode !== null && sr.reasonCode !== undefined) {
        // revocationReason [0] EXPLICIT CRLReason
        revokedInfo.push(ctx(0, true, [enumerated(sr.reasonCode)]));
      }
      certStatus = ctx(1, true, revokedInfo);
    } else {
      // unknown [2] IMPLICIT UnknownInfo (NULL)
      certStatus = ctx(2, false, '');
    }

    const fields = [
      sr.certIdAsn1,
      certStatus,
      generalizedTime(sr.thisUpdate || new Date())
    ];

    if (sr.nextUpdate) {
      // nextUpdate [0] EXPLICIT GeneralizedTime
      fields.push(ctx(0, true, [generalizedTime(sr.nextUpdate)]));
    }

    return seq(fields);
  });

  // ResponseData (version omitted => v1)
  const tbsFields = [
    // responderID byName [1] EXPLICIT Name
    ctx(1, true, [pki.distinguishedNameToAsn1(signerCert.subject)]),
    generalizedTime(new Date()), // producedAt
    seq(responses)
  ];

  if (nonce) {
    // responseExtensions [1] EXPLICIT Extensions — echo the nonce
    tbsFields.push(
      ctx(1, true, [seq([seq([oidNode(OIDS.ocspNonce), octetString(nonce)])])])
    );
  }

  const tbsResponseData = seq(tbsFields);
  const signature = signTbs(tbsResponseData, signerKeyPem);

  // certs [0] EXPLICIT SEQUENCE OF Certificate
  const certAsn1List = [pki.certificateToAsn1(signerCert)];
  for (const pem of extraCertPems) {
    try {
      certAsn1List.push(pki.certificateToAsn1(pki.certificateFromPem(pem)));
    } catch (e) {
      // skip unparseable chain certs
    }
  }

  const basicOcspResponse = seq([
    tbsResponseData,
    sha256WithRsaAlgorithmIdentifier(),
    bitString(signature),
    ctx(0, true, [seq(certAsn1List)])
  ]);

  const ocspResponse = seq([
    enumerated(OCSP_RESPONSE_STATUS.successful),
    // responseBytes [0] EXPLICIT ResponseBytes
    ctx(0, true, [
      seq([
        oidNode(OIDS.ocspBasic),
        octetString(asn1.toDer(basicOcspResponse).getBytes())
      ])
    ])
  ]);

  return toDerBuffer(ocspResponse);
}

// ─────────────────────────────────────────────────────────────────────────
// CRL building (RFC 5280 §5)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a signed DER CertificateList (X.509 v2 CRL).
 *
 * @param {Object} options
 * @param {Object|string} options.caCert - issuing CA forge cert or PEM
 * @param {string} options.caKeyPem - issuing CA private key PEM
 * @param {Date} options.thisUpdate
 * @param {Date} options.nextUpdate
 * @param {number} options.crlNumber - monotonic cRLNumber
 * @param {Object[]} options.revoked - [{ serialNumberHex, revokedAt, reasonCode }]
 * @returns {Buffer} DER CertificateList
 */
function buildCrl(options) {
  const { caCert, caKeyPem, thisUpdate, nextUpdate, crlNumber, revoked } = options;

  const cert = typeof caCert === 'string' ? pki.certificateFromPem(caCert) : caCert;
  const issuerName = pki.distinguishedNameToAsn1(cert.subject);

  const tbsFields = [
    integerNode(1), // version v2
    sha256WithRsaAlgorithmIdentifier(),
    issuerName,
    timeNode(thisUpdate),
    timeNode(nextUpdate)
  ];

  if (revoked && revoked.length > 0) {
    const entries = revoked.map(entry => {
      const fields = [
        integerFromHex(entry.serialNumberHex),
        timeNode(entry.revokedAt)
      ];

      if (entry.reasonCode !== null && entry.reasonCode !== undefined && entry.reasonCode !== 0) {
        // crlEntryExtensions: reasonCode (2.5.29.21) = ENUMERATED
        fields.push(
          seq([
            seq([
              oidNode(OIDS.cRLReason),
              octetString(asn1.toDer(enumerated(entry.reasonCode)).getBytes())
            ])
          ])
        );
      }

      return seq(fields);
    });

    tbsFields.push(seq(entries));
  }

  // crlExtensions [0] EXPLICIT Extensions
  const keyIdentifier = cert.generateSubjectKeyIdentifier().getBytes();
  const akiValue = seq([ctx(0, false, keyIdentifier)]); // keyIdentifier [0] IMPLICIT

  const crlExtensions = seq([
    seq([
      oidNode(OIDS.authorityKeyIdentifier),
      octetString(asn1.toDer(akiValue).getBytes())
    ]),
    seq([
      oidNode(OIDS.cRLNumber),
      octetString(asn1.toDer(integerNode(crlNumber)).getBytes())
    ])
  ]);

  tbsFields.push(ctx(0, true, [crlExtensions]));

  const tbsCertList = seq(tbsFields);
  const signature = signTbs(tbsCertList, caKeyPem);

  const certificateList = seq([
    tbsCertList,
    sha256WithRsaAlgorithmIdentifier(),
    bitString(signature)
  ]);

  return toDerBuffer(certificateList);
}

module.exports = {
  OIDS,
  OCSP_RESPONSE_STATUS,
  seq,
  ctx,
  oidNode,
  nullNode,
  octetString,
  enumerated,
  integerNode,
  integerFromHex,
  bitString,
  sha256WithRsaAlgorithmIdentifier,
  generalizedTime,
  timeNode,
  toDerBuffer,
  signTbs,
  computeIssuerHashes,
  parseOcspRequest,
  buildStatusOnlyResponse,
  buildOcspResponse,
  buildCrl
};
