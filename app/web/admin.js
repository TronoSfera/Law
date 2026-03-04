(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/qrcode/lib/can-promise.js
  var require_can_promise = __commonJS({
    "node_modules/qrcode/lib/can-promise.js"(exports, module) {
      module.exports = function() {
        return typeof Promise === "function" && Promise.prototype && Promise.prototype.then;
      };
    }
  });

  // node_modules/qrcode/lib/core/utils.js
  var require_utils = __commonJS({
    "node_modules/qrcode/lib/core/utils.js"(exports) {
      var toSJISFunction;
      var CODEWORDS_COUNT = [
        0,
        // Not used
        26,
        44,
        70,
        100,
        134,
        172,
        196,
        242,
        292,
        346,
        404,
        466,
        532,
        581,
        655,
        733,
        815,
        901,
        991,
        1085,
        1156,
        1258,
        1364,
        1474,
        1588,
        1706,
        1828,
        1921,
        2051,
        2185,
        2323,
        2465,
        2611,
        2761,
        2876,
        3034,
        3196,
        3362,
        3532,
        3706
      ];
      exports.getSymbolSize = function getSymbolSize(version) {
        if (!version) throw new Error('"version" cannot be null or undefined');
        if (version < 1 || version > 40) throw new Error('"version" should be in range from 1 to 40');
        return version * 4 + 17;
      };
      exports.getSymbolTotalCodewords = function getSymbolTotalCodewords(version) {
        return CODEWORDS_COUNT[version];
      };
      exports.getBCHDigit = function(data) {
        let digit = 0;
        while (data !== 0) {
          digit++;
          data >>>= 1;
        }
        return digit;
      };
      exports.setToSJISFunction = function setToSJISFunction(f) {
        if (typeof f !== "function") {
          throw new Error('"toSJISFunc" is not a valid function.');
        }
        toSJISFunction = f;
      };
      exports.isKanjiModeEnabled = function() {
        return typeof toSJISFunction !== "undefined";
      };
      exports.toSJIS = function toSJIS(kanji) {
        return toSJISFunction(kanji);
      };
    }
  });

  // node_modules/qrcode/lib/core/error-correction-level.js
  var require_error_correction_level = __commonJS({
    "node_modules/qrcode/lib/core/error-correction-level.js"(exports) {
      exports.L = { bit: 1 };
      exports.M = { bit: 0 };
      exports.Q = { bit: 3 };
      exports.H = { bit: 2 };
      function fromString(string) {
        if (typeof string !== "string") {
          throw new Error("Param is not a string");
        }
        const lcStr = string.toLowerCase();
        switch (lcStr) {
          case "l":
          case "low":
            return exports.L;
          case "m":
          case "medium":
            return exports.M;
          case "q":
          case "quartile":
            return exports.Q;
          case "h":
          case "high":
            return exports.H;
          default:
            throw new Error("Unknown EC Level: " + string);
        }
      }
      exports.isValid = function isValid(level) {
        return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
      };
      exports.from = function from(value, defaultValue) {
        if (exports.isValid(value)) {
          return value;
        }
        try {
          return fromString(value);
        } catch (e) {
          return defaultValue;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/bit-buffer.js
  var require_bit_buffer = __commonJS({
    "node_modules/qrcode/lib/core/bit-buffer.js"(exports, module) {
      function BitBuffer() {
        this.buffer = [];
        this.length = 0;
      }
      BitBuffer.prototype = {
        get: function(index) {
          const bufIndex = Math.floor(index / 8);
          return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
        },
        put: function(num, length) {
          for (let i = 0; i < length; i++) {
            this.putBit((num >>> length - i - 1 & 1) === 1);
          }
        },
        getLengthInBits: function() {
          return this.length;
        },
        putBit: function(bit) {
          const bufIndex = Math.floor(this.length / 8);
          if (this.buffer.length <= bufIndex) {
            this.buffer.push(0);
          }
          if (bit) {
            this.buffer[bufIndex] |= 128 >>> this.length % 8;
          }
          this.length++;
        }
      };
      module.exports = BitBuffer;
    }
  });

  // node_modules/qrcode/lib/core/bit-matrix.js
  var require_bit_matrix = __commonJS({
    "node_modules/qrcode/lib/core/bit-matrix.js"(exports, module) {
      function BitMatrix(size) {
        if (!size || size < 1) {
          throw new Error("BitMatrix size must be defined and greater than 0");
        }
        this.size = size;
        this.data = new Uint8Array(size * size);
        this.reservedBit = new Uint8Array(size * size);
      }
      BitMatrix.prototype.set = function(row, col, value, reserved) {
        const index = row * this.size + col;
        this.data[index] = value;
        if (reserved) this.reservedBit[index] = true;
      };
      BitMatrix.prototype.get = function(row, col) {
        return this.data[row * this.size + col];
      };
      BitMatrix.prototype.xor = function(row, col, value) {
        this.data[row * this.size + col] ^= value;
      };
      BitMatrix.prototype.isReserved = function(row, col) {
        return this.reservedBit[row * this.size + col];
      };
      module.exports = BitMatrix;
    }
  });

  // node_modules/qrcode/lib/core/alignment-pattern.js
  var require_alignment_pattern = __commonJS({
    "node_modules/qrcode/lib/core/alignment-pattern.js"(exports) {
      var getSymbolSize = require_utils().getSymbolSize;
      exports.getRowColCoords = function getRowColCoords(version) {
        if (version === 1) return [];
        const posCount = Math.floor(version / 7) + 2;
        const size = getSymbolSize(version);
        const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
        const positions = [size - 7];
        for (let i = 1; i < posCount - 1; i++) {
          positions[i] = positions[i - 1] - intervals;
        }
        positions.push(6);
        return positions.reverse();
      };
      exports.getPositions = function getPositions(version) {
        const coords = [];
        const pos = exports.getRowColCoords(version);
        const posLength = pos.length;
        for (let i = 0; i < posLength; i++) {
          for (let j = 0; j < posLength; j++) {
            if (i === 0 && j === 0 || // top-left
            i === 0 && j === posLength - 1 || // bottom-left
            i === posLength - 1 && j === 0) {
              continue;
            }
            coords.push([pos[i], pos[j]]);
          }
        }
        return coords;
      };
    }
  });

  // node_modules/qrcode/lib/core/finder-pattern.js
  var require_finder_pattern = __commonJS({
    "node_modules/qrcode/lib/core/finder-pattern.js"(exports) {
      var getSymbolSize = require_utils().getSymbolSize;
      var FINDER_PATTERN_SIZE = 7;
      exports.getPositions = function getPositions(version) {
        const size = getSymbolSize(version);
        return [
          // top-left
          [0, 0],
          // top-right
          [size - FINDER_PATTERN_SIZE, 0],
          // bottom-left
          [0, size - FINDER_PATTERN_SIZE]
        ];
      };
    }
  });

  // node_modules/qrcode/lib/core/mask-pattern.js
  var require_mask_pattern = __commonJS({
    "node_modules/qrcode/lib/core/mask-pattern.js"(exports) {
      exports.Patterns = {
        PATTERN000: 0,
        PATTERN001: 1,
        PATTERN010: 2,
        PATTERN011: 3,
        PATTERN100: 4,
        PATTERN101: 5,
        PATTERN110: 6,
        PATTERN111: 7
      };
      var PenaltyScores = {
        N1: 3,
        N2: 3,
        N3: 40,
        N4: 10
      };
      exports.isValid = function isValid(mask) {
        return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
      };
      exports.from = function from(value) {
        return exports.isValid(value) ? parseInt(value, 10) : void 0;
      };
      exports.getPenaltyN1 = function getPenaltyN1(data) {
        const size = data.size;
        let points = 0;
        let sameCountCol = 0;
        let sameCountRow = 0;
        let lastCol = null;
        let lastRow = null;
        for (let row = 0; row < size; row++) {
          sameCountCol = sameCountRow = 0;
          lastCol = lastRow = null;
          for (let col = 0; col < size; col++) {
            let module2 = data.get(row, col);
            if (module2 === lastCol) {
              sameCountCol++;
            } else {
              if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
              lastCol = module2;
              sameCountCol = 1;
            }
            module2 = data.get(col, row);
            if (module2 === lastRow) {
              sameCountRow++;
            } else {
              if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
              lastRow = module2;
              sameCountRow = 1;
            }
          }
          if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
          if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
        }
        return points;
      };
      exports.getPenaltyN2 = function getPenaltyN2(data) {
        const size = data.size;
        let points = 0;
        for (let row = 0; row < size - 1; row++) {
          for (let col = 0; col < size - 1; col++) {
            const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
            if (last === 4 || last === 0) points++;
          }
        }
        return points * PenaltyScores.N2;
      };
      exports.getPenaltyN3 = function getPenaltyN3(data) {
        const size = data.size;
        let points = 0;
        let bitsCol = 0;
        let bitsRow = 0;
        for (let row = 0; row < size; row++) {
          bitsCol = bitsRow = 0;
          for (let col = 0; col < size; col++) {
            bitsCol = bitsCol << 1 & 2047 | data.get(row, col);
            if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
            bitsRow = bitsRow << 1 & 2047 | data.get(col, row);
            if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
          }
        }
        return points * PenaltyScores.N3;
      };
      exports.getPenaltyN4 = function getPenaltyN4(data) {
        let darkCount = 0;
        const modulesCount = data.data.length;
        for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
        const k = Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10);
        return k * PenaltyScores.N4;
      };
      function getMaskAt(maskPattern, i, j) {
        switch (maskPattern) {
          case exports.Patterns.PATTERN000:
            return (i + j) % 2 === 0;
          case exports.Patterns.PATTERN001:
            return i % 2 === 0;
          case exports.Patterns.PATTERN010:
            return j % 3 === 0;
          case exports.Patterns.PATTERN011:
            return (i + j) % 3 === 0;
          case exports.Patterns.PATTERN100:
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
          case exports.Patterns.PATTERN101:
            return i * j % 2 + i * j % 3 === 0;
          case exports.Patterns.PATTERN110:
            return (i * j % 2 + i * j % 3) % 2 === 0;
          case exports.Patterns.PATTERN111:
            return (i * j % 3 + (i + j) % 2) % 2 === 0;
          default:
            throw new Error("bad maskPattern:" + maskPattern);
        }
      }
      exports.applyMask = function applyMask(pattern, data) {
        const size = data.size;
        for (let col = 0; col < size; col++) {
          for (let row = 0; row < size; row++) {
            if (data.isReserved(row, col)) continue;
            data.xor(row, col, getMaskAt(pattern, row, col));
          }
        }
      };
      exports.getBestMask = function getBestMask(data, setupFormatFunc) {
        const numPatterns = Object.keys(exports.Patterns).length;
        let bestPattern = 0;
        let lowerPenalty = Infinity;
        for (let p = 0; p < numPatterns; p++) {
          setupFormatFunc(p);
          exports.applyMask(p, data);
          const penalty = exports.getPenaltyN1(data) + exports.getPenaltyN2(data) + exports.getPenaltyN3(data) + exports.getPenaltyN4(data);
          exports.applyMask(p, data);
          if (penalty < lowerPenalty) {
            lowerPenalty = penalty;
            bestPattern = p;
          }
        }
        return bestPattern;
      };
    }
  });

  // node_modules/qrcode/lib/core/error-correction-code.js
  var require_error_correction_code = __commonJS({
    "node_modules/qrcode/lib/core/error-correction-code.js"(exports) {
      var ECLevel = require_error_correction_level();
      var EC_BLOCKS_TABLE = [
        // L  M  Q  H
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        2,
        2,
        1,
        2,
        2,
        4,
        1,
        2,
        4,
        4,
        2,
        4,
        4,
        4,
        2,
        4,
        6,
        5,
        2,
        4,
        6,
        6,
        2,
        5,
        8,
        8,
        4,
        5,
        8,
        8,
        4,
        5,
        8,
        11,
        4,
        8,
        10,
        11,
        4,
        9,
        12,
        16,
        4,
        9,
        16,
        16,
        6,
        10,
        12,
        18,
        6,
        10,
        17,
        16,
        6,
        11,
        16,
        19,
        6,
        13,
        18,
        21,
        7,
        14,
        21,
        25,
        8,
        16,
        20,
        25,
        8,
        17,
        23,
        25,
        9,
        17,
        23,
        34,
        9,
        18,
        25,
        30,
        10,
        20,
        27,
        32,
        12,
        21,
        29,
        35,
        12,
        23,
        34,
        37,
        12,
        25,
        34,
        40,
        13,
        26,
        35,
        42,
        14,
        28,
        38,
        45,
        15,
        29,
        40,
        48,
        16,
        31,
        43,
        51,
        17,
        33,
        45,
        54,
        18,
        35,
        48,
        57,
        19,
        37,
        51,
        60,
        19,
        38,
        53,
        63,
        20,
        40,
        56,
        66,
        21,
        43,
        59,
        70,
        22,
        45,
        62,
        74,
        24,
        47,
        65,
        77,
        25,
        49,
        68,
        81
      ];
      var EC_CODEWORDS_TABLE = [
        // L  M  Q  H
        7,
        10,
        13,
        17,
        10,
        16,
        22,
        28,
        15,
        26,
        36,
        44,
        20,
        36,
        52,
        64,
        26,
        48,
        72,
        88,
        36,
        64,
        96,
        112,
        40,
        72,
        108,
        130,
        48,
        88,
        132,
        156,
        60,
        110,
        160,
        192,
        72,
        130,
        192,
        224,
        80,
        150,
        224,
        264,
        96,
        176,
        260,
        308,
        104,
        198,
        288,
        352,
        120,
        216,
        320,
        384,
        132,
        240,
        360,
        432,
        144,
        280,
        408,
        480,
        168,
        308,
        448,
        532,
        180,
        338,
        504,
        588,
        196,
        364,
        546,
        650,
        224,
        416,
        600,
        700,
        224,
        442,
        644,
        750,
        252,
        476,
        690,
        816,
        270,
        504,
        750,
        900,
        300,
        560,
        810,
        960,
        312,
        588,
        870,
        1050,
        336,
        644,
        952,
        1110,
        360,
        700,
        1020,
        1200,
        390,
        728,
        1050,
        1260,
        420,
        784,
        1140,
        1350,
        450,
        812,
        1200,
        1440,
        480,
        868,
        1290,
        1530,
        510,
        924,
        1350,
        1620,
        540,
        980,
        1440,
        1710,
        570,
        1036,
        1530,
        1800,
        570,
        1064,
        1590,
        1890,
        600,
        1120,
        1680,
        1980,
        630,
        1204,
        1770,
        2100,
        660,
        1260,
        1860,
        2220,
        720,
        1316,
        1950,
        2310,
        750,
        1372,
        2040,
        2430
      ];
      exports.getBlocksCount = function getBlocksCount(version, errorCorrectionLevel) {
        switch (errorCorrectionLevel) {
          case ECLevel.L:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 0];
          case ECLevel.M:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 1];
          case ECLevel.Q:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 2];
          case ECLevel.H:
            return EC_BLOCKS_TABLE[(version - 1) * 4 + 3];
          default:
            return void 0;
        }
      };
      exports.getTotalCodewordsCount = function getTotalCodewordsCount(version, errorCorrectionLevel) {
        switch (errorCorrectionLevel) {
          case ECLevel.L:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0];
          case ECLevel.M:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1];
          case ECLevel.Q:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2];
          case ECLevel.H:
            return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3];
          default:
            return void 0;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/galois-field.js
  var require_galois_field = __commonJS({
    "node_modules/qrcode/lib/core/galois-field.js"(exports) {
      var EXP_TABLE = new Uint8Array(512);
      var LOG_TABLE = new Uint8Array(256);
      (function initTables() {
        let x = 1;
        for (let i = 0; i < 255; i++) {
          EXP_TABLE[i] = x;
          LOG_TABLE[x] = i;
          x <<= 1;
          if (x & 256) {
            x ^= 285;
          }
        }
        for (let i = 255; i < 512; i++) {
          EXP_TABLE[i] = EXP_TABLE[i - 255];
        }
      })();
      exports.log = function log(n) {
        if (n < 1) throw new Error("log(" + n + ")");
        return LOG_TABLE[n];
      };
      exports.exp = function exp(n) {
        return EXP_TABLE[n];
      };
      exports.mul = function mul(x, y) {
        if (x === 0 || y === 0) return 0;
        return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
      };
    }
  });

  // node_modules/qrcode/lib/core/polynomial.js
  var require_polynomial = __commonJS({
    "node_modules/qrcode/lib/core/polynomial.js"(exports) {
      var GF = require_galois_field();
      exports.mul = function mul(p1, p2) {
        const coeff = new Uint8Array(p1.length + p2.length - 1);
        for (let i = 0; i < p1.length; i++) {
          for (let j = 0; j < p2.length; j++) {
            coeff[i + j] ^= GF.mul(p1[i], p2[j]);
          }
        }
        return coeff;
      };
      exports.mod = function mod(divident, divisor) {
        let result = new Uint8Array(divident);
        while (result.length - divisor.length >= 0) {
          const coeff = result[0];
          for (let i = 0; i < divisor.length; i++) {
            result[i] ^= GF.mul(divisor[i], coeff);
          }
          let offset = 0;
          while (offset < result.length && result[offset] === 0) offset++;
          result = result.slice(offset);
        }
        return result;
      };
      exports.generateECPolynomial = function generateECPolynomial(degree) {
        let poly = new Uint8Array([1]);
        for (let i = 0; i < degree; i++) {
          poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
        }
        return poly;
      };
    }
  });

  // node_modules/qrcode/lib/core/reed-solomon-encoder.js
  var require_reed_solomon_encoder = __commonJS({
    "node_modules/qrcode/lib/core/reed-solomon-encoder.js"(exports, module) {
      var Polynomial = require_polynomial();
      function ReedSolomonEncoder(degree) {
        this.genPoly = void 0;
        this.degree = degree;
        if (this.degree) this.initialize(this.degree);
      }
      ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
        this.degree = degree;
        this.genPoly = Polynomial.generateECPolynomial(this.degree);
      };
      ReedSolomonEncoder.prototype.encode = function encode(data) {
        if (!this.genPoly) {
          throw new Error("Encoder not initialized");
        }
        const paddedData = new Uint8Array(data.length + this.degree);
        paddedData.set(data);
        const remainder = Polynomial.mod(paddedData, this.genPoly);
        const start = this.degree - remainder.length;
        if (start > 0) {
          const buff = new Uint8Array(this.degree);
          buff.set(remainder, start);
          return buff;
        }
        return remainder;
      };
      module.exports = ReedSolomonEncoder;
    }
  });

  // node_modules/qrcode/lib/core/version-check.js
  var require_version_check = __commonJS({
    "node_modules/qrcode/lib/core/version-check.js"(exports) {
      exports.isValid = function isValid(version) {
        return !isNaN(version) && version >= 1 && version <= 40;
      };
    }
  });

  // node_modules/qrcode/lib/core/regex.js
  var require_regex = __commonJS({
    "node_modules/qrcode/lib/core/regex.js"(exports) {
      var numeric = "[0-9]+";
      var alphanumeric = "[A-Z $%*+\\-./:]+";
      var kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
      kanji = kanji.replace(/u/g, "\\u");
      var byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
      exports.KANJI = new RegExp(kanji, "g");
      exports.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
      exports.BYTE = new RegExp(byte, "g");
      exports.NUMERIC = new RegExp(numeric, "g");
      exports.ALPHANUMERIC = new RegExp(alphanumeric, "g");
      var TEST_KANJI = new RegExp("^" + kanji + "$");
      var TEST_NUMERIC = new RegExp("^" + numeric + "$");
      var TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
      exports.testKanji = function testKanji(str) {
        return TEST_KANJI.test(str);
      };
      exports.testNumeric = function testNumeric(str) {
        return TEST_NUMERIC.test(str);
      };
      exports.testAlphanumeric = function testAlphanumeric(str) {
        return TEST_ALPHANUMERIC.test(str);
      };
    }
  });

  // node_modules/qrcode/lib/core/mode.js
  var require_mode = __commonJS({
    "node_modules/qrcode/lib/core/mode.js"(exports) {
      var VersionCheck = require_version_check();
      var Regex = require_regex();
      exports.NUMERIC = {
        id: "Numeric",
        bit: 1 << 0,
        ccBits: [10, 12, 14]
      };
      exports.ALPHANUMERIC = {
        id: "Alphanumeric",
        bit: 1 << 1,
        ccBits: [9, 11, 13]
      };
      exports.BYTE = {
        id: "Byte",
        bit: 1 << 2,
        ccBits: [8, 16, 16]
      };
      exports.KANJI = {
        id: "Kanji",
        bit: 1 << 3,
        ccBits: [8, 10, 12]
      };
      exports.MIXED = {
        bit: -1
      };
      exports.getCharCountIndicator = function getCharCountIndicator(mode, version) {
        if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
        if (!VersionCheck.isValid(version)) {
          throw new Error("Invalid version: " + version);
        }
        if (version >= 1 && version < 10) return mode.ccBits[0];
        else if (version < 27) return mode.ccBits[1];
        return mode.ccBits[2];
      };
      exports.getBestModeForData = function getBestModeForData(dataStr) {
        if (Regex.testNumeric(dataStr)) return exports.NUMERIC;
        else if (Regex.testAlphanumeric(dataStr)) return exports.ALPHANUMERIC;
        else if (Regex.testKanji(dataStr)) return exports.KANJI;
        else return exports.BYTE;
      };
      exports.toString = function toString(mode) {
        if (mode && mode.id) return mode.id;
        throw new Error("Invalid mode");
      };
      exports.isValid = function isValid(mode) {
        return mode && mode.bit && mode.ccBits;
      };
      function fromString(string) {
        if (typeof string !== "string") {
          throw new Error("Param is not a string");
        }
        const lcStr = string.toLowerCase();
        switch (lcStr) {
          case "numeric":
            return exports.NUMERIC;
          case "alphanumeric":
            return exports.ALPHANUMERIC;
          case "kanji":
            return exports.KANJI;
          case "byte":
            return exports.BYTE;
          default:
            throw new Error("Unknown mode: " + string);
        }
      }
      exports.from = function from(value, defaultValue) {
        if (exports.isValid(value)) {
          return value;
        }
        try {
          return fromString(value);
        } catch (e) {
          return defaultValue;
        }
      };
    }
  });

  // node_modules/qrcode/lib/core/version.js
  var require_version = __commonJS({
    "node_modules/qrcode/lib/core/version.js"(exports) {
      var Utils = require_utils();
      var ECCode = require_error_correction_code();
      var ECLevel = require_error_correction_level();
      var Mode = require_mode();
      var VersionCheck = require_version_check();
      var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
      var G18_BCH = Utils.getBCHDigit(G18);
      function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
        for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
          if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode)) {
            return currentVersion;
          }
        }
        return void 0;
      }
      function getReservedBitsCount(mode, version) {
        return Mode.getCharCountIndicator(mode, version) + 4;
      }
      function getTotalBitsFromDataArray(segments, version) {
        let totalBits = 0;
        segments.forEach(function(data) {
          const reservedBits = getReservedBitsCount(data.mode, version);
          totalBits += reservedBits + data.getBitsLength();
        });
        return totalBits;
      }
      function getBestVersionForMixedData(segments, errorCorrectionLevel) {
        for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
          const length = getTotalBitsFromDataArray(segments, currentVersion);
          if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) {
            return currentVersion;
          }
        }
        return void 0;
      }
      exports.from = function from(value, defaultValue) {
        if (VersionCheck.isValid(value)) {
          return parseInt(value, 10);
        }
        return defaultValue;
      };
      exports.getCapacity = function getCapacity(version, errorCorrectionLevel, mode) {
        if (!VersionCheck.isValid(version)) {
          throw new Error("Invalid QR Code version");
        }
        if (typeof mode === "undefined") mode = Mode.BYTE;
        const totalCodewords = Utils.getSymbolTotalCodewords(version);
        const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
        const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
        if (mode === Mode.MIXED) return dataTotalCodewordsBits;
        const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);
        switch (mode) {
          case Mode.NUMERIC:
            return Math.floor(usableBits / 10 * 3);
          case Mode.ALPHANUMERIC:
            return Math.floor(usableBits / 11 * 2);
          case Mode.KANJI:
            return Math.floor(usableBits / 13);
          case Mode.BYTE:
          default:
            return Math.floor(usableBits / 8);
        }
      };
      exports.getBestVersionForData = function getBestVersionForData(data, errorCorrectionLevel) {
        let seg;
        const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
        if (Array.isArray(data)) {
          if (data.length > 1) {
            return getBestVersionForMixedData(data, ecl);
          }
          if (data.length === 0) {
            return 1;
          }
          seg = data[0];
        } else {
          seg = data;
        }
        return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
      };
      exports.getEncodedBits = function getEncodedBits(version) {
        if (!VersionCheck.isValid(version) || version < 7) {
          throw new Error("Invalid QR Code version");
        }
        let d = version << 12;
        while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
          d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
        }
        return version << 12 | d;
      };
    }
  });

  // node_modules/qrcode/lib/core/format-info.js
  var require_format_info = __commonJS({
    "node_modules/qrcode/lib/core/format-info.js"(exports) {
      var Utils = require_utils();
      var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
      var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
      var G15_BCH = Utils.getBCHDigit(G15);
      exports.getEncodedBits = function getEncodedBits(errorCorrectionLevel, mask) {
        const data = errorCorrectionLevel.bit << 3 | mask;
        let d = data << 10;
        while (Utils.getBCHDigit(d) - G15_BCH >= 0) {
          d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
        }
        return (data << 10 | d) ^ G15_MASK;
      };
    }
  });

  // node_modules/qrcode/lib/core/numeric-data.js
  var require_numeric_data = __commonJS({
    "node_modules/qrcode/lib/core/numeric-data.js"(exports, module) {
      var Mode = require_mode();
      function NumericData(data) {
        this.mode = Mode.NUMERIC;
        this.data = data.toString();
      }
      NumericData.getBitsLength = function getBitsLength(length) {
        return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
      };
      NumericData.prototype.getLength = function getLength() {
        return this.data.length;
      };
      NumericData.prototype.getBitsLength = function getBitsLength() {
        return NumericData.getBitsLength(this.data.length);
      };
      NumericData.prototype.write = function write(bitBuffer) {
        let i, group, value;
        for (i = 0; i + 3 <= this.data.length; i += 3) {
          group = this.data.substr(i, 3);
          value = parseInt(group, 10);
          bitBuffer.put(value, 10);
        }
        const remainingNum = this.data.length - i;
        if (remainingNum > 0) {
          group = this.data.substr(i);
          value = parseInt(group, 10);
          bitBuffer.put(value, remainingNum * 3 + 1);
        }
      };
      module.exports = NumericData;
    }
  });

  // node_modules/qrcode/lib/core/alphanumeric-data.js
  var require_alphanumeric_data = __commonJS({
    "node_modules/qrcode/lib/core/alphanumeric-data.js"(exports, module) {
      var Mode = require_mode();
      var ALPHA_NUM_CHARS = [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
        "J",
        "K",
        "L",
        "M",
        "N",
        "O",
        "P",
        "Q",
        "R",
        "S",
        "T",
        "U",
        "V",
        "W",
        "X",
        "Y",
        "Z",
        " ",
        "$",
        "%",
        "*",
        "+",
        "-",
        ".",
        "/",
        ":"
      ];
      function AlphanumericData(data) {
        this.mode = Mode.ALPHANUMERIC;
        this.data = data;
      }
      AlphanumericData.getBitsLength = function getBitsLength(length) {
        return 11 * Math.floor(length / 2) + 6 * (length % 2);
      };
      AlphanumericData.prototype.getLength = function getLength() {
        return this.data.length;
      };
      AlphanumericData.prototype.getBitsLength = function getBitsLength() {
        return AlphanumericData.getBitsLength(this.data.length);
      };
      AlphanumericData.prototype.write = function write(bitBuffer) {
        let i;
        for (i = 0; i + 2 <= this.data.length; i += 2) {
          let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
          value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);
          bitBuffer.put(value, 11);
        }
        if (this.data.length % 2) {
          bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
        }
      };
      module.exports = AlphanumericData;
    }
  });

  // node_modules/qrcode/lib/core/byte-data.js
  var require_byte_data = __commonJS({
    "node_modules/qrcode/lib/core/byte-data.js"(exports, module) {
      var Mode = require_mode();
      function ByteData(data) {
        this.mode = Mode.BYTE;
        if (typeof data === "string") {
          this.data = new TextEncoder().encode(data);
        } else {
          this.data = new Uint8Array(data);
        }
      }
      ByteData.getBitsLength = function getBitsLength(length) {
        return length * 8;
      };
      ByteData.prototype.getLength = function getLength() {
        return this.data.length;
      };
      ByteData.prototype.getBitsLength = function getBitsLength() {
        return ByteData.getBitsLength(this.data.length);
      };
      ByteData.prototype.write = function(bitBuffer) {
        for (let i = 0, l = this.data.length; i < l; i++) {
          bitBuffer.put(this.data[i], 8);
        }
      };
      module.exports = ByteData;
    }
  });

  // node_modules/qrcode/lib/core/kanji-data.js
  var require_kanji_data = __commonJS({
    "node_modules/qrcode/lib/core/kanji-data.js"(exports, module) {
      var Mode = require_mode();
      var Utils = require_utils();
      function KanjiData(data) {
        this.mode = Mode.KANJI;
        this.data = data;
      }
      KanjiData.getBitsLength = function getBitsLength(length) {
        return length * 13;
      };
      KanjiData.prototype.getLength = function getLength() {
        return this.data.length;
      };
      KanjiData.prototype.getBitsLength = function getBitsLength() {
        return KanjiData.getBitsLength(this.data.length);
      };
      KanjiData.prototype.write = function(bitBuffer) {
        let i;
        for (i = 0; i < this.data.length; i++) {
          let value = Utils.toSJIS(this.data[i]);
          if (value >= 33088 && value <= 40956) {
            value -= 33088;
          } else if (value >= 57408 && value <= 60351) {
            value -= 49472;
          } else {
            throw new Error(
              "Invalid SJIS character: " + this.data[i] + "\nMake sure your charset is UTF-8"
            );
          }
          value = (value >>> 8 & 255) * 192 + (value & 255);
          bitBuffer.put(value, 13);
        }
      };
      module.exports = KanjiData;
    }
  });

  // node_modules/dijkstrajs/dijkstra.js
  var require_dijkstra = __commonJS({
    "node_modules/dijkstrajs/dijkstra.js"(exports, module) {
      "use strict";
      var dijkstra = {
        single_source_shortest_paths: function(graph, s, d) {
          var predecessors = {};
          var costs = {};
          costs[s] = 0;
          var open = dijkstra.PriorityQueue.make();
          open.push(s, 0);
          var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
          while (!open.empty()) {
            closest = open.pop();
            u = closest.value;
            cost_of_s_to_u = closest.cost;
            adjacent_nodes = graph[u] || {};
            for (v in adjacent_nodes) {
              if (adjacent_nodes.hasOwnProperty(v)) {
                cost_of_e = adjacent_nodes[v];
                cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
                cost_of_s_to_v = costs[v];
                first_visit = typeof costs[v] === "undefined";
                if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
                  costs[v] = cost_of_s_to_u_plus_cost_of_e;
                  open.push(v, cost_of_s_to_u_plus_cost_of_e);
                  predecessors[v] = u;
                }
              }
            }
          }
          if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
            var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
            throw new Error(msg);
          }
          return predecessors;
        },
        extract_shortest_path_from_predecessor_list: function(predecessors, d) {
          var nodes = [];
          var u = d;
          var predecessor;
          while (u) {
            nodes.push(u);
            predecessor = predecessors[u];
            u = predecessors[u];
          }
          nodes.reverse();
          return nodes;
        },
        find_path: function(graph, s, d) {
          var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
          return dijkstra.extract_shortest_path_from_predecessor_list(
            predecessors,
            d
          );
        },
        /**
         * A very naive priority queue implementation.
         */
        PriorityQueue: {
          make: function(opts) {
            var T = dijkstra.PriorityQueue, t = {}, key;
            opts = opts || {};
            for (key in T) {
              if (T.hasOwnProperty(key)) {
                t[key] = T[key];
              }
            }
            t.queue = [];
            t.sorter = opts.sorter || T.default_sorter;
            return t;
          },
          default_sorter: function(a, b) {
            return a.cost - b.cost;
          },
          /**
           * Add a new item to the queue and ensure the highest priority element
           * is at the front of the queue.
           */
          push: function(value, cost) {
            var item = { value, cost };
            this.queue.push(item);
            this.queue.sort(this.sorter);
          },
          /**
           * Return the highest priority element in the queue.
           */
          pop: function() {
            return this.queue.shift();
          },
          empty: function() {
            return this.queue.length === 0;
          }
        }
      };
      if (typeof module !== "undefined") {
        module.exports = dijkstra;
      }
    }
  });

  // node_modules/qrcode/lib/core/segments.js
  var require_segments = __commonJS({
    "node_modules/qrcode/lib/core/segments.js"(exports) {
      var Mode = require_mode();
      var NumericData = require_numeric_data();
      var AlphanumericData = require_alphanumeric_data();
      var ByteData = require_byte_data();
      var KanjiData = require_kanji_data();
      var Regex = require_regex();
      var Utils = require_utils();
      var dijkstra = require_dijkstra();
      function getStringByteLength(str) {
        return unescape(encodeURIComponent(str)).length;
      }
      function getSegments(regex, mode, str) {
        const segments = [];
        let result;
        while ((result = regex.exec(str)) !== null) {
          segments.push({
            data: result[0],
            index: result.index,
            mode,
            length: result[0].length
          });
        }
        return segments;
      }
      function getSegmentsFromString(dataStr) {
        const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
        const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
        let byteSegs;
        let kanjiSegs;
        if (Utils.isKanjiModeEnabled()) {
          byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
          kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
        } else {
          byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
          kanjiSegs = [];
        }
        const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);
        return segs.sort(function(s1, s2) {
          return s1.index - s2.index;
        }).map(function(obj) {
          return {
            data: obj.data,
            mode: obj.mode,
            length: obj.length
          };
        });
      }
      function getSegmentBitsLength(length, mode) {
        switch (mode) {
          case Mode.NUMERIC:
            return NumericData.getBitsLength(length);
          case Mode.ALPHANUMERIC:
            return AlphanumericData.getBitsLength(length);
          case Mode.KANJI:
            return KanjiData.getBitsLength(length);
          case Mode.BYTE:
            return ByteData.getBitsLength(length);
        }
      }
      function mergeSegments(segs) {
        return segs.reduce(function(acc, curr) {
          const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
          if (prevSeg && prevSeg.mode === curr.mode) {
            acc[acc.length - 1].data += curr.data;
            return acc;
          }
          acc.push(curr);
          return acc;
        }, []);
      }
      function buildNodes(segs) {
        const nodes = [];
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          switch (seg.mode) {
            case Mode.NUMERIC:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
                { data: seg.data, mode: Mode.BYTE, length: seg.length }
              ]);
              break;
            case Mode.ALPHANUMERIC:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.BYTE, length: seg.length }
              ]);
              break;
            case Mode.KANJI:
              nodes.push([
                seg,
                { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
              ]);
              break;
            case Mode.BYTE:
              nodes.push([
                { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
              ]);
          }
        }
        return nodes;
      }
      function buildGraph(nodes, version) {
        const table = {};
        const graph = { start: {} };
        let prevNodeIds = ["start"];
        for (let i = 0; i < nodes.length; i++) {
          const nodeGroup = nodes[i];
          const currentNodeIds = [];
          for (let j = 0; j < nodeGroup.length; j++) {
            const node = nodeGroup[j];
            const key = "" + i + j;
            currentNodeIds.push(key);
            table[key] = { node, lastCount: 0 };
            graph[key] = {};
            for (let n = 0; n < prevNodeIds.length; n++) {
              const prevNodeId = prevNodeIds[n];
              if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
                graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
                table[prevNodeId].lastCount += node.length;
              } else {
                if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
                graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version);
              }
            }
          }
          prevNodeIds = currentNodeIds;
        }
        for (let n = 0; n < prevNodeIds.length; n++) {
          graph[prevNodeIds[n]].end = 0;
        }
        return { map: graph, table };
      }
      function buildSingleSegment(data, modesHint) {
        let mode;
        const bestMode = Mode.getBestModeForData(data);
        mode = Mode.from(modesHint, bestMode);
        if (mode !== Mode.BYTE && mode.bit < bestMode.bit) {
          throw new Error('"' + data + '" cannot be encoded with mode ' + Mode.toString(mode) + ".\n Suggested mode is: " + Mode.toString(bestMode));
        }
        if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
          mode = Mode.BYTE;
        }
        switch (mode) {
          case Mode.NUMERIC:
            return new NumericData(data);
          case Mode.ALPHANUMERIC:
            return new AlphanumericData(data);
          case Mode.KANJI:
            return new KanjiData(data);
          case Mode.BYTE:
            return new ByteData(data);
        }
      }
      exports.fromArray = function fromArray(array) {
        return array.reduce(function(acc, seg) {
          if (typeof seg === "string") {
            acc.push(buildSingleSegment(seg, null));
          } else if (seg.data) {
            acc.push(buildSingleSegment(seg.data, seg.mode));
          }
          return acc;
        }, []);
      };
      exports.fromString = function fromString(data, version) {
        const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled());
        const nodes = buildNodes(segs);
        const graph = buildGraph(nodes, version);
        const path = dijkstra.find_path(graph.map, "start", "end");
        const optimizedSegs = [];
        for (let i = 1; i < path.length - 1; i++) {
          optimizedSegs.push(graph.table[path[i]].node);
        }
        return exports.fromArray(mergeSegments(optimizedSegs));
      };
      exports.rawSplit = function rawSplit(data) {
        return exports.fromArray(
          getSegmentsFromString(data, Utils.isKanjiModeEnabled())
        );
      };
    }
  });

  // node_modules/qrcode/lib/core/qrcode.js
  var require_qrcode = __commonJS({
    "node_modules/qrcode/lib/core/qrcode.js"(exports) {
      var Utils = require_utils();
      var ECLevel = require_error_correction_level();
      var BitBuffer = require_bit_buffer();
      var BitMatrix = require_bit_matrix();
      var AlignmentPattern = require_alignment_pattern();
      var FinderPattern = require_finder_pattern();
      var MaskPattern = require_mask_pattern();
      var ECCode = require_error_correction_code();
      var ReedSolomonEncoder = require_reed_solomon_encoder();
      var Version = require_version();
      var FormatInfo = require_format_info();
      var Mode = require_mode();
      var Segments = require_segments();
      function setupFinderPattern(matrix, version) {
        const size = matrix.size;
        const pos = FinderPattern.getPositions(version);
        for (let i = 0; i < pos.length; i++) {
          const row = pos[i][0];
          const col = pos[i][1];
          for (let r = -1; r <= 7; r++) {
            if (row + r <= -1 || size <= row + r) continue;
            for (let c = -1; c <= 7; c++) {
              if (col + c <= -1 || size <= col + c) continue;
              if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) {
                matrix.set(row + r, col + c, true, true);
              } else {
                matrix.set(row + r, col + c, false, true);
              }
            }
          }
        }
      }
      function setupTimingPattern(matrix) {
        const size = matrix.size;
        for (let r = 8; r < size - 8; r++) {
          const value = r % 2 === 0;
          matrix.set(r, 6, value, true);
          matrix.set(6, r, value, true);
        }
      }
      function setupAlignmentPattern(matrix, version) {
        const pos = AlignmentPattern.getPositions(version);
        for (let i = 0; i < pos.length; i++) {
          const row = pos[i][0];
          const col = pos[i][1];
          for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
              if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) {
                matrix.set(row + r, col + c, true, true);
              } else {
                matrix.set(row + r, col + c, false, true);
              }
            }
          }
        }
      }
      function setupVersionInfo(matrix, version) {
        const size = matrix.size;
        const bits = Version.getEncodedBits(version);
        let row, col, mod;
        for (let i = 0; i < 18; i++) {
          row = Math.floor(i / 3);
          col = i % 3 + size - 8 - 3;
          mod = (bits >> i & 1) === 1;
          matrix.set(row, col, mod, true);
          matrix.set(col, row, mod, true);
        }
      }
      function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
        const size = matrix.size;
        const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
        let i, mod;
        for (i = 0; i < 15; i++) {
          mod = (bits >> i & 1) === 1;
          if (i < 6) {
            matrix.set(i, 8, mod, true);
          } else if (i < 8) {
            matrix.set(i + 1, 8, mod, true);
          } else {
            matrix.set(size - 15 + i, 8, mod, true);
          }
          if (i < 8) {
            matrix.set(8, size - i - 1, mod, true);
          } else if (i < 9) {
            matrix.set(8, 15 - i - 1 + 1, mod, true);
          } else {
            matrix.set(8, 15 - i - 1, mod, true);
          }
        }
        matrix.set(size - 8, 8, 1, true);
      }
      function setupData(matrix, data) {
        const size = matrix.size;
        let inc = -1;
        let row = size - 1;
        let bitIndex = 7;
        let byteIndex = 0;
        for (let col = size - 1; col > 0; col -= 2) {
          if (col === 6) col--;
          while (true) {
            for (let c = 0; c < 2; c++) {
              if (!matrix.isReserved(row, col - c)) {
                let dark = false;
                if (byteIndex < data.length) {
                  dark = (data[byteIndex] >>> bitIndex & 1) === 1;
                }
                matrix.set(row, col - c, dark);
                bitIndex--;
                if (bitIndex === -1) {
                  byteIndex++;
                  bitIndex = 7;
                }
              }
            }
            row += inc;
            if (row < 0 || size <= row) {
              row -= inc;
              inc = -inc;
              break;
            }
          }
        }
      }
      function createData(version, errorCorrectionLevel, segments) {
        const buffer = new BitBuffer();
        segments.forEach(function(data) {
          buffer.put(data.mode.bit, 4);
          buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version));
          data.write(buffer);
        });
        const totalCodewords = Utils.getSymbolTotalCodewords(version);
        const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
        const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
        if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
          buffer.put(0, 4);
        }
        while (buffer.getLengthInBits() % 8 !== 0) {
          buffer.putBit(0);
        }
        const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
        for (let i = 0; i < remainingByte; i++) {
          buffer.put(i % 2 ? 17 : 236, 8);
        }
        return createCodewords(buffer, version, errorCorrectionLevel);
      }
      function createCodewords(bitBuffer, version, errorCorrectionLevel) {
        const totalCodewords = Utils.getSymbolTotalCodewords(version);
        const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
        const dataTotalCodewords = totalCodewords - ecTotalCodewords;
        const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel);
        const blocksInGroup2 = totalCodewords % ecTotalBlocks;
        const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
        const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
        const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
        const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
        const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
        const rs = new ReedSolomonEncoder(ecCount);
        let offset = 0;
        const dcData = new Array(ecTotalBlocks);
        const ecData = new Array(ecTotalBlocks);
        let maxDataSize = 0;
        const buffer = new Uint8Array(bitBuffer.buffer);
        for (let b = 0; b < ecTotalBlocks; b++) {
          const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
          dcData[b] = buffer.slice(offset, offset + dataSize);
          ecData[b] = rs.encode(dcData[b]);
          offset += dataSize;
          maxDataSize = Math.max(maxDataSize, dataSize);
        }
        const data = new Uint8Array(totalCodewords);
        let index = 0;
        let i, r;
        for (i = 0; i < maxDataSize; i++) {
          for (r = 0; r < ecTotalBlocks; r++) {
            if (i < dcData[r].length) {
              data[index++] = dcData[r][i];
            }
          }
        }
        for (i = 0; i < ecCount; i++) {
          for (r = 0; r < ecTotalBlocks; r++) {
            data[index++] = ecData[r][i];
          }
        }
        return data;
      }
      function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
        let segments;
        if (Array.isArray(data)) {
          segments = Segments.fromArray(data);
        } else if (typeof data === "string") {
          let estimatedVersion = version;
          if (!estimatedVersion) {
            const rawSegments = Segments.rawSplit(data);
            estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
          }
          segments = Segments.fromString(data, estimatedVersion || 40);
        } else {
          throw new Error("Invalid data");
        }
        const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);
        if (!bestVersion) {
          throw new Error("The amount of data is too big to be stored in a QR Code");
        }
        if (!version) {
          version = bestVersion;
        } else if (version < bestVersion) {
          throw new Error(
            "\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n"
          );
        }
        const dataBits = createData(version, errorCorrectionLevel, segments);
        const moduleCount = Utils.getSymbolSize(version);
        const modules = new BitMatrix(moduleCount);
        setupFinderPattern(modules, version);
        setupTimingPattern(modules);
        setupAlignmentPattern(modules, version);
        setupFormatInfo(modules, errorCorrectionLevel, 0);
        if (version >= 7) {
          setupVersionInfo(modules, version);
        }
        setupData(modules, dataBits);
        if (isNaN(maskPattern)) {
          maskPattern = MaskPattern.getBestMask(
            modules,
            setupFormatInfo.bind(null, modules, errorCorrectionLevel)
          );
        }
        MaskPattern.applyMask(maskPattern, modules);
        setupFormatInfo(modules, errorCorrectionLevel, maskPattern);
        return {
          modules,
          version,
          errorCorrectionLevel,
          maskPattern,
          segments
        };
      }
      exports.create = function create(data, options) {
        if (typeof data === "undefined" || data === "") {
          throw new Error("No input text");
        }
        let errorCorrectionLevel = ECLevel.M;
        let version;
        let mask;
        if (typeof options !== "undefined") {
          errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
          version = Version.from(options.version);
          mask = MaskPattern.from(options.maskPattern);
          if (options.toSJISFunc) {
            Utils.setToSJISFunction(options.toSJISFunc);
          }
        }
        return createSymbol(data, version, errorCorrectionLevel, mask);
      };
    }
  });

  // node_modules/qrcode/lib/renderer/utils.js
  var require_utils2 = __commonJS({
    "node_modules/qrcode/lib/renderer/utils.js"(exports) {
      function hex2rgba(hex) {
        if (typeof hex === "number") {
          hex = hex.toString();
        }
        if (typeof hex !== "string") {
          throw new Error("Color should be defined as hex string");
        }
        let hexCode = hex.slice().replace("#", "").split("");
        if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
          throw new Error("Invalid hex color: " + hex);
        }
        if (hexCode.length === 3 || hexCode.length === 4) {
          hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
            return [c, c];
          }));
        }
        if (hexCode.length === 6) hexCode.push("F", "F");
        const hexValue = parseInt(hexCode.join(""), 16);
        return {
          r: hexValue >> 24 & 255,
          g: hexValue >> 16 & 255,
          b: hexValue >> 8 & 255,
          a: hexValue & 255,
          hex: "#" + hexCode.slice(0, 6).join("")
        };
      }
      exports.getOptions = function getOptions(options) {
        if (!options) options = {};
        if (!options.color) options.color = {};
        const margin = typeof options.margin === "undefined" || options.margin === null || options.margin < 0 ? 4 : options.margin;
        const width = options.width && options.width >= 21 ? options.width : void 0;
        const scale = options.scale || 4;
        return {
          width,
          scale: width ? 4 : scale,
          margin,
          color: {
            dark: hex2rgba(options.color.dark || "#000000ff"),
            light: hex2rgba(options.color.light || "#ffffffff")
          },
          type: options.type,
          rendererOpts: options.rendererOpts || {}
        };
      };
      exports.getScale = function getScale(qrSize, opts) {
        return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
      };
      exports.getImageWidth = function getImageWidth(qrSize, opts) {
        const scale = exports.getScale(qrSize, opts);
        return Math.floor((qrSize + opts.margin * 2) * scale);
      };
      exports.qrToImageData = function qrToImageData(imgData, qr, opts) {
        const size = qr.modules.size;
        const data = qr.modules.data;
        const scale = exports.getScale(size, opts);
        const symbolSize = Math.floor((size + opts.margin * 2) * scale);
        const scaledMargin = opts.margin * scale;
        const palette = [opts.color.light, opts.color.dark];
        for (let i = 0; i < symbolSize; i++) {
          for (let j = 0; j < symbolSize; j++) {
            let posDst = (i * symbolSize + j) * 4;
            let pxColor = opts.color.light;
            if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
              const iSrc = Math.floor((i - scaledMargin) / scale);
              const jSrc = Math.floor((j - scaledMargin) / scale);
              pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
            }
            imgData[posDst++] = pxColor.r;
            imgData[posDst++] = pxColor.g;
            imgData[posDst++] = pxColor.b;
            imgData[posDst] = pxColor.a;
          }
        }
      };
    }
  });

  // node_modules/qrcode/lib/renderer/canvas.js
  var require_canvas = __commonJS({
    "node_modules/qrcode/lib/renderer/canvas.js"(exports) {
      var Utils = require_utils2();
      function clearCanvas(ctx, canvas, size) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!canvas.style) canvas.style = {};
        canvas.height = size;
        canvas.width = size;
        canvas.style.height = size + "px";
        canvas.style.width = size + "px";
      }
      function getCanvasElement() {
        try {
          return document.createElement("canvas");
        } catch (e) {
          throw new Error("You need to specify a canvas element");
        }
      }
      exports.render = function render(qrData, canvas, options) {
        let opts = options;
        let canvasEl = canvas;
        if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
          opts = canvas;
          canvas = void 0;
        }
        if (!canvas) {
          canvasEl = getCanvasElement();
        }
        opts = Utils.getOptions(opts);
        const size = Utils.getImageWidth(qrData.modules.size, opts);
        const ctx = canvasEl.getContext("2d");
        const image = ctx.createImageData(size, size);
        Utils.qrToImageData(image.data, qrData, opts);
        clearCanvas(ctx, canvasEl, size);
        ctx.putImageData(image, 0, 0);
        return canvasEl;
      };
      exports.renderToDataURL = function renderToDataURL(qrData, canvas, options) {
        let opts = options;
        if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
          opts = canvas;
          canvas = void 0;
        }
        if (!opts) opts = {};
        const canvasEl = exports.render(qrData, canvas, opts);
        const type = opts.type || "image/png";
        const rendererOpts = opts.rendererOpts || {};
        return canvasEl.toDataURL(type, rendererOpts.quality);
      };
    }
  });

  // node_modules/qrcode/lib/renderer/svg-tag.js
  var require_svg_tag = __commonJS({
    "node_modules/qrcode/lib/renderer/svg-tag.js"(exports) {
      var Utils = require_utils2();
      function getColorAttrib(color, attrib) {
        const alpha = color.a / 255;
        const str = attrib + '="' + color.hex + '"';
        return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
      }
      function svgCmd(cmd, x, y) {
        let str = cmd + x;
        if (typeof y !== "undefined") str += " " + y;
        return str;
      }
      function qrToPath(data, size, margin) {
        let path = "";
        let moveBy = 0;
        let newRow = false;
        let lineLength = 0;
        for (let i = 0; i < data.length; i++) {
          const col = Math.floor(i % size);
          const row = Math.floor(i / size);
          if (!col && !newRow) newRow = true;
          if (data[i]) {
            lineLength++;
            if (!(i > 0 && col > 0 && data[i - 1])) {
              path += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0);
              moveBy = 0;
              newRow = false;
            }
            if (!(col + 1 < size && data[i + 1])) {
              path += svgCmd("h", lineLength);
              lineLength = 0;
            }
          } else {
            moveBy++;
          }
        }
        return path;
      }
      exports.render = function render(qrData, options, cb) {
        const opts = Utils.getOptions(options);
        const size = qrData.modules.size;
        const data = qrData.modules.data;
        const qrcodesize = size + opts.margin * 2;
        const bg = !opts.color.light.a ? "" : "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>';
        const path = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data, size, opts.margin) + '"/>';
        const viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"';
        const width = !opts.width ? "" : 'width="' + opts.width + '" height="' + opts.width + '" ';
        const svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path + "</svg>\n";
        if (typeof cb === "function") {
          cb(null, svgTag);
        }
        return svgTag;
      };
    }
  });

  // node_modules/qrcode/lib/browser.js
  var require_browser = __commonJS({
    "node_modules/qrcode/lib/browser.js"(exports) {
      var canPromise = require_can_promise();
      var QRCode2 = require_qrcode();
      var CanvasRenderer = require_canvas();
      var SvgRenderer = require_svg_tag();
      function renderCanvas(renderFunc, canvas, text, opts, cb) {
        const args = [].slice.call(arguments, 1);
        const argsNum = args.length;
        const isLastArgCb = typeof args[argsNum - 1] === "function";
        if (!isLastArgCb && !canPromise()) {
          throw new Error("Callback required as last argument");
        }
        if (isLastArgCb) {
          if (argsNum < 2) {
            throw new Error("Too few arguments provided");
          }
          if (argsNum === 2) {
            cb = text;
            text = canvas;
            canvas = opts = void 0;
          } else if (argsNum === 3) {
            if (canvas.getContext && typeof cb === "undefined") {
              cb = opts;
              opts = void 0;
            } else {
              cb = opts;
              opts = text;
              text = canvas;
              canvas = void 0;
            }
          }
        } else {
          if (argsNum < 1) {
            throw new Error("Too few arguments provided");
          }
          if (argsNum === 1) {
            text = canvas;
            canvas = opts = void 0;
          } else if (argsNum === 2 && !canvas.getContext) {
            opts = text;
            text = canvas;
            canvas = void 0;
          }
          return new Promise(function(resolve, reject) {
            try {
              const data = QRCode2.create(text, opts);
              resolve(renderFunc(data, canvas, opts));
            } catch (e) {
              reject(e);
            }
          });
        }
        try {
          const data = QRCode2.create(text, opts);
          cb(null, renderFunc(data, canvas, opts));
        } catch (e) {
          cb(e);
        }
      }
      exports.create = QRCode2.create;
      exports.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
      exports.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
      exports.toString = renderCanvas.bind(null, function(data, _, opts) {
        return SvgRenderer.render(data, opts);
      });
    }
  });

  // app/web/admin/shared/constants.js
  var LS_TOKEN = "admin_access_token";
  var PAGE_SIZE = 50;
  var DEFAULT_FORM_FIELD_TYPES = ["string", "text", "number", "boolean", "date"];
  var ALL_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "~"];
  var OPERATOR_LABELS = {
    "=": "=",
    "!=": "!=",
    ">": ">",
    "<": "<",
    ">=": ">=",
    "<=": "<=",
    "~": "~"
  };
  var ROLE_LABELS = {
    ADMIN: "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440",
    LAWYER: "\u042E\u0440\u0438\u0441\u0442",
    CURATOR: "\u041A\u0443\u0440\u0430\u0442\u043E\u0440"
  };
  var STATUS_LABELS = {
    NEW: "\u041D\u043E\u0432\u0430\u044F",
    IN_PROGRESS: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
    WAITING_CLIENT: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0430",
    WAITING_COURT: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0441\u0443\u0434\u0430",
    RESOLVED: "\u0420\u0435\u0448\u0435\u043D\u0430",
    CLOSED: "\u0417\u0430\u043A\u0440\u044B\u0442\u0430",
    REJECTED: "\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430"
  };
  var INVOICE_STATUS_LABELS = {
    WAITING_PAYMENT: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u043F\u043B\u0430\u0442\u0443",
    PAID: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D",
    CANCELED: "\u041E\u0442\u043C\u0435\u043D\u0435\u043D"
  };
  var STATUS_KIND_LABELS = {
    DEFAULT: "\u041E\u0431\u044B\u0447\u043D\u044B\u0439",
    INVOICE: "\u0412\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u0447\u0435\u0442\u0430",
    PAID: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E"
  };
  var REQUEST_UPDATE_EVENT_LABELS = {
    MESSAGE: "\u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
    ATTACHMENT: "\u0444\u0430\u0439\u043B",
    REQUEST_DATA: "\u0434\u0430\u043D\u043D\u044B\u0435",
    ASSIGNMENT: "\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435",
    REASSIGNMENT: "\u043F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435",
    STATUS: "\u0441\u0442\u0430\u0442\u0443\u0441"
  };
  var SERVICE_REQUEST_TYPE_LABELS = {
    CURATOR_CONTACT: "\u0417\u0430\u043F\u0440\u043E\u0441 \u043A \u043A\u0443\u0440\u0430\u0442\u043E\u0440\u0443",
    LAWYER_CHANGE_REQUEST: "\u0421\u043C\u0435\u043D\u0430 \u044E\u0440\u0438\u0441\u0442\u0430"
  };
  var SERVICE_REQUEST_STATUS_LABELS = {
    NEW: "\u041D\u043E\u0432\u044B\u0439",
    IN_PROGRESS: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
    RESOLVED: "\u0420\u0435\u0448\u0435\u043D",
    REJECTED: "\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D"
  };
  var KANBAN_GROUPS = [
    { key: "NEW", label: "\u041D\u043E\u0432\u044B\u0435" },
    { key: "IN_PROGRESS", label: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435" },
    { key: "WAITING", label: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435" },
    { key: "DONE", label: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u044B" }
  ];
  var TABLE_SERVER_CONFIG = {
    requests: {
      table: "requests",
      // Requests use a specialized endpoint because it supports virtual/server-side filters
      // (e.g. deadline alerts and unread notifications) that are not plain table columns.
      endpoint: "/api/admin/requests/query",
      sort: [{ field: "created_at", dir: "desc" }]
    },
    serviceRequests: {
      table: "request_service_requests",
      endpoint: "/api/admin/crud/request_service_requests/query",
      sort: [{ field: "created_at", dir: "desc" }]
    },
    invoices: {
      table: "invoices",
      endpoint: "/api/admin/invoices/query",
      sort: [{ field: "issued_at", dir: "desc" }]
    },
    quotes: {
      table: "quotes",
      endpoint: "/api/admin/crud/quotes/query",
      sort: [{ field: "sort_order", dir: "asc" }]
    },
    topics: {
      table: "topics",
      endpoint: "/api/admin/crud/topics/query",
      sort: [{ field: "sort_order", dir: "asc" }]
    },
    statuses: {
      table: "statuses",
      endpoint: "/api/admin/crud/statuses/query",
      sort: [{ field: "sort_order", dir: "asc" }]
    },
    formFields: {
      table: "form_fields",
      endpoint: "/api/admin/crud/form_fields/query",
      sort: [{ field: "sort_order", dir: "asc" }]
    },
    topicRequiredFields: {
      table: "topic_required_fields",
      endpoint: "/api/admin/crud/topic_required_fields/query",
      sort: [{ field: "sort_order", dir: "asc" }]
    },
    topicDataTemplates: {
      table: "topic_data_templates",
      endpoint: "/api/admin/crud/topic_data_templates/query",
      sort: [{ field: "sort_order", dir: "asc" }]
    },
    statusTransitions: {
      table: "topic_status_transitions",
      endpoint: "/api/admin/crud/topic_status_transitions/query",
      sort: [{ field: "sort_order", dir: "asc" }]
    },
    users: {
      table: "admin_users",
      endpoint: "/api/admin/crud/admin_users/query",
      sort: [{ field: "created_at", dir: "desc" }]
    },
    userTopics: {
      table: "admin_user_topics",
      endpoint: "/api/admin/crud/admin_user_topics/query",
      sort: [{ field: "created_at", dir: "desc" }]
    }
  };
  var TABLE_MUTATION_CONFIG = Object.fromEntries(
    Object.entries(TABLE_SERVER_CONFIG).map(([tableKey, config]) => [
      tableKey,
      {
        create: "/api/admin/crud/" + config.table,
        update: (id) => "/api/admin/crud/" + config.table + "/" + id,
        delete: (id) => "/api/admin/crud/" + config.table + "/" + id
      }
    ])
  );
  TABLE_MUTATION_CONFIG.invoices = {
    create: "/api/admin/invoices",
    update: (id) => "/api/admin/invoices/" + id,
    delete: (id) => "/api/admin/invoices/" + id
  };
  var TABLE_KEY_ALIASES = {
    request_service_requests: "serviceRequests",
    form_fields: "formFields",
    status_groups: "statusGroups",
    topic_required_fields: "topicRequiredFields",
    topic_data_templates: "topicDataTemplates",
    topic_status_transitions: "statusTransitions",
    admin_users: "users",
    admin_user_topics: "userTopics"
  };
  var TABLE_UNALIASES = Object.fromEntries(Object.entries(TABLE_KEY_ALIASES).map(([table, alias]) => [alias, table]));
  var KNOWN_CONFIG_TABLE_KEYS = /* @__PURE__ */ new Set([
    "quotes",
    "topics",
    "statuses",
    "formFields",
    "topicRequiredFields",
    "topicDataTemplates",
    "statusTransitions",
    "users",
    "userTopics"
  ]);

  // app/web/admin/shared/state.js
  function createTableState() {
    return {
      filters: [],
      sort: null,
      offset: 0,
      total: 0,
      showAll: false,
      rows: []
    };
  }
  function createRequestModalState() {
    return {
      loading: false,
      requestId: null,
      trackNumber: "",
      requestData: null,
      financeSummary: null,
      invoices: [],
      statusRouteNodes: [],
      statusHistory: [],
      availableStatuses: [],
      currentImportantDateAt: "",
      pendingStatusChangePreset: null,
      messages: [],
      attachments: [],
      messageDraft: "",
      selectedFiles: [],
      fileUploading: false
    };
  }

  // app/web/admin/shared/icons.jsx
  function RefreshIcon() {
    return /* @__PURE__ */ React.createElement("svg", { className: "ui-glyph", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M21 12a9 9 0 1 1-2.64-6.36" }), /* @__PURE__ */ React.createElement("polyline", { points: "21 3 21 9 15 9" }));
  }
  function FilterIcon() {
    return /* @__PURE__ */ React.createElement("svg", { className: "ui-glyph", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M3 5h18l-7 8v5l-4 2v-7z" }));
  }
  function AddIcon() {
    return /* @__PURE__ */ React.createElement("svg", { className: "ui-glyph", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M12 5v14" }), /* @__PURE__ */ React.createElement("path", { d: "M5 12h14" }));
  }
  function PrevIcon() {
    return /* @__PURE__ */ React.createElement("svg", { className: "ui-glyph", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M15 18l-6-6 6-6" }));
  }
  function NextIcon() {
    return /* @__PURE__ */ React.createElement("svg", { className: "ui-glyph", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M9 18l6-6-6-6" }));
  }
  function DownloadIcon() {
    return /* @__PURE__ */ React.createElement("svg", { className: "ui-glyph", viewBox: "0 0 24 24", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M12 4v11" }), /* @__PURE__ */ React.createElement("path", { d: "M8 11l4 4 4-4" }), /* @__PURE__ */ React.createElement("path", { d: "M5 20h14" }));
  }

  // app/web/admin/shared/utils.js
  function resolveAdminRoute(search) {
    const params = new URLSearchParams(String(search || ""));
    const section = String(params.get("section") || "").trim();
    const view = String(params.get("view") || "").trim();
    const requestId = String(params.get("requestId") || "").trim();
    return { section, view, requestId };
  }
  function humanizeKey(value) {
    const text = String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return "-";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function metaKindToFilterType(kind) {
    if (kind === "boolean") return "boolean";
    if (kind === "number") return "number";
    if (kind === "date" || kind === "datetime") return "date";
    return "text";
  }
  function metaKindToRecordType(kind) {
    if (kind === "boolean") return "boolean";
    if (kind === "number") return "number";
    if (kind === "json") return "json";
    return "text";
  }
  function decodeJwtPayload(token) {
    try {
      const payload = token.split(".")[1] || "";
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
      );
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }
  function sortByName(items) {
    return [...items].sort((a, b) => String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "ru"));
  }
  function roleLabel(role) {
    return ROLE_LABELS[role] || role || "-";
  }
  function statusLabel(code) {
    return STATUS_LABELS[code] || code || "-";
  }
  function invoiceStatusLabel(code) {
    return INVOICE_STATUS_LABELS[code] || code || "-";
  }
  function statusKindLabel(code) {
    return STATUS_KIND_LABELS[code] || code || "-";
  }
  function fallbackStatusGroup(statusCode) {
    const code = String(statusCode || "").toUpperCase();
    if (!code) return "NEW";
    if (code.startsWith("NEW")) return "NEW";
    if (code.includes("WAIT") || code.includes("PEND") || code.includes("HOLD")) return "WAITING";
    if (code.includes("CLOSE") || code.includes("RESOLV") || code.includes("REJECT") || code.includes("DONE") || code.includes("PAID")) return "DONE";
    return "IN_PROGRESS";
  }
  function boolLabel(value) {
    return value ? "\u0414\u0430" : "\u041D\u0435\u0442";
  }
  function boolFilterLabel(value) {
    return value ? "True" : "False";
  }
  function fmtDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  }
  function fmtDateOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  }
  function fmtTimeOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  function fmtKanbanDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  }
  function fmtShortDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  }
  function resolveDeadlineTone(value) {
    if (!value) return "ok";
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "ok";
    const delta = time - Date.now();
    const fourDaysMs = 4 * 24 * 60 * 60 * 1e3;
    const oneDayMs = 24 * 60 * 60 * 1e3;
    if (delta > fourDaysMs) return "ok";
    if (delta > oneDayMs) return "warn";
    return "danger";
  }
  function fmtAmount(value) {
    if (value == null || value === "") return "-";
    const number = Number(value);
    if (Number.isNaN(number)) return String(value);
    return number.toLocaleString("ru-RU");
  }
  function fmtBytes(value) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return "0 \u0411";
    const units = ["\u0411", "\u041A\u0411", "\u041C\u0411", "\u0413\u0411"];
    let normalized = size;
    let index = 0;
    while (normalized >= 1024 && index < units.length - 1) {
      normalized /= 1024;
      index += 1;
    }
    return normalized.toLocaleString("ru-RU", { maximumFractionDigits: index === 0 ? 0 : 1 }) + " " + units[index];
  }
  function normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    value.forEach((item) => {
      const text = String(item || "").trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }
  function listPreview(value, emptyLabel) {
    const items = normalizeStringList(value);
    return items.length ? items.join(", ") : emptyLabel;
  }
  function normalizeReferenceMeta(raw) {
    if (!raw || typeof raw !== "object") return null;
    const table = String(raw.table || "").trim();
    const valueField = String(raw.value_field || "id").trim() || "id";
    const labelField = String(raw.label_field || valueField).trim() || valueField;
    if (!table) return null;
    return { table, value_field: valueField, label_field: labelField };
  }
  function userInitials(name, email) {
    const source = String(name || "").trim();
    if (source) {
      const parts = source.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return source.slice(0, 2).toUpperCase();
    }
    const mail = String(email || "").trim();
    return (mail.slice(0, 2) || "U").toUpperCase();
  }
  function avatarColor(seed) {
    const palette = ["#6f8fa9", "#568f7d", "#a07a5c", "#7d6ea9", "#8f6f8f", "#7f8c5a"];
    const text = String(seed || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = hash * 31 + text.charCodeAt(i) >>> 0;
    return palette[hash % palette.length];
  }
  function resolveAvatarSrc(avatarUrl, accessToken) {
    const raw = String(avatarUrl || "").trim();
    if (!raw) return "";
    if (raw.startsWith("s3://")) {
      const key = raw.slice("s3://".length);
      if (!key || !accessToken) return "";
      return "/api/admin/uploads/object/" + encodeURIComponent(key) + "?token=" + encodeURIComponent(accessToken);
    }
    return raw;
  }
  function resolveAdminObjectSrc(s3Key, accessToken) {
    const key = String(s3Key || "").trim();
    if (!key || !accessToken) return "";
    return "/api/admin/uploads/object/" + encodeURIComponent(key) + "?token=" + encodeURIComponent(accessToken);
  }
  function detectAttachmentPreviewKind(fileName, mimeType) {
    const name = String(fileName || "").toLowerCase();
    const mime = String(mimeType || "").toLowerCase();
    if (/\.(txt|md|csv|json|log|xml|ya?ml|ini|cfg)$/i.test(name)) return "text";
    if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml" || mime === "text/xml") {
      return "text";
    }
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image";
    if (mime.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return "video";
    if (mime === "application/pdf" || /\.pdf$/.test(name)) return "pdf";
    return "none";
  }
  function buildUniversalQuery(filters, sort, limit, offset) {
    return {
      filters: filters || [],
      sort: sort || [],
      page: { limit: limit != null ? limit : 50, offset: offset != null ? offset : 0 }
    };
  }
  function canAccessSection(role, section) {
    const roleCode = String(role || "").toUpperCase();
    const allowed = /* @__PURE__ */ new Set([
      "dashboard",
      "kanban",
      "requests",
      "serviceRequests",
      "requestWorkspace",
      "invoices",
      "meta",
      "quotes",
      "config",
      "availableTables"
    ]);
    if (!allowed.has(section)) return false;
    if (section === "requests") return roleCode === "ADMIN" || roleCode === "LAWYER";
    if (section === "serviceRequests") return roleCode === "ADMIN" || roleCode === "CURATOR";
    if (section === "quotes" || section === "config" || section === "availableTables") return roleCode === "ADMIN";
    return true;
  }
  function translateApiError(message) {
    const direct = {
      "Missing auth token": "\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043E\u043A\u0435\u043D \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
      "Missing bearer token": "\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043E\u043A\u0435\u043D \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
      "Invalid token": "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0442\u043E\u043A\u0435\u043D",
      Forbidden: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432",
      "Invalid credentials": "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C",
      "Request not found": "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430",
      "Quote not found": "\u0426\u0438\u0442\u0430\u0442\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430",
      not_found: "\u0417\u0430\u043F\u0438\u0441\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430"
    };
    if (direct[message]) return direct[message];
    if (String(message).startsWith("HTTP ")) return "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 (" + message + ")";
    return message;
  }
  function getOperatorsForType(type) {
    if (type === "number" || type === "date" || type === "datetime") return ["=", "!=", ">", "<", ">=", "<="];
    if (type === "boolean" || type === "reference" || type === "enum") return ["=", "!="];
    return [...ALL_OPERATORS];
  }
  function localizeMeta(data) {
    const fieldTypeMap = {
      string: "\u0441\u0442\u0440\u043E\u043A\u0430",
      text: "\u0442\u0435\u043A\u0441\u0442",
      boolean: "\u0431\u0443\u043B\u0435\u0432\u043E",
      number: "\u0447\u0438\u0441\u043B\u043E",
      date: "\u0434\u0430\u0442\u0430"
    };
    return {
      \u0421\u0443\u0449\u043D\u043E\u0441\u0442\u044C: data.entity,
      \u041F\u043E\u043B\u044F: (data.fields || []).map((field) => ({
        "\u041A\u043E\u0434 \u043F\u043E\u043B\u044F": field.field_name,
        \u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435: field.label,
        \u0422\u0438\u043F: fieldTypeMap[field.type] || field.type,
        \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435: boolLabel(field.required),
        "\u0422\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u0435\u043D\u0438\u0435": boolLabel(field.read_only),
        "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0435\u043C\u044B\u0435 \u0440\u043E\u043B\u0438": (field.editable_roles || []).map(roleLabel)
      }))
    };
  }

  // app/web/admin/features/kanban/KanbanBoard.jsx
  function KanbanBoard({
    loading,
    columns,
    rows,
    role,
    actorId,
    filters,
    onRefresh,
    onOpenFilter,
    onRemoveFilter,
    onEditFilter,
    getFilterChipLabel,
    onOpenSort,
    sortActive,
    onOpenRequest,
    onClaimRequest,
    onMoveRequest,
    status,
    FilterToolbarComponent,
    StatusLineComponent
  }) {
    const { useMemo, useState } = React;
    const [draggingId, setDraggingId] = useState("");
    const [dragOverGroup, setDragOverGroup] = useState("");
    const safeColumns = Array.isArray(columns) && columns.length ? columns : KANBAN_GROUPS;
    const grouped = useMemo(() => {
      const map = {};
      safeColumns.forEach((column) => {
        map[String(column.key)] = [];
      });
      (rows || []).forEach((row) => {
        const group = String((row == null ? void 0 : row.status_group) || fallbackStatusGroup(row == null ? void 0 : row.status_code));
        if (!map[group]) map[group] = [];
        map[group].push(row);
      });
      return map;
    }, [rows, safeColumns]);
    const rowMap = useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      (rows || []).forEach((row) => {
        if (!(row == null ? void 0 : row.id)) return;
        map.set(String(row.id), row);
      });
      return map;
    }, [rows]);
    const onDropToGroup = (event, groupKey) => {
      event.preventDefault();
      const requestId = String(event.dataTransfer.getData("text/plain") || draggingId || "");
      setDragOverGroup("");
      setDraggingId("");
      if (!requestId) return;
      const row = rowMap.get(requestId);
      if (!row) return;
      onMoveRequest(row, String(groupKey || ""));
    };
    const FilterToolbar = FilterToolbarComponent;
    const StatusLine = StatusLineComponent;
    return /* @__PURE__ */ React.createElement("div", { className: "kanban-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u041A\u0430\u043D\u0431\u0430\u043D \u0437\u0430\u044F\u0432\u043E\u043A"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0413\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0430 \u043F\u043E \u0433\u0440\u0443\u043F\u043F\u0430\u043C \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432 \u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u0430\u044F \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u0446\u0438\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u0435\u043A.")), /* @__PURE__ */ React.createElement("div", { className: "section-head-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary" + (sortActive ? " active-success" : ""), type: "button", onClick: onOpenSort }, "\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onRefresh, disabled: loading, title: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C", "aria-label": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" }, /* @__PURE__ */ React.createElement(RefreshIcon, null)), /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onOpenFilter, title: "\u0424\u0438\u043B\u044C\u0442\u0440", "aria-label": "\u0424\u0438\u043B\u044C\u0442\u0440" }, /* @__PURE__ */ React.createElement(FilterIcon, null)))), FilterToolbar ? /* @__PURE__ */ React.createElement(
      FilterToolbar,
      {
        filters: filters || [],
        onOpen: onOpenFilter,
        onRemove: onRemoveFilter,
        onEdit: onEditFilter,
        hideAction: true,
        getChipLabel: getFilterChipLabel
      }
    ) : null, /* @__PURE__ */ React.createElement("div", { className: "kanban-board", id: "kanban-board" }, safeColumns.map((column) => {
      var _a;
      const key = String(column.key || "");
      const cards = grouped[key] || [];
      const isOver = dragOverGroup === key;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key,
          className: "kanban-column" + (isOver ? " drag-over" : ""),
          onDragOver: (event) => {
            event.preventDefault();
            setDragOverGroup(key);
          },
          onDragLeave: (event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            setDragOverGroup((prev) => prev === key ? "" : prev);
          },
          onDrop: (event) => onDropToGroup(event, key)
        },
        /* @__PURE__ */ React.createElement("div", { className: "kanban-column-head" }, /* @__PURE__ */ React.createElement("b", null, column.label || key), /* @__PURE__ */ React.createElement("span", null, Number((_a = column.total) != null ? _a : cards.length))),
        /* @__PURE__ */ React.createElement("div", { className: "kanban-column-body" }, cards.length ? cards.map((row) => {
          const requestId = String(row.id || "");
          const isUnassigned = !String(row.assigned_lawyer_id || "").trim();
          const canClaim = role === "LAWYER" && isUnassigned;
          const canMove = role === "ADMIN" || !isUnassigned && String(row.assigned_lawyer_id || "").trim() === String(actorId || "").trim();
          const transitionOptions = Array.isArray(row.available_transitions) ? row.available_transitions : [];
          const deadline = row.sla_deadline_at || row.case_deadline_at || "";
          const deadlineTone = resolveDeadlineTone(deadline);
          const unreadTypes = /* @__PURE__ */ new Set();
          if (role === "LAWYER") {
            if (row.lawyer_has_unread_updates && row.lawyer_unread_event_type) unreadTypes.add(String(row.lawyer_unread_event_type).toUpperCase());
          } else {
            if (row.client_has_unread_updates && row.client_unread_event_type) unreadTypes.add(String(row.client_unread_event_type).toUpperCase());
            if (row.lawyer_has_unread_updates && row.lawyer_unread_event_type) unreadTypes.add(String(row.lawyer_unread_event_type).toUpperCase());
          }
          const hasUnreadMessage = unreadTypes.has("MESSAGE");
          const hasUnreadAttachment = unreadTypes.has("ATTACHMENT");
          return /* @__PURE__ */ React.createElement(
            "article",
            {
              key: requestId,
              className: "kanban-card" + (canMove ? " draggable" : ""),
              draggable: canMove,
              role: "button",
              tabIndex: 0,
              onClick: (event) => onOpenRequest(requestId, event),
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenRequest(requestId, event);
                }
              },
              onDragStart: (event) => {
                if (!canMove) {
                  event.preventDefault();
                  return;
                }
                setDraggingId(requestId);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", requestId);
              },
              onDragEnd: () => {
                setDraggingId("");
                setDragOverGroup("");
              }
            },
            /* @__PURE__ */ React.createElement("div", { className: "kanban-card-head" }, /* @__PURE__ */ React.createElement(
              "button",
              {
                type: "button",
                className: "request-track-link",
                onClick: (event) => {
                  event.stopPropagation();
                  onOpenRequest(requestId, event);
                },
                title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443"
              },
              /* @__PURE__ */ React.createElement("code", null, row.track_number || "-")
            ), /* @__PURE__ */ React.createElement("span", { className: "kanban-status-badge group-" + String(row.status_group || "").toLowerCase() }, row.status_name || statusLabel(row.status_code))),
            /* @__PURE__ */ React.createElement("p", { className: "kanban-card-desc" }, String(row.description || "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E")),
            /* @__PURE__ */ React.createElement("div", { className: "kanban-card-meta" }, /* @__PURE__ */ React.createElement("span", null, row.client_name || "-"), /* @__PURE__ */ React.createElement("span", null, fmtKanbanDate(row.created_at))),
            /* @__PURE__ */ React.createElement("div", { className: "kanban-card-meta" }, /* @__PURE__ */ React.createElement("span", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("span", null, row.assigned_lawyer_name || (isUnassigned ? "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E" : row.assigned_lawyer_id || "-"))),
            /* @__PURE__ */ React.createElement("div", { className: "kanban-card-meta" }, /* @__PURE__ */ React.createElement("div", { className: "kanban-update-icons" }, /* @__PURE__ */ React.createElement("span", { className: "kanban-update-icon" + (hasUnreadMessage ? " is-unread" : ""), title: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F" }, "\u{1F4AC}"), /* @__PURE__ */ React.createElement("span", { className: "kanban-update-icon" + (hasUnreadAttachment ? " is-unread" : ""), title: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B" }, "\u{1F4CE}")), /* @__PURE__ */ React.createElement("span", { className: "kanban-deadline-chip tone-" + deadlineTone }, deadline ? fmtKanbanDate(deadline) : "\u2014")),
            /* @__PURE__ */ React.createElement(
              "div",
              {
                className: "kanban-card-actions",
                onClick: (event) => event.stopPropagation(),
                onMouseDown: (event) => event.stopPropagation()
              },
              canClaim ? /* @__PURE__ */ React.createElement("button", { className: "btn secondary btn-sm", type: "button", onClick: () => onClaimRequest(requestId) }, "\u0412\u0437\u044F\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0443") : null,
              canMove && transitionOptions.length ? /* @__PURE__ */ React.createElement(
                "select",
                {
                  className: "kanban-transition-select",
                  defaultValue: "",
                  onClick: (event) => event.stopPropagation(),
                  onChange: (event) => {
                    const targetStatus = String(event.target.value || "");
                    if (!targetStatus) return;
                    onMoveRequest(row, "", targetStatus);
                    event.target.value = "";
                  }
                },
                /* @__PURE__ */ React.createElement("option", { value: "" }, "\u041F\u0435\u0440\u0435\u0432\u0435\u0441\u0442\u0438\u2026"),
                transitionOptions.map((transition) => /* @__PURE__ */ React.createElement("option", { key: String(transition.to_status), value: String(transition.to_status) }, String(transition.to_status_name || transition.to_status)))
              ) : null
            )
          );
        }) : /* @__PURE__ */ React.createElement("p", { className: "muted kanban-empty" }, "\u041F\u0443\u0441\u0442\u043E"))
      );
    })), StatusLine ? /* @__PURE__ */ React.createElement(StatusLine, { status }) : null);
  }

  // app/web/admin/features/config/ConfigSection.jsx
  function fmtBalance(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20BD";
  }
  function smsBalanceSummary(health) {
    if (!health || typeof health !== "object") return "\u0411\u0430\u043B\u0430\u043D\u0441 SMS Aero: \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430...";
    const provider = String(health.provider || "").toLowerCase();
    if (provider !== "smsaero") {
      return "SMS \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440: " + String(health.provider || "-") + " (\u0431\u0430\u043B\u0430\u043D\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D)";
    }
    if (health.balance_available) {
      return "\u0411\u0430\u043B\u0430\u043D\u0441 SMS Aero: " + fmtBalance(health.balance_amount);
    }
    const issues = Array.isArray(health.issues) ? health.issues.filter(Boolean) : [];
    return "\u0411\u0430\u043B\u0430\u043D\u0441 SMS Aero \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D" + (issues.length ? " \u2022 " + String(issues[0]) : "");
  }
  function ConfigSection(props) {
    var _a;
    const {
      token,
      tables,
      dictionaries,
      configActiveKey,
      activeConfigTableState,
      activeConfigMeta,
      genericConfigHeaders,
      canCreateInConfig,
      canUpdateInConfig,
      canDeleteInConfig,
      statusDesignerTopicCode,
      statusDesignerCards,
      getTableLabel,
      getFieldDef,
      getFilterValuePreview,
      resolveReferenceLabel,
      resolveTableConfig,
      getStatus,
      loadCurrentConfigTable,
      onRefreshSmsProviderHealth,
      smsProviderHealth,
      openCreateRecordModal,
      openFilterModal,
      removeFilterChip,
      openFilterEditModal,
      toggleTableSort,
      openEditRecordModal,
      deleteRecord,
      loadStatusDesignerTopic,
      openCreateStatusTransitionForTopic,
      loadPrevPage,
      loadNextPage,
      loadAllRows,
      FilterToolbarComponent,
      DataTableComponent,
      StatusLineComponent,
      IconButtonComponent,
      UserAvatarComponent
    } = props;
    const FilterToolbar = FilterToolbarComponent;
    const DataTable = DataTableComponent;
    const StatusLine = StatusLineComponent;
    const IconButton = IconButtonComponent;
    const UserAvatar = UserAvatarComponent;
    const statusRouteLabel = (code) => resolveReferenceLabel({ table: "statuses", value_field: "code", label_field: "name" }, code);
    const canRefresh = Boolean(configActiveKey);
    const canCreateRecord = Boolean(canCreateInConfig && configActiveKey);
    const canLoadAllRows = Boolean(
      configActiveKey && activeConfigTableState.total > 0 && !activeConfigTableState.showAll && activeConfigTableState.rows.length < activeConfigTableState.total
    );
    const canLoadPrev = Boolean(configActiveKey && !activeConfigTableState.showAll && activeConfigTableState.offset > 0);
    const canLoadNext = Boolean(
      configActiveKey && !activeConfigTableState.showAll && activeConfigTableState.offset + PAGE_SIZE < activeConfigTableState.total
    );
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "breadcrumbs" }, configActiveKey ? getTableLabel(configActiveKey) : "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D"), configActiveKey === "otp_sessions" ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, smsBalanceSummary(smsProviderHealth), (smsProviderHealth == null ? void 0 : smsProviderHealth.loaded_at) ? " \u2022 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E " + fmtDate(smsProviderHealth.loaded_at) : "") : null), /* @__PURE__ */ React.createElement("div", { className: "config-head-actions" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn secondary table-control-btn",
        type: "button",
        onClick: () => openCreateRecordModal(configActiveKey),
        disabled: !canCreateRecord,
        title: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C",
        "aria-label": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"
      },
      /* @__PURE__ */ React.createElement(AddIcon, null)
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn secondary table-control-btn",
        type: "button",
        onClick: () => openFilterModal(configActiveKey),
        disabled: !configActiveKey,
        title: "\u0424\u0438\u043B\u044C\u0442\u0440",
        "aria-label": "\u0424\u0438\u043B\u044C\u0442\u0440"
      },
      /* @__PURE__ */ React.createElement(FilterIcon, null)
    ), configActiveKey === "otp_sessions" ? /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onRefreshSmsProviderHealth }, "\u0411\u0430\u043B\u0430\u043D\u0441") : null)), /* @__PURE__ */ React.createElement("div", { className: "config-layout" }, /* @__PURE__ */ React.createElement("div", { className: "config-panel config-panel-flat" }, /* @__PURE__ */ React.createElement("div", { className: "config-content" }, /* @__PURE__ */ React.createElement(
      FilterToolbar,
      {
        filters: activeConfigTableState.filters,
        onOpen: () => openFilterModal(configActiveKey),
        onRemove: (index) => removeFilterChip(configActiveKey, index),
        onEdit: (index) => openFilterEditModal(configActiveKey, index),
        hideAction: true,
        getChipLabel: (clause) => {
          const fieldDef = getFieldDef(configActiveKey, clause.field);
          return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview(configActiveKey, clause);
        }
      }
    ), configActiveKey === "topics" ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", sortable: true, field: "name" },
          { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", sortable: true, field: "enabled" },
          { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.topics.rows,
        emptyColspan: 4,
        onSort: (field) => toggleTableSort("topics", field),
        sortClause: tables.topics.sort && tables.topics.sort[0] || TABLE_SERVER_CONFIG.topics.sort[0],
        renderRow: (row) => {
          var _a2;
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.name || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String((_a2 = row.sort_order) != null ? _a2 : 0)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043C\u0443", onClick: () => openEditRecordModal("topics", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0442\u0435\u043C\u0443", onClick: () => deleteRecord("topics", row.id), tone: "danger" }))));
        }
      }
    ) : null, configActiveKey === "quotes" ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "author", label: "\u0410\u0432\u0442\u043E\u0440", sortable: true, field: "author" },
          { key: "text", label: "\u0422\u0435\u043A\u0441\u0442", sortable: true, field: "text" },
          { key: "source", label: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", sortable: true, field: "source" },
          { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", sortable: true, field: "is_active" },
          { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430", sortable: true, field: "created_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.quotes.rows,
        emptyColspan: 7,
        onSort: (field) => toggleTableSort("quotes", field),
        sortClause: tables.quotes.sort && tables.quotes.sort[0] || TABLE_SERVER_CONFIG.quotes.sort[0],
        renderRow: (row) => {
          var _a2;
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.author || "-"), /* @__PURE__ */ React.createElement("td", null, row.text || "-"), /* @__PURE__ */ React.createElement("td", null, row.source || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.is_active)), /* @__PURE__ */ React.createElement("td", null, String((_a2 = row.sort_order) != null ? _a2 : 0)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443", onClick: () => openEditRecordModal("quotes", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443", onClick: () => deleteRecord("quotes", row.id), tone: "danger" }))));
        }
      }
    ) : null, configActiveKey === "statuses" ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", sortable: true, field: "name" },
          { key: "status_group_id", label: "\u0413\u0440\u0443\u043F\u043F\u0430", sortable: true, field: "status_group_id" },
          { key: "kind", label: "\u0422\u0438\u043F", sortable: true, field: "kind" },
          { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", sortable: true, field: "enabled" },
          { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
          { key: "is_terminal", label: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439", sortable: true, field: "is_terminal" },
          { key: "invoice_template", label: "\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u0447\u0435\u0442\u0430" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.statuses.rows,
        emptyColspan: 8,
        onSort: (field) => toggleTableSort("statuses", field),
        sortClause: tables.statuses.sort && tables.statuses.sort[0] || TABLE_SERVER_CONFIG.statuses.sort[0],
        renderRow: (row) => {
          var _a2;
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.name || "-"), /* @__PURE__ */ React.createElement("td", null, resolveReferenceLabel({ table: "status_groups", value_field: "id", label_field: "name" }, row.status_group_id)), /* @__PURE__ */ React.createElement("td", null, statusKindLabel(row.kind)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String((_a2 = row.sort_order) != null ? _a2 : 0)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.is_terminal)), /* @__PURE__ */ React.createElement("td", null, row.invoice_template || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441", onClick: () => openEditRecordModal("statuses", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441", onClick: () => deleteRecord("statuses", row.id), tone: "danger" }))));
        }
      }
    ) : null, configActiveKey === "formFields" ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "key", label: "\u041A\u043B\u044E\u0447", sortable: true, field: "key" },
          { key: "label", label: "\u041C\u0435\u0442\u043A\u0430", sortable: true, field: "label" },
          { key: "type", label: "\u0422\u0438\u043F", sortable: true, field: "type" },
          { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", sortable: true, field: "required" },
          { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", sortable: true, field: "enabled" },
          { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.formFields.rows,
        emptyColspan: 7,
        onSort: (field) => toggleTableSort("formFields", field),
        sortClause: tables.formFields.sort && tables.formFields.sort[0] || TABLE_SERVER_CONFIG.formFields.sort[0],
        renderRow: (row) => {
          var _a2;
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.key || "-")), /* @__PURE__ */ React.createElement("td", null, row.label || "-"), /* @__PURE__ */ React.createElement("td", null, row.type || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.required)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String((_a2 = row.sort_order) != null ? _a2 : 0)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", onClick: () => openEditRecordModal("formFields", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", onClick: () => deleteRecord("formFields", row.id), tone: "danger" }))));
        }
      }
    ) : null, configActiveKey === "topicRequiredFields" ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "topic_code", label: "\u0422\u0435\u043C\u0430", sortable: true, field: "topic_code" },
          { key: "field_key", label: "\u041F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", sortable: true, field: "field_key" },
          { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", sortable: true, field: "required" },
          { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", sortable: true, field: "enabled" },
          { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u043E", sortable: true, field: "created_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.topicRequiredFields.rows,
        emptyColspan: 7,
        onSort: (field) => toggleTableSort("topicRequiredFields", field),
        sortClause: tables.topicRequiredFields.sort && tables.topicRequiredFields.sort[0] || TABLE_SERVER_CONFIG.topicRequiredFields.sort[0],
        renderRow: (row) => {
          var _a2;
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.field_key || "-")), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.required)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String((_a2 = row.sort_order) != null ? _a2 : 0)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(
            IconButton,
            {
              icon: "\u270E",
              tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043B\u0435",
              onClick: () => openEditRecordModal("topicRequiredFields", row)
            }
          ), /* @__PURE__ */ React.createElement(
            IconButton,
            {
              icon: "\u{1F5D1}",
              tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043B\u0435",
              onClick: () => deleteRecord("topicRequiredFields", row.id),
              tone: "danger"
            }
          ))));
        }
      }
    ) : null, configActiveKey === "topicDataTemplates" ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "topic_code", label: "\u0422\u0435\u043C\u0430", sortable: true, field: "topic_code" },
          { key: "key", label: "\u041A\u043B\u044E\u0447", sortable: true, field: "key" },
          { key: "label", label: "\u041C\u0435\u0442\u043A\u0430", sortable: true, field: "label" },
          { key: "description", label: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", sortable: true, field: "description" },
          { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", sortable: true, field: "required" },
          { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", sortable: true, field: "enabled" },
          { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u043E", sortable: true, field: "created_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.topicDataTemplates.rows,
        emptyColspan: 9,
        onSort: (field) => toggleTableSort("topicDataTemplates", field),
        sortClause: tables.topicDataTemplates.sort && tables.topicDataTemplates.sort[0] || TABLE_SERVER_CONFIG.topicDataTemplates.sort[0],
        renderRow: (row) => {
          var _a2;
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.key || "-")), /* @__PURE__ */ React.createElement("td", null, row.label || "-"), /* @__PURE__ */ React.createElement("td", null, row.description || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.required)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String((_a2 = row.sort_order) != null ? _a2 : 0)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D", onClick: () => openEditRecordModal("topicDataTemplates", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D", onClick: () => deleteRecord("topicDataTemplates", row.id), tone: "danger" }))));
        }
      }
    ) : null, configActiveKey === "statusTransitions" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "status-designer" }, /* @__PURE__ */ React.createElement("div", { className: "status-designer-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", null, "\u041A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442\u043E\u0440 \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0412\u0435\u0442\u0432\u043B\u0435\u043D\u0438\u044F, \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u044B, SLA \u0438 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u043A \u0434\u0430\u043D\u043D\u044B\u043C/\u0444\u0430\u0439\u043B\u0430\u043C \u043D\u0430 \u043A\u0430\u0436\u0434\u043E\u043C \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0435.")), /* @__PURE__ */ React.createElement("div", { className: "status-designer-controls" }, /* @__PURE__ */ React.createElement(
      "select",
      {
        id: "status-designer-topic",
        value: statusDesignerTopicCode,
        onChange: (event) => loadStatusDesignerTopic(event.target.value)
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0435\u043C\u0443"),
      (dictionaries.topics || []).map((topic) => /* @__PURE__ */ React.createElement("option", { key: topic.code, value: topic.code }, (topic.name || topic.code) + " (" + topic.code + ")"))
    ), /* @__PURE__ */ React.createElement("button", { className: "btn secondary btn-sm", type: "button", onClick: () => loadStatusDesignerTopic(statusDesignerTopicCode) }, "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0442\u0435\u043C\u0443"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm", type: "button", onClick: openCreateStatusTransitionForTopic }, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0445\u043E\u0434"))), statusDesignerCards.length ? /* @__PURE__ */ React.createElement("div", { className: "status-designer-grid", id: "status-designer-cards" }, statusDesignerCards.map((card) => /* @__PURE__ */ React.createElement("div", { className: "status-node-card", key: card.code }, /* @__PURE__ */ React.createElement("div", { className: "status-node-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("b", null, card.name), /* @__PURE__ */ React.createElement("code", null, card.code)), card.isTerminal ? /* @__PURE__ */ React.createElement("span", { className: "status-node-terminal" }, "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439") : null), card.outgoing.length ? /* @__PURE__ */ React.createElement("ul", { className: "simple-list status-node-links" }, card.outgoing.map((link) => /* @__PURE__ */ React.createElement("li", { key: String(link.id) }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "status-link-chip",
        type: "button",
        onClick: () => openEditRecordModal("statusTransitions", link)
      },
      /* @__PURE__ */ React.createElement("span", null, statusRouteLabel(link.to_status)),
      /* @__PURE__ */ React.createElement("small", null, "SLA: " + (link.sla_hours == null ? "-" : String(link.sla_hours) + " \u0447") + " \u2022 \u0414\u0430\u043D\u043D\u044B\u0435: " + listPreview(link.required_data_keys, "-") + " \u2022 \u0424\u0430\u0439\u043B\u044B: " + listPreview(link.required_mime_types, "-"))
    )))) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041D\u0435\u0442 \u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u043E\u0432")))) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0414\u043B\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0442\u0435\u043C\u044B \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u044B \u043F\u043E\u043A\u0430 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u044B.")), /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "topic_code", label: "\u0422\u0435\u043C\u0430", sortable: true, field: "topic_code" },
          { key: "from_status", label: "\u0418\u0437 \u0441\u0442\u0430\u0442\u0443\u0441\u0430", sortable: true, field: "from_status" },
          { key: "to_status", label: "\u0412 \u0441\u0442\u0430\u0442\u0443\u0441", sortable: true, field: "to_status" },
          { key: "sla_hours", label: "SLA (\u0447\u0430\u0441\u044B)", sortable: true, field: "sla_hours" },
          { key: "required_data_keys", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435" },
          { key: "required_mime_types", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B" },
          { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", sortable: true, field: "enabled" },
          { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.statusTransitions.rows,
        emptyColspan: 9,
        onSort: (field) => toggleTableSort("statusTransitions", field),
        sortClause: tables.statusTransitions.sort && tables.statusTransitions.sort[0] || TABLE_SERVER_CONFIG.statusTransitions.sort[0],
        renderRow: (row) => {
          var _a2;
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, statusRouteLabel(row.from_status)), /* @__PURE__ */ React.createElement("td", null, statusRouteLabel(row.to_status)), /* @__PURE__ */ React.createElement("td", null, row.sla_hours == null ? "-" : String(row.sla_hours)), /* @__PURE__ */ React.createElement("td", null, listPreview(row.required_data_keys, "-")), /* @__PURE__ */ React.createElement("td", null, listPreview(row.required_mime_types, "-")), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String((_a2 = row.sort_order) != null ? _a2 : 0)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(
            IconButton,
            {
              icon: "\u270E",
              tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0435\u0440\u0435\u0445\u043E\u0434",
              onClick: () => openEditRecordModal("statusTransitions", row)
            }
          ), /* @__PURE__ */ React.createElement(
            IconButton,
            {
              icon: "\u{1F5D1}",
              tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0445\u043E\u0434",
              onClick: () => deleteRecord("statusTransitions", row.id),
              tone: "danger"
            }
          ))));
        }
      }
    )) : null, configActiveKey === "users" ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "name", label: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C", sortable: true, field: "name" },
          { key: "email", label: "Email", sortable: true, field: "email" },
          { key: "role", label: "\u0420\u043E\u043B\u044C", sortable: true, field: "role" },
          { key: "primary_topic_code", label: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C (\u0442\u0435\u043C\u0430)", sortable: true, field: "primary_topic_code" },
          { key: "default_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430", sortable: true, field: "default_rate" },
          { key: "salary_percent", label: "\u041F\u0440\u043E\u0446\u0435\u043D\u0442", sortable: true, field: "salary_percent" },
          { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", sortable: true, field: "is_active" },
          { key: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", sortable: true, field: "responsible" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D", sortable: true, field: "created_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.users.rows,
        emptyColspan: 10,
        onSort: (field) => toggleTableSort("users", field),
        sortClause: tables.users.sort && tables.users.sort[0] || TABLE_SERVER_CONFIG.users.sort[0],
        renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "user-identity" }, /* @__PURE__ */ React.createElement(UserAvatar, { name: row.name, email: row.email, avatarUrl: row.avatar_url, accessToken: token, size: 32 }), /* @__PURE__ */ React.createElement("div", { className: "user-identity-text" }, /* @__PURE__ */ React.createElement("b", null, row.name || "-")))), /* @__PURE__ */ React.createElement("td", null, row.email || "-"), /* @__PURE__ */ React.createElement("td", null, roleLabel(row.role)), /* @__PURE__ */ React.createElement("td", null, resolveReferenceLabel({ table: "topics", value_field: "code", label_field: "name" }, row.primary_topic_code)), /* @__PURE__ */ React.createElement("td", null, row.default_rate == null ? "-" : String(row.default_rate)), /* @__PURE__ */ React.createElement("td", null, row.salary_percent == null ? "-" : String(row.salary_percent)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.is_active)), /* @__PURE__ */ React.createElement("td", null, row.responsible || "-"), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", onClick: () => openEditRecordModal("users", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", onClick: () => deleteRecord("users", row.id), tone: "danger" }))))
      }
    ) : null, configActiveKey === "userTopics" ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "admin_user_id", label: "\u042E\u0440\u0438\u0441\u0442", sortable: true, field: "admin_user_id" },
          { key: "topic_code", label: "\u0414\u043E\u043F. \u0442\u0435\u043C\u0430", sortable: true, field: "topic_code" },
          { key: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", sortable: true, field: "responsible" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u043E", sortable: true, field: "created_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tables.userTopics.rows,
        emptyColspan: 5,
        onSort: (field) => toggleTableSort("userTopics", field),
        sortClause: tables.userTopics.sort && tables.userTopics.sort[0] || TABLE_SERVER_CONFIG.userTopics.sort[0],
        renderRow: (row) => {
          const lawyer = (dictionaries.users || []).find((item) => String(item.id) === String(row.admin_user_id));
          const lawyerLabel = lawyer ? lawyer.name || lawyer.email || row.admin_user_id : row.admin_user_id || "-";
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, lawyerLabel), /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, row.responsible || "-"), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0432\u044F\u0437\u044C", onClick: () => openEditRecordModal("userTopics", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0432\u044F\u0437\u044C", onClick: () => deleteRecord("userTopics", row.id), tone: "danger" }))));
        }
      }
    ) : null, configActiveKey && !KNOWN_CONFIG_TABLE_KEYS.has(configActiveKey) ? /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: genericConfigHeaders,
        rows: activeConfigTableState.rows,
        emptyColspan: Math.max(1, genericConfigHeaders.length),
        onSort: (field) => toggleTableSort(configActiveKey, field),
        sortClause: activeConfigTableState.sort && activeConfigTableState.sort[0] || (((_a = resolveTableConfig(configActiveKey)) == null ? void 0 : _a.sort) || [])[0],
        renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id || JSON.stringify(row) }, ((activeConfigMeta == null ? void 0 : activeConfigMeta.columns) || []).filter((column) => String((column == null ? void 0 : column.name) || "") !== "id").map((column) => {
          const key = String(column.name || "");
          const value = row[key];
          if (column.kind === "boolean") return /* @__PURE__ */ React.createElement("td", { key }, boolLabel(Boolean(value)));
          if (column.kind === "date" || column.kind === "datetime") return /* @__PURE__ */ React.createElement("td", { key }, fmtDate(value));
          if (column.kind === "json") return /* @__PURE__ */ React.createElement("td", { key }, value == null ? "-" : JSON.stringify(value));
          const reference = normalizeReferenceMeta(column.reference);
          if (reference) return /* @__PURE__ */ React.createElement("td", { key }, resolveReferenceLabel(reference, value));
          return /* @__PURE__ */ React.createElement("td", { key }, value == null || value === "" ? "-" : String(value));
        }), canUpdateInConfig || canDeleteInConfig ? /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, canUpdateInConfig ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C", onClick: () => openEditRecordModal(configActiveKey, row) }) : null, canDeleteInConfig ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C", onClick: () => deleteRecord(configActiveKey, row.id), tone: "danger" }) : null)) : null)
      }
    ) : null, /* @__PURE__ */ React.createElement("div", { className: "pager table-footer-bar config-controls-bar" }, /* @__PURE__ */ React.createElement("div", { className: "config-controls-summary" }, activeConfigTableState.showAll ? "\u0412\u0441\u0435\u0433\u043E: " + activeConfigTableState.total + " \u2022 \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0432\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438" : "\u0412\u0441\u0435\u0433\u043E: " + activeConfigTableState.total + " \u2022 \u0441\u043C\u0435\u0449\u0435\u043D\u0438\u0435: " + activeConfigTableState.offset), /* @__PURE__ */ React.createElement("div", { className: "config-controls-actions" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn secondary table-control-btn table-control-loadall",
        type: "button",
        onClick: () => loadAllRows(configActiveKey),
        disabled: !canLoadAllRows,
        title: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u0441\u0435 " + activeConfigTableState.total,
        "aria-label": "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u0441\u0435 " + activeConfigTableState.total
      },
      /* @__PURE__ */ React.createElement(DownloadIcon, null),
      /* @__PURE__ */ React.createElement("span", null, activeConfigTableState.total)
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn secondary table-control-btn",
        type: "button",
        onClick: () => loadCurrentConfigTable(true),
        disabled: !canRefresh,
        title: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
        "aria-label": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C"
      },
      /* @__PURE__ */ React.createElement(RefreshIcon, null)
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn secondary table-control-btn",
        type: "button",
        onClick: () => loadPrevPage(configActiveKey),
        disabled: !canLoadPrev,
        title: "\u041D\u0430\u0437\u0430\u0434",
        "aria-label": "\u041D\u0430\u0437\u0430\u0434"
      },
      /* @__PURE__ */ React.createElement(PrevIcon, null)
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn secondary table-control-btn",
        type: "button",
        onClick: () => loadNextPage(configActiveKey),
        disabled: !canLoadNext,
        title: "\u0412\u043F\u0435\u0440\u0435\u0434",
        "aria-label": "\u0412\u043F\u0435\u0440\u0435\u0434"
      },
      /* @__PURE__ */ React.createElement(NextIcon, null)
    ))), /* @__PURE__ */ React.createElement(StatusLine, { status: getStatus(configActiveKey) })))));
  }

  // app/web/admin/features/dashboard/DashboardSection.jsx
  function DashboardSection({
    dashboardData,
    token,
    status,
    apiCall,
    onOpenRequest,
    DataTableComponent,
    StatusLineComponent,
    UserAvatarComponent
  }) {
    var _a, _b, _c, _d, _e, _f;
    const { useMemo, useState } = React;
    const DataTable = DataTableComponent;
    const StatusLine = StatusLineComponent;
    const UserAvatar = UserAvatarComponent;
    const [lawyerModal, setLawyerModal] = useState({
      open: false,
      loading: false,
      error: "",
      lawyer: null,
      rows: [],
      totals: { amount: 0, salary: 0 }
    });
    const statusCards = useMemo(() => {
      return Object.entries((dashboardData == null ? void 0 : dashboardData.byStatus) || {}).map(([label, value]) => ({ label, value })).sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
    }, [dashboardData == null ? void 0 : dashboardData.byStatus]);
    const fmtThousandsCompact = (value) => {
      const amount = Number(value || 0);
      if (!Number.isFinite(amount)) return "0";
      return new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
      }).format(amount / 1e3);
    };
    const openLawyerModal = async (lawyerRow) => {
      if (!(lawyerRow == null ? void 0 : lawyerRow.lawyer_id) || typeof apiCall !== "function") return;
      setLawyerModal({
        open: true,
        loading: true,
        error: "",
        lawyer: lawyerRow,
        rows: [],
        totals: { amount: 0, salary: 0 }
      });
      try {
        const data = await apiCall("/api/admin/metrics/lawyers/" + encodeURIComponent(String(lawyerRow.lawyer_id)) + "/active-requests");
        setLawyerModal((prev) => {
          var _a2, _b2;
          return {
            ...prev,
            loading: false,
            error: "",
            rows: Array.isArray(data == null ? void 0 : data.rows) ? data.rows : [],
            totals: {
              amount: Number(((_a2 = data == null ? void 0 : data.totals) == null ? void 0 : _a2.amount) || 0),
              salary: Number(((_b2 = data == null ? void 0 : data.totals) == null ? void 0 : _b2.salary) || 0)
            }
          };
        });
      } catch (error) {
        setLawyerModal((prev) => ({ ...prev, loading: false, error: error.message || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438" }));
      }
    };
    const closeLawyerModal = () => {
      setLawyerModal({ open: false, loading: false, error: "", lawyer: null, rows: [], totals: { amount: 0, salary: 0 } });
    };
    const isLawyerScope = (dashboardData == null ? void 0 : dashboardData.scope) === "LAWYER";
    const lawyerCards = Array.isArray(dashboardData == null ? void 0 : dashboardData.lawyerLoads) ? dashboardData.lawyerLoads : [];
    const currentLawyer = lawyerCards[0] || null;
    const lawyerMetrics = currentLawyer ? [
      { label: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435", value: String((_a = currentLawyer.active_load) != null ? _a : 0) },
      { label: "\u041D\u043E\u0432\u044B\u0435", value: String((_b = currentLawyer.monthly_assigned_count) != null ? _b : 0) },
      { label: "\u0417\u0430\u043A\u0440\u044B\u0442\u043E", value: String((_c = currentLawyer.monthly_completed_count) != null ? _c : 0) },
      { label: "\u0417\u041F, \u0442\u044B\u0441.", value: fmtThousandsCompact(currentLawyer.monthly_salary) }
    ] : [];
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u041E\u0431\u0437\u043E\u0440 \u043C\u0435\u0442\u0440\u0438\u043A"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, isLawyerScope ? "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043E\u043A \u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430." : "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043E\u043A, \u0444\u0438\u043D\u0430\u043D\u0441\u044B \u043C\u0435\u0441\u044F\u0446\u0430 \u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u044E\u0440\u0438\u0441\u0442\u043E\u0432."))), /* @__PURE__ */ React.createElement("div", { className: "cards" }, ((dashboardData == null ? void 0 : dashboardData.cards) || []).map((card) => /* @__PURE__ */ React.createElement("div", { className: "card", key: card.label }, /* @__PURE__ */ React.createElement("p", null, card.label), /* @__PURE__ */ React.createElement("b", null, card.value)))), statusCards.length ? /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.8rem" } }, /* @__PURE__ */ React.createElement("div", { className: "section-head", style: { marginBottom: "0.5rem" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0 } }, "\u0421\u0442\u0430\u0442\u0443\u0441\u044B \u0437\u0430\u044F\u0432\u043E\u043A"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.2rem" } }, "\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430 \u043F\u043E \u0432\u0441\u0435\u043C \u0441\u0442\u0430\u0442\u0443\u0441\u0430\u043C."))), /* @__PURE__ */ React.createElement("div", { className: "cards" }, statusCards.map((card) => {
      var _a2;
      return /* @__PURE__ */ React.createElement("div", { className: "card", key: "status-" + card.label }, /* @__PURE__ */ React.createElement("p", null, card.label), /* @__PURE__ */ React.createElement("b", null, String((_a2 = card.value) != null ? _a2 : 0)));
    }))) : null, isLawyerScope ? /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.9rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: "0 0 0.55rem" } }, "\u041C\u043E\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430"), /* @__PURE__ */ React.createElement("div", { className: "cards" }, lawyerMetrics.length ? lawyerMetrics.map((metric) => /* @__PURE__ */ React.createElement("div", { className: "card", key: "lawyer-metric-" + metric.label }, /* @__PURE__ */ React.createElement("p", null, metric.label), /* @__PURE__ */ React.createElement("b", null, metric.value))) : /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("p", null, "\u041C\u043E\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430"), /* @__PURE__ */ React.createElement("b", null, "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445")))) : /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.9rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: "0 0 0.55rem" } }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u044E\u0440\u0438\u0441\u0442\u043E\u0432"), /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-grid" }, lawyerCards.length ? lawyerCards.map((row) => {
      var _a2, _b2, _c2;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: row.lawyer_id,
          type: "button",
          className: "lawyer-dashboard-card",
          onClick: () => openLawyerModal(row),
          title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0435\u0442\u0430\u043B\u0438 \u044E\u0440\u0438\u0441\u0442\u0430"
        },
        /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-left" }, /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-avatar" }, /* @__PURE__ */ React.createElement(UserAvatar, { name: row.name, email: row.email, avatarUrl: row.avatar_url, accessToken: token, size: 72 })), /* @__PURE__ */ React.createElement("b", { className: "lawyer-dashboard-name" }, row.name || row.email || "-"), /* @__PURE__ */ React.createElement("span", { className: "lawyer-dashboard-topic" }, row.primary_topic_code || "\u0422\u0435\u043C\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430")),
        /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-right" }, /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435"), /* @__PURE__ */ React.createElement("b", null, String((_a2 = row.active_load) != null ? _a2 : 0))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u041D\u043E\u0432\u044B\u0435"), /* @__PURE__ */ React.createElement("b", null, String((_b2 = row.monthly_assigned_count) != null ? _b2 : 0))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u0417\u0430\u043A\u0440\u044B\u0442\u043E"), /* @__PURE__ */ React.createElement("b", null, String((_c2 = row.monthly_completed_count) != null ? _c2 : 0))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u0421\u0443\u043C\u043C\u0430, \u0442\u044B\u0441."), /* @__PURE__ */ React.createElement("b", null, fmtThousandsCompact(row.monthly_paid_gross))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u0417\u041F, \u0442\u044B\u0441."), /* @__PURE__ */ React.createElement("b", null, fmtThousandsCompact(row.monthly_salary))))
      );
    }) : /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("p", null, "\u042E\u0440\u0438\u0441\u0442\u044B"), /* @__PURE__ */ React.createElement("b", null, "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445")))), /* @__PURE__ */ React.createElement(StatusLine, { status }), /* @__PURE__ */ React.createElement("div", { className: "overlay" + (lawyerModal.open ? " open" : ""), onClick: closeLawyerModal }, /* @__PURE__ */ React.createElement("div", { className: "modal lawyer-dashboard-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, lawyerModal.lawyer ? "\u042E\u0440\u0438\u0441\u0442: " + (lawyerModal.lawyer.name || lawyerModal.lawyer.email || "-") : "\u042E\u0440\u0438\u0441\u0442"), lawyerModal.lawyer ? /* @__PURE__ */ React.createElement("p", { className: "muted", style: { margin: "0.2rem 0 0" } }, (lawyerModal.lawyer.primary_topic_code || "\u0422\u0435\u043C\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430") + " \u2022 " + (lawyerModal.lawyer.email || "")) : null), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeLawyerModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), lawyerModal.lawyer ? /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-modal-summary" }, /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-modal-avatar" }, /* @__PURE__ */ React.createElement(
      UserAvatar,
      {
        name: lawyerModal.lawyer.name,
        email: lawyerModal.lawyer.email,
        avatarUrl: lawyerModal.lawyer.avatar_url,
        accessToken: token,
        size: 84
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-modal-metrics" }, /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435"), /* @__PURE__ */ React.createElement("b", null, String((_d = lawyerModal.lawyer.active_load) != null ? _d : 0))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u041D\u043E\u0432\u044B\u0435"), /* @__PURE__ */ React.createElement("b", null, String((_e = lawyerModal.lawyer.monthly_assigned_count) != null ? _e : 0))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043D\u044B\u0435"), /* @__PURE__ */ React.createElement("b", null, String((_f = lawyerModal.lawyer.monthly_completed_count) != null ? _f : 0))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u0421\u0443\u043C\u043C\u0430"), /* @__PURE__ */ React.createElement("b", null, fmtAmount(lawyerModal.lawyer.monthly_paid_gross))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-metric-pair" }, /* @__PURE__ */ React.createElement("span", null, "\u0417\u0430\u0440\u043F\u043B\u0430\u0442\u0430"), /* @__PURE__ */ React.createElement("b", null, fmtAmount(lawyerModal.lawyer.monthly_salary))))) : null, /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-modal-scroll" }, lawyerModal.loading ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u044F\u0432\u043E\u043A...") : null, lawyerModal.error ? /* @__PURE__ */ React.createElement("p", { className: "status error" }, lawyerModal.error) : null, !lawyerModal.loading ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-modal-table-area" }, /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "track_number", label: "\u041D\u043E\u043C\u0435\u0440" },
          { key: "status_code", label: "\u0421\u0442\u0430\u0442\u0443\u0441" },
          { key: "client_name", label: "\u041A\u043B\u0438\u0435\u043D\u0442" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430" },
          { key: "invoice_amount", label: "\u0421\u0443\u043C\u043C\u0430 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435" },
          { key: "month_paid_amount", label: "\u041E\u043F\u043B\u0430\u0442\u044B" },
          { key: "month_salary_amount", label: "\u0417\u0430\u0440\u043F\u043B\u0430\u0442\u0430" }
        ],
        rows: lawyerModal.rows || [],
        emptyColspan: 7,
        renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "request-track-link",
            onClick: (event) => {
              if (typeof onOpenRequest === "function") onOpenRequest(row.id, event);
              closeLawyerModal();
            },
            title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443"
          },
          /* @__PURE__ */ React.createElement("code", null, row.track_number || "-")
        )), /* @__PURE__ */ React.createElement("td", null, statusLabel(row.status_code)), /* @__PURE__ */ React.createElement("td", null, row.client_name || "-"), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, fmtAmount(row.invoice_amount)), /* @__PURE__ */ React.createElement("td", null, fmtAmount(row.month_paid_amount)), /* @__PURE__ */ React.createElement("td", null, fmtAmount(row.month_salary_amount)))
      }
    ))) : null), !lawyerModal.loading ? /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-modal-footer" }, /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-total-chip" }, "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445: ", /* @__PURE__ */ React.createElement("b", null, String((lawyerModal.rows || []).length))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-total-chip" }, "\u041E\u043F\u043B\u0430\u0442\u044B: ", /* @__PURE__ */ React.createElement("b", null, fmtAmount(lawyerModal.totals.amount))), /* @__PURE__ */ React.createElement("div", { className: "lawyer-dashboard-total-chip" }, "\u0417\u0430\u0440\u043F\u043B\u0430\u0442\u0430: ", /* @__PURE__ */ React.createElement("b", null, fmtAmount(lawyerModal.totals.salary)))) : null)));
  }

  // app/web/admin/features/invoices/InvoicesSection.jsx
  function InvoicesSection({
    role,
    tables,
    status,
    getFieldDef,
    getFilterValuePreview,
    onRefresh,
    onCreate,
    onOpenFilter,
    onRemoveFilter,
    onEditFilter,
    onSort,
    onPrev,
    onNext,
    onLoadAll,
    onOpenRequest,
    onDownloadPdf,
    onEditRecord,
    onDeleteRecord,
    FilterToolbarComponent,
    DataTableComponent,
    TablePagerComponent,
    StatusLineComponent,
    IconButtonComponent
  }) {
    const tableState = (tables == null ? void 0 : tables.invoices) || { rows: [], filters: [], sort: [] };
    const FilterToolbar = FilterToolbarComponent;
    const DataTable = DataTableComponent;
    const TablePager = TablePagerComponent;
    const StatusLine = StatusLineComponent;
    const IconButton = IconButtonComponent;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0421\u0447\u0435\u0442\u0430"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0412\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0441\u0447\u0435\u0442\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430\u043C, \u0441\u0442\u0430\u0442\u0443\u0441\u044B \u043E\u043F\u043B\u0430\u0442\u044B \u0438 \u0432\u044B\u0433\u0440\u0443\u0437\u043A\u0430 PDF.")), /* @__PURE__ */ React.createElement("div", { className: "section-head-actions" }, onCreate ? /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onCreate, title: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C", "aria-label": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" }, /* @__PURE__ */ React.createElement(AddIcon, null)) : null, /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onOpenFilter, title: "\u0424\u0438\u043B\u044C\u0442\u0440", "aria-label": "\u0424\u0438\u043B\u044C\u0442\u0440" }, /* @__PURE__ */ React.createElement(FilterIcon, null)))), /* @__PURE__ */ React.createElement(
      FilterToolbar,
      {
        filters: tableState.filters,
        onOpen: onOpenFilter,
        onRemove: onRemoveFilter,
        onEdit: onEditFilter,
        hideAction: true,
        getChipLabel: (clause) => {
          const fieldDef = getFieldDef("invoices", clause.field);
          return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("invoices", clause);
        }
      }
    ), /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "invoice_number", label: "\u041D\u043E\u043C\u0435\u0440", sortable: true, field: "invoice_number" },
          { key: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", sortable: true, field: "status" },
          { key: "amount", label: "\u0421\u0443\u043C\u043C\u0430", sortable: true, field: "amount" },
          { key: "payer_display_name", label: "\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A", sortable: true, field: "payer_display_name" },
          { key: "request_track_number", label: "\u0417\u0430\u044F\u0432\u043A\u0430" },
          { key: "issued_by_name", label: "\u0412\u044B\u0441\u0442\u0430\u0432\u0438\u043B", sortable: true, field: "issued_by_admin_user_id" },
          { key: "issued_at", label: "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D", sortable: true, field: "issued_at" },
          { key: "paid_at", label: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D", sortable: true, field: "paid_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tableState.rows,
        emptyColspan: 9,
        onSort,
        sortClause: tableState.sort && tableState.sort[0] || TABLE_SERVER_CONFIG.invoices.sort[0],
        renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.invoice_number || "-")), /* @__PURE__ */ React.createElement("td", null, row.status_label || invoiceStatusLabel(row.status)), /* @__PURE__ */ React.createElement("td", null, row.amount == null ? "-" : String(row.amount) + " " + String(row.currency || "RUB")), /* @__PURE__ */ React.createElement("td", null, row.payer_display_name || "-"), /* @__PURE__ */ React.createElement("td", null, row.request_id ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "request-track-link",
            onClick: (event) => onOpenRequest(row, event),
            title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443"
          },
          /* @__PURE__ */ React.createElement("code", null, row.request_track_number || row.request_id || "-")
        ) : /* @__PURE__ */ React.createElement("code", null, row.request_track_number || row.request_id || "-")), /* @__PURE__ */ React.createElement("td", null, row.issued_by_name || "-"), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.issued_at)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.paid_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u2B07", tooltip: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C PDF", onClick: () => onDownloadPdf(row) }), role === "ADMIN" ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0447\u0435\u0442", onClick: () => onEditRecord(row) }) : null, role === "ADMIN" ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0447\u0435\u0442", onClick: () => onDeleteRecord(row.id), tone: "danger" }) : null)))
      }
    ), /* @__PURE__ */ React.createElement(
      TablePager,
      {
        tableState,
        onPrev,
        onNext,
        onLoadAll,
        onRefresh
      }
    ), /* @__PURE__ */ React.createElement(StatusLine, { status }));
  }

  // app/web/admin/features/requests/RequestsSection.jsx
  function renderRequestUpdatesCell(row, role) {
    const hasServiceRequestUnread = Boolean(row == null ? void 0 : row.has_service_requests_unread);
    const serviceRequestCount = Number((row == null ? void 0 : row.service_requests_unread_count) || 0);
    const viewerUnreadTotal = Number((row == null ? void 0 : row.viewer_unread_total) || 0);
    const viewerUnreadByEvent = (row == null ? void 0 : row.viewer_unread_by_event) && typeof row.viewer_unread_by_event === "object" ? row.viewer_unread_by_event : {};
    const viewerUnreadLabel = viewerUnreadTotal > 0 ? Object.entries(viewerUnreadByEvent).map(([eventType, count]) => {
      const code = String(eventType || "").toUpperCase();
      const label = REQUEST_UPDATE_EVENT_LABELS[code] || code.toLowerCase();
      return label + ": " + String(count || 0);
    }).join(", ") : "";
    if (role === "LAWYER") {
      const has = Boolean(row.lawyer_has_unread_updates);
      const eventType = String(row.lawyer_unread_event_type || "").toUpperCase();
      if (!has && !hasServiceRequestUnread && !viewerUnreadTotal) return /* @__PURE__ */ React.createElement("span", { className: "request-update-empty" }, "\u043D\u0435\u0442");
      return /* @__PURE__ */ React.createElement("span", { className: "request-updates-stack" }, viewerUnreadTotal > 0 ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u041C\u043E\u0438 \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435: " + (viewerUnreadLabel || String(viewerUnreadTotal)) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), "\u041C\u043D\u0435: " + String(viewerUnreadTotal)) : null, has ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u0415\u0441\u0442\u044C \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u043E\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435: " + (REQUEST_UPDATE_EVENT_LABELS[eventType] || eventType.toLowerCase()) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), REQUEST_UPDATE_EVENT_LABELS[eventType] || "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435") : null, hasServiceRequestUnread ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u0430: " + String(serviceRequestCount) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), "\u0417\u0430\u043F\u0440\u043E\u0441\u044B: " + String(serviceRequestCount || 1)) : null);
    }
    const clientHas = Boolean(row.client_has_unread_updates);
    const clientType = String(row.client_unread_event_type || "").toUpperCase();
    const lawyerHas = Boolean(row.lawyer_has_unread_updates);
    const lawyerType = String(row.lawyer_unread_event_type || "").toUpperCase();
    if (!clientHas && !lawyerHas && !hasServiceRequestUnread && !viewerUnreadTotal) return /* @__PURE__ */ React.createElement("span", { className: "request-update-empty" }, "\u043D\u0435\u0442");
    return /* @__PURE__ */ React.createElement("span", { className: "request-updates-stack" }, viewerUnreadTotal > 0 ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u041C\u043E\u0438 \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435: " + (viewerUnreadLabel || String(viewerUnreadTotal)) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), "\u041C\u043D\u0435: " + String(viewerUnreadTotal)) : null, clientHas ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u041A\u043B\u0438\u0435\u043D\u0442\u0443: " + (REQUEST_UPDATE_EVENT_LABELS[clientType] || clientType.toLowerCase()) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), "\u041A\u043B\u0438\u0435\u043D\u0442: " + (REQUEST_UPDATE_EVENT_LABELS[clientType] || "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435")) : null, lawyerHas ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u042E\u0440\u0438\u0441\u0442\u0443: " + (REQUEST_UPDATE_EVENT_LABELS[lawyerType] || lawyerType.toLowerCase()) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), "\u042E\u0440\u0438\u0441\u0442: " + (REQUEST_UPDATE_EVENT_LABELS[lawyerType] || "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435")) : null, hasServiceRequestUnread ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u0430: " + String(serviceRequestCount) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), "\u0417\u0430\u043F\u0440\u043E\u0441\u044B: " + String(serviceRequestCount || 1)) : null);
  }
  function RequestsSection({
    role,
    tables,
    status,
    getStatus,
    getFieldDef,
    getFilterValuePreview,
    resolveReferenceLabel,
    onRefresh,
    onCreate,
    onOpenFilter,
    onRemoveFilter,
    onEditFilter,
    onSort,
    onPrev,
    onNext,
    onLoadAll,
    onClaimRequest,
    onOpenReassign,
    onOpenRequest,
    onEditRecord,
    onDeleteRecord,
    FilterToolbarComponent,
    DataTableComponent,
    TablePagerComponent,
    StatusLineComponent,
    IconButtonComponent
  }) {
    const tableState = (tables == null ? void 0 : tables.requests) || { rows: [], filters: [], sort: [] };
    const FilterToolbar = FilterToolbarComponent;
    const DataTable = DataTableComponent;
    const TablePager = TablePagerComponent;
    const StatusLine = StatusLineComponent;
    const IconButton = IconButtonComponent;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0417\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0421\u0435\u0440\u0432\u0435\u0440\u043D\u0430\u044F \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u0446\u0438\u044F \u0438 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0445 \u0437\u0430\u044F\u0432\u043E\u043A.")), /* @__PURE__ */ React.createElement("div", { className: "section-head-actions" }, onCreate ? /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onCreate, title: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C", "aria-label": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" }, /* @__PURE__ */ React.createElement(AddIcon, null)) : null, /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onOpenFilter, title: "\u0424\u0438\u043B\u044C\u0442\u0440", "aria-label": "\u0424\u0438\u043B\u044C\u0442\u0440" }, /* @__PURE__ */ React.createElement(FilterIcon, null)))), /* @__PURE__ */ React.createElement(
      FilterToolbar,
      {
        filters: tableState.filters,
        onOpen: onOpenFilter,
        onRemove: onRemoveFilter,
        onEdit: onEditFilter,
        hideAction: true,
        getChipLabel: (clause) => {
          const fieldDef = getFieldDef("requests", clause.field);
          return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("requests", clause);
        }
      }
    ), /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "track_number", label: "\u041D\u043E\u043C\u0435\u0440", sortable: true, field: "track_number" },
          { key: "client_name", label: "\u041A\u043B\u0438\u0435\u043D\u0442", sortable: true, field: "client_name" },
          { key: "client_phone", label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", sortable: true, field: "client_phone" },
          { key: "status_code", label: "\u0421\u0442\u0430\u0442\u0443\u0441", sortable: true, field: "status_code" },
          { key: "topic_code", label: "\u0422\u0435\u043C\u0430", sortable: true, field: "topic_code" },
          { key: "assigned_lawyer_id", label: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D", sortable: true, field: "assigned_lawyer_id" },
          { key: "invoice_amount", label: "\u0421\u0447\u0435\u0442", sortable: true, field: "invoice_amount" },
          { key: "paid_at", label: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E", sortable: true, field: "paid_at" },
          { key: "updates", label: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430", sortable: true, field: "created_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tableState.rows,
        emptyColspan: 11,
        onSort,
        sortClause: tableState.sort && tableState.sort[0] || TABLE_SERVER_CONFIG.requests.sort[0],
        renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "request-track-link",
            onClick: (event) => onOpenRequest(row.id, event),
            title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443"
          },
          /* @__PURE__ */ React.createElement("code", null, row.track_number || "-")
        )), /* @__PURE__ */ React.createElement("td", null, row.client_name || "-"), /* @__PURE__ */ React.createElement("td", null, row.client_phone || "-"), /* @__PURE__ */ React.createElement("td", null, statusLabel(row.status_code)), /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, resolveReferenceLabel({ table: "admin_users", value_field: "id", label_field: "name" }, row.assigned_lawyer_id)), /* @__PURE__ */ React.createElement("td", null, row.invoice_amount == null ? "-" : String(row.invoice_amount)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.paid_at)), /* @__PURE__ */ React.createElement("td", null, renderRequestUpdatesCell(row, role)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, role === "LAWYER" ? /* @__PURE__ */ React.createElement(
          IconButton,
          {
            icon: "\u{1F4E5}",
            tooltip: row.assigned_lawyer_id ? "\u0417\u0430\u044F\u0432\u043A\u0430 \u0443\u0436\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430" : "\u0412\u0437\u044F\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0443",
            onClick: () => onClaimRequest(row.id),
            disabled: Boolean(row.assigned_lawyer_id)
          }
        ) : null, role === "ADMIN" && row.assigned_lawyer_id ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u21C4", tooltip: "\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C", onClick: () => onOpenReassign(row) }) : null, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443", onClick: () => onEditRecord(row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443", onClick: () => onDeleteRecord(row.id), tone: "danger" }))))
      }
    ), /* @__PURE__ */ React.createElement(
      TablePager,
      {
        tableState,
        onPrev,
        onNext,
        onLoadAll,
        onRefresh
      }
    ), /* @__PURE__ */ React.createElement(StatusLine, { status: status || (typeof getStatus === "function" ? getStatus("requests") : null) }));
  }

  // app/web/admin/features/quotes/QuotesSection.jsx
  function QuotesSection({
    tables,
    status,
    getFieldDef,
    getFilterValuePreview,
    onRefresh,
    onCreate,
    onOpenFilter,
    onRemoveFilter,
    onEditFilter,
    onSort,
    onPrev,
    onNext,
    onLoadAll,
    onEditRecord,
    onDeleteRecord,
    FilterToolbarComponent,
    DataTableComponent,
    TablePagerComponent,
    StatusLineComponent,
    IconButtonComponent
  }) {
    const tableState = (tables == null ? void 0 : tables.quotes) || { rows: [], filters: [], sort: [] };
    const FilterToolbar = FilterToolbarComponent;
    const DataTable = DataTableComponent;
    const TablePager = TablePagerComponent;
    const StatusLine = StatusLineComponent;
    const IconButton = IconButtonComponent;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0426\u0438\u0442\u0430\u0442\u044B"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u043B\u0435\u043D\u0442\u043E\u0439 \u0446\u0438\u0442\u0430\u0442 \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u044B\u043C\u0438 \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u043C\u0438."))), /* @__PURE__ */ React.createElement(
      FilterToolbar,
      {
        filters: tableState.filters,
        onOpen: onOpenFilter,
        onRemove: onRemoveFilter,
        onEdit: onEditFilter,
        hideAction: true,
        getChipLabel: (clause) => {
          const fieldDef = getFieldDef("quotes", clause.field);
          return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("quotes", clause);
        }
      }
    ), /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "author", label: "\u0410\u0432\u0442\u043E\u0440", sortable: true, field: "author" },
          { key: "text", label: "\u0422\u0435\u043A\u0441\u0442", sortable: true, field: "text" },
          { key: "source", label: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", sortable: true, field: "source" },
          { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", sortable: true, field: "is_active" },
          { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430", sortable: true, field: "created_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tableState.rows,
        emptyColspan: 7,
        onSort,
        sortClause: tableState.sort && tableState.sort[0] || TABLE_SERVER_CONFIG.quotes.sort[0],
        renderRow: (row) => {
          var _a;
          return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.author || "-"), /* @__PURE__ */ React.createElement("td", null, row.text || "-"), /* @__PURE__ */ React.createElement("td", null, row.source || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.is_active)), /* @__PURE__ */ React.createElement("td", null, String((_a = row.sort_order) != null ? _a : 0)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443", onClick: () => onEditRecord(row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443", onClick: () => onDeleteRecord(row.id), tone: "danger" }))));
        }
      }
    ), /* @__PURE__ */ React.createElement(
      TablePager,
      {
        tableState,
        onPrev,
        onNext,
        onLoadAll,
        onRefresh,
        onCreate,
        onOpenFilter
      }
    ), /* @__PURE__ */ React.createElement(StatusLine, { status }));
  }

  // app/web/admin/features/service-requests/ServiceRequestsSection.jsx
  function serviceRequestTypeLabel(value) {
    const code = String(value || "").toUpperCase();
    return SERVICE_REQUEST_TYPE_LABELS[code] || code || "-";
  }
  function serviceRequestStatusLabel(value) {
    const code = String(value || "").toUpperCase();
    return SERVICE_REQUEST_STATUS_LABELS[code] || code || "-";
  }
  function unreadLabel(row, role) {
    if (String(role || "").toUpperCase() === "LAWYER") {
      return (row == null ? void 0 : row.lawyer_unread) ? "\u0414\u0430" : "\u041D\u0435\u0442";
    }
    return (row == null ? void 0 : row.admin_unread) ? "\u0414\u0430" : "\u041D\u0435\u0442";
  }
  function ServiceRequestsSection({
    role,
    tables,
    status,
    getStatus,
    getFieldDef,
    getFilterValuePreview,
    resolveReferenceLabel,
    onRefresh,
    onCreate,
    onOpenFilter,
    onRemoveFilter,
    onEditFilter,
    onSort,
    onPrev,
    onNext,
    onLoadAll,
    onOpenRequest,
    onMarkRead,
    onEditRecord,
    onDeleteRecord,
    FilterToolbarComponent,
    DataTableComponent,
    TablePagerComponent,
    StatusLineComponent,
    IconButtonComponent
  }) {
    const tableState = (tables == null ? void 0 : tables.serviceRequests) || { rows: [], filters: [], sort: [] };
    const FilterToolbar = FilterToolbarComponent;
    const DataTable = DataTableComponent;
    const TablePager = TablePagerComponent;
    const StatusLine = StatusLineComponent;
    const IconButton = IconButtonComponent;
    const roleCode = String(role || "").toUpperCase();
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0417\u0430\u043F\u0440\u043E\u0441\u044B"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0417\u0430\u043F\u0440\u043E\u0441\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u0430 \u043A \u043A\u0443\u0440\u0430\u0442\u043E\u0440\u0443 \u0438 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F \u043D\u0430 \u0441\u043C\u0435\u043D\u0443 \u044E\u0440\u0438\u0441\u0442\u0430.")), /* @__PURE__ */ React.createElement("div", { className: "section-head-actions" }, onCreate && roleCode === "ADMIN" ? /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onCreate, title: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C", "aria-label": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" }, /* @__PURE__ */ React.createElement(AddIcon, null)) : null, /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onOpenFilter, title: "\u0424\u0438\u043B\u044C\u0442\u0440", "aria-label": "\u0424\u0438\u043B\u044C\u0442\u0440" }, /* @__PURE__ */ React.createElement(FilterIcon, null)))), /* @__PURE__ */ React.createElement(
      FilterToolbar,
      {
        filters: tableState.filters,
        onOpen: onOpenFilter,
        onRemove: onRemoveFilter,
        onEdit: onEditFilter,
        hideAction: true,
        getChipLabel: (clause) => {
          const fieldDef = getFieldDef("serviceRequests", clause.field);
          return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("serviceRequests", clause);
        }
      }
    ), /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "type", label: "\u0422\u0438\u043F", sortable: true, field: "type" },
          { key: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", sortable: true, field: "status" },
          { key: "body", label: "\u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435", sortable: false },
          { key: "request_id", label: "\u0417\u0430\u044F\u0432\u043A\u0430", sortable: true, field: "request_id" },
          { key: "unread", label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E", sortable: true, field: roleCode === "LAWYER" ? "lawyer_unread" : "admin_unread" },
          { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D", sortable: true, field: "created_at" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tableState.rows,
        emptyColspan: 7,
        onSort,
        sortClause: tableState.sort && tableState.sort[0] || TABLE_SERVER_CONFIG.serviceRequests.sort[0],
        renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, serviceRequestTypeLabel(row.type)), /* @__PURE__ */ React.createElement("td", null, serviceRequestStatusLabel(row.status)), /* @__PURE__ */ React.createElement("td", null, row.body || "-"), /* @__PURE__ */ React.createElement("td", null, (() => {
          const requestTrackNumber = String((row == null ? void 0 : row.request_track_number) || "").trim() || String(
            typeof resolveReferenceLabel === "function" ? resolveReferenceLabel({ table: "requests", value_field: "id", label_field: "track_number" }, row == null ? void 0 : row.request_id) : ""
          ).trim();
          const requestLabel = requestTrackNumber || String((row == null ? void 0 : row.request_id) || "").trim() || "-";
          if (!row.request_id) return "-";
          return /* @__PURE__ */ React.createElement("button", { type: "button", className: "request-track-link", onClick: (event) => onOpenRequest(row.request_id, event), title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443" }, /* @__PURE__ */ React.createElement("code", null, requestLabel));
        })()), /* @__PURE__ */ React.createElement("td", null, unreadLabel(row, roleCode)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u2713", tooltip: "\u041E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u043C", onClick: () => onMarkRead(row.id) }), roleCode === "ADMIN" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441", onClick: () => onEditRecord(row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441", onClick: () => onDeleteRecord(row.id), tone: "danger" })) : null)))
      }
    ), /* @__PURE__ */ React.createElement(
      TablePager,
      {
        tableState,
        onPrev,
        onNext,
        onLoadAll,
        onRefresh
      }
    ), /* @__PURE__ */ React.createElement(StatusLine, { status: status || (typeof getStatus === "function" ? getStatus("serviceRequests") : null) }));
  }

  // app/web/admin/features/requests/RequestWorkspace.jsx
  function RequestWorkspace({
    viewerRole,
    viewerUserId,
    loading,
    trackNumber,
    requestData,
    financeSummary,
    invoices,
    statusRouteNodes,
    statusHistory,
    availableStatuses,
    currentImportantDateAt,
    pendingStatusChangePreset,
    messages,
    attachments,
    messageDraft,
    selectedFiles,
    fileUploading,
    status,
    onMessageChange,
    onSendMessage,
    onFilesSelect,
    onRemoveSelectedFile,
    onClearSelectedFiles,
    onLoadRequestDataTemplates,
    onLoadRequestDataBatch,
    onLoadRequestDataTemplateDetails,
    onSaveRequestDataTemplate,
    onSaveRequestDataBatch,
    onIssueInvoice,
    onDownloadInvoicePdf,
    onSaveRequestDataValues,
    onUploadRequestAttachment,
    onChangeStatus,
    onConsumePendingStatusChangePreset,
    onLiveProbe,
    onTypingSignal,
    domIds,
    AttachmentPreviewModalComponent,
    StatusLineComponent
  }) {
    var _a, _b, _c;
    const { useEffect, useMemo, useRef, useState } = React;
    const [preview, setPreview] = useState({ open: false, url: "", fileName: "", mimeType: "" });
    const [chatTab, setChatTab] = useState("chat");
    const [dropActive, setDropActive] = useState(false);
    const [financeOpen, setFinanceOpen] = useState(false);
    const [financeIssueForm, setFinanceIssueForm] = useState({
      open: false,
      saving: false,
      amount: "",
      serviceDescription: "",
      payerDisplayName: "",
      error: ""
    });
    const [requestDataListOpen, setRequestDataListOpen] = useState(false);
    const [descriptionOpen, setDescriptionOpen] = useState(false);
    const [requestTemplateSuggestOpen, setRequestTemplateSuggestOpen] = useState(false);
    const [catalogFieldSuggestOpen, setCatalogFieldSuggestOpen] = useState(false);
    const [statusChangeModal, setStatusChangeModal] = useState({
      open: false,
      saving: false,
      statusCode: "",
      allowedStatusCodes: null,
      importantDateAt: "",
      comment: "",
      files: [],
      error: ""
    });
    const [draggedRequestRowId, setDraggedRequestRowId] = useState("");
    const [dragOverRequestRowId, setDragOverRequestRowId] = useState("");
    const [dataRequestModal, setDataRequestModal] = useState({
      open: false,
      loading: false,
      saving: false,
      savingTemplate: false,
      messageId: "",
      documentName: "",
      availableDocuments: [],
      templateList: [],
      requestTemplateQuery: "",
      templateName: "",
      selectedRequestTemplateId: "",
      templates: [],
      catalogFieldQuery: "",
      selectedCatalogTemplateId: "",
      rows: [],
      customLabel: "",
      customType: "string",
      templateStatus: "",
      error: ""
    });
    const [clientDataModal, setClientDataModal] = useState({
      open: false,
      loading: false,
      saving: false,
      messageId: "",
      items: [],
      status: "",
      error: ""
    });
    const [composerFocused, setComposerFocused] = useState(false);
    const [typingPeers, setTypingPeers] = useState([]);
    const [liveMode, setLiveMode] = useState("online");
    const fileInputRef = useRef(null);
    const statusChangeFileInputRef = useRef(null);
    const chatListRef = useRef(null);
    const liveCursorRef = useRef("");
    const liveTimerRef = useRef(null);
    const liveInFlightRef = useRef(false);
    const liveFailCountRef = useRef(0);
    const typingHeartbeatRef = useRef(null);
    const typingActiveRef = useRef(false);
    const lastAutoScrollCursorRef = useRef("");
    const idMap = useMemo(
      () => ({
        messagesList: "request-modal-messages",
        filesList: "request-modal-files",
        messageBody: "request-modal-message-body",
        sendButton: "request-modal-message-send",
        fileInput: "request-modal-file-input",
        fileUploadButton: "",
        dataRequestOverlay: "data-request-overlay",
        dataRequestItems: "data-request-items",
        dataRequestStatus: "data-request-status",
        dataRequestSave: "data-request-save",
        ...domIds || {}
      }),
      [domIds]
    );
    const requestDataTypeOptions = useMemo(
      () => [
        { value: "string", label: "\u0421\u0442\u0440\u043E\u043A\u0430" },
        { value: "date", label: "\u0414\u0430\u0442\u0430" },
        { value: "number", label: "\u0427\u0438\u0441\u043B\u043E" },
        { value: "file", label: "\u0424\u0430\u0439\u043B" },
        { value: "text", label: "\u0422\u0435\u043A\u0441\u0442" }
      ],
      []
    );
    const openPreview = (item) => {
      if (!(item == null ? void 0 : item.download_url)) return;
      setPreview({
        open: true,
        url: String(item.download_url),
        fileName: String(item.file_name || ""),
        mimeType: String(item.mime_type || "")
      });
    };
    const closePreview = () => setPreview({ open: false, url: "", fileName: "", mimeType: "" });
    const pendingFiles = Array.isArray(selectedFiles) ? selectedFiles : [];
    const hasPendingFiles = pendingFiles.length > 0;
    const canSubmit = Boolean(String(messageDraft || "").trim() || hasPendingFiles);
    const onInputFiles = (event) => {
      const files = Array.from(event.target && event.target.files || []);
      if (files.length && typeof onFilesSelect === "function") onFilesSelect(files);
      event.target.value = "";
    };
    const onDropFiles = (event) => {
      event.preventDefault();
      setDropActive(false);
      const files = Array.from(event.dataTransfer && event.dataTransfer.files || []);
      if (files.length && typeof onFilesSelect === "function") onFilesSelect(files);
    };
    const row = requestData && typeof requestData === "object" ? requestData : null;
    const finance = financeSummary && typeof financeSummary === "object" ? financeSummary : null;
    const viewerRoleCode = String(viewerRole || "").toUpperCase();
    const canRequestData = viewerRoleCode === "LAWYER" || viewerRoleCode === "ADMIN";
    const canFillRequestData = viewerRoleCode === "CLIENT";
    const canSeeRate = viewerRoleCode !== "CLIENT";
    const canSeeCreatedUpdatedInCard = viewerRoleCode !== "CLIENT";
    const showTopicStatusInCard = viewerRoleCode !== "CLIENT";
    const showContactsInCard = viewerRoleCode !== "CLIENT";
    const safeMessages = Array.isArray(messages) ? messages : [];
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const safeInvoices = Array.isArray(invoices) ? invoices : [];
    const safeStatusHistory = Array.isArray(statusHistory) ? statusHistory : [];
    const safeAvailableStatuses = Array.isArray(availableStatuses) ? availableStatuses : [];
    const totalFilesBytes = safeAttachments.reduce((acc, item) => acc + Number((item == null ? void 0 : item.size_bytes) || 0), 0);
    const clientLabel = (row == null ? void 0 : row.client_name) || "-";
    const clientPhone = String((row == null ? void 0 : row.client_phone) || "").trim();
    const lawyerLabel = (row == null ? void 0 : row.assigned_lawyer_name) || (row == null ? void 0 : row.assigned_lawyer_id) || "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D";
    const lawyerPhone = String((row == null ? void 0 : row.assigned_lawyer_phone) || "").trim();
    const clientHasPhone = Boolean(clientPhone);
    const lawyerHasPhone = Boolean(lawyerPhone);
    const messagePlaceholder = canFillRequestData ? "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u044E\u0440\u0438\u0441\u0442\u0430" : "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430";
    const selectedRequestTemplateCandidate = useMemo(
      () => (dataRequestModal.templateList || []).find((item) => {
        const query = String(dataRequestModal.requestTemplateQuery || "").trim().toLowerCase();
        if (!query) return false;
        return query === String((item == null ? void 0 : item.name) || "").trim().toLowerCase() || query === String((item == null ? void 0 : item.id) || "").trim().toLowerCase();
      }) || null,
      [dataRequestModal.requestTemplateQuery, dataRequestModal.templateList]
    );
    const selectedCatalogFieldCandidate = useMemo(
      () => (dataRequestModal.templates || []).find((item) => {
        const query = String(dataRequestModal.catalogFieldQuery || "").trim().toLowerCase();
        if (!query) return false;
        return query === String((item == null ? void 0 : item.label) || "").trim().toLowerCase() || query === String((item == null ? void 0 : item.key) || "").trim().toLowerCase() || query === String((item == null ? void 0 : item.id) || "").trim().toLowerCase();
      }) || null,
      [dataRequestModal.catalogFieldQuery, dataRequestModal.templates]
    );
    const filteredRequestTemplates = useMemo(() => {
      const query = String(dataRequestModal.requestTemplateQuery || "").trim().toLowerCase();
      const rows = Array.isArray(dataRequestModal.templateList) ? dataRequestModal.templateList : [];
      if (!query) return rows.slice(0, 8);
      return rows.filter((item) => String((item == null ? void 0 : item.name) || "").toLowerCase().includes(query)).slice(0, 8);
    }, [dataRequestModal.requestTemplateQuery, dataRequestModal.templateList]);
    const filteredCatalogFields = useMemo(() => {
      const query = String(dataRequestModal.catalogFieldQuery || "").trim().toLowerCase();
      const rows = Array.isArray(dataRequestModal.templates) ? dataRequestModal.templates : [];
      if (!query) return rows.slice(0, 10);
      return rows.filter((item) => {
        const label = String((item == null ? void 0 : item.label) || "").toLowerCase();
        const key = String((item == null ? void 0 : item.key) || "").toLowerCase();
        return label.includes(query) || key.includes(query);
      }).slice(0, 10);
    }, [dataRequestModal.catalogFieldQuery, dataRequestModal.templates]);
    const requestTemplateActionMode = selectedRequestTemplateCandidate ? "save" : String(dataRequestModal.requestTemplateQuery || "").trim() ? "create" : "";
    const catalogFieldActionMode = selectedCatalogFieldCandidate ? "add" : String(dataRequestModal.catalogFieldQuery || "").trim() ? "create" : "";
    const requestTemplateBadge = useMemo(() => {
      const query = String(dataRequestModal.requestTemplateQuery || "").trim();
      if (!query) return null;
      const matched = selectedRequestTemplateCandidate;
      if (!matched) return { kind: "create", label: "\u041D\u043E\u0432\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D" };
      const roleCode = String(viewerRole || "").toUpperCase();
      const actorId = String(viewerUserId || "").trim();
      const ownerId = String(matched.created_by_admin_id || "").trim();
      if (roleCode === "LAWYER" && ownerId && actorId && ownerId !== actorId) {
        return { kind: "readonly", label: "\u0427\u0443\u0436\u043E\u0439 \u0448\u0430\u0431\u043B\u043E\u043D" };
      }
      return { kind: "existing", label: "\u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0431\u043B\u043E\u043D" };
    }, [dataRequestModal.requestTemplateQuery, selectedRequestTemplateCandidate, viewerRole, viewerUserId]);
    const canSaveSelectedRequestTemplate = useMemo(() => {
      if (!String(dataRequestModal.requestTemplateQuery || "").trim()) return false;
      if (!requestTemplateBadge) return true;
      return requestTemplateBadge.kind !== "readonly";
    }, [dataRequestModal.requestTemplateQuery, requestTemplateBadge]);
    const attachmentById = useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      safeAttachments.forEach((item) => {
        const id = String((item == null ? void 0 : item.id) || "").trim();
        if (id) map.set(id, item);
      });
      return map;
    }, [safeAttachments]);
    const statusOptions = useMemo(
      () => safeAvailableStatuses.filter((item) => item && item.code).map((item) => ({
        code: String(item.code),
        name: String(item.name || "").trim() || humanizeKey(item.code),
        groupName: item.status_group_name ? String(item.status_group_name) : "",
        isTerminal: Boolean(item.is_terminal)
      })),
      [safeAvailableStatuses]
    );
    const statusByCode = useMemo(() => new Map(statusOptions.map((item) => [item.code, item])), [statusOptions]);
    const toDateTimeLocalValue = (value) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
    };
    const defaultImportantDateLocal = useMemo(() => {
      const source = String(currentImportantDateAt || (row == null ? void 0 : row.important_date_at) || "").trim();
      if (source) {
        const local = toDateTimeLocalValue(source);
        if (local) return local;
      }
      const next = new Date(Date.now() + 3 * 24 * 60 * 60 * 1e3);
      return toDateTimeLocalValue(next.toISOString());
    }, [currentImportantDateAt, row == null ? void 0 : row.important_date_at]);
    const formatDuration = (seconds) => {
      const total = Number(seconds);
      if (!Number.isFinite(total) || total < 0) return "\u2014";
      const days = Math.floor(total / 86400);
      const hours = Math.floor(total % 86400 / 3600);
      const minutes = Math.floor(total % 3600 / 60);
      if (days > 0) return days + " \u0434 " + hours + " \u0447";
      if (hours > 0) return hours + " \u0447 " + minutes + " \u043C\u0438\u043D";
      return Math.max(0, minutes) + " \u043C\u0438\u043D";
    };
    const formatMoneyInput = (value) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return "";
      return String(Math.round((amount + Number.EPSILON) * 100) / 100);
    };
    const openFinanceIssueForm = () => {
      var _a2, _b2, _c2, _d, _e;
      const defaultAmount = (_e = (_d = (_c2 = (_b2 = (_a2 = finance == null ? void 0 : finance.request_cost) != null ? _a2 : row == null ? void 0 : row.request_cost) != null ? _b2 : row == null ? void 0 : row.invoice_amount) != null ? _c2 : finance == null ? void 0 : finance.effective_rate) != null ? _d : row == null ? void 0 : row.effective_rate) != null ? _e : "";
      setFinanceIssueForm({
        open: true,
        saving: false,
        amount: formatMoneyInput(defaultAmount),
        serviceDescription: String((row == null ? void 0 : row.topic_name) || (row == null ? void 0 : row.topic_code) || "\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0443\u0441\u043B\u0443\u0433\u0438"),
        payerDisplayName: String((row == null ? void 0 : row.client_name) || "").trim() || "\u041A\u043B\u0438\u0435\u043D\u0442",
        error: ""
      });
    };
    const closeFinanceIssueForm = () => {
      setFinanceIssueForm((prev) => ({ ...prev, open: false, saving: false, error: "" }));
    };
    const closeFinanceModal = () => {
      setFinanceOpen(false);
      closeFinanceIssueForm();
    };
    const submitFinanceIssueForm = async (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!(row == null ? void 0 : row.id) || typeof onIssueInvoice !== "function") return;
      const normalizedAmount = Number(String(financeIssueForm.amount || "").replace(",", "."));
      if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        setFinanceIssueForm((prev) => ({ ...prev, error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0443\u044E \u0441\u0443\u043C\u043C\u0443 \u0441\u0447\u0435\u0442\u0430" }));
        return;
      }
      setFinanceIssueForm((prev) => ({ ...prev, saving: true, error: "" }));
      try {
        await onIssueInvoice({
          requestId: String(row.id),
          amount: normalizedAmount,
          serviceDescription: String(financeIssueForm.serviceDescription || ""),
          payerDisplayName: String(financeIssueForm.payerDisplayName || "")
        });
        setFinanceIssueForm((prev) => ({ ...prev, open: false, saving: false, error: "" }));
      } catch (error) {
        setFinanceIssueForm((prev) => ({ ...prev, saving: false, error: (error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0447\u0435\u0442" }));
      }
    };
    const openStatusChangeModal = (preset) => {
      const suggested = Array.isArray(preset == null ? void 0 : preset.suggestedStatuses) ? preset.suggestedStatuses.filter(Boolean) : [];
      const currentCode = String((row == null ? void 0 : row.status_code) || "").trim();
      const firstSuggested = suggested.find((code) => code && code !== currentCode) || "";
      setStatusChangeModal({
        open: true,
        saving: false,
        statusCode: firstSuggested,
        allowedStatusCodes: suggested.length ? suggested : null,
        importantDateAt: defaultImportantDateLocal,
        comment: "",
        files: [],
        error: ""
      });
    };
    const closeStatusChangeModal = () => {
      setStatusChangeModal((prev) => ({ ...prev, open: false, saving: false, error: "", files: [] }));
    };
    useEffect(() => {
      if (!pendingStatusChangePreset) return;
      openStatusChangeModal(pendingStatusChangePreset);
      if (typeof onConsumePendingStatusChangePreset === "function") onConsumePendingStatusChangePreset();
    }, [pendingStatusChangePreset]);
    const requestDataListItems = useMemo(() => {
      const byKey = /* @__PURE__ */ new Map();
      const messagesChrono = [...safeMessages].sort((a, b) => {
        const at = new Date((a == null ? void 0 : a.created_at) || 0).getTime();
        const bt = new Date((b == null ? void 0 : b.created_at) || 0).getTime();
        if (at !== bt) return at - bt;
        return String((a == null ? void 0 : a.id) || "").localeCompare(String((b == null ? void 0 : b.id) || ""), "ru");
      });
      messagesChrono.forEach((msg) => {
        if (String((msg == null ? void 0 : msg.message_kind) || "") !== "REQUEST_DATA") return;
        const items = Array.isArray(msg == null ? void 0 : msg.request_data_items) ? msg.request_data_items : [];
        items.forEach((item, idx) => {
          const key = String((item == null ? void 0 : item.key) || (item == null ? void 0 : item.id) || "item-" + idx);
          if (!key) return;
          byKey.set(key, {
            id: String((item == null ? void 0 : item.id) || ""),
            key,
            label: String((item == null ? void 0 : item.label) || (item == null ? void 0 : item.label_short) || key),
            field_type: String((item == null ? void 0 : item.field_type) || "string").toLowerCase(),
            value_text: (item == null ? void 0 : item.value_text) == null ? "" : String(item.value_text),
            is_filled: Boolean(item == null ? void 0 : item.is_filled),
            source_message_id: String((msg == null ? void 0 : msg.id) || ""),
            source_message_created_at: (msg == null ? void 0 : msg.created_at) || null,
            value_file: (item == null ? void 0 : item.value_file) || null
          });
        });
      });
      return Array.from(byKey.values()).sort((a, b) => {
        const aFilled = a.is_filled ? 1 : 0;
        const bFilled = b.is_filled ? 1 : 0;
        if (aFilled !== bFilled) return aFilled - bFilled;
        return String(a.label || a.key).localeCompare(String(b.label || b.key), "ru");
      });
    }, [safeMessages]);
    const attachmentsByMessageId = useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      safeAttachments.forEach((item) => {
        const messageId = String((item == null ? void 0 : item.message_id) || "").trim();
        if (!messageId) return;
        if (!map.has(messageId)) map.set(messageId, []);
        map.get(messageId).push(item);
      });
      return map;
    }, [safeAttachments]);
    const localActivityCursor = useMemo(() => {
      let latestTs = 0;
      const pickLatest = (value) => {
        if (!value) return;
        const ts = new Date(value).getTime();
        if (Number.isFinite(ts) && ts > latestTs) latestTs = ts;
      };
      safeMessages.forEach((item) => {
        pickLatest(item == null ? void 0 : item.updated_at);
        pickLatest(item == null ? void 0 : item.created_at);
      });
      safeAttachments.forEach((item) => {
        pickLatest(item == null ? void 0 : item.updated_at);
        pickLatest(item == null ? void 0 : item.created_at);
      });
      return latestTs > 0 ? new Date(latestTs).toISOString() : "";
    }, [safeAttachments, safeMessages]);
    const typingHintText = useMemo(() => {
      const rows = Array.isArray(typingPeers) ? typingPeers : [];
      if (!rows.length) return "";
      const labels = rows.map((item) => String((item == null ? void 0 : item.actor_label) || (item == null ? void 0 : item.label) || "").trim()).filter(Boolean);
      if (!labels.length) return "\u0421\u043E\u0431\u0435\u0441\u0435\u0434\u043D\u0438\u043A \u043F\u0435\u0447\u0430\u0442\u0430\u0435\u0442...";
      const unique = [];
      labels.forEach((label) => {
        if (!unique.includes(label)) unique.push(label);
      });
      if (unique.length === 1) return unique[0] + " \u043F\u0435\u0447\u0430\u0442\u0430\u0435\u0442...";
      if (unique.length === 2) return unique[0] + " \u0438 " + unique[1] + " \u043F\u0435\u0447\u0430\u0442\u0430\u044E\u0442...";
      return unique[0] + ", " + unique[1] + " \u0438 \u0435\u0449\u0435 " + String(unique.length - 2) + " \u043F\u0435\u0447\u0430\u0442\u0430\u044E\u0442...";
    }, [typingPeers]);
    const openAttachmentFromMessage = (item) => {
      if (!(item == null ? void 0 : item.download_url)) return;
      const kind = detectAttachmentPreviewKind(item.file_name, item.mime_type);
      if (kind === "none") {
        window.open(String(item.download_url), "_blank", "noopener,noreferrer");
        return;
      }
      openPreview(item);
    };
    const downloadAttachment = (item) => {
      const url = String((item == null ? void 0 : item.download_url) || "").trim();
      if (!url) return;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      const fileName = String((item == null ? void 0 : item.file_name) || "").trim();
      if (fileName) link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    useEffect(() => {
      liveCursorRef.current = localActivityCursor || "";
    }, [localActivityCursor, row == null ? void 0 : row.id]);
    useEffect(() => {
      if (!row || typeof onLiveProbe !== "function") {
        setTypingPeers([]);
        setLiveMode("online");
        if (liveTimerRef.current) {
          clearTimeout(liveTimerRef.current);
          liveTimerRef.current = null;
        }
        liveInFlightRef.current = false;
        liveFailCountRef.current = 0;
        return void 0;
      }
      let cancelled = false;
      const scheduleNext = (ms) => {
        if (cancelled) return;
        if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
        liveTimerRef.current = setTimeout(runProbe, ms);
      };
      const runProbe = async () => {
        if (cancelled || liveInFlightRef.current) return;
        liveInFlightRef.current = true;
        try {
          const payload = await onLiveProbe({ cursor: liveCursorRef.current });
          const cursor = String((payload == null ? void 0 : payload.cursor) || "").trim();
          if (cursor) liveCursorRef.current = cursor;
          setTypingPeers(Array.isArray(payload == null ? void 0 : payload.typing) ? payload.typing : []);
          liveFailCountRef.current = 0;
          setLiveMode("online");
        } catch (_) {
          liveFailCountRef.current += 1;
          setLiveMode(liveFailCountRef.current >= 3 ? "degraded" : "online");
        } finally {
          liveInFlightRef.current = false;
          const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
          const baseInterval = hidden ? 8e3 : 2500;
          const failStep = Math.min(5, Math.max(0, liveFailCountRef.current));
          const backoffInterval = failStep > 0 ? Math.min(3e4, baseInterval * Math.pow(2, failStep - 1)) : baseInterval;
          scheduleNext(backoffInterval);
        }
      };
      runProbe();
      return () => {
        cancelled = true;
        if (liveTimerRef.current) {
          clearTimeout(liveTimerRef.current);
          liveTimerRef.current = null;
        }
        liveInFlightRef.current = false;
        liveFailCountRef.current = 0;
        setTypingPeers([]);
        setLiveMode("online");
      };
    }, [onLiveProbe, row, trackNumber]);
    const typingEnabled = Boolean(
      row && typeof onTypingSignal === "function" && !loading && !fileUploading && composerFocused && String(messageDraft || "").trim()
    );
    useEffect(() => {
      if (typeof onTypingSignal !== "function" || !row) {
        if (typingHeartbeatRef.current) {
          clearInterval(typingHeartbeatRef.current);
          typingHeartbeatRef.current = null;
        }
        typingActiveRef.current = false;
        return;
      }
      if (typingEnabled) {
        if (!typingActiveRef.current) {
          typingActiveRef.current = true;
          void onTypingSignal({ typing: true }).catch(() => null);
        }
        if (!typingHeartbeatRef.current) {
          typingHeartbeatRef.current = setInterval(() => {
            void onTypingSignal({ typing: true }).catch(() => null);
          }, 2500);
        }
        return;
      }
      if (typingHeartbeatRef.current) {
        clearInterval(typingHeartbeatRef.current);
        typingHeartbeatRef.current = null;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void onTypingSignal({ typing: false }).catch(() => null);
      }
    }, [onTypingSignal, row, typingEnabled]);
    useEffect(
      () => () => {
        if (typingHeartbeatRef.current) {
          clearInterval(typingHeartbeatRef.current);
          typingHeartbeatRef.current = null;
        }
        if (typingActiveRef.current && typeof onTypingSignal === "function") {
          typingActiveRef.current = false;
          void onTypingSignal({ typing: false }).catch(() => null);
        }
      },
      [onTypingSignal]
    );
    const newDataRequestRow = (source) => {
      const item = source || {};
      const label = String(item.label || "").trim();
      const key = String(item.key || "").trim();
      const fieldTypeRaw = String(item.field_type || item.value_type || "string").trim().toLowerCase();
      const fieldType = ["string", "text", "date", "number", "file"].includes(fieldTypeRaw) ? fieldTypeRaw : "string";
      return {
        localId: "row-" + Math.random().toString(36).slice(2),
        id: item.id ? String(item.id) : "",
        topic_template_id: item.topic_template_id ? String(item.topic_template_id) : item.id ? String(item.id) : "",
        key,
        label: label || "\u041F\u043E\u043B\u0435",
        field_type: fieldType,
        document_name: String(item.document_name || "").trim(),
        value_text: item.value_text == null ? "" : String(item.value_text),
        value_file: item.value_file || null,
        is_filled: Boolean(item.is_filled)
      };
    };
    const getRequestDataRowIdentity = (item) => {
      const rowItem = item || {};
      const key = String(rowItem.key || "").trim().toLowerCase();
      if (key) return "key:" + key;
      const tplId = String(rowItem.topic_template_id || rowItem.id || "").trim();
      if (tplId) return "tpl:" + tplId;
      return "label:" + String(rowItem.label || "").trim().toLowerCase();
    };
    const mergeRequestDataRows = (baseRows, incomingRows) => {
      const rows = Array.isArray(baseRows) ? [...baseRows] : [];
      const nextItems = Array.isArray(incomingRows) ? incomingRows : [];
      const seen = new Set(rows.map((rowItem) => getRequestDataRowIdentity(rowItem)));
      nextItems.forEach((rowItem) => {
        const identity = getRequestDataRowIdentity(rowItem);
        if (!identity || seen.has(identity)) return;
        seen.add(identity);
        rows.push(rowItem);
      });
      return rows;
    };
    const openCreateDataRequestModal = async () => {
      if (!canRequestData || typeof onLoadRequestDataTemplates !== "function") return;
      setDataRequestModal((prev) => ({
        ...prev,
        open: true,
        loading: true,
        saving: false,
        savingTemplate: false,
        messageId: "",
        rows: [],
        error: "",
        templateStatus: "",
        requestTemplateQuery: "",
        catalogFieldQuery: "",
        selectedCatalogTemplateId: "",
        selectedRequestTemplateId: "",
        templateName: "",
        documentName: "",
        customLabel: "",
        customType: "string"
      }));
      try {
        const data = await onLoadRequestDataTemplates();
        setDataRequestModal((prev) => ({
          ...prev,
          open: true,
          loading: false,
          templates: Array.isArray(data == null ? void 0 : data.rows) ? data.rows : [],
          templateList: Array.isArray(data == null ? void 0 : data.templates) ? data.templates : [],
          availableDocuments: Array.isArray(data == null ? void 0 : data.documents) ? data.documents : [],
          documentName: "",
          requestTemplateQuery: "",
          catalogFieldQuery: ""
        }));
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D\u044B" }));
      }
    };
    const openEditDataRequestModal = async (messageId) => {
      if (!canRequestData || !messageId) return;
      setDataRequestModal((prev) => ({
        ...prev,
        open: true,
        loading: true,
        saving: false,
        savingTemplate: false,
        messageId: String(messageId),
        rows: [],
        error: "",
        templateStatus: "",
        requestTemplateQuery: "",
        catalogFieldQuery: "",
        selectedCatalogTemplateId: "",
        selectedRequestTemplateId: "",
        templateName: ""
      }));
      try {
        const [batch, templates] = await Promise.all([
          typeof onLoadRequestDataBatch === "function" ? onLoadRequestDataBatch(messageId) : Promise.resolve({ items: [] }),
          typeof onLoadRequestDataTemplates === "function" ? onLoadRequestDataTemplates() : Promise.resolve({ rows: [], documents: [], templates: [] })
        ]);
        setDataRequestModal((prev) => ({
          ...prev,
          open: true,
          loading: false,
          messageId: String(messageId),
          rows: Array.isArray(batch == null ? void 0 : batch.items) ? batch.items.map(newDataRequestRow) : [],
          documentName: String((batch == null ? void 0 : batch.document_name) || ""),
          templates: Array.isArray(templates == null ? void 0 : templates.rows) ? templates.rows : [],
          templateList: Array.isArray(templates == null ? void 0 : templates.templates) ? templates.templates : [],
          availableDocuments: Array.isArray(templates == null ? void 0 : templates.documents) ? templates.documents : [],
          requestTemplateQuery: "",
          catalogFieldQuery: ""
        }));
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441" }));
      }
    };
    const closeDataRequestModal = () => {
      setDataRequestModal((prev) => ({ ...prev, open: false, error: "", saving: false, savingTemplate: false, templateStatus: "" }));
    };
    const findRequestTemplateByQuery = (queryValue) => {
      const query = String(queryValue || "").trim().toLowerCase();
      if (!query) return null;
      return (dataRequestModal.templateList || []).find((item) => {
        const id = String((item == null ? void 0 : item.id) || "").toLowerCase();
        const name = String((item == null ? void 0 : item.name) || "").toLowerCase();
        return query === id || query === name;
      }) || null;
    };
    const findCatalogFieldByQuery = (queryValue) => {
      const query = String(queryValue || "").trim().toLowerCase();
      if (!query) return null;
      return (dataRequestModal.templates || []).find((item) => {
        const id = String((item == null ? void 0 : item.id) || "").toLowerCase();
        const key = String((item == null ? void 0 : item.key) || "").toLowerCase();
        const label = String((item == null ? void 0 : item.label) || "").toLowerCase();
        return query === id || query === key || query === label;
      }) || null;
    };
    const applyRequestTemplateById = async (rawTemplateId, templateNameHint) => {
      if (typeof onLoadRequestDataTemplateDetails !== "function") return;
      const templateId = String(rawTemplateId || "").trim();
      if (!templateId) return;
      setDataRequestModal((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const data = await onLoadRequestDataTemplateDetails(templateId);
        const incomingRows = (Array.isArray(data == null ? void 0 : data.items) ? data.items : []).map(
          (item) => newDataRequestRow({
            ...item,
            topic_template_id: item.topic_data_template_id || item.topic_template_id || "",
            field_type: item.value_type || item.field_type
          })
        );
        setDataRequestModal((prev) => {
          var _a2, _b2;
          return {
            ...prev,
            loading: false,
            rows: mergeRequestDataRows(prev.rows, incomingRows),
            selectedRequestTemplateId: String(((_a2 = data == null ? void 0 : data.template) == null ? void 0 : _a2.id) || prev.selectedRequestTemplateId || ""),
            requestTemplateQuery: String(((_b2 = data == null ? void 0 : data.template) == null ? void 0 : _b2.name) || templateNameHint || prev.requestTemplateQuery || ""),
            templateStatus: ""
          };
        });
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" }));
      }
    };
    const applySelectedRequestTemplate = async () => {
      const selectedByQuery = findRequestTemplateByQuery(dataRequestModal.requestTemplateQuery);
      const templateId = String((selectedByQuery == null ? void 0 : selectedByQuery.id) || dataRequestModal.selectedRequestTemplateId || "").trim();
      return applyRequestTemplateById(templateId, (selectedByQuery == null ? void 0 : selectedByQuery.name) || "");
    };
    const refreshDataRequestCatalog = async () => {
      if (typeof onLoadRequestDataTemplates !== "function") return null;
      const data = await onLoadRequestDataTemplates();
      setDataRequestModal((prev) => ({
        ...prev,
        templates: Array.isArray(data == null ? void 0 : data.rows) ? data.rows : [],
        templateList: Array.isArray(data == null ? void 0 : data.templates) ? data.templates : [],
        availableDocuments: Array.isArray(data == null ? void 0 : data.documents) ? data.documents : [],
        selectedRequestTemplateId: prev.selectedRequestTemplateId && (Array.isArray(data == null ? void 0 : data.templates) ? data.templates : []).some((item) => String(item == null ? void 0 : item.id) === String(prev.selectedRequestTemplateId)) ? prev.selectedRequestTemplateId : ""
      }));
      return data;
    };
    const saveCurrentDataRequestTemplate = async () => {
      if (typeof onSaveRequestDataTemplate !== "function") return;
      const selectedFromQuery = findRequestTemplateByQuery(dataRequestModal.requestTemplateQuery);
      const templateName = String(dataRequestModal.requestTemplateQuery || "").trim();
      const rows = (dataRequestModal.rows || []).filter((row2) => String(row2.label || "").trim());
      if (!templateName) {
        setDataRequestModal((prev) => ({ ...prev, error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u0430" }));
        return;
      }
      if (!rows.length) {
        setDataRequestModal((prev) => ({ ...prev, error: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u043E \u043F\u043E\u043B\u0435 \u0434\u043B\u044F \u0448\u0430\u0431\u043B\u043E\u043D\u0430" }));
        return;
      }
      setDataRequestModal((prev) => ({ ...prev, savingTemplate: true, error: "", templateStatus: "" }));
      try {
        const result = await onSaveRequestDataTemplate({
          template_id: String((selectedFromQuery == null ? void 0 : selectedFromQuery.id) || dataRequestModal.selectedRequestTemplateId || "").trim() || void 0,
          name: templateName,
          items: rows.map((row2) => ({
            topic_data_template_id: row2.topic_template_id || void 0,
            key: row2.key || void 0,
            label: row2.label,
            value_type: row2.field_type || "string"
          }))
        });
        const savedRows = (Array.isArray(result == null ? void 0 : result.items) ? result.items : []).map(
          (item) => newDataRequestRow({
            ...item,
            topic_template_id: item.topic_data_template_id || item.topic_template_id || "",
            field_type: item.value_type || item.field_type
          })
        );
        setDataRequestModal((prev) => {
          var _a2, _b2;
          return {
            ...prev,
            savingTemplate: false,
            rows: savedRows.length ? savedRows : prev.rows,
            selectedRequestTemplateId: String(((_a2 = result == null ? void 0 : result.template) == null ? void 0 : _a2.id) || prev.selectedRequestTemplateId || ""),
            requestTemplateQuery: String(((_b2 = result == null ? void 0 : result.template) == null ? void 0 : _b2.name) || templateName),
            templateStatus: "\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D"
          };
        });
        await refreshDataRequestCatalog();
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, savingTemplate: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" }));
      }
    };
    const addSelectedTemplateRow = () => {
      const selectedByQuery = findCatalogFieldByQuery(dataRequestModal.catalogFieldQuery);
      const templateId = String((selectedByQuery == null ? void 0 : selectedByQuery.id) || dataRequestModal.selectedCatalogTemplateId || "").trim();
      const template = (dataRequestModal.templates || []).find((item) => String(item.id) === templateId);
      if (!template) {
        const manualLabel = String(dataRequestModal.catalogFieldQuery || "").trim();
        if (!manualLabel) return;
        setDataRequestModal((prev) => ({
          ...prev,
          catalogFieldQuery: "",
          templateStatus: "",
          rows: [...prev.rows || [], newDataRequestRow({ label: manualLabel, field_type: "string" })]
        }));
        return;
      }
      setDataRequestModal((prev) => {
        const exists = (prev.rows || []).some((row2) => String(row2.key || "") === String(template.key || ""));
        if (exists) return { ...prev, selectedCatalogTemplateId: "", catalogFieldQuery: "" };
        return {
          ...prev,
          selectedCatalogTemplateId: "",
          catalogFieldQuery: "",
          templateStatus: "",
          rows: [...prev.rows || [], newDataRequestRow({ ...template, topic_template_id: template.id, field_type: template.value_type })]
        };
      });
    };
    const updateDataRequestRow = (localId, patch) => {
      setDataRequestModal((prev) => ({
        ...prev,
        templateStatus: "",
        rows: (prev.rows || []).map((row2) => row2.localId === localId ? { ...row2, ...patch || {} } : row2)
      }));
    };
    const removeDataRequestRow = (localId) => {
      setDataRequestModal((prev) => ({
        ...prev,
        templateStatus: "",
        rows: (prev.rows || []).filter((row2) => row2.localId !== localId)
      }));
    };
    const moveDataRequestRow = (localId, delta) => {
      const shift = Number(delta) || 0;
      if (!shift) return;
      setDataRequestModal((prev) => {
        const rows = Array.isArray(prev.rows) ? [...prev.rows] : [];
        const index = rows.findIndex((row2) => row2.localId === localId);
        if (index < 0) return prev;
        const nextIndex = index + shift;
        if (nextIndex < 0 || nextIndex >= rows.length) return prev;
        const [item] = rows.splice(index, 1);
        rows.splice(nextIndex, 0, item);
        return { ...prev, templateStatus: "", rows };
      });
    };
    const moveDataRequestRowToIndex = (localId, targetIndexRaw) => {
      const targetIndex = Number(targetIndexRaw);
      if (!Number.isInteger(targetIndex)) return;
      setDataRequestModal((prev) => {
        const rows = Array.isArray(prev.rows) ? [...prev.rows] : [];
        const fromIndex = rows.findIndex((rowItem) => rowItem.localId === localId);
        if (fromIndex < 0) return prev;
        const boundedIndex = Math.max(0, Math.min(rows.length - 1, targetIndex));
        if (fromIndex === boundedIndex) return prev;
        const [item] = rows.splice(fromIndex, 1);
        rows.splice(boundedIndex, 0, item);
        return { ...prev, templateStatus: "", rows };
      });
    };
    const submitDataRequestModal = async () => {
      if (typeof onSaveRequestDataBatch !== "function") return;
      const rows = (dataRequestModal.rows || []).filter((row2) => String(row2.label || "").trim());
      if (!rows.length) {
        setDataRequestModal((prev) => ({ ...prev, error: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u043E \u043F\u043E\u043B\u0435" }));
        return;
      }
      setDataRequestModal((prev) => ({ ...prev, saving: true, error: "" }));
      try {
        await onSaveRequestDataBatch({
          message_id: dataRequestModal.messageId || void 0,
          items: rows.map((row2) => ({
            id: row2.id || void 0,
            topic_template_id: row2.topic_template_id || void 0,
            key: row2.key || void 0,
            label: row2.label,
            field_type: row2.field_type || "string",
            document_name: row2.document_name || void 0
          }))
        });
        closeDataRequestModal();
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, saving: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441" }));
      }
    };
    const closeClientDataModal = () => {
      setClientDataModal({
        open: false,
        loading: false,
        saving: false,
        messageId: "",
        items: [],
        status: "",
        error: ""
      });
    };
    const openClientDataRequestModal = async (messageId) => {
      if (!canFillRequestData || typeof onLoadRequestDataBatch !== "function" || !messageId) return;
      setClientDataModal({
        open: true,
        loading: true,
        saving: false,
        messageId: String(messageId),
        items: [],
        status: "",
        error: ""
      });
      try {
        const data = await onLoadRequestDataBatch(String(messageId));
        const items = Array.isArray(data == null ? void 0 : data.items) ? data.items.slice().sort((a, b) => Number((a == null ? void 0 : a.sort_order) || 0) - Number((b == null ? void 0 : b.sort_order) || 0)).map((item, index) => ({
          localId: "client-data-" + String((item == null ? void 0 : item.id) || (item == null ? void 0 : item.key) || index),
          id: String((item == null ? void 0 : item.id) || ""),
          key: String((item == null ? void 0 : item.key) || ""),
          label: String((item == null ? void 0 : item.label) || (item == null ? void 0 : item.key) || "\u041F\u043E\u043B\u0435"),
          field_type: String((item == null ? void 0 : item.field_type) || "string").toLowerCase(),
          value_text: (item == null ? void 0 : item.value_text) == null ? "" : String(item.value_text),
          value_file: (item == null ? void 0 : item.value_file) || null,
          pendingFile: null
        })) : [];
        setClientDataModal((prev) => ({ ...prev, loading: false, items }));
      } catch (error) {
        setClientDataModal((prev) => ({ ...prev, loading: false, error: (error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441 \u0434\u0430\u043D\u043D\u044B\u0445" }));
      }
    };
    const updateClientDataItem = (localId, patch) => {
      setClientDataModal((prev) => ({
        ...prev,
        status: "",
        error: "",
        items: (prev.items || []).map((item) => item.localId === localId ? { ...item, ...patch || {} } : item)
      }));
    };
    const submitClientDataModal = async (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!canFillRequestData || typeof onSaveRequestDataValues !== "function") return;
      const currentMessageId = String(clientDataModal.messageId || "").trim();
      if (!currentMessageId) return;
      setClientDataModal((prev) => ({ ...prev, saving: true, status: "", error: "" }));
      try {
        const payloadItems = [];
        for (const item of clientDataModal.items || []) {
          const fieldType = String((item == null ? void 0 : item.field_type) || "string").toLowerCase();
          if (fieldType === "file") {
            let attachmentId = String((item == null ? void 0 : item.value_text) || "").trim();
            if (item == null ? void 0 : item.pendingFile) {
              if (typeof onUploadRequestAttachment !== "function") {
                throw new Error("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0444\u0430\u0439\u043B\u0430 \u0434\u043B\u044F \u043F\u043E\u043B\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430");
              }
              const uploadResult = await onUploadRequestAttachment(item.pendingFile, {
                source: "data_request",
                message_id: currentMessageId,
                key: String((item == null ? void 0 : item.key) || "")
              });
              attachmentId = String(
                uploadResult && (uploadResult.attachment_id || uploadResult.id || uploadResult.value || uploadResult) || ""
              ).trim();
              if (!attachmentId) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0434\u043B\u044F \u043F\u043E\u043B\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u0430");
            }
            payloadItems.push({
              id: String((item == null ? void 0 : item.id) || ""),
              key: String((item == null ? void 0 : item.key) || ""),
              attachment_id: attachmentId || "",
              value_text: attachmentId || ""
            });
            continue;
          }
          payloadItems.push({
            id: String((item == null ? void 0 : item.id) || ""),
            key: String((item == null ? void 0 : item.key) || ""),
            value_text: String((item == null ? void 0 : item.value_text) || "")
          });
        }
        await onSaveRequestDataValues({
          message_id: currentMessageId,
          items: payloadItems
        });
        closeClientDataModal();
      } catch (error) {
        setClientDataModal((prev) => ({
          ...prev,
          saving: false,
          error: (error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435"
        }));
      }
    };
    const handleRequestRowDragStart = (event, rowItem, rowLocked) => {
      if (rowLocked || dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate) {
        event.preventDefault();
        return;
      }
      setDraggedRequestRowId(String(rowItem.localId || ""));
      setDragOverRequestRowId(String(rowItem.localId || ""));
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(rowItem.localId || ""));
      } catch (_error) {
      }
    };
    const handleRequestRowDragEnd = () => {
      setDraggedRequestRowId("");
      setDragOverRequestRowId("");
    };
    const appendStatusChangeFiles = (files) => {
      const list = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!list.length) return;
      setStatusChangeModal((prev) => {
        const existing = Array.isArray(prev.files) ? prev.files : [];
        const next = [...existing];
        list.forEach((file) => {
          const duplicate = next.some(
            (item) => item && item.name === file.name && Number(item.size || 0) === Number(file.size || 0) && Number(item.lastModified || 0) === Number(file.lastModified || 0)
          );
          if (!duplicate) next.push(file);
        });
        return { ...prev, files: next };
      });
    };
    const removeStatusChangeFile = (index) => {
      setStatusChangeModal((prev) => {
        const files = Array.isArray(prev.files) ? [...prev.files] : [];
        files.splice(index, 1);
        return { ...prev, files };
      });
    };
    const submitStatusChange = async (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!(row == null ? void 0 : row.id) || typeof onChangeStatus !== "function") return;
      const nextStatus = String(statusChangeModal.statusCode || "").trim();
      if (!nextStatus) {
        setStatusChangeModal((prev) => ({ ...prev, error: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441" }));
        return;
      }
      if (nextStatus === String((row == null ? void 0 : row.status_code) || "").trim()) {
        setStatusChangeModal((prev) => ({ ...prev, error: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441, \u043E\u0442\u043B\u0438\u0447\u043D\u044B\u0439 \u043E\u0442 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E" }));
        return;
      }
      setStatusChangeModal((prev) => ({ ...prev, saving: true, error: "" }));
      try {
        const localValue = String(statusChangeModal.importantDateAt || "").trim();
        const importantDateIso = localValue ? new Date(localValue).toISOString() : "";
        await onChangeStatus({
          requestId: String(row.id),
          statusCode: nextStatus,
          importantDateAt: importantDateIso || null,
          comment: statusChangeModal.comment || "",
          files: statusChangeModal.files || []
        });
        closeStatusChangeModal();
      } catch (error) {
        setStatusChangeModal((prev) => ({ ...prev, saving: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441" }));
      }
    };
    const chatTimelineItems = [];
    let previousDate = "";
    const timelineSource = [];
    safeMessages.forEach((item) => {
      timelineSource.push({
        type: "message",
        key: "msg-" + String((item == null ? void 0 : item.id) || Math.random()),
        created_at: (item == null ? void 0 : item.created_at) || null,
        payload: item
      });
    });
    safeAttachments.filter((item) => !String((item == null ? void 0 : item.message_id) || "").trim()).forEach((item) => {
      timelineSource.push({
        type: "file",
        key: "file-" + String((item == null ? void 0 : item.id) || Math.random()),
        created_at: (item == null ? void 0 : item.created_at) || null,
        payload: item
      });
    });
    timelineSource.sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
      if (!Number.isFinite(aTime)) return 1;
      if (!Number.isFinite(bTime)) return -1;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.key).localeCompare(String(b.key), "ru");
    });
    timelineSource.forEach((entry, index) => {
      const dateLabel = fmtDateOnly(entry.created_at);
      const normalizedDate = dateLabel && dateLabel !== "-" ? dateLabel : "\u0411\u0435\u0437 \u0434\u0430\u0442\u044B";
      if (normalizedDate !== previousDate) {
        chatTimelineItems.push({ type: "date", key: "date-" + normalizedDate + "-" + index, label: normalizedDate });
        previousDate = normalizedDate;
      }
      chatTimelineItems.push(entry);
    });
    useEffect(() => {
      if (chatTab !== "chat") return;
      const listNode = chatListRef.current;
      if (!listNode) return;
      const cursor = String(localActivityCursor || "");
      if (!cursor || cursor === lastAutoScrollCursorRef.current) return;
      lastAutoScrollCursorRef.current = cursor;
      const raf = window.requestAnimationFrame(() => {
        if (!chatListRef.current) return;
        chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      });
      return () => window.cancelAnimationFrame(raf);
    }, [chatTab, localActivityCursor]);
    const baseRouteNodes = Array.isArray(statusRouteNodes) && statusRouteNodes.length ? statusRouteNodes : (row == null ? void 0 : row.status_code) ? [{ code: row.status_code, name: String((row == null ? void 0 : row.status_name) || statusLabel(row.status_code) || row.status_code), state: "current", note: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u044D\u0442\u0430\u043F \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u0437\u0430\u044F\u0432\u043A\u0438" }] : [];
    const upcomingImportantDate = useMemo(() => {
      const source = String(currentImportantDateAt || (row == null ? void 0 : row.important_date_at) || "").trim();
      if (!source) return "";
      const timestamp = new Date(source).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return "";
      return new Date(timestamp).toISOString();
    }, [currentImportantDateAt, row == null ? void 0 : row.important_date_at]);
    const routeNodes = useMemo(() => {
      if (viewerRoleCode !== "CLIENT" && viewerRoleCode !== "LAWYER" || !upcomingImportantDate) return baseRouteNodes;
      if (!Array.isArray(baseRouteNodes) || !baseRouteNodes.length) {
        return [
          {
            code: "__IMPORTANT_DATE__",
            name: "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430",
            state: "pending",
            changed_at: upcomingImportantDate,
            note: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u043E\u043A"
          }
        ];
      }
      const hasVirtualNode = baseRouteNodes.some((node) => String((node == null ? void 0 : node.code) || "").trim() === "__IMPORTANT_DATE__");
      if (hasVirtualNode) return baseRouteNodes;
      const currentIndex = baseRouteNodes.findIndex((node) => String((node == null ? void 0 : node.state) || "").trim().toLowerCase() === "current");
      const virtualNode = {
        code: "__IMPORTANT_DATE__",
        name: "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430",
        state: "pending",
        changed_at: upcomingImportantDate,
        note: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u043E\u043A"
      };
      if (currentIndex < 0) return [...baseRouteNodes, virtualNode];
      const next = [...baseRouteNodes];
      next.splice(currentIndex + 1, 0, virtualNode);
      return next;
    }, [baseRouteNodes, upcomingImportantDate, viewerRoleCode]);
    const routeNodesForDisplay = useMemo(() => {
      if (!Array.isArray(routeNodes) || !routeNodes.length) return [];
      const important = [];
      const current = [];
      const completed = [];
      const pending = [];
      routeNodes.forEach((node) => {
        const code = String((node == null ? void 0 : node.code) || "").trim();
        const state = String((node == null ? void 0 : node.state) || "pending").trim().toLowerCase();
        if (code === "__IMPORTANT_DATE__") {
          important.push(node);
          return;
        }
        if (state === "current") {
          current.push(node);
          return;
        }
        if (state === "completed") {
          completed.push(node);
          return;
        }
        pending.push(node);
      });
      return [...important, ...current, ...completed.reverse(), ...pending];
    }, [routeNodes]);
    const AttachmentPreviewModal = AttachmentPreviewModalComponent;
    const StatusLine = StatusLineComponent;
    const resolveMessageReceiptState = (payload) => {
      const authorType = String((payload == null ? void 0 : payload.author_type) || "").trim().toUpperCase();
      const isClientAuthor = authorType === "CLIENT";
      const deliveredAt = isClientAuthor ? payload == null ? void 0 : payload.delivered_to_staff_at : payload == null ? void 0 : payload.delivered_to_client_at;
      const readAt = isClientAuthor ? payload == null ? void 0 : payload.read_by_staff_at : payload == null ? void 0 : payload.read_by_client_at;
      if (readAt) return { state: "read", label: "\u041F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E" };
      if (deliveredAt) return { state: "delivered", label: "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E" };
      return { state: "sent", label: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E" };
    };
    const isOutgoingForViewer = (payload) => {
      const authorType = String((payload == null ? void 0 : payload.author_type) || "").trim().toUpperCase();
      if (!authorType) return false;
      if (viewerRoleCode === "CLIENT") return authorType === "CLIENT";
      return authorType !== "CLIENT";
    };
    const renderMessageMeta = (payload) => {
      const timeLabel = fmtTimeOnly(payload == null ? void 0 : payload.created_at);
      if (!isOutgoingForViewer(payload)) return /* @__PURE__ */ React.createElement("div", { className: "chat-message-time" }, timeLabel);
      const receipt = resolveMessageReceiptState(payload);
      return /* @__PURE__ */ React.createElement("div", { className: "chat-message-meta" }, /* @__PURE__ */ React.createElement("div", { className: "chat-message-time" }, timeLabel), /* @__PURE__ */ React.createElement("span", { className: "chat-message-status " + receipt.state, title: receipt.label, "aria-label": receipt.label }, /* @__PURE__ */ React.createElement("span", { className: "chat-message-status-check first", "aria-hidden": "true" }, "\u2713"), receipt.state !== "sent" ? /* @__PURE__ */ React.createElement("span", { className: "chat-message-status-check second", "aria-hidden": "true" }, "\u2713") : null));
    };
    const renderRequestDataMessageItems = (payload) => {
      var _a2;
      const items = Array.isArray(payload == null ? void 0 : payload.request_data_items) ? payload.request_data_items : [];
      const allFilled = Boolean(payload == null ? void 0 : payload.request_data_all_filled);
      if (!items.length) return /* @__PURE__ */ React.createElement("p", { className: "chat-message-text" }, "\u0417\u0430\u043F\u0440\u043E\u0441");
      if (allFilled) {
        const fileOnly = items.length === 1 && String(((_a2 = items[0]) == null ? void 0 : _a2.field_type) || "").toLowerCase() === "file";
        return /* @__PURE__ */ React.createElement("p", { className: "chat-message-text chat-request-data-collapsed" }, fileOnly ? "\u0424\u0430\u0439\u043B" : "\u0417\u0430\u043F\u043E\u043B\u043D\u0435\u043D");
      }
      const visibleItems = items.slice(0, 7);
      const hiddenCount = Math.max(0, items.length - visibleItems.length);
      return /* @__PURE__ */ React.createElement("div", { className: "chat-request-data-list" }, visibleItems.map((item, idx) => /* @__PURE__ */ React.createElement("div", { className: "chat-request-data-item" + ((item == null ? void 0 : item.is_filled) ? " filled" : ""), key: String((item == null ? void 0 : item.id) || idx) }, /* @__PURE__ */ React.createElement("span", { className: "chat-request-data-index" }, (item == null ? void 0 : item.is_filled) ? /* @__PURE__ */ React.createElement("span", { className: "chat-request-data-check" }, "\u2713") : null, String((item == null ? void 0 : item.index) || idx + 1) + "."), /* @__PURE__ */ React.createElement("span", { className: "chat-request-data-label" }, String((item == null ? void 0 : item.label_short) || (item == null ? void 0 : item.label) || "\u041F\u043E\u043B\u0435")))), hiddenCount > 0 ? /* @__PURE__ */ React.createElement("div", { className: "chat-request-data-more" }, "... \u0435\u0449\u0435 ", hiddenCount) : null);
    };
    const resolveServiceMessageContent = (payload) => {
      const messageKind = String((payload == null ? void 0 : payload.message_kind) || "");
      if (messageKind === "REQUEST_DATA") return null;
      const bodyRaw = String((payload == null ? void 0 : payload.body) || "").replace(/\r/g, "").trim();
      if (!bodyRaw) return null;
      const lines = bodyRaw.split("\n");
      const firstLine = String(lines[0] || "").trim();
      const restLines = lines.slice(1);
      const normalizeDetail = (value) => String(value || "").trim();
      const withTail = (firstDetail) => [normalizeDetail(firstDetail), ...restLines.map((line) => normalizeDetail(line)).filter(Boolean)].filter(Boolean).join("\n");
      if (firstLine === "\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443" || firstLine.startsWith("\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443:")) {
        return {
          title: "\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443",
          text: withTail(firstLine.startsWith("\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443:") ? firstLine.slice("\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443:".length) : "")
        };
      }
      if (firstLine.startsWith("\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441:") || firstLine.startsWith("\u0421\u043C\u0435\u043D\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0430:")) {
        const source = firstLine.startsWith("\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441:") ? firstLine : firstLine.slice("\u0421\u043C\u0435\u043D\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0430:".length);
        const detail = firstLine.startsWith("\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441:") ? source.slice("\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441:".length) : source;
        return {
          title: "\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441",
          text: withTail(detail)
        };
      }
      if (firstLine.startsWith("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442:")) {
        return {
          title: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442",
          text: withTail(firstLine.slice("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442:".length))
        };
      }
      if (firstLine.startsWith("\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E:")) {
        return {
          title: "\u0421\u043C\u0435\u043D\u0430 \u044E\u0440\u0438\u0441\u0442\u0430",
          text: withTail(firstLine.slice("\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E:".length))
        };
      }
      if (firstLine.startsWith("\u0421\u043C\u0435\u043D\u0430 \u044E\u0440\u0438\u0441\u0442\u0430:")) {
        return {
          title: "\u0421\u043C\u0435\u043D\u0430 \u044E\u0440\u0438\u0441\u0442\u0430",
          text: withTail(firstLine.slice("\u0421\u043C\u0435\u043D\u0430 \u044E\u0440\u0438\u0441\u0442\u0430:".length))
        };
      }
      if (firstLine.startsWith("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u044E\u0440\u0438\u0441\u0442\u0430:")) {
        return {
          title: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442",
          text: withTail(firstLine.slice("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u044E\u0440\u0438\u0441\u0442\u0430:".length))
        };
      }
      if (firstLine.startsWith("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435:")) {
        return {
          title: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442",
          text: withTail(firstLine.slice("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435:".length))
        };
      }
      if (firstLine.startsWith("\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435:")) {
        return {
          title: "\u0421\u043C\u0435\u043D\u0430 \u044E\u0440\u0438\u0441\u0442\u0430",
          text: withTail(firstLine.slice("\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435:".length))
        };
      }
      return null;
    };
    const resolveStatusDisplayName = (code, explicitName) => {
      var _a2;
      const explicit = String(explicitName || "").trim();
      if (explicit) return explicit;
      const normalizedCode = String(code || "").trim();
      if (!normalizedCode) return "-";
      const optionName = String(((_a2 = statusByCode.get(normalizedCode)) == null ? void 0 : _a2.name) || "").trim();
      if (optionName) return optionName;
      const legacyName = String(statusLabel(normalizedCode) || "").trim();
      if (legacyName && legacyName !== normalizedCode) return legacyName;
      return humanizeKey(normalizedCode);
    };
    const formatRequestDataValue = (item) => {
      const type = String((item == null ? void 0 : item.field_type) || "string").toLowerCase();
      if (type === "date") {
        const text2 = String((item == null ? void 0 : item.value_text) || "").trim();
        return text2 ? fmtDateOnly(text2) : "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E";
      }
      if (type === "file") {
        const attachmentId = String((item == null ? void 0 : item.value_text) || "").trim();
        const linkedAttachment = attachmentId ? attachmentById.get(attachmentId) : null;
        const fileMeta = (item == null ? void 0 : item.value_file) || (linkedAttachment ? {
          attachment_id: linkedAttachment.id,
          file_name: linkedAttachment.file_name,
          mime_type: linkedAttachment.mime_type,
          size_bytes: linkedAttachment.size_bytes,
          download_url: linkedAttachment.download_url
        } : null);
        return fileMeta || null;
      }
      const text = String((item == null ? void 0 : item.value_text) || "").trim();
      return text || "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E";
    };
    const currentStatusName = resolveStatusDisplayName(row == null ? void 0 : row.status_code, (row == null ? void 0 : row.status_name) || "");
    const dataRequestProgress = useMemo(() => {
      const rows = Array.isArray(dataRequestModal.rows) ? dataRequestModal.rows : [];
      const total = rows.length;
      const filled = rows.filter((rowItem) => Boolean((rowItem == null ? void 0 : rowItem.is_filled) || String((rowItem == null ? void 0 : rowItem.value_text) || "").trim())).length;
      return { total, filled };
    }, [dataRequestModal.rows]);
    return /* @__PURE__ */ React.createElement("div", { className: "block" }, /* @__PURE__ */ React.createElement("div", { className: "request-workspace-layout" }, /* @__PURE__ */ React.createElement("div", { className: "request-main-column" }, /* @__PURE__ */ React.createElement("div", { className: "block" }, /* @__PURE__ */ React.createElement("div", { className: "request-card-head" }, /* @__PURE__ */ React.createElement("h3", null, "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430"), /* @__PURE__ */ React.createElement("div", { className: "request-card-head-actions" }, canRequestData ? /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "icon-btn request-card-status-btn",
        "data-tooltip": "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441",
        "aria-label": "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441",
        onClick: () => openStatusChangeModal(),
        disabled: loading || !row
      },
      "\u21C4"
    ) : null, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "icon-btn request-card-data-btn",
        "data-tooltip": "\u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438",
        "aria-label": "\u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438",
        onClick: () => setRequestDataListOpen(true),
        disabled: loading || !row
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement("path", { d: "M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h10v2H4v-2Z", fill: "currentColor" }))
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "icon-btn request-card-finance-btn",
        "data-tooltip": "\u0424\u0438\u043D\u0430\u043D\u0441\u044B \u0437\u0430\u044F\u0432\u043A\u0438",
        "aria-label": "\u0424\u0438\u043D\u0430\u043D\u0441\u044B \u0437\u0430\u044F\u0432\u043A\u0438",
        onClick: () => setFinanceOpen(true),
        disabled: loading || !row
      },
      "$"
    ))), /* @__PURE__ */ React.createElement("div", { className: "request-card-head-spacer", "aria-hidden": "true" }), loading ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...") : row ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "request-card-grid request-card-grid-compact" }, showTopicStatusInCard ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0422\u0435\u043C\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, String(row.topic_name || row.topic_code || "-"))), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u0442\u0430\u0442\u0443\u0441"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, currentStatusName))) : null, /* @__PURE__ */ React.createElement("div", { className: "request-field request-field-span-2 request-field-description" }, /* @__PURE__ */ React.createElement("div", { className: "request-field-head" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B"), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "icon-btn request-field-expand-btn",
        "data-tooltip": "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435",
        "aria-label": "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435",
        onClick: () => setDescriptionOpen(true)
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M4 9V4h5v2H6v3H4zm10-5h6v6h-2V6h-4V4zM4 15h2v3h3v2H4v-5zm14 3v-3h2v5h-5v-2h3z",
          fill: "currentColor"
        }
      ))
    )), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, row.description ? String(row.description) : "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E")), showContactsInCard ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041A\u043B\u0438\u0435\u043D\u0442"), /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "request-field-value" + (clientHasPhone ? " has-tooltip request-contact-value" : ""),
        "data-tooltip": clientHasPhone ? clientPhone : void 0
      },
      clientLabel
    )), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u042E\u0440\u0438\u0441\u0442"), /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "request-field-value" + (lawyerHasPhone ? " has-tooltip request-contact-value" : ""),
        "data-tooltip": lawyerHasPhone ? lawyerPhone : void 0
      },
      lawyerLabel
    ))) : null, canSeeCreatedUpdatedInCard ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u043E\u0437\u0434\u0430\u043D\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime(row.created_at))), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime(row.updated_at)))) : null), /* @__PURE__ */ React.createElement("div", { className: "request-status-route" }, /* @__PURE__ */ React.createElement("h4", null, "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432"), routeNodesForDisplay.length ? /* @__PURE__ */ React.createElement("ol", { className: "request-route-list", id: "request-status-route" }, routeNodesForDisplay.map((node, index) => {
      const state = String((node == null ? void 0 : node.state) || "pending");
      const code = String((node == null ? void 0 : node.code) || "").trim();
      const rawName = String((node == null ? void 0 : node.name) || "").trim();
      const name = resolveStatusDisplayName(code, rawName && rawName !== code ? rawName : "");
      const note = String((node == null ? void 0 : node.note) || "").trim();
      const isImportantDateNode = code === "__IMPORTANT_DATE__";
      const changedAtSource = String((node == null ? void 0 : node.changed_at) || "").trim() || (isImportantDateNode ? String(currentImportantDateAt || (row == null ? void 0 : row.important_date_at) || "").trim() : "");
      const changedAt = changedAtSource ? fmtDate(changedAtSource) : "";
      const className = "route-item " + (state === "current" ? "current" : state === "completed" ? "completed" : "pending") + (isImportantDateNode ? " important-date" : "");
      return /* @__PURE__ */ React.createElement("li", { className, key: ((node == null ? void 0 : node.code) || "node") + "-" + index }, /* @__PURE__ */ React.createElement("span", { className: "route-dot" }), /* @__PURE__ */ React.createElement("div", { className: "route-body" }, /* @__PURE__ */ React.createElement("b", null, name), isImportantDateNode ? /* @__PURE__ */ React.createElement("p", null, "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u043E\u043A: " + (changedAt || "-")) : /* @__PURE__ */ React.createElement(React.Fragment, null, note ? /* @__PURE__ */ React.createElement("p", null, note) : null, /* @__PURE__ */ React.createElement("div", { className: "muted route-time" }, "\u0414\u0430\u0442\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F: ", changedAt || "-"))));
    })) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432 \u0434\u043B\u044F \u0442\u0435\u043C\u044B \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D"))) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435"))), /* @__PURE__ */ React.createElement("div", { className: "block request-chat-block" }, /* @__PURE__ */ React.createElement("div", { className: "request-chat-head" }, /* @__PURE__ */ React.createElement("h3", null, "\u041A\u043E\u043C\u043C\u0443\u043D\u0438\u043A\u0430\u0446\u0438\u044F"), /* @__PURE__ */ React.createElement("div", { className: "request-chat-tabs", role: "tablist", "aria-label": "\u041A\u043E\u043C\u043C\u0443\u043D\u0438\u043A\u0430\u0446\u0438\u044F" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": chatTab === "chat",
        className: "tab-btn" + (chatTab === "chat" ? " active" : ""),
        onClick: () => setChatTab("chat")
      },
      "\u0427\u0430\u0442"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": chatTab === "files",
        className: "tab-btn" + (chatTab === "files" ? " active" : ""),
        onClick: () => setChatTab("files")
      },
      "\u0424\u0430\u0439\u043B\u044B" + (safeAttachments.length ? " (" + safeAttachments.length + ")" : "")
    ))), /* @__PURE__ */ React.createElement("div", { className: "request-chat-live-row", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("span", { className: "chat-live-dot" + (liveMode === "degraded" ? " degraded" : "") }), /* @__PURE__ */ React.createElement("span", { className: "request-chat-live-text" }, typingHintText || (liveMode === "degraded" ? "\u0421\u0432\u044F\u0437\u044C \u043D\u0435\u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u0430, \u0432\u043A\u043B\u044E\u0447\u0435\u043D backoff" : "\u041E\u043D\u043B\u0430\u0439\u043D"))), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: idMap.fileInput,
        ref: fileInputRef,
        type: "file",
        multiple: true,
        onChange: onInputFiles,
        disabled: loading || fileUploading,
        style: { position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }
      }
    ), chatTab === "chat" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("ul", { className: "simple-list request-modal-list request-chat-list", id: idMap.messagesList, ref: chatListRef }, chatTimelineItems.length ? chatTimelineItems.map(
      (entry) => {
        var _a2, _b2, _c2, _d, _e;
        return entry.type === "date" ? /* @__PURE__ */ React.createElement("li", { key: entry.key, className: "chat-date-divider" }, /* @__PURE__ */ React.createElement("span", null, entry.label)) : entry.type === "file" ? /* @__PURE__ */ React.createElement(
          "li",
          {
            key: entry.key,
            className: "chat-message " + (String(((_a2 = entry.payload) == null ? void 0 : _a2.responsible) || "").toUpperCase().includes("\u041A\u041B\u0418\u0415\u041D\u0422") ? "incoming" : "outgoing")
          },
          /* @__PURE__ */ React.createElement("div", { className: "chat-message-author" }, String(((_b2 = entry.payload) == null ? void 0 : _b2.responsible) || "\u0421\u0438\u0441\u0442\u0435\u043C\u0430")),
          /* @__PURE__ */ React.createElement("div", { className: "chat-message-bubble" }, /* @__PURE__ */ React.createElement("div", { className: "chat-message-files" }, /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "chat-message-file-chip",
              onClick: () => openAttachmentFromMessage(entry.payload),
              title: String(((_c2 = entry.payload) == null ? void 0 : _c2.file_name) || "\u0424\u0430\u0439\u043B")
            },
            /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"),
            /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(((_d = entry.payload) == null ? void 0 : _d.file_name) || "\u0424\u0430\u0439\u043B"))
          )), /* @__PURE__ */ React.createElement("div", { className: "chat-message-time" }, fmtTimeOnly((_e = entry.payload) == null ? void 0 : _e.created_at)))
        ) : (() => {
          var _a3, _b3, _c3, _d2, _e2, _f, _g, _h;
          const messageKind = String(((_a3 = entry.payload) == null ? void 0 : _a3.message_kind) || "");
          const isRequestDataMessage = messageKind === "REQUEST_DATA";
          const serviceMessageContent = resolveServiceMessageContent(entry.payload);
          const requestDataInteractive = isRequestDataMessage && (canRequestData || canFillRequestData);
          const bubbleClass = "chat-message-bubble" + (isRequestDataMessage ? " chat-request-data-bubble" : "") + (((_b3 = entry.payload) == null ? void 0 : _b3.request_data_all_filled) ? " all-filled" : "") + (isRequestDataMessage && canFillRequestData ? " request-data-message-btn" : "");
          const itemClass = "chat-message " + (String(((_c3 = entry.payload) == null ? void 0 : _c3.author_type) || "").toUpperCase() === "CLIENT" ? "incoming" : "outgoing") + (isRequestDataMessage && canFillRequestData ? " request-data-item" + (((_d2 = entry.payload) == null ? void 0 : _d2.request_data_all_filled) ? " done" : "") : "");
          return /* @__PURE__ */ React.createElement("li", { key: entry.key, className: itemClass }, /* @__PURE__ */ React.createElement("div", { className: "chat-message-author" }, String(((_e2 = entry.payload) == null ? void 0 : _e2.author_name) || ((_f = entry.payload) == null ? void 0 : _f.author_type) || "\u0421\u0438\u0441\u0442\u0435\u043C\u0430")), /* @__PURE__ */ React.createElement(
            "div",
            {
              className: bubbleClass,
              onClick: requestDataInteractive ? () => {
                var _a4, _b4;
                return canRequestData ? openEditDataRequestModal(String(((_a4 = entry.payload) == null ? void 0 : _a4.id) || "")) : openClientDataRequestModal(String(((_b4 = entry.payload) == null ? void 0 : _b4.id) || ""));
              } : void 0,
              role: requestDataInteractive ? "button" : void 0,
              tabIndex: requestDataInteractive ? 0 : void 0,
              onKeyDown: requestDataInteractive ? (event) => {
                var _a4, _b4;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (canRequestData) openEditDataRequestModal(String(((_a4 = entry.payload) == null ? void 0 : _a4.id) || ""));
                  else openClientDataRequestModal(String(((_b4 = entry.payload) == null ? void 0 : _b4.id) || ""));
                }
              } : void 0
            },
            String(((_g = entry.payload) == null ? void 0 : _g.message_kind) || "") === "REQUEST_DATA" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "chat-request-data-head" }, "\u0417\u0430\u043F\u0440\u043E\u0441"), renderRequestDataMessageItems(entry.payload)) : /* @__PURE__ */ React.createElement(React.Fragment, null, (serviceMessageContent == null ? void 0 : serviceMessageContent.title) ? /* @__PURE__ */ React.createElement("div", { className: "chat-service-head" }, serviceMessageContent.title) : null, serviceMessageContent ? serviceMessageContent.text ? /* @__PURE__ */ React.createElement("p", { className: "chat-message-text" }, serviceMessageContent.text) : null : /* @__PURE__ */ React.createElement("p", { className: "chat-message-text" }, String(((_h = entry.payload) == null ? void 0 : _h.body) || ""))),
            (() => {
              var _a4, _b4;
              if (String(((_a4 = entry.payload) == null ? void 0 : _a4.message_kind) || "") === "REQUEST_DATA") return null;
              const messageId = String(((_b4 = entry.payload) == null ? void 0 : _b4.id) || "").trim();
              if (!messageId) return null;
              const messageFiles = attachmentsByMessageId.get(messageId) || [];
              if (!messageFiles.length) return null;
              return /* @__PURE__ */ React.createElement("div", { className: "chat-message-files" }, messageFiles.map((file) => /* @__PURE__ */ React.createElement(
                "button",
                {
                  type: "button",
                  key: String(file.id),
                  className: "chat-message-file-chip",
                  onClick: () => openAttachmentFromMessage(file),
                  title: String(file.file_name || "\u0424\u0430\u0439\u043B")
                },
                /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"),
                /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(file.file_name || "\u0424\u0430\u0439\u043B"))
              )));
            })(),
            renderMessageMeta(entry.payload)
          ));
        })();
      }
    ) : /* @__PURE__ */ React.createElement("li", { className: "muted chat-empty-state" }, "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u043D\u0435\u0442")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit: onSendMessage }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "field request-chat-composer-dropzone" + (dropActive ? " drag-active" : ""),
        onDragOver: (event) => {
          event.preventDefault();
          setDropActive(true);
        },
        onDragLeave: (event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          setDropActive(false);
        },
        onDrop: onDropFiles
      },
      /* @__PURE__ */ React.createElement("label", { htmlFor: idMap.messageBody }, "\u041D\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435"),
      /* @__PURE__ */ React.createElement(
        "textarea",
        {
          id: idMap.messageBody,
          placeholder: messagePlaceholder,
          value: messageDraft,
          onChange: onMessageChange,
          onFocus: () => setComposerFocused(true),
          onBlur: () => setComposerFocused(false),
          disabled: loading || fileUploading
        }
      ),
      /* @__PURE__ */ React.createElement("div", { className: "request-drop-hint muted" }, "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0444\u0430\u0439\u043B\u044B \u0441\u044E\u0434\u0430 \u0438\u043B\u0438 \u043F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u0435 \u0441\u043A\u0440\u0435\u043F\u043A\u043E\u0439")
    ), hasPendingFiles ? /* @__PURE__ */ React.createElement("div", { className: "request-pending-files" }, pendingFiles.map((file, index) => /* @__PURE__ */ React.createElement("div", { className: "pending-file-chip", key: (file.name || "file") + "-" + String(file.lastModified || index) }, /* @__PURE__ */ React.createElement("span", { className: "pending-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"), /* @__PURE__ */ React.createElement("span", { className: "pending-file-name" }, file.name), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "pending-file-remove",
        "aria-label": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0430\u0439\u043B " + file.name,
        onClick: () => onRemoveSelectedFile(index)
      },
      "\xD7"
    ))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn secondary btn-sm", onClick: onClearSelectedFiles }, "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u044F")) : null, /* @__PURE__ */ React.createElement("div", { className: "request-chat-composer-actions" }, canRequestData ? /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn secondary btn-sm",
        type: "button",
        onClick: openCreateDataRequestModal,
        disabled: loading || fileUploading
      },
      "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C"
    ) : null, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "icon-btn file-action-btn composer-attach-btn",
        type: "button",
        "data-tooltip": "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B",
        "aria-label": "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B",
        onClick: () => {
          var _a2;
          return (_a2 = fileInputRef.current) == null ? void 0 : _a2.click();
        },
        disabled: loading || fileUploading
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M8.6 13.8 15 7.4a3 3 0 0 1 4.2 4.2l-8.1 8.1a5 5 0 1 1-7.1-7.1l8.6-8.6a1 1 0 0 1 1.4 1.4l-8.6 8.6a3 3 0 1 0 4.2 4.2l8.1-8.1a1 1 0 0 0-1.4-1.4l-6.4 6.4a1 1 0 0 1-1.4-1.4z",
          fill: "currentColor"
        }
      ))
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn",
        id: idMap.sendButton,
        type: "submit",
        disabled: loading || fileUploading || !canSubmit
      },
      "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C"
    )))) : /* @__PURE__ */ React.createElement("div", { className: "request-files-tab" }, /* @__PURE__ */ React.createElement("ul", { className: "simple-list request-modal-list", id: idMap.filesList }, safeAttachments.length ? safeAttachments.map((item) => /* @__PURE__ */ React.createElement("li", { key: String(item.id) }, /* @__PURE__ */ React.createElement("div", null, item.file_name || "\u0424\u0430\u0439\u043B"), /* @__PURE__ */ React.createElement("div", { className: "muted request-modal-item-meta" }, String(item.mime_type || "application/octet-stream") + " \u2022 " + fmtBytes(item.size_bytes) + " \u2022 " + fmtDate(item.created_at)), /* @__PURE__ */ React.createElement("div", { className: "request-file-actions" }, item.download_url && detectAttachmentPreviewKind(item.file_name, item.mime_type) !== "none" ? /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "icon-btn file-action-btn",
        type: "button",
        "data-tooltip": "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440",
        onClick: () => openPreview(item),
        "aria-label": "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M12 5C6.8 5 3 9.2 2 12c1 2.8 4.8 7 10 7s9-4.2 10-7c-1-2.8-4.8-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.2A1.8 1.8 0 1 0 12 10a1.8 1.8 0 0 0 0 3.8z",
          fill: "currentColor"
        }
      ))
    ) : null, item.download_url ? /* @__PURE__ */ React.createElement(
      "a",
      {
        className: "icon-btn file-action-btn request-file-link-icon",
        "data-tooltip": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C",
        "aria-label": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C: " + String(item.file_name || "\u0444\u0430\u0439\u043B"),
        href: item.download_url,
        target: "_blank",
        rel: "noreferrer"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M12 3a1 1 0 0 1 1 1v8.17l2.58-2.58a1 1 0 1 1 1.42 1.42l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 0 1 1.42-1.42L11 12.17V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z",
          fill: "currentColor"
        }
      ))
    ) : null))) : /* @__PURE__ */ React.createElement("li", { className: "muted" }, "\u0424\u0430\u0439\u043B\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442")), /* @__PURE__ */ React.createElement("div", { className: "request-files-tab-actions" }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439: " + String(safeMessages.length) + " \u2022 \u041E\u0431\u0449\u0438\u0439 \u0440\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u043E\u0432: " + fmtBytes(totalFilesBytes)))))), StatusLine ? /* @__PURE__ */ React.createElement(StatusLine, { status }) : null, AttachmentPreviewModal ? /* @__PURE__ */ React.createElement(
      AttachmentPreviewModal,
      {
        open: preview.open,
        title: "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0444\u0430\u0439\u043B\u0430",
        url: preview.url,
        fileName: preview.fileName,
        mimeType: preview.mimeType,
        onClose: closePreview
      }
    ) : null, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (clientDataModal.open ? " open" : ""),
        onClick: closeClientDataModal,
        "aria-hidden": clientDataModal.open ? "false" : "true",
        id: idMap.dataRequestOverlay
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-data-summary-modal data-request-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0417\u0430\u043F\u0440\u043E\u0441 \u0434\u0430\u043D\u043D\u044B\u0445"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \u044E\u0440\u0438\u0441\u0442\u0430")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeClientDataModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit: submitClientDataModal }, /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-list", id: idMap.dataRequestItems }, clientDataModal.loading ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...") : (clientDataModal.items || []).length ? (clientDataModal.items || []).map((item, index) => {
        const fieldType = String((item == null ? void 0 : item.field_type) || "string").toLowerCase();
        const fileMeta = item == null ? void 0 : item.value_file;
        return /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-row", key: String(item.localId || index) }, /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-label" }, String(index + 1) + ". " + String((item == null ? void 0 : item.label) || (item == null ? void 0 : item.key) || "\u041F\u043E\u043B\u0435")), /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-value" }, fieldType === "text" ? /* @__PURE__ */ React.createElement(
          "textarea",
          {
            value: String((item == null ? void 0 : item.value_text) || ""),
            onChange: (event) => updateClientDataItem(item.localId, { value_text: event.target.value }),
            rows: 3,
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        ) : fieldType === "date" ? /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "date",
            value: String((item == null ? void 0 : item.value_text) || "").slice(0, 10),
            onChange: (event) => updateClientDataItem(item.localId, { value_text: event.target.value }),
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        ) : fieldType === "number" ? /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "number",
            step: "any",
            value: String((item == null ? void 0 : item.value_text) || ""),
            onChange: (event) => updateClientDataItem(item.localId, { value_text: event.target.value }),
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        ) : fieldType === "file" ? /* @__PURE__ */ React.createElement("div", { className: "stack" }, fileMeta && fileMeta.download_url ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "chat-message-file-chip",
            onClick: () => openAttachmentFromMessage(fileMeta)
          },
          /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"),
          /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(fileMeta.file_name || "\u0424\u0430\u0439\u043B"))
        ) : null, /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "file",
            onChange: (event) => updateClientDataItem(item.localId, {
              pendingFile: event.target.files && event.target.files[0] ? event.target.files[0] : null
            }),
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        ), (item == null ? void 0 : item.pendingFile) ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, String(item.pendingFile.name || "")) : null) : /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: String((item == null ? void 0 : item.value_text) || ""),
            onChange: (event) => updateClientDataItem(item.localId, { value_text: event.target.value }),
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        )));
      }) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041D\u0435\u0442 \u043F\u043E\u043B\u0435\u0439 \u0434\u043B\u044F \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F.")), clientDataModal.error ? /* @__PURE__ */ React.createElement("div", { className: "status error" }, clientDataModal.error) : null, /* @__PURE__ */ React.createElement("div", { className: "request-data-status" + (clientDataModal.status ? " ok" : ""), id: idMap.dataRequestStatus }, clientDataModal.status || ""), /* @__PURE__ */ React.createElement("div", { className: "modal-actions modal-actions-right" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "submit",
          className: "btn btn-sm request-data-submit-btn",
          id: idMap.dataRequestSave,
          disabled: clientDataModal.loading || clientDataModal.saving
        },
        clientDataModal.saving ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." : "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"
      ))))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (statusChangeModal.open ? " open" : ""),
        onClick: closeStatusChangeModal,
        "aria-hidden": statusChangeModal.open ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-status-change-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0421\u043C\u0435\u043D\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0430"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441 \u0438 \u0432\u0430\u0436\u043D\u0443\u044E \u0434\u0430\u0442\u0443")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeStatusChangeModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: statusChangeFileInputRef,
          type: "file",
          multiple: true,
          onChange: (event) => {
            appendStatusChangeFiles(Array.from(event.target && event.target.files || []));
            event.target.value = "";
          },
          style: { position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }
        }
      ), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit: submitStatusChange }, /* @__PURE__ */ React.createElement("div", { className: "request-status-change-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "status-change-next-status" }, "\u041D\u043E\u0432\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441"), /* @__PURE__ */ React.createElement(
        "select",
        {
          id: "status-change-next-status",
          value: statusChangeModal.statusCode,
          onChange: (event) => setStatusChangeModal((prev) => ({ ...prev, statusCode: event.target.value, error: "" })),
          disabled: statusChangeModal.saving || loading
        },
        /* @__PURE__ */ React.createElement("option", { value: "" }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441"),
        statusOptions.filter((item) => item.code !== String((row == null ? void 0 : row.status_code) || "").trim()).filter(
          (item) => Array.isArray(statusChangeModal.allowedStatusCodes) && statusChangeModal.allowedStatusCodes.length ? statusChangeModal.allowedStatusCodes.includes(item.code) : true
        ).map((item) => /* @__PURE__ */ React.createElement("option", { key: item.code, value: item.code }, item.name + (item.groupName ? " \u2022 " + item.groupName : "")))
      )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "status-change-important-date" }, "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430 (\u0434\u0435\u0434\u043B\u0430\u0439\u043D)"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "status-change-important-date",
          type: "datetime-local",
          value: statusChangeModal.importantDateAt,
          onChange: (event) => setStatusChangeModal((prev) => ({ ...prev, importantDateAt: event.target.value, error: "" })),
          disabled: statusChangeModal.saving || loading
        }
      ))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "status-change-comment" }, "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043A \u0441\u043C\u0435\u043D\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u0430"), /* @__PURE__ */ React.createElement(
        "textarea",
        {
          id: "status-change-comment",
          placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0431\u0443\u0434\u0435\u0442 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0438 \u0447\u0430\u0442 (\u0435\u0441\u043B\u0438 \u0443\u043A\u0430\u0437\u0430\u043D)",
          value: statusChangeModal.comment,
          onChange: (event) => setStatusChangeModal((prev) => ({ ...prev, comment: event.target.value })),
          disabled: statusChangeModal.saving || loading
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "request-status-change-files" }, /* @__PURE__ */ React.createElement("div", { className: "request-status-change-files-head" }, /* @__PURE__ */ React.createElement("b", null, "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u044F"), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn file-action-btn",
          "data-tooltip": "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B",
          onClick: () => {
            var _a2;
            return (_a2 = statusChangeFileInputRef.current) == null ? void 0 : _a2.click();
          },
          disabled: statusChangeModal.saving || loading
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: "M8.6 13.8 15 7.4a3 3 0 0 1 4.2 4.2l-8.1 8.1a5 5 0 1 1-7.1-7.1l8.6-8.6a1 1 0 0 1 1.4 1.4l-8.6 8.6a3 3 0 1 0 4.2 4.2l8.1-8.1a1 1 0 0 0-1.4-1.4l-6.4 6.4a1 1 0 0 1-1.4-1.4z",
            fill: "currentColor"
          }
        ))
      )), Array.isArray(statusChangeModal.files) && statusChangeModal.files.length ? /* @__PURE__ */ React.createElement("div", { className: "request-pending-files" }, statusChangeModal.files.map((file, index) => /* @__PURE__ */ React.createElement("div", { className: "pending-file-chip", key: (file.name || "file") + "-" + String(file.lastModified || index) }, /* @__PURE__ */ React.createElement("span", { className: "pending-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"), /* @__PURE__ */ React.createElement("span", { className: "pending-file-name" }, file.name), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "pending-file-remove",
          "aria-label": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0430\u0439\u043B " + file.name,
          onClick: () => removeStatusChangeFile(index)
        },
        "\xD7"
      )))) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0424\u0430\u0439\u043B\u044B \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B")), /* @__PURE__ */ React.createElement("div", { className: "request-status-history-block" }, /* @__PURE__ */ React.createElement("div", { className: "request-status-history-head" }, /* @__PURE__ */ React.createElement("b", null, "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, safeStatusHistory.length ? String(safeStatusHistory.length) + " \u0437\u0430\u043F\u0438\u0441\u0435\u0439" : "\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439")), /* @__PURE__ */ React.createElement("ol", { className: "request-route-list request-status-history-list" }, safeStatusHistory.length ? safeStatusHistory.map((item, index) => {
        const statusCode = String((item == null ? void 0 : item.to_status) || "");
        const statusMeta = statusByCode.get(statusCode);
        const itemClass = "route-item request-status-history-route-item " + (index === 0 ? "current" : "completed");
        return /* @__PURE__ */ React.createElement("li", { key: String((item == null ? void 0 : item.id) || index), className: itemClass }, /* @__PURE__ */ React.createElement("span", { className: "route-dot" }), /* @__PURE__ */ React.createElement("div", { className: "route-body" }, /* @__PURE__ */ React.createElement("div", { className: "request-status-history-row" }, /* @__PURE__ */ React.createElement("b", null, resolveStatusDisplayName(statusCode, (item == null ? void 0 : item.to_status_name) || (statusMeta == null ? void 0 : statusMeta.name) || "")), (statusMeta == null ? void 0 : statusMeta.isTerminal) ? /* @__PURE__ */ React.createElement("span", { className: "request-status-history-chip" }, "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439") : null), /* @__PURE__ */ React.createElement("div", { className: "muted route-time" }, fmtShortDateTime(item == null ? void 0 : item.changed_at)), /* @__PURE__ */ React.createElement("div", { className: "request-status-history-meta" }, /* @__PURE__ */ React.createElement("span", null, "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430: " + fmtShortDateTime(item == null ? void 0 : item.important_date_at)), /* @__PURE__ */ React.createElement("span", null, "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C: " + formatDuration(item == null ? void 0 : item.duration_seconds))), String((item == null ? void 0 : item.comment) || "").trim() ? /* @__PURE__ */ React.createElement("div", { className: "request-status-history-comment" }, String(item.comment)) : null));
      }) : /* @__PURE__ */ React.createElement("li", { className: "muted" }, "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432 \u043F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442\u0430\u044F"))), statusChangeModal.error ? /* @__PURE__ */ React.createElement("div", { className: "status error" }, statusChangeModal.error) : null, /* @__PURE__ */ React.createElement("div", { className: "modal-actions modal-actions-right" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "submit",
          className: "btn btn-sm request-data-submit-btn",
          disabled: statusChangeModal.saving || loading
        },
        statusChangeModal.saving ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." : "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C"
      ))))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (financeOpen ? " open" : ""),
        onClick: closeFinanceModal,
        "aria-hidden": financeOpen ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-finance-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0424\u0438\u043D\u0430\u043D\u0441\u044B \u0437\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeFinanceModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "request-card-grid request-finance-grid" }, /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtAmount((_a = finance == null ? void 0 : finance.request_cost) != null ? _a : row == null ? void 0 : row.request_cost))), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtAmount(finance == null ? void 0 : finance.paid_total))), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0414\u0430\u0442\u0430 \u043E\u043F\u043B\u0430\u0442\u044B"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime((_b = finance == null ? void 0 : finance.last_paid_at) != null ? _b : row == null ? void 0 : row.paid_at))), canSeeRate ? /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u0442\u0430\u0432\u043A\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtAmount((_c = finance == null ? void 0 : finance.effective_rate) != null ? _c : row == null ? void 0 : row.effective_rate))) : null), typeof onIssueInvoice === "function" ? /* @__PURE__ */ React.createElement("div", { className: "request-finance-actions" }, !financeIssueForm.open ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "btn btn-sm",
          onClick: openFinanceIssueForm,
          disabled: loading || !row
        },
        "\u0412\u044B\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0447\u0435\u0442"
      ) : /* @__PURE__ */ React.createElement("form", { className: "stack request-finance-issue-form", onSubmit: submitFinanceIssueForm }, /* @__PURE__ */ React.createElement("div", { className: "request-finance-issue-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-finance-invoice-amount" }, "\u0421\u0443\u043C\u043C\u0430"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-finance-invoice-amount",
          type: "number",
          min: "0.01",
          step: "0.01",
          value: financeIssueForm.amount,
          onChange: (event) => setFinanceIssueForm((prev) => ({ ...prev, amount: event.target.value, error: "" })),
          disabled: financeIssueForm.saving || loading,
          placeholder: "0.00"
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-finance-invoice-payer" }, "\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-finance-invoice-payer",
          type: "text",
          value: financeIssueForm.payerDisplayName,
          onChange: (event) => setFinanceIssueForm((prev) => ({ ...prev, payerDisplayName: event.target.value, error: "" })),
          disabled: financeIssueForm.saving || loading,
          placeholder: "\u0424\u0418\u041E / \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F"
        }
      ))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-finance-invoice-service" }, "\u0423\u0441\u043B\u0443\u0433\u0430"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-finance-invoice-service",
          type: "text",
          value: financeIssueForm.serviceDescription,
          onChange: (event) => setFinanceIssueForm((prev) => ({ ...prev, serviceDescription: event.target.value, error: "" })),
          disabled: financeIssueForm.saving || loading,
          placeholder: "\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0443\u0441\u043B\u0443\u0433\u0438"
        }
      )), financeIssueForm.error ? /* @__PURE__ */ React.createElement("div", { className: "status error" }, financeIssueForm.error) : null, /* @__PURE__ */ React.createElement("div", { className: "modal-actions modal-actions-right request-finance-actions-inline" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn secondary btn-sm", onClick: closeFinanceIssueForm, disabled: financeIssueForm.saving }, "\u041E\u0442\u043C\u0435\u043D\u0430"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn btn-sm", disabled: financeIssueForm.saving || loading }, financeIssueForm.saving ? "\u0412\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435..." : "\u0412\u044B\u0441\u0442\u0430\u0432\u0438\u0442\u044C")))) : null, /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoices" }, /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoices-head" }, /* @__PURE__ */ React.createElement("h4", null, "\u0421\u0447\u0435\u0442\u0430"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, safeInvoices.length ? String(safeInvoices.length) + " \u0448\u0442." : "\u041D\u0435\u0442 \u0432\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0445 \u0441\u0447\u0435\u0442\u043E\u0432")), safeInvoices.length ? /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-list" }, safeInvoices.map((item) => /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-row", key: String((item == null ? void 0 : item.id) || (item == null ? void 0 : item.invoice_number) || (item == null ? void 0 : item.issued_at) || "-") }, /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-meta" }, /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-number" }, /* @__PURE__ */ React.createElement("code", null, String((item == null ? void 0 : item.invoice_number) || "-"))), /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-details" }, /* @__PURE__ */ React.createElement("span", null, invoiceStatusLabel(item == null ? void 0 : item.status)), /* @__PURE__ */ React.createElement("span", null, fmtAmount(item == null ? void 0 : item.amount) + " " + String((item == null ? void 0 : item.currency) || "RUB")), /* @__PURE__ */ React.createElement("span", null, "\u0421\u043E\u0437\u0434\u0430\u043D: " + fmtDate(item == null ? void 0 : item.issued_at)), /* @__PURE__ */ React.createElement("span", null, "\u041E\u043F\u043B\u0430\u0447\u0435\u043D: " + fmtDate(item == null ? void 0 : item.paid_at)))), typeof onDownloadInvoicePdf === "function" ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn request-finance-invoice-download-btn",
          onClick: () => onDownloadInvoicePdf(item),
          disabled: loading,
          "aria-label": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0441\u0447\u0435\u0442 PDF",
          "data-tooltip": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C PDF"
        },
        "\u2B07"
      ) : null))) : /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-empty" }, "\u0421\u0447\u0435\u0442\u0430 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0432\u044B\u0441\u0442\u0430\u0432\u043B\u044F\u043B\u0438\u0441\u044C")))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (descriptionOpen ? " open" : ""),
        onClick: () => setDescriptionOpen(false),
        "aria-hidden": descriptionOpen ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-description-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0417\u0430\u044F\u0432\u043A\u0430"), /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-headline" }, /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, String((row == null ? void 0 : row.topic_name) || (row == null ? void 0 : row.topic_code) || "\u0422\u0435\u043C\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430")), /* @__PURE__ */ React.createElement("span", { className: "request-description-status-chip" }, currentStatusName))), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: () => setDescriptionOpen(false), "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-body" }, /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-main" }, /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-title" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B")), /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-text" }, (row == null ? void 0 : row.description) ? String(row.description) : "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E")), /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-meta-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-meta" }, /* @__PURE__ */ React.createElement("div", { className: "request-description-meta-item" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041A\u043B\u0438\u0435\u043D\u0442"), /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "request-field-value" + (clientHasPhone ? " has-tooltip request-contact-value" : ""),
          "data-tooltip": clientHasPhone ? clientPhone : void 0
        },
        clientLabel
      )), /* @__PURE__ */ React.createElement("div", { className: "request-description-meta-item align-right" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u042E\u0440\u0438\u0441\u0442"), /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "request-field-value" + (lawyerHasPhone ? " has-tooltip request-contact-value" : ""),
          "data-tooltip": lawyerHasPhone ? lawyerPhone : void 0
        },
        lawyerLabel
      )), /* @__PURE__ */ React.createElement("div", { className: "request-description-meta-item" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u043E\u0437\u0434\u0430\u043D\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime(row == null ? void 0 : row.created_at))), /* @__PURE__ */ React.createElement("div", { className: "request-description-meta-item align-right" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime(row == null ? void 0 : row.updated_at)))))))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (dataRequestModal.open ? " open" : ""),
        onClick: closeDataRequestModal,
        "aria-hidden": dataRequestModal.open ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-data-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, dataRequestModal.messageId ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u0434\u0430\u043D\u043D\u044B\u0445" : "\u0417\u0430\u043F\u0440\u043E\u0441 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u043B\u044F \u0434\u043B\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u0430")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeDataRequestModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "stack" }, /* @__PURE__ */ React.createElement("div", { className: "request-data-modal-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-data-request-template-select" }, "\u0428\u0430\u0431\u043B\u043E\u043D \u0437\u0430\u043F\u0440\u043E\u0441\u0430 (\u043F\u043E\u0438\u0441\u043A)"), /* @__PURE__ */ React.createElement("div", { className: "request-data-combobox" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-data-request-template-select",
          name: "request_template_search_nohistory",
          type: "text",
          value: dataRequestModal.requestTemplateQuery,
          onChange: (event) => setDataRequestModal((prev) => ({
            ...prev,
            requestTemplateQuery: event.target.value,
            selectedRequestTemplateId: "",
            templateStatus: "",
            error: ""
          })),
          onFocus: (event) => {
            event.currentTarget.removeAttribute("readonly");
            setRequestTemplateSuggestOpen(true);
          },
          onBlur: (event) => {
            event.currentTarget.setAttribute("readonly", "readonly");
            window.setTimeout(() => setRequestTemplateSuggestOpen(false), 120);
          },
          disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate,
          placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u0430",
          readOnly: true,
          autoComplete: "new-password",
          autoCorrect: "off",
          autoCapitalize: "none",
          spellCheck: false,
          "aria-autocomplete": "list",
          "data-1p-ignore": "true",
          "data-lpignore": "true"
        }
      ), requestTemplateBadge ? /* @__PURE__ */ React.createElement("span", { className: "request-data-template-badge " + requestTemplateBadge.kind }, requestTemplateBadge.label) : null, requestTemplateSuggestOpen && filteredRequestTemplates.length ? /* @__PURE__ */ React.createElement("div", { className: "request-data-suggest-list", role: "listbox", "aria-label": "\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u0437\u0430\u043F\u0440\u043E\u0441\u0430" }, filteredRequestTemplates.map((tpl) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: String(tpl.id),
          type: "button",
          className: "request-data-suggest-item",
          onMouseDown: (event) => {
            event.preventDefault();
            setDataRequestModal((prev) => ({
              ...prev,
              requestTemplateQuery: String(tpl.name || ""),
              selectedRequestTemplateId: String(tpl.id || ""),
              error: "",
              templateStatus: ""
            }));
            setRequestTemplateSuggestOpen(false);
            void applyRequestTemplateById(String(tpl.id || ""), String(tpl.name || ""));
          }
        },
        /* @__PURE__ */ React.createElement("span", null, String(tpl.name || "\u0428\u0430\u0431\u043B\u043E\u043D"))
      ))) : null)), /* @__PURE__ */ React.createElement("div", { className: "request-data-modal-actions-inline" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn",
          "data-tooltip": !canSaveSelectedRequestTemplate ? "\u0427\u0443\u0436\u043E\u0439 \u0448\u0430\u0431\u043B\u043E\u043D \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0434\u043B\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F" : requestTemplateActionMode === "save" ? "\u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" : requestTemplateActionMode === "create" ? "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" : "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u0430",
          onClick: saveCurrentDataRequestTemplate,
          disabled: !canSaveSelectedRequestTemplate || dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate
        },
        dataRequestModal.savingTemplate ? "\u2026" : requestTemplateActionMode === "create" ? "\u271A" : "\u{1F4BE}"
      ))), dataRequestModal.templateStatus ? /* @__PURE__ */ React.createElement("div", { className: "status ok" }, dataRequestModal.templateStatus) : null, canRequestData && dataRequestModal.messageId ? /* @__PURE__ */ React.createElement("div", { className: "request-data-progress-line" }, /* @__PURE__ */ React.createElement("span", { className: "request-data-progress-chip" }, "\u0417\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C: " + String(dataRequestProgress.filled) + " / " + String(dataRequestProgress.total))) : null, /* @__PURE__ */ React.createElement("div", { className: "request-data-modal-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-data-template-select" }, "\u041F\u043E\u043B\u0435 \u0434\u0430\u043D\u043D\u044B\u0445 (\u043F\u043E\u0438\u0441\u043A \u043F\u043E \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0443)"), /* @__PURE__ */ React.createElement("div", { className: "request-data-combobox" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-data-template-select",
          name: "request_field_search_nohistory",
          type: "text",
          value: dataRequestModal.catalogFieldQuery,
          onChange: (event) => setDataRequestModal((prev) => ({
            ...prev,
            catalogFieldQuery: event.target.value,
            selectedCatalogTemplateId: "",
            templateStatus: "",
            error: ""
          })),
          onFocus: (event) => {
            event.currentTarget.removeAttribute("readonly");
            setCatalogFieldSuggestOpen(true);
          },
          onBlur: (event) => {
            event.currentTarget.setAttribute("readonly", "readonly");
            window.setTimeout(() => setCatalogFieldSuggestOpen(false), 120);
          },
          disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate,
          placeholder: "\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u0432\u0432\u043E\u0434\u0438\u0442\u044C \u043D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u043B\u044F",
          readOnly: true,
          autoComplete: "new-password",
          autoCorrect: "off",
          autoCapitalize: "none",
          spellCheck: false,
          "aria-autocomplete": "list",
          "data-1p-ignore": "true",
          "data-lpignore": "true"
        }
      ), catalogFieldSuggestOpen && filteredCatalogFields.length ? /* @__PURE__ */ React.createElement("div", { className: "request-data-suggest-list", role: "listbox", "aria-label": "\u041F\u043E\u043B\u044F \u0434\u0430\u043D\u043D\u044B\u0445" }, filteredCatalogFields.map((tpl) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: String(tpl.id),
          type: "button",
          className: "request-data-suggest-item",
          onMouseDown: (event) => {
            event.preventDefault();
            setDataRequestModal((prev) => ({
              ...prev,
              catalogFieldQuery: String(tpl.label || tpl.key || ""),
              selectedCatalogTemplateId: String(tpl.id || ""),
              error: "",
              templateStatus: ""
            }));
            setCatalogFieldSuggestOpen(false);
          }
        },
        /* @__PURE__ */ React.createElement("span", null, String(tpl.label || tpl.key)),
        /* @__PURE__ */ React.createElement("small", null, String(tpl.value_type || "string"))
      ))) : null)), /* @__PURE__ */ React.createElement("div", { className: "request-data-modal-actions-inline" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn",
          "data-tooltip": catalogFieldActionMode === "add" ? "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u043B\u0435 \u0438\u0437 \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0430" : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043D\u043E\u0432\u043E\u0435 \u043F\u043E\u043B\u0435",
          onClick: addSelectedTemplateRow,
          disabled: !String(dataRequestModal.catalogFieldQuery || "").trim() && !selectedCatalogFieldCandidate || dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate
        },
        catalogFieldActionMode === "add" ? "+" : "\u271A"
      ))), /* @__PURE__ */ React.createElement("div", { className: "request-data-rows" }, (dataRequestModal.rows || []).length ? (dataRequestModal.rows || []).map((rowItem, idx) => /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "request-data-row" + (String(draggedRequestRowId) === String(rowItem.localId) ? " dragging" : "") + (String(dragOverRequestRowId) === String(rowItem.localId) && String(draggedRequestRowId) !== String(rowItem.localId) ? " drag-over" : "") + (viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled) ? " row-locked" : ""),
          key: rowItem.localId,
          onDragOver: (event) => {
            if (!draggedRequestRowId) return;
            event.preventDefault();
            if (viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)) return;
            setDragOverRequestRowId(String(rowItem.localId || ""));
          },
          onDrop: (event) => {
            if (!draggedRequestRowId) return;
            event.preventDefault();
            if (viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)) return;
            moveDataRequestRowToIndex(draggedRequestRowId, idx);
            handleRequestRowDragEnd();
          }
        },
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "icon-btn request-data-row-index-handle",
            "data-tooltip": viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled) ? "\u0417\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u043E\u0435 \u043F\u043E\u043B\u0435: \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E" : "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0434\u043B\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u043E\u0440\u044F\u0434\u043A\u0430",
            draggable: !(viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)),
            onDragStart: (event) => handleRequestRowDragStart(event, rowItem, viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)),
            onDragEnd: handleRequestRowDragEnd,
            disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate || viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled),
            "aria-label": "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u043F\u043E\u043B\u044F " + String(idx + 1)
          },
          /* @__PURE__ */ React.createElement("span", null, idx + 1)
        ),
        /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "\u041D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435"), /* @__PURE__ */ React.createElement(
          "input",
          {
            value: rowItem.label,
            onChange: (event) => updateDataRequestRow(rowItem.localId, { label: event.target.value }),
            disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate || viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)
          }
        )),
        /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "\u0422\u0438\u043F"), /* @__PURE__ */ React.createElement(
          "select",
          {
            value: rowItem.field_type || "string",
            onChange: (event) => updateDataRequestRow(rowItem.localId, { field_type: event.target.value }),
            disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate || viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)
          },
          requestDataTypeOptions.map((option) => /* @__PURE__ */ React.createElement("option", { key: option.value, value: option.value }, option.label))
        )),
        /* @__PURE__ */ React.createElement("div", { className: "request-data-row-controls" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "icon-btn danger request-data-row-action-btn",
            "data-tooltip": viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled) ? "\u042E\u0440\u0438\u0441\u0442 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u043E\u0435 \u043F\u043E\u043B\u0435" : "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u043B\u0435",
            onClick: () => removeDataRequestRow(rowItem.localId),
            disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate || viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)
          },
          "\xD7"
        )),
        canRequestData && ((rowItem == null ? void 0 : rowItem.is_filled) || String((rowItem == null ? void 0 : rowItem.value_text) || "").trim()) ? /* @__PURE__ */ React.createElement("div", { className: "request-data-row-client-value" }, /* @__PURE__ */ React.createElement("span", { className: "request-data-row-client-label" }, "\u0417\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C:"), String((rowItem == null ? void 0 : rowItem.field_type) || "").toLowerCase() === "file" ? (rowItem == null ? void 0 : rowItem.value_file) && rowItem.value_file.download_url ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "chat-message-file-chip",
            onClick: () => openAttachmentFromMessage(rowItem.value_file)
          },
          /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"),
          /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(rowItem.value_file.file_name || "\u0424\u0430\u0439\u043B"))
        ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u0424\u0430\u0439\u043B \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D") : /* @__PURE__ */ React.createElement("span", { className: "request-data-row-client-text" }, String((rowItem == null ? void 0 : rowItem.field_type) || "").toLowerCase() === "date" ? fmtDateOnly(rowItem == null ? void 0 : rowItem.value_text) : String((rowItem == null ? void 0 : rowItem.value_text) || "").trim().slice(0, 140))) : null
      )) : /* @__PURE__ */ React.createElement("div", { className: "muted" }, "\u041F\u043E\u043B\u044F \u0434\u043B\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u0435\u0449\u0435 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B"))), dataRequestModal.error ? /* @__PURE__ */ React.createElement("div", { className: "status error" }, dataRequestModal.error) : null, /* @__PURE__ */ React.createElement("div", { className: "modal-actions modal-actions-right" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "btn btn-sm request-data-submit-btn",
          onClick: submitDataRequestModal,
          disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate
        },
        dataRequestModal.saving ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." : "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C"
      )))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (requestDataListOpen ? " open" : ""),
        onClick: () => setRequestDataListOpen(false),
        "aria-hidden": requestDataListOpen ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-data-summary-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: () => setRequestDataListOpen(false), "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-list" }, requestDataListItems.length ? requestDataListItems.map((item) => {
        const value = formatRequestDataValue(item);
        const isFile = String((item == null ? void 0 : item.field_type) || "").toLowerCase() === "file";
        return /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-row", key: String(item.id || item.key) }, /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-label" }, String(item.label || humanizeKey(item.key))), /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-value" }, isFile ? value && typeof value === "object" ? /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-file" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "chat-message-file-chip", onClick: () => downloadAttachment(value) }, /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"), /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(value.file_name || "\u0424\u0430\u0439\u043B")))) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E") : String(value || "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E")));
      }) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442")))
    ));
  }

  // app/web/admin/features/tables/AvailableTablesSection.jsx
  function AvailableTablesSection({
    tables,
    status,
    onRefresh,
    onToggleActive,
    DataTableComponent,
    StatusLineComponent,
    IconButtonComponent
  }) {
    const tableState = (tables == null ? void 0 : tables.availableTables) || { rows: [] };
    const DataTable = DataTableComponent;
    const StatusLine = StatusLineComponent;
    const IconButton = IconButtonComponent;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0441\u0442\u044C \u0442\u0430\u0431\u043B\u0438\u0446"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0421\u043A\u0440\u044B\u0442\u0430\u044F \u0441\u043B\u0443\u0436\u0435\u0431\u043D\u0430\u044F \u0432\u043A\u043B\u0430\u0434\u043A\u0430. \u0414\u043E\u0441\u0442\u0443\u043F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430 \u043F\u043E \u043F\u0440\u044F\u043C\u043E\u0439 \u0441\u0441\u044B\u043B\u043A\u0435.")), /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onRefresh, title: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C", "aria-label": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" }, /* @__PURE__ */ React.createElement(RefreshIcon, null))), /* @__PURE__ */ React.createElement(
      DataTable,
      {
        headers: [
          { key: "label", label: "\u0422\u0430\u0431\u043B\u0438\u0446\u0430" },
          { key: "table", label: "\u041A\u043E\u0434" },
          { key: "section", label: "\u0420\u0430\u0437\u0434\u0435\u043B" },
          { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430" },
          { key: "updated_at", label: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430" },
          { key: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439" },
          { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
        ],
        rows: tableState.rows,
        emptyColspan: 7,
        renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: String(row.table || row.label) }, /* @__PURE__ */ React.createElement("td", null, row.label || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.table || "-")), /* @__PURE__ */ React.createElement("td", null, row.section || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(Boolean(row.is_active))), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.updated_at)), /* @__PURE__ */ React.createElement("td", null, row.responsible || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(
          IconButton,
          {
            icon: row.is_active ? "\u23F8" : "\u25B6",
            tooltip: row.is_active ? "\u0414\u0435\u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0430\u0431\u043B\u0438\u0446\u0443" : "\u0410\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0430\u0431\u043B\u0438\u0446\u0443",
            onClick: () => onToggleActive(row.table, !Boolean(row.is_active))
          }
        ))))
      }
    ), /* @__PURE__ */ React.createElement(StatusLine, { status }));
  }

  // app/web/admin/hooks/useAdminApi.js
  function useAdminApi(token) {
    const { useCallback } = React;
    return useCallback(
      async (path, options, tokenOverride) => {
        const opts = options || {};
        const authToken = tokenOverride !== void 0 ? tokenOverride : token;
        const headers = { "Content-Type": "application/json", ...opts.headers || {} };
        if (opts.auth !== false) {
          if (!authToken) throw new Error("\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043E\u043A\u0435\u043D \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438");
          headers.Authorization = "Bearer " + authToken;
        }
        const response = await fetch(path, {
          method: opts.method || "GET",
          headers,
          body: opts.body ? JSON.stringify(opts.body) : void 0
        });
        const text = await response.text();
        let payload;
        try {
          payload = text ? JSON.parse(text) : {};
        } catch (_) {
          payload = { raw: text };
        }
        if (!response.ok) {
          const message = payload && (payload.detail || payload.error || payload.raw) || "HTTP " + response.status;
          const error = new Error(translateApiError(String(message)));
          error.httpStatus = Number(response.status || 0);
          throw error;
        }
        return payload;
      },
      [token]
    );
  }

  // app/web/admin/hooks/useAdminCatalogLoaders.js
  function useAdminCatalogLoaders({ api, setStatus, setTableState, setReferenceRowsMap, buildUniversalQuery: buildUniversalQuery2 }) {
    const { useCallback } = React;
    const loadAvailableTables = useCallback(
      async (tokenOverride) => {
        setStatus("availableTables", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
        try {
          const data = await api("/api/admin/crud/meta/available-tables", {}, tokenOverride);
          const rows = Array.isArray(data.rows) ? data.rows : [];
          setTableState("availableTables", {
            filters: [],
            sort: null,
            offset: 0,
            total: rows.length,
            showAll: true,
            rows
          });
          setStatus("availableTables", "\u0421\u043F\u0438\u0441\u043E\u043A \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D", "ok");
          return true;
        } catch (error) {
          setStatus("availableTables", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          return false;
        }
      },
      [api, setStatus, setTableState]
    );
    const loadReferenceRows = useCallback(
      async (catalogRows, tokenOverride) => {
        const rows = Array.isArray(catalogRows) ? catalogRows : [];
        const byTable = {};
        rows.forEach((item) => {
          const table = String((item == null ? void 0 : item.table) || "");
          if (!table) return;
          byTable[table] = item;
        });
        const references = /* @__PURE__ */ new Set();
        rows.forEach((item) => {
          ((item == null ? void 0 : item.columns) || []).forEach((column) => {
            const meta = normalizeReferenceMeta(column == null ? void 0 : column.reference);
            if (meta == null ? void 0 : meta.table) references.add(meta.table);
          });
        });
        if (!references.size) {
          setReferenceRowsMap({});
          return;
        }
        const nextMap = {};
        await Promise.all(
          Array.from(references.values()).map(async (table) => {
            const meta = byTable[table];
            const endpoint = String((meta == null ? void 0 : meta.query_endpoint) || "/api/admin/crud/" + table + "/query");
            const sort = Array.isArray(meta == null ? void 0 : meta.default_sort) && meta.default_sort.length ? meta.default_sort : [{ field: "created_at", dir: "desc" }];
            try {
              const data = await api(
                endpoint,
                {
                  method: "POST",
                  body: buildUniversalQuery2([], sort, 500, 0)
                },
                tokenOverride
              );
              nextMap[table] = Array.isArray(data == null ? void 0 : data.rows) ? data.rows : [];
            } catch (_) {
              nextMap[table] = [];
            }
          })
        );
        setReferenceRowsMap(nextMap);
      },
      [api, buildUniversalQuery2, setReferenceRowsMap]
    );
    return {
      loadAvailableTables,
      loadReferenceRows
    };
  }

  // app/web/admin/hooks/useKanban.js
  function normalizeKanbanColumns(rows, columns) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeColumns = Array.isArray(columns) ? columns : [];
    const canonicalByLabel = /* @__PURE__ */ new Map();
    const aliases = /* @__PURE__ */ new Map();
    const mergedColumns = [];
    safeColumns.forEach((column, index) => {
      const key = String((column == null ? void 0 : column.key) || "").trim();
      if (!key) return;
      const label = String((column == null ? void 0 : column.label) || key).trim() || key;
      const labelKey = label.toLocaleLowerCase("ru-RU");
      const sortOrder = Number.isFinite(Number(column == null ? void 0 : column.sort_order)) ? Number(column.sort_order) : index;
      if (!canonicalByLabel.has(labelKey)) {
        const canonical2 = {
          key,
          label,
          sort_order: sortOrder,
          total: 0
        };
        canonicalByLabel.set(labelKey, canonical2);
        mergedColumns.push(canonical2);
        return;
      }
      const canonical = canonicalByLabel.get(labelKey);
      if (canonical && canonical.key !== key) aliases.set(key, canonical.key);
    });
    if (!aliases.size) {
      return { rows: safeRows, columns: safeColumns };
    }
    const remapGroup = (groupKey) => {
      const normalized = String(groupKey || "").trim();
      if (!normalized) return normalized;
      return aliases.get(normalized) || normalized;
    };
    const normalizedRows = safeRows.map((row) => ({
      ...row,
      status_group: remapGroup(row == null ? void 0 : row.status_group),
      available_transitions: Array.isArray(row == null ? void 0 : row.available_transitions) ? row.available_transitions.map((transition) => ({
        ...transition,
        target_group: remapGroup(transition == null ? void 0 : transition.target_group)
      })) : []
    }));
    const totals = /* @__PURE__ */ new Map();
    normalizedRows.forEach((row) => {
      const key = String((row == null ? void 0 : row.status_group) || "").trim();
      if (!key) return;
      totals.set(key, Number(totals.get(key) || 0) + 1);
    });
    const normalizedColumns = mergedColumns.map((column) => ({
      ...column,
      total: Number(totals.get(String(column.key || "").trim()) || 0)
    }));
    return { rows: normalizedRows, columns: normalizedColumns };
  }
  function useKanban({ api, setStatus, setTableState, tablesRef }) {
    const { useCallback, useState } = React;
    const [kanbanData, setKanbanData] = useState({
      rows: [],
      columns: KANBAN_GROUPS,
      total: 0,
      truncated: false
    });
    const [kanbanLoading, setKanbanLoading] = useState(false);
    const [kanbanSortModal, setKanbanSortModal] = useState({
      open: false,
      value: "created_newest"
    });
    const [kanbanSortApplied, setKanbanSortApplied] = useState(false);
    const loadKanban = useCallback(
      async (tokenOverride, options) => {
        const opts = options || {};
        const currentKanbanState = tablesRef.current.kanban || createTableState();
        const activeFilters = Array.isArray(opts.filtersOverride) ? [...opts.filtersOverride] : [...currentKanbanState.filters || []];
        const currentSortMode = Array.isArray(currentKanbanState.sort) && currentKanbanState.sort[0] ? String(currentKanbanState.sort[0].field || "") : "";
        const activeSortMode = String(opts.sortModeOverride || currentSortMode || kanbanSortModal.value || "created_newest").trim() || "created_newest";
        const params = new URLSearchParams({ limit: "400", sort_mode: activeSortMode });
        if (activeFilters.length) params.set("filters", JSON.stringify(activeFilters));
        setKanbanLoading(true);
        setStatus("kanban", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
        try {
          const data = await api("/api/admin/requests/kanban?" + params.toString(), {}, tokenOverride);
          const rawRows = Array.isArray(data.rows) ? data.rows : [];
          const rawColumns = Array.isArray(data.columns) && data.columns.length ? data.columns : KANBAN_GROUPS;
          const normalized = normalizeKanbanColumns(rawRows, rawColumns);
          const rows = Array.isArray(normalized.rows) ? normalized.rows : rawRows;
          const columns = Array.isArray(normalized.columns) && normalized.columns.length ? normalized.columns : rawColumns;
          setKanbanData({
            rows,
            columns,
            total: Number(data.total || rows.length),
            truncated: Boolean(data.truncated)
          });
          setTableState("kanban", {
            ...currentKanbanState,
            filters: activeFilters,
            sort: [{ field: activeSortMode, dir: "asc" }],
            rows,
            total: Number(data.total || rows.length),
            offset: 0,
            showAll: false
          });
          const tail = Boolean(data.truncated) ? " \u041F\u043E\u043A\u0430\u0437\u0430\u043D\u0430 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u043D\u0430\u044F \u0432\u044B\u0431\u043E\u0440\u043A\u0430." : "";
          setStatus("kanban", "\u041A\u0430\u043D\u0431\u0430\u043D \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D." + tail, "ok");
        } catch (error) {
          setStatus("kanban", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
        } finally {
          setKanbanLoading(false);
        }
      },
      [api, kanbanSortModal.value, setStatus, setTableState, tablesRef]
    );
    const openKanbanSortModal = useCallback(() => {
      const tableState = tablesRef.current.kanban || createTableState();
      const currentMode = Array.isArray(tableState.sort) && tableState.sort[0] ? String(tableState.sort[0].field || "") : "";
      setKanbanSortModal({
        open: true,
        value: currentMode || "created_newest"
      });
      setStatus("kanbanSort", "", "");
    }, [setStatus, tablesRef]);
    const closeKanbanSortModal = useCallback(() => {
      setKanbanSortModal((prev) => ({ ...prev, open: false }));
      setStatus("kanbanSort", "", "");
    }, [setStatus]);
    const updateKanbanSortMode = useCallback((event) => {
      setKanbanSortModal((prev) => ({ ...prev, value: String(event.target.value || "created_newest") }));
    }, []);
    const submitKanbanSortModal = useCallback(
      async (event) => {
        event.preventDefault();
        const nextMode = String(kanbanSortModal.value || "created_newest");
        const tableState = tablesRef.current.kanban || createTableState();
        setTableState("kanban", {
          ...tableState,
          sort: [{ field: nextMode, dir: "asc" }],
          offset: 0,
          showAll: false
        });
        setKanbanSortApplied(true);
        closeKanbanSortModal();
        await loadKanban(void 0, { sortModeOverride: nextMode });
      },
      [closeKanbanSortModal, kanbanSortModal.value, loadKanban, setTableState, tablesRef]
    );
    const resetKanbanState = useCallback(() => {
      setKanbanSortModal({ open: false, value: "created_newest" });
      setKanbanSortApplied(false);
      setKanbanData({ rows: [], columns: KANBAN_GROUPS, total: 0, truncated: false });
      setKanbanLoading(false);
    }, []);
    return {
      kanbanData,
      kanbanLoading,
      kanbanSortModal,
      kanbanSortApplied,
      loadKanban,
      openKanbanSortModal,
      closeKanbanSortModal,
      updateKanbanSortMode,
      submitKanbanSortModal,
      resetKanbanState
    };
  }

  // app/web/admin/hooks/useRequestWorkspace.js
  var DEFAULT_INVOICE_REQUISITES = Object.freeze({
    issuer_name: '\u041E\u041E\u041E "\u0410\u0443\u0434\u0438\u0442\u043E\u0440\u044B \u043A\u043E\u0440\u043F\u043E\u0440\u0430\u0442\u0438\u0432\u043D\u043E\u0439 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u0438"',
    issuer_inn: "7604226740",
    issuer_kpp: "760401001",
    issuer_address: "\u0433. \u042F\u0440\u043E\u0441\u043B\u0430\u0432\u043B\u044C, \u0443\u043B. \u0411\u043E\u0433\u0434\u0430\u043D\u043E\u0432\u0438\u0447\u0430, 6\u0410",
    bank_name: '\u0410\u041E "\u0410\u041B\u042C\u0424\u0410-\u0411\u0410\u041D\u041A"',
    bank_bik: "044525593",
    bank_account: "40702810501860000582",
    bank_corr_account: "30101810200000000593"
  });
  var UPLOAD_MAX_ATTEMPTS = 4;
  async function buildStorageUploadError(response, fallbackMessage) {
    const base = String(fallbackMessage || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435");
    const status = Number((response == null ? void 0 : response.status) || 0);
    const statusText = String((response == null ? void 0 : response.statusText) || "").trim();
    let details = "";
    try {
      details = String(await response.text() || "").replace(/\s+/g, " ").trim();
    } catch (_) {
      details = "";
    }
    if (details.length > 180) details = details.slice(0, 180) + "...";
    const parts = [];
    if (status > 0) parts.push("HTTP " + status + (statusText ? " " + statusText : ""));
    if (details) parts.push(details);
    return parts.length ? base + " (" + parts.join("; ") + ")" : base;
  }
  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }
  function nextUploadRetryDelayMs(attempt) {
    const base = Math.min(1200 * Math.pow(2, Math.max(0, Number(attempt || 1) - 1)), 7e3);
    const jitter = Math.floor(Math.random() * 250);
    return base + jitter;
  }
  function isRetryableUploadError(error) {
    const status = Number((error == null ? void 0 : error.httpStatus) || (error == null ? void 0 : error.status) || 0);
    if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    if (status > 0) return false;
    const message = String((error == null ? void 0 : error.message) || "").toLowerCase();
    if (!message) return true;
    return message.includes("networkerror") || message.includes("failed to fetch") || message.includes("load failed") || message.includes("network request failed") || message.includes("timeout");
  }
  function useRequestWorkspace(options) {
    const { useCallback, useRef, useState } = React;
    const opts = options || {};
    const api = opts.api;
    const setStatus = opts.setStatus;
    const setActiveSection = opts.setActiveSection;
    const token = opts.token || "";
    const users = Array.isArray(opts.users) ? opts.users : [];
    const buildUniversalQuery2 = opts.buildUniversalQuery;
    const resolveAdminObjectSrc2 = opts.resolveAdminObjectSrc;
    const [requestModal, setRequestModal] = useState(createRequestModalState());
    const requestOpenGuardRef = useRef({ requestId: "", ts: 0 });
    const resetRequestWorkspaceState = useCallback(() => {
      setRequestModal(createRequestModalState());
      requestOpenGuardRef.current = { requestId: "", ts: 0 };
    }, []);
    const updateRequestModalMessageDraft = useCallback((event) => {
      const value = event.target.value;
      setRequestModal((prev) => ({ ...prev, messageDraft: value }));
    }, []);
    const appendRequestModalFiles = useCallback((files) => {
      const list = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!list.length) return;
      setRequestModal((prev) => {
        const existing = Array.isArray(prev.selectedFiles) ? prev.selectedFiles : [];
        const next = [...existing];
        list.forEach((file) => {
          const duplicate = next.some(
            (item) => item && item.name === file.name && Number(item.size || 0) === Number(file.size || 0) && Number(item.lastModified || 0) === Number(file.lastModified || 0)
          );
          if (!duplicate) next.push(file);
        });
        return { ...prev, selectedFiles: next };
      });
    }, []);
    const removeRequestModalFile = useCallback((index) => {
      setRequestModal((prev) => {
        const existing = Array.isArray(prev.selectedFiles) ? [...prev.selectedFiles] : [];
        existing.splice(index, 1);
        return { ...prev, selectedFiles: existing };
      });
    }, []);
    const clearRequestModalFiles = useCallback(() => {
      setRequestModal((prev) => ({ ...prev, selectedFiles: [] }));
    }, []);
    const uploadRequestAttachmentWithRetry = useCallback(
      async ({ requestId, file, messageId }) => {
        if (!api) throw new Error("API \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
        const targetRequestId = String(requestId || "").trim();
        if (!targetRequestId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
        if (!file) throw new Error("\u0424\u0430\u0439\u043B \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D");
        const mimeType = String(file.type || "application/octet-stream");
        const runUploadStepWithRetry = async (label, action) => {
          let lastError = null;
          let attemptsUsed = 0;
          for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
            attemptsUsed = attempt;
            try {
              return await action(attempt);
            } catch (error) {
              lastError = error;
              const canRetry = attempt < UPLOAD_MAX_ATTEMPTS && isRetryableUploadError(error);
              if (!canRetry) break;
              await wait(nextUploadRetryDelayMs(attempt));
            }
          }
          const reason = String((lastError == null ? void 0 : lastError.message) || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0442\u0438");
          throw new Error(label + ": " + reason + " (\u043F\u043E\u043F\u044B\u0442\u043E\u043A: " + attemptsUsed + ")");
        };
        const init = await runUploadStepWithRetry("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0444\u0430\u0439\u043B\u0430", async () => {
          return api("/api/admin/uploads/init", {
            method: "POST",
            body: {
              file_name: file.name,
              mime_type: mimeType,
              size_bytes: file.size,
              scope: "REQUEST_ATTACHMENT",
              request_id: targetRequestId
            }
          });
        });
        await runUploadStepWithRetry("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435", async () => {
          const putResp = await fetch(init.presigned_url, {
            method: "PUT",
            headers: { "Content-Type": mimeType },
            body: file
          });
          if (putResp.ok) return null;
          const error = new Error(await buildStorageUploadError(putResp, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435"));
          error.httpStatus = Number(putResp.status || 0);
          throw error;
        });
        return runUploadStepWithRetry("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0444\u0430\u0439\u043B\u0430", async () => {
          return api("/api/admin/uploads/complete", {
            method: "POST",
            body: {
              key: init.key,
              file_name: file.name,
              mime_type: mimeType,
              size_bytes: file.size,
              scope: "REQUEST_ATTACHMENT",
              request_id: targetRequestId,
              message_id: messageId || null
            }
          });
        });
      },
      [api]
    );
    const loadRequestModalData = useCallback(
      async (requestId, loadOptions) => {
        if (!api || !requestId) return;
        const localOpts = loadOptions || {};
        const showLoading = localOpts.showLoading !== false;
        if (showLoading) {
          setRequestModal((prev) => ({
            ...prev,
            loading: true,
            requestId,
            requestData: null,
            financeSummary: null,
            invoices: [],
            statusRouteNodes: []
          }));
        }
        const requestFilter = [{ field: "request_id", op: "=", value: String(requestId) }];
        try {
          const [row, messagesData, attachmentsData, statusRouteData, invoicesData] = await Promise.all([
            api("/api/admin/crud/requests/" + requestId),
            api("/api/admin/chat/requests/" + requestId + "/messages"),
            api("/api/admin/crud/attachments/query", {
              method: "POST",
              body: buildUniversalQuery2(requestFilter, [{ field: "created_at", dir: "asc" }], 500, 0)
            }),
            api("/api/admin/requests/" + requestId + "/status-route").catch(() => ({ nodes: [] })),
            api("/api/admin/invoices/query", {
              method: "POST",
              body: buildUniversalQuery2(requestFilter, [{ field: "issued_at", dir: "desc" }], 500, 0)
            }).catch(() => ({ rows: [] }))
          ]);
          const usersById = new Map(users.filter((user) => user && user.id).map((user) => [String(user.id), user]));
          const rowData = row && typeof row === "object" ? { ...row } : row;
          if (rowData && typeof rowData === "object") {
            const assignedLawyerId = String(rowData.assigned_lawyer_id || "").trim();
            if (assignedLawyerId) {
              const lawyer = usersById.get(assignedLawyerId);
              if (lawyer) {
                rowData.assigned_lawyer_name = rowData.assigned_lawyer_name || lawyer.name || lawyer.email || assignedLawyerId;
                rowData.assigned_lawyer_phone = rowData.assigned_lawyer_phone || lawyer.phone || null;
              }
            }
          }
          const attachments = (attachmentsData.rows || []).map((item) => ({
            ...item,
            download_url: resolveAdminObjectSrc2(item.s3_key, token)
          }));
          const usersByEmail = new Map(
            users.filter((user) => user && user.email).map((user) => [String(user.email).toLowerCase(), String(user.name || user.email)])
          );
          const normalizedMessages = (messagesData.rows || []).map((item) => {
            if (!item || typeof item !== "object") return item;
            const authorType = String(item.author_type || "").toUpperCase();
            const authorName = String(item.author_name || "").trim();
            if ((authorType === "LAWYER" || authorType === "SYSTEM") && authorName.includes("@")) {
              const mapped = usersByEmail.get(authorName.toLowerCase());
              if (mapped) return { ...item, author_name: mapped };
            }
            return item;
          });
          const invoices = Array.isArray(invoicesData == null ? void 0 : invoicesData.rows) ? invoicesData.rows : [];
          const paidInvoices = invoices.filter(
            (item) => String((item == null ? void 0 : item.status) || "").toUpperCase() === "PAID"
          );
          const paidTotal = paidInvoices.reduce((acc, item) => {
            const amount = Number((item == null ? void 0 : item.amount) || 0);
            return Number.isFinite(amount) ? acc + amount : acc;
          }, 0);
          const latestPaidAt = paidInvoices.reduce((latest, item) => {
            const raw = item == null ? void 0 : item.paid_at;
            const ts = raw ? new Date(raw).getTime() : Number.NaN;
            if (!Number.isFinite(ts)) return latest;
            if (!latest) return String(raw);
            const latestTs = new Date(latest).getTime();
            return ts > latestTs ? String(raw) : latest;
          }, "");
          setRequestModal((prev) => {
            var _a, _b;
            return {
              ...prev,
              loading: false,
              requestId: (rowData == null ? void 0 : rowData.id) || requestId,
              trackNumber: String((rowData == null ? void 0 : rowData.track_number) || ""),
              requestData: rowData,
              financeSummary: {
                request_cost: (_a = rowData == null ? void 0 : rowData.request_cost) != null ? _a : null,
                effective_rate: (_b = rowData == null ? void 0 : rowData.effective_rate) != null ? _b : null,
                paid_total: Math.round((paidTotal + Number.EPSILON) * 100) / 100,
                last_paid_at: latestPaidAt || (rowData == null ? void 0 : rowData.paid_at) || null
              },
              invoices,
              statusRouteNodes: Array.isArray(statusRouteData == null ? void 0 : statusRouteData.nodes) ? statusRouteData.nodes : [],
              statusHistory: Array.isArray(statusRouteData == null ? void 0 : statusRouteData.history) ? statusRouteData.history : [],
              availableStatuses: Array.isArray(statusRouteData == null ? void 0 : statusRouteData.available_statuses) ? statusRouteData.available_statuses : [],
              currentImportantDateAt: String((statusRouteData == null ? void 0 : statusRouteData.current_important_date_at) || (rowData == null ? void 0 : rowData.important_date_at) || ""),
              messages: normalizedMessages,
              attachments,
              selectedFiles: [],
              fileUploading: false
            };
          });
          if (showLoading && typeof setStatus === "function") setStatus("requestModal", "", "");
        } catch (error) {
          setRequestModal((prev) => ({
            ...prev,
            loading: false,
            requestId,
            requestData: null,
            financeSummary: null,
            invoices: [],
            statusRouteNodes: [],
            statusHistory: [],
            availableStatuses: [],
            currentImportantDateAt: "",
            messages: [],
            attachments: [],
            selectedFiles: [],
            fileUploading: false
          }));
          if (typeof setStatus === "function") setStatus("requestModal", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
        }
      },
      [api, buildUniversalQuery2, resolveAdminObjectSrc2, setStatus, token, users]
    );
    const refreshRequestModal = useCallback(async () => {
      if (!requestModal.requestId) return;
      await loadRequestModalData(requestModal.requestId, { showLoading: true });
    }, [loadRequestModalData, requestModal.requestId]);
    const openRequestDetails = useCallback(
      async (requestId, event, options2) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (!requestId) return;
        const normalizedRequestId = String(requestId);
        const now = Date.now();
        const prev = requestOpenGuardRef.current;
        if (prev.requestId === normalizedRequestId && now - prev.ts < 900) return;
        requestOpenGuardRef.current = { requestId: normalizedRequestId, ts: now };
        if (window.location.pathname !== "/admin.html" || window.location.search) {
          window.history.replaceState(null, "", "/admin.html");
        }
        if (typeof setStatus === "function") setStatus("requestModal", "", "");
        if (typeof setActiveSection === "function") setActiveSection("requestWorkspace");
        await loadRequestModalData(normalizedRequestId, { showLoading: true });
        const preset = options2 && typeof options2 === "object" ? options2.statusChangePreset : null;
        if (preset) {
          setRequestModal((prev2) => ({ ...prev2, pendingStatusChangePreset: preset }));
        }
      },
      [loadRequestModalData, setActiveSection, setStatus]
    );
    const submitRequestModalMessage = useCallback(
      async (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (!api) return;
        const requestId = requestModal.requestId;
        const body = String(requestModal.messageDraft || "").trim();
        const files = Array.isArray(requestModal.selectedFiles) ? requestModal.selectedFiles : [];
        if (!requestId || !body && !files.length) return;
        try {
          setRequestModal((prev) => ({ ...prev, fileUploading: true }));
          if (typeof setStatus === "function") {
            setStatus("requestModal", files.length ? "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0438 \u0444\u0430\u0439\u043B\u043E\u0432..." : "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F...", "");
          }
          let messageId = null;
          if (body) {
            const message = await api("/api/admin/chat/requests/" + requestId + "/messages", {
              method: "POST",
              body: { body }
            });
            messageId = String((message == null ? void 0 : message.id) || "").trim() || null;
          }
          for (const file of files) {
            await uploadRequestAttachmentWithRetry({ requestId, file, messageId });
          }
          setRequestModal((prev) => ({ ...prev, messageDraft: "", selectedFiles: [], fileUploading: false }));
          const successMessage = body && files.length ? "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438 \u0444\u0430\u0439\u043B\u044B \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u044B" : files.length ? "\u0424\u0430\u0439\u043B\u044B \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u044B" : "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E";
          if (typeof setStatus === "function") setStatus("requestModal", successMessage, "ok");
          await loadRequestModalData(requestId, { showLoading: false });
        } catch (error) {
          setRequestModal((prev) => ({ ...prev, fileUploading: false }));
          if (typeof setStatus === "function") setStatus("requestModal", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438: " + error.message, "error");
        }
      },
      [
        api,
        loadRequestModalData,
        requestModal.messageDraft,
        requestModal.requestId,
        requestModal.selectedFiles,
        setStatus,
        uploadRequestAttachmentWithRetry
      ]
    );
    const loadRequestDataTemplates = useCallback(
      async (documentName) => {
        const requestId = requestModal.requestId;
        if (!api || !requestId) return { rows: [], documents: [] };
        const query = documentName ? "?document=" + encodeURIComponent(String(documentName)) : "";
        return api("/api/admin/chat/requests/" + requestId + "/data-request-templates" + query);
      },
      [api, requestModal.requestId]
    );
    const loadRequestDataBatch = useCallback(
      async (messageId) => {
        const requestId = requestModal.requestId;
        if (!api || !requestId || !messageId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
        return api("/api/admin/chat/requests/" + requestId + "/data-requests/" + encodeURIComponent(String(messageId)));
      },
      [api, requestModal.requestId]
    );
    const loadRequestDataTemplateDetails = useCallback(
      async (templateId) => {
        const requestId = requestModal.requestId;
        if (!api || !requestId || !templateId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D \u0448\u0430\u0431\u043B\u043E\u043D");
        return api(
          "/api/admin/chat/requests/" + requestId + "/data-request-templates/" + encodeURIComponent(String(templateId))
        );
      },
      [api, requestModal.requestId]
    );
    const saveRequestDataTemplate = useCallback(
      async (payload) => {
        const requestId = requestModal.requestId;
        if (!api || !requestId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
        return api("/api/admin/chat/requests/" + requestId + "/data-request-templates", {
          method: "POST",
          body: payload || {}
        });
      },
      [api, requestModal.requestId]
    );
    const saveRequestDataBatch = useCallback(
      async (payload) => {
        const requestId = requestModal.requestId;
        if (!api || !requestId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
        const result = await api("/api/admin/chat/requests/" + requestId + "/data-requests", {
          method: "POST",
          body: payload || {}
        });
        await loadRequestModalData(requestId, { showLoading: false });
        return result;
      },
      [api, loadRequestModalData, requestModal.requestId]
    );
    const clearPendingStatusChangePreset = useCallback(() => {
      setRequestModal((prev) => ({ ...prev, pendingStatusChangePreset: null }));
    }, []);
    const probeRequestLive = useCallback(
      async ({ cursor } = {}) => {
        const requestId = requestModal.requestId;
        if (!api || !requestId) return { has_updates: false, typing: [], cursor: null };
        const query = cursor ? "?cursor=" + encodeURIComponent(String(cursor)) : "";
        const payload = await api("/api/admin/chat/requests/" + requestId + "/live" + query);
        if (payload && payload.has_updates) {
          await loadRequestModalData(requestId, { showLoading: false });
        }
        return payload || { has_updates: false, typing: [], cursor: null };
      },
      [api, loadRequestModalData, requestModal.requestId]
    );
    const setRequestTyping = useCallback(
      async ({ typing } = {}) => {
        const requestId = requestModal.requestId;
        if (!api || !requestId) return { status: "skipped", typing: false };
        return api("/api/admin/chat/requests/" + requestId + "/typing", {
          method: "POST",
          body: { typing: Boolean(typing) }
        });
      },
      [api, requestModal.requestId]
    );
    const submitRequestStatusChange = useCallback(
      async ({ requestId, statusCode, importantDateAt, comment, files } = {}) => {
        var _a;
        if (!api) throw new Error("API \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
        const targetRequestId = String(requestId || requestModal.requestId || "").trim();
        if (!targetRequestId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
        const nextStatus = String(statusCode || "").trim();
        if (!nextStatus) throw new Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441");
        const body = {
          status_code: nextStatus,
          important_date_at: importantDateAt || null,
          comment: String(comment || "").trim() || null
        };
        if (typeof setStatus === "function") setStatus("requestModal", "\u0421\u043C\u0435\u043D\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0430...", "");
        const result = await api("/api/admin/requests/" + targetRequestId + "/status-change", {
          method: "POST",
          body
        });
        const attachedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
        const commentText = String(comment || "").trim();
        const availableStatuses = Array.isArray(requestModal.availableStatuses) ? requestModal.availableStatuses : [];
        const statusName = (_a = availableStatuses.find((item) => String((item == null ? void 0 : item.code) || "").trim() === String((result == null ? void 0 : result.to_status) || nextStatus).trim())) == null ? void 0 : _a.name;
        const nextStatusLabel = String(statusName || (result == null ? void 0 : result.to_status) || nextStatus).trim() || nextStatus;
        const importantDateRaw = String((result == null ? void 0 : result.important_date_at) || importantDateAt || "").trim();
        const importantDateLabel = importantDateRaw ? fmtShortDateTime(importantDateRaw) : "";
        const serviceLines = [`\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441: "${nextStatusLabel}"`];
        if (importantDateRaw) {
          serviceLines.push("\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430: " + (importantDateLabel && importantDateLabel !== "-" ? importantDateLabel : importantDateRaw));
        }
        if (commentText) serviceLines.push(commentText);
        let messageId = null;
        const serviceMessageBody = serviceLines.filter(Boolean).join("\n").trim();
        if (serviceMessageBody) {
          const message = await api("/api/admin/chat/requests/" + targetRequestId + "/messages", {
            method: "POST",
            body: { body: serviceMessageBody }
          });
          messageId = String((message == null ? void 0 : message.id) || "").trim() || null;
        }
        for (const file of attachedFiles) {
          await uploadRequestAttachmentWithRetry({ requestId: targetRequestId, file, messageId });
        }
        if (typeof setStatus === "function") setStatus("requestModal", "\u0421\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u044F\u0432\u043A\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D", "ok");
        await loadRequestModalData(targetRequestId, { showLoading: false });
        return result;
      },
      [api, loadRequestModalData, requestModal.availableStatuses, requestModal.requestId, setStatus, uploadRequestAttachmentWithRetry]
    );
    const issueRequestInvoice = useCallback(
      async ({ requestId, amount, serviceDescription, payerDisplayName } = {}) => {
        if (!api) throw new Error("API \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
        const targetRequestId = String(requestId || requestModal.requestId || "").trim();
        if (!targetRequestId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
          throw new Error("\u0421\u0443\u043C\u043C\u0430 \u0441\u0447\u0435\u0442\u0430 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0443\u043B\u044F");
        }
        const roundedAmount = Math.round((parsedAmount + Number.EPSILON) * 100) / 100;
        const rowData = requestModal.requestData && typeof requestModal.requestData === "object" ? requestModal.requestData : null;
        const payerName = String(payerDisplayName || (rowData == null ? void 0 : rowData.client_name) || "").trim() || "\u041A\u043B\u0438\u0435\u043D\u0442";
        const serviceLabel = String(serviceDescription || "").trim() || "\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0443\u0441\u043B\u0443\u0433\u0438";
        const trackNumber = String((rowData == null ? void 0 : rowData.track_number) || requestModal.trackNumber || "").trim();
        const topicLabel = String((rowData == null ? void 0 : rowData.topic_name) || (rowData == null ? void 0 : rowData.topic_code) || "").trim();
        if (typeof setStatus === "function") setStatus("requestModal", "\u0412\u044B\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u043C \u0441\u0447\u0435\u0442...", "");
        const created = await api("/api/admin/invoices", {
          method: "POST",
          body: {
            request_id: targetRequestId,
            status: "WAITING_PAYMENT",
            amount: roundedAmount,
            currency: "RUB",
            payer_display_name: payerName,
            payer_details: {
              ...DEFAULT_INVOICE_REQUISITES,
              request_track_number: trackNumber,
              service_description: serviceLabel,
              topic_name: topicLabel
            }
          }
        });
        await loadRequestModalData(targetRequestId, { showLoading: false });
        if (typeof setStatus === "function") {
          const invoiceNumber = String((created == null ? void 0 : created.invoice_number) || "").trim();
          setStatus("requestModal", invoiceNumber ? "\u0421\u0447\u0435\u0442 \u0432\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D: " + invoiceNumber : "\u0421\u0447\u0435\u0442 \u0432\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D", "ok");
        }
        return created;
      },
      [api, loadRequestModalData, requestModal.requestData, requestModal.requestId, requestModal.trackNumber, setStatus]
    );
    return {
      requestModal,
      setRequestModal,
      requestOpenGuardRef,
      resetRequestWorkspaceState,
      updateRequestModalMessageDraft,
      appendRequestModalFiles,
      removeRequestModalFile,
      clearRequestModalFiles,
      loadRequestModalData,
      refreshRequestModal,
      openRequestDetails,
      clearPendingStatusChangePreset,
      submitRequestStatusChange,
      submitRequestModalMessage,
      probeRequestLive,
      setRequestTyping,
      loadRequestDataTemplates,
      loadRequestDataBatch,
      loadRequestDataTemplateDetails,
      saveRequestDataTemplate,
      saveRequestDataBatch,
      issueRequestInvoice
    };
  }

  // app/web/admin/hooks/useTableActions.js
  function useTableActions({ api, setStatus, resolveTableConfig, tablesRef, setTableState, setDictionaries, buildUniversalQuery: buildUniversalQuery2 }) {
    const { useCallback } = React;
    const loadTable = useCallback(
      async (tableKey, options, tokenOverride) => {
        const opts = options || {};
        const config = resolveTableConfig(tableKey);
        if (!config) return false;
        const current = tablesRef.current[tableKey] || createTableState();
        const next = {
          ...current,
          filters: Array.isArray(opts.filtersOverride) ? [...opts.filtersOverride] : [...current.filters || []],
          sort: Array.isArray(opts.sortOverride) ? [...opts.sortOverride] : Array.isArray(current.sort) ? [...current.sort] : null,
          rows: [...current.rows || []]
        };
        if (opts.resetOffset) {
          next.offset = 0;
          next.showAll = false;
        }
        if (opts.loadAll) {
          next.offset = 0;
          next.showAll = true;
        }
        const statusKey = tableKey;
        setStatus(statusKey, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
        try {
          const activeSort = next.sort && next.sort.length ? next.sort : config.sort;
          let limit = next.showAll ? Math.max(next.total || PAGE_SIZE, PAGE_SIZE) : PAGE_SIZE;
          const offset = next.showAll ? 0 : next.offset;
          let data = await api(
            config.endpoint,
            {
              method: "POST",
              body: buildUniversalQuery2(next.filters, activeSort, limit, offset)
            },
            tokenOverride
          );
          next.total = Number(data.total || 0);
          next.rows = data.rows || [];
          if (next.showAll && next.total > next.rows.length) {
            limit = next.total;
            data = await api(
              config.endpoint,
              {
                method: "POST",
                body: buildUniversalQuery2(next.filters, activeSort, limit, 0)
              },
              tokenOverride
            );
            next.total = Number(data.total || next.total);
            next.rows = data.rows || [];
          }
          if (!next.showAll && next.total > 0 && next.offset >= next.total) {
            next.offset = Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE;
            setTableState(tableKey, next);
            return loadTable(tableKey, {}, tokenOverride);
          }
          setTableState(tableKey, next);
          if (tableKey === "requests") {
            setDictionaries((prev) => {
              const map = new Map((prev.topics || []).map((topic) => [topic.code, topic]));
              (next.rows || []).forEach((row) => {
                if (!row.topic_code || map.has(row.topic_code)) return;
                map.set(row.topic_code, { code: row.topic_code, name: row.topic_code });
              });
              return { ...prev, topics: sortByName(Array.from(map.values())) };
            });
          }
          if (tableKey === "topics") {
            setDictionaries((prev) => ({
              ...prev,
              topics: sortByName((next.rows || []).map((row) => ({ code: row.code, name: row.name || row.code })))
            }));
          }
          if (tableKey === "statuses") {
            setDictionaries((prev) => {
              const map = new Map(Object.entries(STATUS_LABELS).map(([code, name]) => [code, { code, name }]));
              (next.rows || []).forEach((row) => {
                if (!row.code) return;
                map.set(row.code, { code: row.code, name: row.name || statusLabel(row.code) });
              });
              return { ...prev, statuses: sortByName(Array.from(map.values())) };
            });
          }
          if (tableKey === "formFields" || tableKey === "form_fields") {
            setDictionaries((prev) => {
              const set = new Set(DEFAULT_FORM_FIELD_TYPES);
              (next.rows || []).forEach((row) => {
                if (row == null ? void 0 : row.type) set.add(row.type);
              });
              const fieldKeys = (next.rows || []).filter((row) => row && row.key).map((row) => ({ key: row.key, label: row.label || row.key })).sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
              return {
                ...prev,
                formFieldTypes: Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
                formFieldKeys: fieldKeys
              };
            });
          }
          if (tableKey === "users" || tableKey === "admin_users") {
            setDictionaries((prev) => {
              const map = new Map((prev.users || []).map((user) => [user.id, user]));
              (next.rows || []).forEach((row) => {
                map.set(row.id, {
                  id: row.id,
                  name: row.name || "",
                  email: row.email || "",
                  role: row.role || "",
                  is_active: Boolean(row.is_active)
                });
              });
              return { ...prev, users: Array.from(map.values()) };
            });
          }
          setStatus(statusKey, "\u0421\u043F\u0438\u0441\u043E\u043A \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D", "ok");
          return true;
        } catch (error) {
          setStatus(statusKey, "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          return false;
        }
      },
      [api, buildUniversalQuery2, resolveTableConfig, setDictionaries, setStatus, setTableState, tablesRef]
    );
    const loadPrevPage = useCallback(
      (tableKey) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        const next = { ...tableState, offset: Math.max(0, tableState.offset - PAGE_SIZE), showAll: false };
        setTableState(tableKey, next);
        loadTable(tableKey, {});
      },
      [loadTable, setTableState, tablesRef]
    );
    const loadNextPage = useCallback(
      (tableKey) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        if (tableState.offset + PAGE_SIZE >= tableState.total) return;
        const next = { ...tableState, offset: tableState.offset + PAGE_SIZE, showAll: false };
        setTableState(tableKey, next);
        loadTable(tableKey, {});
      },
      [loadTable, setTableState, tablesRef]
    );
    const loadAllRows = useCallback(
      (tableKey) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        if (!tableState.total) return;
        const next = { ...tableState, offset: 0, showAll: true };
        setTableState(tableKey, next);
        loadTable(tableKey, { loadAll: true });
      },
      [loadTable, setTableState, tablesRef]
    );
    const toggleTableSort = useCallback(
      (tableKey, field) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        const currentSort = Array.isArray(tableState.sort) ? tableState.sort[0] : null;
        const dir = currentSort && currentSort.field === field ? currentSort.dir === "asc" ? "desc" : "asc" : "asc";
        const sortOverride = [{ field, dir }];
        const next = { ...tableState, sort: sortOverride, offset: 0, showAll: false };
        setTableState(tableKey, next);
        loadTable(tableKey, { resetOffset: true, sortOverride });
      },
      [loadTable, setTableState, tablesRef]
    );
    return {
      loadTable,
      loadPrevPage,
      loadNextPage,
      loadAllRows,
      toggleTableSort
    };
  }

  // app/web/admin/hooks/useTableFilterActions.js
  function useTableFilterActions({
    filterModal,
    closeFilterModal,
    getFieldDef,
    loadKanban,
    loadTable,
    setStatus,
    setTableState,
    tablesRef
  }) {
    const { useCallback } = React;
    const applyFilterModal = useCallback(
      async (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (!filterModal.tableKey) return;
        const fieldDef = getFieldDef(filterModal.tableKey, filterModal.field);
        if (!fieldDef) {
          setStatus("filter", "\u041F\u043E\u043B\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u0430 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043E", "error");
          return;
        }
        let value;
        if (fieldDef.type === "boolean") {
          value = filterModal.rawValue === "true";
        } else if (fieldDef.type === "number") {
          if (String(filterModal.rawValue || "").trim() === "") {
            setStatus("filter", "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0447\u0438\u0441\u043B\u043E", "error");
            return;
          }
          value = Number(filterModal.rawValue);
          if (Number.isNaN(value)) {
            setStatus("filter", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E", "error");
            return;
          }
        } else {
          value = String(filterModal.rawValue || "").trim();
          if (!value) {
            setStatus("filter", "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u0430", "error");
            return;
          }
        }
        const tableState = tablesRef.current[filterModal.tableKey] || createTableState();
        const nextFilters = [...tableState.filters || []];
        const nextClause = { field: fieldDef.field, op: filterModal.op, value };
        if (Number.isInteger(filterModal.editIndex) && filterModal.editIndex >= 0 && filterModal.editIndex < nextFilters.length) {
          nextFilters[filterModal.editIndex] = nextClause;
        } else {
          const existingIndex = nextFilters.findIndex((item) => item.field === nextClause.field && item.op === nextClause.op);
          if (existingIndex >= 0) nextFilters[existingIndex] = nextClause;
          else nextFilters.push(nextClause);
        }
        setTableState(filterModal.tableKey, {
          ...tableState,
          filters: nextFilters,
          offset: 0,
          showAll: false
        });
        closeFilterModal();
        if (filterModal.tableKey === "kanban") {
          await loadKanban(void 0, { filtersOverride: nextFilters });
        } else {
          await loadTable(filterModal.tableKey, { resetOffset: true, filtersOverride: nextFilters });
        }
      },
      [closeFilterModal, filterModal, getFieldDef, loadKanban, loadTable, setStatus, setTableState, tablesRef]
    );
    const clearFiltersFromModal = useCallback(async () => {
      if (!filterModal.tableKey) return;
      const tableState = tablesRef.current[filterModal.tableKey] || createTableState();
      setTableState(filterModal.tableKey, {
        ...tableState,
        filters: [],
        offset: 0,
        showAll: false
      });
      closeFilterModal();
      if (filterModal.tableKey === "kanban") {
        await loadKanban(void 0, { filtersOverride: [] });
      } else {
        await loadTable(filterModal.tableKey, { resetOffset: true, filtersOverride: [] });
      }
    }, [closeFilterModal, filterModal.tableKey, loadKanban, loadTable, setTableState, tablesRef]);
    const removeFilterChip = useCallback(
      async (tableKey, index) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        const nextFilters = [...tableState.filters || []];
        nextFilters.splice(index, 1);
        setTableState(tableKey, {
          ...tableState,
          filters: nextFilters,
          offset: 0,
          showAll: false
        });
        if (tableKey === "kanban") {
          await loadKanban(void 0, { filtersOverride: nextFilters });
        } else {
          await loadTable(tableKey, { resetOffset: true, filtersOverride: nextFilters });
        }
      },
      [loadKanban, loadTable, setTableState, tablesRef]
    );
    return {
      applyFilterModal,
      clearFiltersFromModal,
      removeFilterChip
    };
  }

  // app/web/admin/hooks/useTablesState.js
  function createInitialTablesState() {
    return {
      kanban: createTableState(),
      requests: createTableState(),
      serviceRequests: createTableState(),
      invoices: createTableState(),
      quotes: createTableState(),
      topics: createTableState(),
      statuses: createTableState(),
      formFields: createTableState(),
      topicRequiredFields: createTableState(),
      topicDataTemplates: createTableState(),
      statusTransitions: createTableState(),
      users: createTableState(),
      userTopics: createTableState(),
      availableTables: createTableState()
    };
  }
  function useTablesState() {
    const { useCallback, useEffect, useRef, useState } = React;
    const [tables, setTables] = useState(createInitialTablesState);
    const [tableCatalog, setTableCatalog] = useState([]);
    const [referenceRowsMap, setReferenceRowsMap] = useState({});
    const tablesRef = useRef(tables);
    useEffect(() => {
      tablesRef.current = tables;
    }, [tables]);
    const setTableState = useCallback((tableKey, next) => {
      setTables((prev) => ({ ...prev, [tableKey]: next }));
    }, []);
    const resetTablesState = useCallback(() => {
      setTables(createInitialTablesState());
      setTableCatalog([]);
      setReferenceRowsMap({});
    }, []);
    return {
      tables,
      setTables,
      tablesRef,
      setTableState,
      resetTablesState,
      tableCatalog,
      setTableCatalog,
      referenceRowsMap,
      setReferenceRowsMap
    };
  }

  // app/web/admin.jsx
  var import_qrcode = __toESM(require_browser());
  (function() {
    const { useCallback, useEffect, useMemo, useRef, useState } = React;
    const LEGACY_HIDDEN_DICTIONARY_TABLES = /* @__PURE__ */ new Set(["formFields", "topicRequiredFields", "statusTransitions"]);
    const NEW_REQUEST_CLIENT_OPTION = "__new_client__";
    function StatusLine({ status }) {
      return /* @__PURE__ */ React.createElement("p", { className: "status" + ((status == null ? void 0 : status.kind) ? " " + status.kind : "") }, (status == null ? void 0 : status.message) || "");
    }
    function Section({ active, children, id }) {
      return /* @__PURE__ */ React.createElement("section", { className: "section" + (active ? " active" : ""), id }, children);
    }
    function DataTable({ headers, rows, emptyColspan, renderRow, onSort, sortClause }) {
      return /* @__PURE__ */ React.createElement("div", { className: "table-wrap table-scroll-region" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, headers.map((header) => {
        const h = typeof header === "string" ? { key: header, label: header } : header;
        const sortable = Boolean(h.sortable && h.field && onSort);
        const active = Boolean(sortable && sortClause && sortClause.field === h.field);
        const direction = active ? sortClause.dir : "";
        return /* @__PURE__ */ React.createElement(
          "th",
          {
            key: h.key || h.label,
            className: sortable ? "sortable-th" : "",
            onClick: sortable ? () => onSort(h.field) : void 0,
            title: sortable ? "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u0441\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0438" : void 0
          },
          /* @__PURE__ */ React.createElement("span", { className: sortable ? "sortable-head" : "" }, h.label, sortable ? /* @__PURE__ */ React.createElement("span", { className: "sort-indicator" + (active ? " active" : "") }, direction === "desc" ? "\u2193" : "\u2191") : null)
        );
      }))), /* @__PURE__ */ React.createElement("tbody", null, rows.length ? rows.map((row, index) => renderRow(row, index)) : /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: emptyColspan }, "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445")))));
    }
    function TablePager({ tableState, onPrev, onNext, onLoadAll, onRefresh, onCreate, onOpenFilter }) {
      return /* @__PURE__ */ React.createElement("div", { className: "pager table-footer-bar" }, /* @__PURE__ */ React.createElement("div", null, tableState.showAll ? "\u0412\u0441\u0435\u0433\u043E: " + tableState.total + " \u2022 \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0432\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438" : "\u0412\u0441\u0435\u0433\u043E: " + tableState.total + " \u2022 \u0441\u043C\u0435\u0449\u0435\u043D\u0438\u0435: " + tableState.offset), /* @__PURE__ */ React.createElement("div", { className: "table-footer-actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn secondary table-control-btn table-control-loadall",
          type: "button",
          onClick: onLoadAll,
          disabled: tableState.total === 0 || tableState.showAll || tableState.rows.length >= tableState.total,
          title: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u0441\u0435 " + tableState.total,
          "aria-label": "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u0441\u0435 " + tableState.total
        },
        /* @__PURE__ */ React.createElement(DownloadIcon, null),
        /* @__PURE__ */ React.createElement("span", null, tableState.total)
      ), onRefresh ? /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onRefresh, title: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C", "aria-label": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" }, /* @__PURE__ */ React.createElement(RefreshIcon, null)) : null, onCreate ? /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onCreate, title: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C", "aria-label": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" }, /* @__PURE__ */ React.createElement(AddIcon, null)) : null, onOpenFilter ? /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onOpenFilter, title: "\u0424\u0438\u043B\u044C\u0442\u0440", "aria-label": "\u0424\u0438\u043B\u044C\u0442\u0440" }, /* @__PURE__ */ React.createElement(FilterIcon, null)) : null, /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onPrev, disabled: tableState.showAll || tableState.offset <= 0, title: "\u041D\u0430\u0437\u0430\u0434", "aria-label": "\u041D\u0430\u0437\u0430\u0434" }, /* @__PURE__ */ React.createElement(PrevIcon, null)), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn secondary table-control-btn",
          type: "button",
          onClick: onNext,
          disabled: tableState.showAll || tableState.offset + PAGE_SIZE >= tableState.total,
          title: "\u0412\u043F\u0435\u0440\u0435\u0434",
          "aria-label": "\u0412\u043F\u0435\u0440\u0435\u0434"
        },
        /* @__PURE__ */ React.createElement(NextIcon, null)
      )));
    }
    function FilterToolbar({ filters, onOpen, onRemove, onEdit, getChipLabel, hideAction = false }) {
      return /* @__PURE__ */ React.createElement("div", { className: "filter-toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "filter-chips" }, filters.length ? filters.map((filter, index) => /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "filter-chip",
          key: filter.field + filter.op + index,
          onClick: () => onEdit(index),
          role: "button",
          tabIndex: 0,
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onEdit(index);
            }
          },
          title: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440"
        },
        /* @__PURE__ */ React.createElement("span", null, getChipLabel(filter)),
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            "aria-label": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440",
            onClick: (event) => {
              event.stopPropagation();
              onRemove(index);
            }
          },
          "\xD7"
        )
      )) : /* @__PURE__ */ React.createElement("span", { className: "chip-placeholder" }, "\u0424\u0438\u043B\u044C\u0442\u0440\u044B \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B")), !hideAction ? /* @__PURE__ */ React.createElement("div", { className: "filter-action" }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary table-control-btn", type: "button", onClick: onOpen, title: "\u0424\u0438\u043B\u044C\u0442\u0440", "aria-label": "\u0424\u0438\u043B\u044C\u0442\u0440" }, /* @__PURE__ */ React.createElement(FilterIcon, null))) : null);
    }
    function Overlay({ open, onClose, children, id }) {
      return /* @__PURE__ */ React.createElement("div", { className: "overlay" + (open ? " open" : ""), id, onClick: onClose }, children);
    }
    function IconButton({ icon, tooltip, onClick, tone, disabled = false }) {
      const handleClick = (event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.nativeEvent && typeof event.nativeEvent.stopImmediatePropagation === "function") {
          event.nativeEvent.stopImmediatePropagation();
        }
        if (typeof onClick === "function") onClick(event);
      };
      const handleAuxClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.nativeEvent && typeof event.nativeEvent.stopImmediatePropagation === "function") {
          event.nativeEvent.stopImmediatePropagation();
        }
      };
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "icon-btn" + (tone ? " " + tone : ""),
          type: "button",
          "data-tooltip": tooltip,
          onClick: handleClick,
          onAuxClick: handleAuxClick,
          "aria-label": tooltip,
          disabled
        },
        icon
      );
    }
    function UserAvatar({ name, email, avatarUrl, accessToken, size = 32 }) {
      const [broken, setBroken] = useState(false);
      useEffect(() => setBroken(false), [avatarUrl]);
      const initials = userInitials(name, email);
      const bg = avatarColor(name || email || initials);
      const src = resolveAvatarSrc(avatarUrl, accessToken);
      const canShowImage = Boolean(src && !broken);
      return /* @__PURE__ */ React.createElement("span", { className: "avatar", style: { width: size + "px", height: size + "px", backgroundColor: bg } }, canShowImage ? /* @__PURE__ */ React.createElement("img", { src, alt: name || email || "avatar", onError: () => setBroken(true) }) : /* @__PURE__ */ React.createElement("span", null, initials));
    }
    function LoginScreen({ onSubmit, status }) {
      const [email, setEmail] = useState("");
      const [password, setPassword] = useState("");
      const [totpCode, setTotpCode] = useState("");
      const submit = (event) => {
        event.preventDefault();
        onSubmit(email, password, totpCode);
      };
      return /* @__PURE__ */ React.createElement("div", { className: "login-screen" }, /* @__PURE__ */ React.createElement("div", { className: "login-card" }, /* @__PURE__ */ React.createElement("h2", null, "\u0412\u0445\u043E\u0434 \u0432 \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u044C"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0443\u0447\u0435\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430 \u0438\u043B\u0438 \u044E\u0440\u0438\u0441\u0442\u0430."), /* @__PURE__ */ React.createElement("form", { className: "stack", style: { marginTop: "0.7rem" }, onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "login-email" }, "\u042D\u043B. \u043F\u043E\u0447\u0442\u0430"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "login-email",
          type: "email",
          required: true,
          placeholder: "admin@example.com",
          value: email,
          onChange: (event) => setEmail(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "login-password" }, "\u041F\u0430\u0440\u043E\u043B\u044C"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "login-password",
          type: "password",
          required: true,
          placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
          value: password,
          onChange: (event) => setPassword(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "login-totp" }, "TOTP / \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0439 \u043A\u043E\u0434"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "login-totp",
          type: "text",
          placeholder: "123456 \u0438\u043B\u0438 backup-code",
          value: totpCode,
          onChange: (event) => setTotpCode(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "\u0412\u043E\u0439\u0442\u0438"), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function FilterModal({
      open,
      tableLabel,
      fields,
      draft,
      status,
      onClose,
      onFieldChange,
      onOpChange,
      onValueChange,
      onSubmit,
      onClear,
      getOperators,
      getFieldOptions
    }) {
      if (!open) return null;
      const selectedField = fields.find((field) => field.field === draft.field) || fields[0] || null;
      const operators = getOperators((selectedField == null ? void 0 : selectedField.type) || "text");
      const options = selectedField ? getFieldOptions(selectedField) : [];
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "filter-overlay", onClose: (event) => event.target.id === "filter-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: { width: "min(560px, 100%)" }, onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0424\u0438\u043B\u044C\u0442\u0440 \u0442\u0430\u0431\u043B\u0438\u0446\u044B"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, tableLabel ? (draft.editIndex !== null ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u0430 \u2022 " : "\u041D\u043E\u0432\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440 \u2022 ") + "\u0422\u0430\u0431\u043B\u0438\u0446\u0430: " + tableLabel : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u043B\u0435, \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0438 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435.")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "filter-field" }, "\u041F\u043E\u043B\u0435"), /* @__PURE__ */ React.createElement("select", { id: "filter-field", value: draft.field, onChange: onFieldChange }, fields.map((field) => /* @__PURE__ */ React.createElement("option", { value: field.field, key: field.field }, field.label)))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "filter-op" }, "\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440"), /* @__PURE__ */ React.createElement("select", { id: "filter-op", value: draft.op, onChange: onOpChange }, operators.map((op) => /* @__PURE__ */ React.createElement("option", { value: op, key: op }, OPERATOR_LABELS[op])))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "filter-value" }, selectedField ? "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435: " + selectedField.label : "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435"), !selectedField || selectedField.type === "text" ? /* @__PURE__ */ React.createElement("input", { id: "filter-value", type: "text", value: draft.rawValue, onChange: onValueChange, placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435" }) : selectedField.type === "number" ? /* @__PURE__ */ React.createElement("input", { id: "filter-value", type: "number", step: "any", value: draft.rawValue, onChange: onValueChange, placeholder: "\u0427\u0438\u0441\u043B\u043E" }) : selectedField.type === "date" ? /* @__PURE__ */ React.createElement("input", { id: "filter-value", type: "date", value: draft.rawValue, onChange: onValueChange }) : selectedField.type === "boolean" ? /* @__PURE__ */ React.createElement("select", { id: "filter-value", value: draft.rawValue, onChange: onValueChange }, /* @__PURE__ */ React.createElement("option", { value: "true" }, "True"), /* @__PURE__ */ React.createElement("option", { value: "false" }, "False")) : selectedField.type === "reference" || selectedField.type === "enum" ? /* @__PURE__ */ React.createElement("select", { id: "filter-value", value: draft.rawValue, onChange: onValueChange, disabled: !options.length }, !options.length ? /* @__PURE__ */ React.createElement("option", { value: "" }, "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0439") : options.map((option) => /* @__PURE__ */ React.createElement("option", { value: String(option.value), key: String(option.value) }, option.label))) : /* @__PURE__ */ React.createElement("input", { id: "filter-value", type: "text", value: draft.rawValue, onChange: onValueChange, placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435" })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, draft.editIndex !== null ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" : "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClear }, "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose }, "\u041E\u0442\u043C\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function ReassignModal({ open, status, options, value, onChange, onClose, onSubmit, trackNumber }) {
      if (!open) return null;
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "reassign-overlay", onClose: (event) => event.target.id === "reassign-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: { width: "min(520px, 100%)" }, onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, trackNumber ? "\u0417\u0430\u044F\u0432\u043A\u0430: " + trackNumber : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u043E\u0432\u043E\u0433\u043E \u044E\u0440\u0438\u0441\u0442\u0430")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "reassign-lawyer" }, "\u041D\u043E\u0432\u044B\u0439 \u044E\u0440\u0438\u0441\u0442"), /* @__PURE__ */ React.createElement("select", { id: "reassign-lawyer", value, onChange, disabled: !options.length }, !options.length ? /* @__PURE__ */ React.createElement("option", { value: "" }, "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u044E\u0440\u0438\u0441\u0442\u043E\u0432") : options.map((option) => /* @__PURE__ */ React.createElement("option", { value: String(option.value), key: String(option.value) }, option.label)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: !value }, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose }, "\u041E\u0442\u043C\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function KanbanSortModal({ open, value, status, onChange, onClose, onSubmit }) {
      if (!open) return null;
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "kanban-sort-overlay", onClose: (event) => event.target.id === "kanban-sort-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: { width: "min(520px, 100%)" }, onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430 \u043A\u0430\u043D\u0431\u0430\u043D\u0430"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u043E\u0441\u043E\u0431 \u0441\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0438 \u043A\u0430\u0440\u0442\u043E\u0447\u0435\u043A.")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "kanban-sort-mode" }, "\u0422\u0438\u043F \u0441\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("select", { id: "kanban-sort-mode", value, onChange }, /* @__PURE__ */ React.createElement("option", { value: "created_newest" }, "\u0414\u0430\u0442\u0430 \u0437\u0430\u044F\u0432\u043A\u0438 (\u043D\u043E\u0432\u044B\u0435 \u0441\u0432\u0435\u0440\u0445\u0443)"), /* @__PURE__ */ React.createElement("option", { value: "lawyer" }, "\u042E\u0440\u0438\u0441\u0442"), /* @__PURE__ */ React.createElement("option", { value: "deadline" }, "\u0414\u0435\u0434\u043B\u0430\u0439\u043D"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "\u041E\u043A"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose }, "\u041E\u0442\u043C\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function TotpSetupModal({
      open,
      status,
      secret,
      uri,
      qrDataUrl,
      code,
      loading,
      onCodeChange,
      onClose,
      onSubmit,
      onCopySecret,
      onCopyUri
    }) {
      if (!open) return null;
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "totp-setup-overlay", onClose: (event) => event.target.id === "totp-setup-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: { width: "min(700px, 100%)" }, onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 2FA"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, "\u0421\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435 QR-\u043A\u043E\u0434 \u0432 Google Authenticator \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 6-\u0437\u043D\u0430\u0447\u043D\u044B\u043C \u043A\u043E\u0434\u043E\u043C.")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "totp-setup-grid" }, /* @__PURE__ */ React.createElement("div", { className: "totp-qr-box" }, qrDataUrl ? /* @__PURE__ */ React.createElement("img", { className: "totp-qr-img", src: qrDataUrl, alt: "QR-\u043A\u043E\u0434 \u0434\u043B\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 2FA" }) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "QR-\u043A\u043E\u0434 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043B\u044E\u0447 \u0432\u0440\u0443\u0447\u043D\u0443\u044E.")), /* @__PURE__ */ React.createElement("div", { className: "stack" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "totp-secret" }, "\u0421\u0435\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u043A\u043B\u044E\u0447"), /* @__PURE__ */ React.createElement("input", { id: "totp-secret", type: "text", value: secret, readOnly: true })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "totp-uri" }, "URI (otpauth)"), /* @__PURE__ */ React.createElement("textarea", { id: "totp-uri", rows: 3, value: uri, readOnly: true })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.5rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onCopySecret }, "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u043B\u044E\u0447"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onCopyUri }, "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C URI")))), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "totp-verify-code" }, "\u041A\u043E\u0434 \u0438\u0437 Google Authenticator"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "totp-verify-code",
          type: "text",
          inputMode: "numeric",
          autoComplete: "one-time-code",
          placeholder: "123456",
          value: code,
          onChange: onCodeChange
        }
      )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: loading }, loading ? "\u0412\u043A\u043B\u044E\u0447\u0430\u0435\u043C..." : "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C 2FA"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose, disabled: loading }, "\u041E\u0442\u043C\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function AccountModal({
      open,
      status,
      profileLoading,
      saveLoading,
      form,
      currentEmail,
      currentRoleLabel,
      totpStatus,
      onFieldChange,
      onClose,
      onSubmit,
      onSetupTotp,
      onRegenerateBackupCodes,
      onDisableTotp,
      onLogout
    }) {
      if (!open) return null;
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "account-overlay", onClose: (event) => event.target.id === "account-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal account-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u041B\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0438 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430.")), /* @__PURE__ */ React.createElement("div", { className: "modal-head-actions" }, /* @__PURE__ */ React.createElement("button", { className: "icon-btn", type: "button", "data-tooltip": "\u0412\u044B\u0439\u0442\u0438 \u0438\u0437 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430", "aria-label": "\u0412\u044B\u0439\u0442\u0438 \u0438\u0437 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430", onClick: onLogout }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M15.4 5.4a1 1 0 0 1 1.4 0l5.2 5.2a1 1 0 0 1 0 1.4l-5.2 5.2a1 1 0 1 1-1.4-1.4l3.5-3.4H9a1 1 0 1 1 0-2h9.9l-3.5-3.4a1 1 0 0 1 0-1.4zM3 4a1 1 0 0 1 1-1h7a1 1 0 1 1 0 2H5v14h6a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1V4z",
          fill: "currentColor"
        }
      ))), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7"))), profileLoading ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u0440\u043E\u0444\u0438\u043B\u044F...") : /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "account-security-box" }, "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C: ", /* @__PURE__ */ React.createElement("b", null, currentEmail || "-"), /* @__PURE__ */ React.createElement("br", null), "\u0420\u043E\u043B\u044C: ", /* @__PURE__ */ React.createElement("b", null, currentRoleLabel || "-"), /* @__PURE__ */ React.createElement("br", null), "2FA: ", /* @__PURE__ */ React.createElement("b", null, totpStatus.enabled ? "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u0430" : "\u0412\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement("div", { className: "account-modal-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "account-name" }, "\u0418\u043C\u044F"), /* @__PURE__ */ React.createElement("input", { id: "account-name", name: "name", type: "text", value: form.name, onChange: onFieldChange })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "account-email" }, "\u041F\u043E\u0447\u0442\u0430"), /* @__PURE__ */ React.createElement("input", { id: "account-email", name: "email", type: "email", value: form.email, onChange: onFieldChange }))), /* @__PURE__ */ React.createElement("div", { className: "account-modal-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "account-phone" }, "\u0422\u0435\u043B\u0435\u0444\u043E\u043D"), /* @__PURE__ */ React.createElement("input", { id: "account-phone", name: "phone", type: "text", value: form.phone, onChange: onFieldChange })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "account-password" }, "\u041D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "account-password",
          name: "password",
          type: "password",
          autoComplete: "new-password",
          value: form.password,
          onChange: onFieldChange,
          placeholder: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0435\u0441\u043B\u0438 \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442\u0435"
        }
      ))), /* @__PURE__ */ React.createElement("div", { className: "account-modal-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "account-password-confirm" }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u043E\u043B\u044F"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "account-password-confirm",
          name: "passwordConfirm",
          type: "password",
          autoComplete: "new-password",
          value: form.passwordConfirm,
          onChange: onFieldChange
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "field" })), /* @__PURE__ */ React.createElement("div", { className: "account-security-box" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("b", null, "2FA"), ": ", totpStatus.enabled ? "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u0430" : "\u0412\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430"), /* @__PURE__ */ React.createElement("div", { className: "muted" }, "\u0420\u0435\u0436\u0438\u043C: ", String(totpStatus.mode || "-"))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.6rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onSetupTotp }, "\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C 2FA"), totpStatus.enabled ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onRegenerateBackupCodes }, "Backup-\u043A\u043E\u0434\u044B"), /* @__PURE__ */ React.createElement("button", { className: "btn danger", type: "button", onClick: onDisableTotp }, "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C 2FA")) : null)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: saveLoading }, saveLoading ? "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u043C..." : "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose, disabled: saveLoading }, "\u0417\u0430\u043A\u0440\u044B\u0442\u044C")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function AttachmentPreviewModal({ open, title, url, fileName, mimeType, onClose }) {
      const [resolvedUrl, setResolvedUrl] = useState("");
      const [resolvedText, setResolvedText] = useState("");
      const [resolvedKind, setResolvedKind] = useState("");
      const [hint, setHint] = useState("");
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      const decodeTextPreview = (arrayBuffer) => {
        const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
        const sampleLength = Math.min(bytes.length, 4096);
        let suspicious = 0;
        for (let i = 0; i < sampleLength; i += 1) {
          const byte = bytes[i];
          if (byte === 0) suspicious += 4;
          else if (byte < 9 || byte > 13 && byte < 32) suspicious += 1;
        }
        if (sampleLength && suspicious / sampleLength > 0.08) return null;
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");
        const normalized = text.length > 2e5 ? text.slice(0, 2e5) + "\n\n[\u0422\u0435\u043A\u0441\u0442 \u043E\u0431\u0440\u0435\u0437\u0430\u043D \u0434\u043B\u044F \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430]" : text;
        return normalized;
      };
      useEffect(() => {
        if (!open || !url) {
          setResolvedUrl("");
          setResolvedText("");
          setResolvedKind("");
          setHint("");
          setLoading(false);
          setError("");
          return;
        }
        const kind2 = detectAttachmentPreviewKind(fileName, mimeType);
        setResolvedKind(kind2);
        setResolvedText("");
        setHint("");
        if (kind2 === "none") {
          setResolvedUrl("");
          setLoading(false);
          setError("");
          return;
        }
        let cancelled = false;
        let objectUrl = "";
        setLoading(true);
        setError("");
        setResolvedUrl("");
        (async () => {
          try {
            const response = await fetch(url, { credentials: "same-origin" });
            if (!response.ok) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0434\u043B\u044F \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430");
            const buffer = await response.arrayBuffer();
            if (cancelled) return;
            if (kind2 === "pdf") {
              const header = new Uint8Array(buffer.slice(0, 5));
              const isPdf = header.length >= 5 && header[0] === 37 && header[1] === 80 && header[2] === 68 && header[3] === 70 && header[4] === 45;
              if (isPdf) {
                setResolvedUrl(String(url));
                setResolvedKind("pdf");
                setLoading(false);
                return;
              }
              const textPreview = decodeTextPreview(buffer);
              if (textPreview != null) {
                setResolvedUrl("");
                setResolvedText(textPreview);
                setResolvedKind("text");
                setHint("\u0424\u0430\u0439\u043B \u043F\u043E\u043C\u0435\u0447\u0435\u043D \u043A\u0430\u043A PDF, \u043D\u043E \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u043C PDF. \u041F\u043E\u043A\u0430\u0437\u0430\u043D \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440.");
                setLoading(false);
                return;
              }
              throw new Error("\u0424\u0430\u0439\u043B \u043F\u043E\u043C\u0435\u0447\u0435\u043D \u043A\u0430\u043A PDF, \u043D\u043E \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u043C PDF-\u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u043C.");
            }
            if (kind2 === "text") {
              const textPreview = decodeTextPreview(buffer);
              if (textPreview == null) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u0444\u0430\u0439\u043B \u0434\u043B\u044F \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430.");
              setResolvedUrl("");
              setResolvedText(textPreview);
              setResolvedKind("text");
              setLoading(false);
              return;
            }
            const blob = new Blob([buffer], { type: response.headers.get("content-type") || mimeType || "application/octet-stream" });
            objectUrl = URL.createObjectURL(blob);
            if (cancelled) {
              URL.revokeObjectURL(objectUrl);
              return;
            }
            setResolvedUrl(objectUrl);
            setResolvedKind(kind2);
            setLoading(false);
          } catch (err) {
            if (cancelled) return;
            setError(err instanceof Error ? err.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440");
            setLoading(false);
          }
        })();
        return () => {
          cancelled = true;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
      }, [fileName, mimeType, open, url]);
      if (!open || !url) return null;
      const kind = resolvedKind || detectAttachmentPreviewKind(fileName, mimeType);
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "request-file-preview-overlay", onClose: (event) => event.target.id === "request-file-preview-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal request-preview-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("h3", null, title || fileName || "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0444\u0430\u0439\u043B\u0430"), /* @__PURE__ */ React.createElement("div", { className: "request-preview-head-actions" }, /* @__PURE__ */ React.createElement(
        "a",
        {
          className: "icon-btn file-action-btn request-preview-download-icon",
          href: url,
          target: "_blank",
          rel: "noreferrer",
          "aria-label": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0444\u0430\u0439\u043B",
          "data-tooltip": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C"
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: "M12 3a1 1 0 0 1 1 1v8.17l2.58-2.58a1 1 0 1 1 1.42 1.42l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 0 1 1.42-1.42L11 12.17V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z",
            fill: "currentColor"
          }
        ))
      ), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7"))), /* @__PURE__ */ React.createElement("div", { className: "request-preview-body" }, loading ? /* @__PURE__ */ React.createElement("p", { className: "request-preview-note" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430...") : null, !loading && !error && hint ? /* @__PURE__ */ React.createElement("p", { className: "request-preview-note" }, hint) : null, error ? /* @__PURE__ */ React.createElement("p", { className: "request-preview-note" }, error) : null, !loading && !error && kind === "image" && resolvedUrl ? /* @__PURE__ */ React.createElement("img", { className: "request-preview-image", src: resolvedUrl, alt: fileName || "attachment" }) : null, !loading && !error && kind === "video" && resolvedUrl ? /* @__PURE__ */ React.createElement("video", { className: "request-preview-video", src: resolvedUrl, controls: true, preload: "metadata" }) : null, !loading && !error && kind === "pdf" && resolvedUrl ? /* @__PURE__ */ React.createElement("iframe", { className: "request-preview-frame", src: resolvedUrl, title: fileName || "preview" }) : null, !loading && !error && kind === "text" ? /* @__PURE__ */ React.createElement("pre", { className: "request-preview-text" }, resolvedText || "\u0424\u0430\u0439\u043B \u043F\u0443\u0441\u0442.") : null, kind === "none" ? /* @__PURE__ */ React.createElement("p", { className: "request-preview-note" }, "\u0414\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0442\u0438\u043F\u0430 \u0444\u0430\u0439\u043B\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0435 \u0438\u043B\u0438 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435.") : null)));
    }
    function RecordModal({ open, title, fields, form, status, onClose, onChange, onSubmit, onUploadField }) {
      if (!open) return null;
      const visibleFields = (fields || []).filter((field) => {
        if (typeof field.visibleWhen !== "function") return true;
        try {
          return Boolean(field.visibleWhen(form || {}));
        } catch (_) {
          return true;
        }
      });
      const renderField = (field) => {
        var _a;
        const value = (_a = form[field.key]) != null ? _a : "";
        const options = typeof field.options === "function" ? field.options(form || {}) : [];
        const id = "record-field-" + field.key;
        const disabled = Boolean(field.readOnly) || (typeof field.readOnlyWhen === "function" ? Boolean(field.readOnlyWhen(form || {})) : false);
        if (field.type === "textarea" || field.type === "json") {
          return /* @__PURE__ */ React.createElement(
            "textarea",
            {
              id,
              value,
              onChange: (event) => onChange(field.key, event.target.value),
              placeholder: field.placeholder || "",
              required: Boolean(field.required),
              disabled
            }
          );
        }
        if (field.type === "boolean") {
          return /* @__PURE__ */ React.createElement("select", { id, value, onChange: (event) => onChange(field.key, event.target.value), disabled }, /* @__PURE__ */ React.createElement("option", { value: "true" }, "\u0414\u0430"), /* @__PURE__ */ React.createElement("option", { value: "false" }, "\u041D\u0435\u0442"));
        }
        if (field.type === "reference" || field.type === "enum") {
          const extraOptions = Array.isArray(field.extraOptions) ? field.extraOptions : [];
          const hasCurrentValue = String(value || "").trim() !== "" && [...extraOptions, ...options].some((option) => String((option == null ? void 0 : option.value) || "") === String(value));
          return /* @__PURE__ */ React.createElement("select", { id, value, onChange: (event) => onChange(field.key, event.target.value), disabled }, field.optional ? /* @__PURE__ */ React.createElement("option", { value: "" }, "-") : null, !hasCurrentValue && String(value || "").trim() !== "" ? /* @__PURE__ */ React.createElement("option", { value: String(value) }, String(value)) : null, extraOptions.map((option) => /* @__PURE__ */ React.createElement("option", { value: String(option.value), key: String(option.value) }, option.label)), options.map((option) => /* @__PURE__ */ React.createElement("option", { value: String(option.value), key: String(option.value) }, option.label)));
        }
        if (field.uploadScope) {
          return /* @__PURE__ */ React.createElement("div", { className: "field-inline" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              id,
              type: "text",
              value,
              onChange: (event) => onChange(field.key, event.target.value),
              placeholder: field.placeholder || "",
              required: Boolean(field.required),
              disabled
            }
          ), /* @__PURE__ */ React.createElement("label", { className: "btn secondary btn-sm", style: { whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" } }, "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C", /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "file",
              accept: field.accept || "*/*",
              style: { display: "none" },
              onChange: (event) => {
                const file = event.target.files && event.target.files[0];
                if (file && onUploadField) onUploadField(field, file);
                event.target.value = "";
              },
              disabled
            }
          )));
        }
        return /* @__PURE__ */ React.createElement(
          "input",
          {
            id,
            type: field.type === "number" ? "number" : field.type === "password" ? "password" : "text",
            step: field.type === "number" ? "any" : void 0,
            value,
            onChange: (event) => onChange(field.key, event.target.value),
            placeholder: field.placeholder || "",
            required: Boolean(field.required),
            disabled
          }
        );
      };
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "record-overlay", onClose: (event) => event.target.id === "record-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: { width: "min(760px, 100%)" }, onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, title), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0438 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043F\u0438\u0441\u0438.")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "filters", style: { gridTemplateColumns: "repeat(2, minmax(0,1fr))" } }, visibleFields.map((field) => /* @__PURE__ */ React.createElement("div", { className: "field", key: field.key, style: field.fullRow ? { gridColumn: "1 / -1" } : void 0 }, /* @__PURE__ */ React.createElement("label", { htmlFor: "record-field-" + field.key }, field.label), renderField(field)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose }, "\u041E\u0442\u043C\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function GlobalTooltipLayer() {
      const [tooltip, setTooltip] = useState({ open: false, text: "", x: 0, y: 0, maxWidth: 320 });
      const activeRef = useRef(null);
      useEffect(() => {
        const getTarget = (node) => {
          if (!(node instanceof Element)) return null;
          const el = node.closest("[data-tooltip]");
          if (!el) return null;
          const text = String(el.getAttribute("data-tooltip") || "").trim();
          return text ? el : null;
        };
        const reposition = (el) => {
          if (!(el instanceof Element)) return;
          const text = String(el.getAttribute("data-tooltip") || "").trim();
          if (!text) return;
          const rect = el.getBoundingClientRect();
          const vw = window.innerWidth || 0;
          const maxWidth = Math.min(360, Math.max(140, vw - 24));
          const approxWidth = Math.min(maxWidth, Math.max(80, text.length * 7.1 + 22));
          const centerX = rect.left + rect.width / 2;
          const x = Math.max(12 + approxWidth / 2, Math.min(vw - 12 - approxWidth / 2, centerX));
          const y = Math.max(8, rect.top - 8);
          setTooltip({ open: true, text, x, y, maxWidth });
        };
        const open = (node) => {
          const target = getTarget(node);
          if (!target) return;
          activeRef.current = target;
          reposition(target);
        };
        const closeIfNeeded = (related) => {
          const current = activeRef.current;
          if (!current) return;
          if (related instanceof Element) {
            if (related === current || current.contains(related)) return;
            const nextTarget = getTarget(related);
            if (nextTarget === current) return;
          }
          activeRef.current = null;
          setTooltip((prev) => ({ ...prev, open: false }));
        };
        const onMouseOver = (event) => open(event.target);
        const onFocusIn = (event) => open(event.target);
        const onMouseOut = (event) => closeIfNeeded(event.relatedTarget);
        const onFocusOut = (event) => closeIfNeeded(event.relatedTarget);
        const onUpdatePosition = () => {
          if (activeRef.current) reposition(activeRef.current);
        };
        document.addEventListener("mouseover", onMouseOver, true);
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("mouseout", onMouseOut, true);
        document.addEventListener("focusout", onFocusOut, true);
        window.addEventListener("scroll", onUpdatePosition, true);
        window.addEventListener("resize", onUpdatePosition);
        return () => {
          document.removeEventListener("mouseover", onMouseOver, true);
          document.removeEventListener("focusin", onFocusIn, true);
          document.removeEventListener("mouseout", onMouseOut, true);
          document.removeEventListener("focusout", onFocusOut, true);
          window.removeEventListener("scroll", onUpdatePosition, true);
          window.removeEventListener("resize", onUpdatePosition);
        };
      }, []);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "global-tooltip-layer" + (tooltip.open ? " open" : ""),
          style: { left: tooltip.x + "px", top: tooltip.y + "px", maxWidth: tooltip.maxWidth + "px" },
          role: "tooltip",
          "aria-hidden": tooltip.open ? "false" : "true"
        },
        tooltip.text
      );
    }
    function App() {
      var _a;
      const routeInfo = useMemo(() => resolveAdminRoute(window.location.search), []);
      const isRequestWorkspaceRoute = routeInfo.view === "request" && Boolean(routeInfo.requestId);
      const initialSection = isRequestWorkspaceRoute ? "requestWorkspace" : routeInfo.section || "dashboard";
      const [token, setToken] = useState("");
      const [role, setRole] = useState("");
      const [email, setEmail] = useState("");
      const [userId, setUserId] = useState("");
      const [activeSection, setActiveSection] = useState(initialSection);
      const [dashboardData, setDashboardData] = useState({
        scope: "",
        cards: [],
        byStatus: {},
        lawyerLoads: [],
        myUnreadByEvent: {},
        myUnreadTotal: 0,
        myUnreadNotificationsTotal: 0,
        unreadForClients: 0,
        unreadForLawyers: 0,
        serviceRequestUnreadTotal: 0,
        deadlineAlertTotal: 0,
        monthRevenue: 0,
        monthExpenses: 0
      });
      const {
        tables,
        tablesRef,
        setTableState,
        resetTablesState,
        tableCatalog,
        setTableCatalog,
        referenceRowsMap,
        setReferenceRowsMap
      } = useTablesState();
      const [dictionaries, setDictionaries] = useState({
        topics: [],
        statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
        formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
        formFieldKeys: [],
        users: []
      });
      const [statusMap, setStatusMap] = useState({});
      const [smsProviderHealth, setSmsProviderHealth] = useState(null);
      const [totpStatus, setTotpStatus] = useState({
        mode: "password_totp_optional",
        enabled: false,
        required: false,
        has_backup_codes: false
      });
      const [totpSetupModal, setTotpSetupModal] = useState({
        open: false,
        secret: "",
        uri: "",
        qrDataUrl: "",
        code: "",
        loading: false
      });
      const [accountModal, setAccountModal] = useState({
        open: false,
        loading: false,
        saving: false,
        initial: {
          name: "",
          email: "",
          phone: ""
        },
        form: {
          name: "",
          email: "",
          phone: "",
          password: "",
          passwordConfirm: ""
        }
      });
      const [recordModal, setRecordModal] = useState({
        open: false,
        tableKey: null,
        mode: "create",
        rowId: null,
        form: {}
      });
      const [configActiveKey, setConfigActiveKey] = useState("");
      const [referencesExpanded, setReferencesExpanded] = useState(true);
      const [statusDesignerTopicCode, setStatusDesignerTopicCode] = useState("");
      const [metaEntity, setMetaEntity] = useState("quotes");
      const [metaJson, setMetaJson] = useState("");
      const [filterModal, setFilterModal] = useState({
        open: false,
        tableKey: null,
        field: "",
        op: "=",
        rawValue: "",
        editIndex: null
      });
      const [reassignModal, setReassignModal] = useState({
        open: false,
        requestId: null,
        trackNumber: "",
        lawyerId: ""
      });
      const initialRouteHandledRef = useRef(false);
      const statusDesignerLoadedTopicRef = useRef("");
      const setStatus = useCallback((key, message, kind) => {
        setStatusMap((prev) => ({ ...prev, [key]: { message: message || "", kind: kind || "" } }));
      }, []);
      const getStatus = useCallback((key) => statusMap[key] || { message: "", kind: "" }, [statusMap]);
      const api = useAdminApi(token);
      const {
        requestModal,
        setRequestModal,
        resetRequestWorkspaceState,
        updateRequestModalMessageDraft,
        appendRequestModalFiles,
        removeRequestModalFile,
        clearRequestModalFiles,
        loadRequestModalData,
        refreshRequestModal,
        openRequestDetails,
        clearPendingStatusChangePreset,
        submitRequestStatusChange,
        submitRequestModalMessage,
        probeRequestLive,
        setRequestTyping,
        loadRequestDataTemplates,
        loadRequestDataBatch,
        loadRequestDataTemplateDetails,
        saveRequestDataTemplate,
        saveRequestDataBatch,
        issueRequestInvoice
      } = useRequestWorkspace({
        api,
        setStatus,
        setActiveSection,
        token,
        users: dictionaries.users,
        buildUniversalQuery,
        resolveAdminObjectSrc
      });
      const getStatusOptions = useCallback(() => {
        return (dictionaries.statuses || []).filter((item) => item && item.code).map((item) => ({ value: item.code, label: String(item.name || "").trim() || humanizeKey(item.code) }));
      }, [dictionaries.statuses]);
      const getInvoiceStatusOptions = useCallback(() => {
        return Object.entries(INVOICE_STATUS_LABELS).map(([code, name]) => ({ value: code, label: name }));
      }, []);
      const getServiceRequestTypeOptions = useCallback(() => {
        return Object.entries(SERVICE_REQUEST_TYPE_LABELS).map(([code, name]) => ({ value: code, label: name }));
      }, []);
      const getServiceRequestStatusOptions = useCallback(() => {
        return Object.entries(SERVICE_REQUEST_STATUS_LABELS).map(([code, name]) => ({ value: code, label: name }));
      }, []);
      const getStatusKindOptions = useCallback(() => {
        return Object.entries(STATUS_KIND_LABELS).map(([code, name]) => ({ value: code, label: name }));
      }, []);
      const getTopicOptions = useCallback(() => {
        return (dictionaries.topics || []).filter((item) => item && item.code).map((item) => ({ value: item.code, label: String(item.name || "").trim() || humanizeKey(item.code) }));
      }, [dictionaries.topics]);
      const getLawyerOptions = useCallback(() => {
        return (dictionaries.users || []).filter((item) => item && item.id && String(item.role || "").toUpperCase() === "LAWYER").map((item) => ({
          value: item.id,
          label: (item.name || item.email || item.id) + (item.email ? " (" + item.email + ")" : "")
        }));
      }, [dictionaries.users]);
      const getFormFieldTypeOptions = useCallback(() => {
        return (dictionaries.formFieldTypes || []).filter(Boolean).map((item) => ({ value: item, label: item }));
      }, [dictionaries.formFieldTypes]);
      const getRequestDataValueTypeOptions = useCallback(() => {
        return [
          { value: "string", label: "\u0421\u0442\u0440\u043E\u043A\u0430" },
          { value: "date", label: "\u0414\u0430\u0442\u0430" },
          { value: "number", label: "\u0427\u0438\u0441\u043B\u043E" },
          { value: "file", label: "\u0424\u0430\u0439\u043B" },
          { value: "text", label: "\u0422\u0435\u043A\u0441\u0442" }
        ];
      }, []);
      const getFormFieldKeyOptions = useCallback(() => {
        return (dictionaries.formFieldKeys || []).filter((item) => item && item.key).map((item) => ({ value: item.key, label: String(item.label || "").trim() || humanizeKey(item.key) }));
      }, [dictionaries.formFieldKeys]);
      const getRoleOptions = useCallback(() => {
        return Object.entries(ROLE_LABELS).map(([code, label]) => ({ value: code, label }));
      }, []);
      const tableCatalogMap = useMemo(() => {
        const map = {};
        (tableCatalog || []).forEach((item) => {
          if (!item || !item.key) return;
          map[item.key] = item;
        });
        return map;
      }, [tableCatalog]);
      const getReferenceOptions = useCallback(
        (rawReference) => {
          const reference = normalizeReferenceMeta(rawReference);
          if (!reference) return [];
          const rows = referenceRowsMap[reference.table] || [];
          const map = /* @__PURE__ */ new Map();
          rows.forEach((row) => {
            if (!row || typeof row !== "object") return;
            const rawValue = row[reference.value_field];
            if (rawValue == null || rawValue === "") return;
            const value = String(rawValue);
            const labelRaw = row[reference.label_field];
            const label = String(labelRaw == null || labelRaw === "" ? rawValue : labelRaw);
            if (!map.has(value)) map.set(value, label);
          });
          return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
        },
        [referenceRowsMap]
      );
      const resolveReferenceLabel = useCallback(
        (rawReference, rawValue) => {
          if (rawValue == null || rawValue === "") return "-";
          const value = String(rawValue);
          const options = getReferenceOptions(rawReference);
          const found = options.find((item) => String(item.value) === value);
          return found ? found.label : value;
        },
        [getReferenceOptions]
      );
      const getStatusGroupOptions = useCallback(() => {
        return getReferenceOptions({ table: "status_groups", value_field: "id", label_field: "name" });
      }, [getReferenceOptions]);
      const getClientOptions = useCallback(() => {
        return getReferenceOptions({ table: "clients", value_field: "id", label_field: "full_name" });
      }, [getReferenceOptions]);
      const getInvoiceRequestRows = useCallback(() => {
        var _a2;
        const fromReferences = Array.isArray(referenceRowsMap.requests) ? referenceRowsMap.requests : [];
        const fromTable = Array.isArray((_a2 = tables.requests) == null ? void 0 : _a2.rows) ? tables.requests.rows : [];
        const byTrack = /* @__PURE__ */ new Map();
        [...fromReferences, ...fromTable].forEach((row) => {
          const track = String((row == null ? void 0 : row.track_number) || "").trim().toUpperCase();
          if (!track) return;
          if (!byTrack.has(track)) byTrack.set(track, row);
        });
        return Array.from(byTrack.values());
      }, [referenceRowsMap.requests, (_a = tables.requests) == null ? void 0 : _a.rows]);
      const getInvoiceRequestTrackOptions = useCallback(() => {
        const rows = getInvoiceRequestRows();
        return rows.map((row) => {
          const track = String((row == null ? void 0 : row.track_number) || "").trim().toUpperCase();
          if (!track) return null;
          const clientName = String((row == null ? void 0 : row.client_name) || "").trim();
          const clientPhone = String((row == null ? void 0 : row.client_phone) || "").trim();
          const parts = [track];
          if (clientName) parts.push(clientName);
          if (clientPhone) parts.push(clientPhone);
          return { value: track, label: parts.join(" \u2022 ") };
        }).filter(Boolean).sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
      }, [getInvoiceRequestRows]);
      const getInvoicePayerOptions = useCallback((formOrTrack) => {
        const map = /* @__PURE__ */ new Map();
        const addPayer = (nameRaw, phoneRaw) => {
          const name = String(nameRaw || "").trim();
          if (!name) return;
          const phone = String(phoneRaw || "").trim();
          if (map.has(name)) return;
          map.set(name, phone ? `${name} (${phone})` : name);
        };
        const rows = getInvoiceRequestRows();
        const trackFromInput = typeof formOrTrack === "string" ? formOrTrack : String((formOrTrack == null ? void 0 : formOrTrack.request_track_number) || "").trim();
        const requestIdFromInput = typeof formOrTrack === "string" ? "" : String((formOrTrack == null ? void 0 : formOrTrack.request_id) || "").trim();
        const normalizedTrack = String(trackFromInput || "").trim().toUpperCase();
        const selectedRequest = rows.find((row) => {
          const rowTrack = String((row == null ? void 0 : row.track_number) || "").trim().toUpperCase();
          const rowId = String((row == null ? void 0 : row.id) || "").trim();
          return normalizedTrack && rowTrack === normalizedTrack || requestIdFromInput && rowId === requestIdFromInput;
        });
        if (selectedRequest) {
          addPayer(selectedRequest == null ? void 0 : selectedRequest.client_name, selectedRequest == null ? void 0 : selectedRequest.client_phone);
        } else {
          const clientRows = Array.isArray(referenceRowsMap.clients) ? referenceRowsMap.clients : [];
          clientRows.forEach((row) => addPayer((row == null ? void 0 : row.full_name) || (row == null ? void 0 : row.client_name), (row == null ? void 0 : row.phone) || (row == null ? void 0 : row.client_phone)));
          rows.forEach((row) => addPayer(row == null ? void 0 : row.client_name, row == null ? void 0 : row.client_phone));
        }
        return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
      }, [getInvoiceRequestRows, referenceRowsMap.clients]);
      const dictionaryTableItems = useMemo(() => {
        return (tableCatalog || []).filter(
          (item) => item && item.section === "dictionary" && Array.isArray(item.actions) && item.actions.includes("query") && !LEGACY_HIDDEN_DICTIONARY_TABLES.has(String(item.key || ""))
        ).sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
      }, [tableCatalog]);
      const resolveTableConfig = useCallback(
        (tableKey) => {
          if (TABLE_SERVER_CONFIG[tableKey]) return TABLE_SERVER_CONFIG[tableKey];
          const meta = tableCatalogMap[tableKey];
          if (!meta || !meta.table) return null;
          const tableName = String(meta.table || tableKey);
          return {
            table: tableName,
            endpoint: String(meta.query_endpoint || "/api/admin/crud/" + tableName + "/query"),
            sort: Array.isArray(meta.default_sort) && meta.default_sort.length ? meta.default_sort : [{ field: "created_at", dir: "desc" }]
          };
        },
        [tableCatalogMap]
      );
      const resolveMutationConfig = useCallback(
        (tableKey) => {
          if (TABLE_MUTATION_CONFIG[tableKey]) return TABLE_MUTATION_CONFIG[tableKey];
          const meta = tableCatalogMap[tableKey];
          if (!meta || !meta.table) return null;
          const tableName = String(meta.table || tableKey);
          return {
            create: String(meta.create_endpoint || "/api/admin/crud/" + tableName),
            update: (id) => String(meta.update_endpoint_template || "/api/admin/crud/" + tableName + "/{id}").replace("{id}", String(id)),
            delete: (id) => String(meta.delete_endpoint_template || "/api/admin/crud/" + tableName + "/{id}").replace("{id}", String(id))
          };
        },
        [tableCatalogMap]
      );
      const getFilterFields = useCallback(
        (tableKey) => {
          if (tableKey === "kanban") {
            return [
              { field: "assigned_lawyer_id", label: "\u042E\u0440\u0438\u0441\u0442", type: "reference", options: getLawyerOptions },
              { field: "client_name", label: "\u041A\u043B\u0438\u0435\u043D\u0442", type: "text" },
              { field: "status_code", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "reference", options: getStatusOptions },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430", type: "date" },
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "has_unread_updates", label: "\u0415\u0441\u0442\u044C \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F", type: "boolean" },
              { field: "deadline_alert", label: "\u0413\u043E\u0440\u044F\u0449\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u044B", type: "boolean" },
              { field: "overdue", label: "\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D", type: "boolean" }
            ];
          }
          if (tableKey === "requests") {
            return [
              { field: "track_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u044F\u0432\u043A\u0438", type: "text" },
              { field: "client_name", label: "\u041A\u043B\u0438\u0435\u043D\u0442", type: "text" },
              { field: "client_phone", label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", type: "text" },
              { field: "status_code", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "reference", options: getStatusOptions },
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "important_date_at", label: "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430", type: "date" },
              { field: "has_unread_updates", label: "\u0415\u0441\u0442\u044C \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F", type: "boolean" },
              { field: "deadline_alert", label: "\u0413\u043E\u0440\u044F\u0449\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u044B", type: "boolean" },
              { field: "client_has_unread_updates", label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C", type: "boolean" },
              { field: "lawyer_has_unread_updates", label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u044E\u0440\u0438\u0441\u0442\u043E\u043C", type: "boolean" },
              { field: "invoice_amount", label: "\u0421\u0443\u043C\u043C\u0430 \u0441\u0447\u0435\u0442\u0430", type: "number" },
              { field: "effective_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430", type: "number" },
              { field: "paid_at", label: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E", type: "date" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "serviceRequests") {
            return [
              { field: "type", label: "\u0422\u0438\u043F", type: "enum", options: getServiceRequestTypeOptions },
              { field: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "enum", options: getServiceRequestStatusOptions },
              { field: "request_id", label: "ID \u0437\u0430\u044F\u0432\u043A\u0438", type: "text" },
              { field: "client_id", label: "ID \u043A\u043B\u0438\u0435\u043D\u0442\u0430", type: "text" },
              { field: "assigned_lawyer_id", label: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0439 \u044E\u0440\u0438\u0441\u0442", type: "reference", options: getLawyerOptions },
              { field: "admin_unread", label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u043E\u043C", type: "boolean" },
              { field: "lawyer_unread", label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u044E\u0440\u0438\u0441\u0442\u043E\u043C", type: "boolean" },
              { field: "resolved_at", label: "\u0414\u0430\u0442\u0430 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438", type: "date" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "invoices") {
            return [
              { field: "invoice_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0435\u0442\u0430", type: "text" },
              { field: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "enum", options: getInvoiceStatusOptions },
              { field: "amount", label: "\u0421\u0443\u043C\u043C\u0430", type: "number" },
              { field: "currency", label: "\u0412\u0430\u043B\u044E\u0442\u0430", type: "text" },
              { field: "payer_display_name", label: "\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A", type: "text" },
              { field: "request_id", label: "ID \u0437\u0430\u044F\u0432\u043A\u0438", type: "text" },
              { field: "issued_by_admin_user_id", label: "ID \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430", type: "text" },
              { field: "issued_at", label: "\u0414\u0430\u0442\u0430 \u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F", type: "date" },
              { field: "paid_at", label: "\u0414\u0430\u0442\u0430 \u043E\u043F\u043B\u0430\u0442\u044B", type: "date" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "quotes") {
            return [
              { field: "author", label: "\u0410\u0432\u0442\u043E\u0440", type: "text" },
              { field: "text", label: "\u0422\u0435\u043A\u0441\u0442", type: "text" },
              { field: "source", label: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", type: "text" },
              { field: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "topics") {
            return [
              { field: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", type: "text" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" }
            ];
          }
          if (tableKey === "statuses") {
            return [
              { field: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", type: "text" },
              { field: "status_group_id", label: "\u0413\u0440\u0443\u043F\u043F\u0430", type: "reference", options: getStatusGroupOptions },
              { field: "kind", label: "\u0422\u0438\u043F", type: "enum", options: getStatusKindOptions },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" },
              { field: "is_terminal", label: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439", type: "boolean" }
            ];
          }
          if (tableKey === "formFields") {
            return [
              { field: "key", label: "\u041A\u043B\u044E\u0447", type: "text" },
              { field: "label", label: "\u041C\u0435\u0442\u043A\u0430", type: "text" },
              { field: "type", label: "\u0422\u0438\u043F", type: "enum", options: getFormFieldTypeOptions },
              { field: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" }
            ];
          }
          if (tableKey === "topicRequiredFields") {
            return [
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "field_key", label: "\u041F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", type: "reference", options: getFormFieldKeyOptions },
              { field: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" }
            ];
          }
          if (tableKey === "topicDataTemplates") {
            return [
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "key", label: "\u041A\u043B\u044E\u0447", type: "text" },
              { field: "label", label: "\u041C\u0435\u0442\u043A\u0430", type: "text" },
              { field: "value_type", label: "\u0422\u0438\u043F \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F", type: "enum", options: getRequestDataValueTypeOptions },
              { field: "document_name", label: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442", type: "text" },
              { field: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "statusTransitions") {
            return [
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "from_status", label: "\u0418\u0437 \u0441\u0442\u0430\u0442\u0443\u0441\u0430", type: "reference", options: getStatusOptions },
              { field: "to_status", label: "\u0412 \u0441\u0442\u0430\u0442\u0443\u0441", type: "reference", options: getStatusOptions },
              { field: "sla_hours", label: "SLA (\u0447\u0430\u0441\u044B)", type: "number" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" }
            ];
          }
          if (tableKey === "users") {
            return [
              { field: "name", label: "\u0418\u043C\u044F", type: "text" },
              { field: "email", label: "Email", type: "text" },
              { field: "phone", label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", type: "text" },
              { field: "role", label: "\u0420\u043E\u043B\u044C", type: "enum", options: getRoleOptions },
              { field: "primary_topic_code", label: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C (\u0442\u0435\u043C\u0430)", type: "reference", options: getTopicOptions },
              { field: "default_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E", type: "number" },
              { field: "salary_percent", label: "\u041F\u0440\u043E\u0446\u0435\u043D\u0442 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u044B", type: "number" },
              { field: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean" },
              { field: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", type: "text" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "userTopics") {
            return [
              { field: "admin_user_id", label: "\u042E\u0440\u0438\u0441\u0442", type: "reference", options: getLawyerOptions },
              { field: "topic_code", label: "\u0414\u043E\u043F. \u0442\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", type: "text" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          const meta = tableCatalogMap[tableKey];
          if (!meta || !Array.isArray(meta.columns)) return [];
          return (meta.columns || []).filter((column) => column && column.name && column.filterable !== false && String(column.name) !== "id").map((column) => {
            const name = String(column.name);
            const label = String(column.label || humanizeKey(name));
            if (name === "topic_code") return { field: name, label, type: "reference", options: getTopicOptions };
            if (name === "status_code" || name === "from_status" || name === "to_status") {
              return { field: name, label, type: "reference", options: getStatusOptions };
            }
            if (name === "field_key") return { field: name, label, type: "reference", options: getFormFieldKeyOptions };
            const reference = normalizeReferenceMeta(column.reference);
            if (reference) {
              return { field: name, label, type: "reference", options: () => getReferenceOptions(reference) };
            }
            return { field: name, label, type: metaKindToFilterType(column.kind) };
          });
        },
        [
          getReferenceOptions,
          tableCatalogMap,
          getFormFieldKeyOptions,
          getFormFieldTypeOptions,
          getInvoiceStatusOptions,
          getLawyerOptions,
          getRoleOptions,
          getServiceRequestStatusOptions,
          getServiceRequestTypeOptions,
          role,
          getStatusGroupOptions,
          getStatusKindOptions,
          getStatusOptions,
          getTopicOptions
        ]
      );
      const getTableLabel = useCallback((tableKey) => {
        if (tableKey === "kanban") return "\u041A\u0430\u043D\u0431\u0430\u043D";
        if (tableKey === "requests") return "\u0417\u0430\u044F\u0432\u043A\u0438";
        if (tableKey === "serviceRequests") return "\u0417\u0430\u043F\u0440\u043E\u0441\u044B";
        if (tableKey === "invoices") return "\u0421\u0447\u0435\u0442\u0430";
        if (tableKey === "quotes") return "\u0426\u0438\u0442\u0430\u0442\u044B";
        if (tableKey === "topics") return "\u0422\u0435\u043C\u044B";
        if (tableKey === "statuses") return "\u0421\u0442\u0430\u0442\u0443\u0441\u044B";
        if (tableKey === "statusGroups") return "\u0413\u0440\u0443\u043F\u043F\u044B \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432";
        if (tableKey === "formFields") return "\u041F\u043E\u043B\u044F \u0444\u043E\u0440\u043C\u044B";
        if (tableKey === "topicRequiredFields") return "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F \u043F\u043E \u0442\u0435\u043C\u0430\u043C";
        if (tableKey === "topicDataTemplates") return "\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u0434\u043E\u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u043F\u043E \u0442\u0435\u043C\u0430\u043C";
        if (tableKey === "statusTransitions") return "\u041F\u0435\u0440\u0435\u0445\u043E\u0434\u044B \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432";
        if (tableKey === "users") return "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438";
        if (tableKey === "userTopics") return "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0442\u0435\u043C\u044B \u044E\u0440\u0438\u0441\u0442\u043E\u0432";
        const meta = tableCatalogMap[tableKey];
        if (meta && meta.label) return String(meta.label);
        const raw = TABLE_UNALIASES[tableKey] || tableKey;
        return humanizeKey(raw);
      }, [tableCatalogMap]);
      const statusDesignerRows = useMemo(() => {
        const activeTopic = String(statusDesignerTopicCode || "").trim();
        const rows = tables.statusTransitions.rows || [];
        if (!activeTopic) return rows;
        return rows.filter((row) => String(row.topic_code || "") === activeTopic);
      }, [statusDesignerTopicCode, tables.statusTransitions.rows]);
      const statusDesignerCards = useMemo(() => {
        const rows = statusDesignerRows || [];
        if (!rows.length) return [];
        const orderMap = /* @__PURE__ */ new Map();
        (tables.statuses.rows || []).forEach((row, index) => {
          const code = String((row == null ? void 0 : row.code) || "").trim();
          if (!code) return;
          const sortOrder = Number(row == null ? void 0 : row.sort_order);
          orderMap.set(code, Number.isFinite(sortOrder) ? sortOrder : index);
        });
        const statusMetaMap = /* @__PURE__ */ new Map();
        (dictionaries.statuses || []).forEach((row, index) => {
          var _a2;
          const code = String((row == null ? void 0 : row.code) || "").trim();
          if (!code) return;
          statusMetaMap.set(code, {
            name: String((row == null ? void 0 : row.name) || code),
            isTerminal: false,
            order: (_a2 = orderMap.get(code)) != null ? _a2 : index
          });
        });
        (tables.statuses.rows || []).forEach((row, index) => {
          var _a2;
          const code = String((row == null ? void 0 : row.code) || "").trim();
          if (!code) return;
          statusMetaMap.set(code, {
            name: String((row == null ? void 0 : row.name) || code),
            isTerminal: Boolean(row == null ? void 0 : row.is_terminal),
            order: (_a2 = orderMap.get(code)) != null ? _a2 : index
          });
        });
        const codeSet = /* @__PURE__ */ new Set();
        rows.forEach((row) => {
          const fromCode = String((row == null ? void 0 : row.from_status) || "").trim();
          const toCode = String((row == null ? void 0 : row.to_status) || "").trim();
          if (fromCode) codeSet.add(fromCode);
          if (toCode) codeSet.add(toCode);
        });
        const codes = Array.from(codeSet.values()).sort((a, b) => {
          var _a2, _b;
          const aOrder = (_a2 = statusMetaMap.get(a)) == null ? void 0 : _a2.order;
          const bOrder = (_b = statusMetaMap.get(b)) == null ? void 0 : _b.order;
          if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
          if (aOrder != null && bOrder == null) return -1;
          if (aOrder == null && bOrder != null) return 1;
          return String(a).localeCompare(String(b), "ru");
        });
        return codes.map((code) => {
          const outgoing = rows.filter((row) => String((row == null ? void 0 : row.from_status) || "").trim() === code).sort((a, b) => {
            const aOrder = Number((a == null ? void 0 : a.sort_order) || 0);
            const bOrder = Number((b == null ? void 0 : b.sort_order) || 0);
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String((a == null ? void 0 : a.to_status) || "").localeCompare(String((b == null ? void 0 : b.to_status) || ""), "ru");
          });
          const meta = statusMetaMap.get(code) || { name: statusLabel(code), isTerminal: false };
          return {
            code,
            name: String(meta.name || statusLabel(code)),
            isTerminal: Boolean(meta.isTerminal),
            outgoing
          };
        });
      }, [dictionaries.statuses, statusDesignerRows, tables.statuses.rows]);
      const getRecordFields = useCallback(
        (tableKey) => {
          if (tableKey === "requests") {
            const isNewClientMode = (form) => {
              const value = String((form == null ? void 0 : form.client_id) || "").trim();
              return !value || value === NEW_REQUEST_CLIENT_OPTION;
            };
            const fields = [
              { key: "track_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u044F\u0432\u043A\u0438", type: "text", optional: true, placeholder: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438" },
              ...role !== "LAWYER" ? [
                {
                  key: "client_id",
                  label: "\u041A\u043B\u0438\u0435\u043D\u0442",
                  type: "reference",
                  defaultValue: NEW_REQUEST_CLIENT_OPTION,
                  options: getClientOptions,
                  extraOptions: [{ value: NEW_REQUEST_CLIENT_OPTION, label: "\u041D\u043E\u0432\u044B\u0439 \u043A\u043B\u0438\u0435\u043D\u0442" }],
                  fullRow: true
                }
              ] : [],
              {
                key: "client_name",
                label: role !== "LAWYER" ? "\u0424\u0418\u041E \u043D\u043E\u0432\u043E\u0433\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u0430" : "\u041A\u043B\u0438\u0435\u043D\u0442",
                type: "text",
                required: true,
                visibleWhen: role === "LAWYER" ? void 0 : isNewClientMode
              },
              {
                key: "client_phone",
                label: role !== "LAWYER" ? "\u0422\u0435\u043B\u0435\u0444\u043E\u043D \u043D\u043E\u0432\u043E\u0433\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u0430" : "\u0422\u0435\u043B\u0435\u0444\u043E\u043D",
                type: "text",
                required: true,
                visibleWhen: role === "LAWYER" ? void 0 : isNewClientMode
              },
              { key: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", optional: true, options: getTopicOptions },
              { key: "status_code", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "reference", required: true, options: getStatusOptions },
              { key: "description", label: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", type: "textarea", optional: true },
              { key: "request_cost", label: "\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0438", type: "number", optional: true }
            ];
            if (role !== "LAWYER") {
              fields.push({ key: "assigned_lawyer_id", label: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0439 \u044E\u0440\u0438\u0441\u0442", type: "reference", optional: true, options: getLawyerOptions });
              fields.push({ key: "effective_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430 (\u0444\u0438\u043A\u0441.)", type: "number", optional: true });
            }
            return fields;
          }
          if (tableKey === "invoices") {
            return [
              { key: "request_track_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u044F\u0432\u043A\u0438", type: "reference", required: true, createOnly: true, options: getInvoiceRequestTrackOptions },
              { key: "invoice_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0435\u0442\u0430", type: "text", optional: true, placeholder: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438" },
              { key: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "enum", required: true, options: getInvoiceStatusOptions, defaultValue: "WAITING_PAYMENT" },
              { key: "amount", label: "\u0421\u0443\u043C\u043C\u0430", type: "number", required: true },
              { key: "currency", label: "\u0412\u0430\u043B\u044E\u0442\u0430", type: "text", optional: true, defaultValue: "RUB" },
              {
                key: "payer_display_name",
                label: "\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A (\u0424\u0418\u041E / \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F)",
                type: "reference",
                required: true,
                options: (form) => getInvoicePayerOptions(form)
              }
            ];
          }
          if (tableKey === "serviceRequests") {
            return [
              { key: "type", label: "\u0422\u0438\u043F", type: "enum", required: true, options: getServiceRequestTypeOptions },
              { key: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "enum", required: true, options: getServiceRequestStatusOptions },
              { key: "body", label: "\u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435", type: "textarea", required: true, fullRow: true },
              { key: "request_id", label: "ID \u0437\u0430\u044F\u0432\u043A\u0438", type: "text", required: true },
              { key: "client_id", label: "ID \u043A\u043B\u0438\u0435\u043D\u0442\u0430", type: "text", optional: true },
              { key: "assigned_lawyer_id", label: "ID \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u043E\u0433\u043E \u044E\u0440\u0438\u0441\u0442\u0430", type: "text", optional: true }
            ];
          }
          if (tableKey === "quotes") {
            return [
              { key: "author", label: "\u0410\u0432\u0442\u043E\u0440", type: "text", required: true },
              { key: "text", label: "\u0422\u0435\u043A\u0441\u0442", type: "textarea", required: true },
              { key: "source", label: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", type: "text", optional: true },
              { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "topics") {
            return [
              { key: "code", label: "\u041A\u043E\u0434", type: "text", required: true, autoCreate: true },
              { key: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", type: "text", required: true },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "statuses") {
            return [
              { key: "code", label: "\u041A\u043E\u0434", type: "text", required: true },
              { key: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", type: "text", required: true },
              { key: "status_group_id", label: "\u0413\u0440\u0443\u043F\u043F\u0430", type: "reference", optional: true, options: getStatusGroupOptions },
              { key: "kind", label: "\u0422\u0438\u043F", type: "enum", required: true, options: getStatusKindOptions, defaultValue: "DEFAULT" },
              { key: "invoice_template", label: "\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u0447\u0435\u0442\u0430", type: "textarea", optional: true, placeholder: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043F\u043E\u043B\u044F: {track_number}, {client_name}, {topic_code}, {amount}" },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" },
              { key: "is_terminal", label: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439", type: "boolean", defaultValue: "false" }
            ];
          }
          if (tableKey === "formFields") {
            return [
              { key: "key", label: "\u041A\u043B\u044E\u0447", type: "text", required: true },
              { key: "label", label: "\u041C\u0435\u0442\u043A\u0430", type: "text", required: true },
              { key: "type", label: "\u0422\u0438\u043F", type: "enum", required: true, options: getFormFieldTypeOptions },
              { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean", defaultValue: "false" },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" },
              { key: "options", label: "\u041E\u043F\u0446\u0438\u0438 (JSON)", type: "json", optional: true }
            ];
          }
          if (tableKey === "topicRequiredFields") {
            return [
              { key: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", required: true, options: getTopicOptions },
              { key: "field_key", label: "\u041F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", type: "reference", required: true, options: getFormFieldKeyOptions },
              { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean", defaultValue: "true" },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "topicDataTemplates") {
            return [
              { key: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", required: true, options: getTopicOptions },
              { key: "key", label: "\u041A\u043B\u044E\u0447", type: "text", required: true },
              { key: "label", label: "\u041C\u0435\u0442\u043A\u0430", type: "text", required: true },
              { key: "value_type", label: "\u0422\u0438\u043F \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F", type: "enum", required: true, options: getRequestDataValueTypeOptions, defaultValue: "string" },
              { key: "document_name", label: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442", type: "text", optional: true, placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0414\u043E\u0433\u043E\u0432\u043E\u0440 / \u041F\u0430\u0441\u043F\u043E\u0440\u0442" },
              { key: "description", label: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", type: "textarea", optional: true },
              { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean", defaultValue: "true" },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "statusTransitions") {
            return [
              { key: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", required: true, options: getTopicOptions },
              { key: "from_status", label: "\u0418\u0437 \u0441\u0442\u0430\u0442\u0443\u0441\u0430", type: "reference", required: true, options: getStatusOptions },
              { key: "to_status", label: "\u0412 \u0441\u0442\u0430\u0442\u0443\u0441", type: "reference", required: true, options: getStatusOptions },
              { key: "sla_hours", label: "SLA (\u0447\u0430\u0441\u044B)", type: "number", optional: true },
              {
                key: "required_data_keys",
                label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043A\u043B\u044E\u0447\u0438 \u0434\u0430\u043D\u043D\u044B\u0445 (JSON-\u043C\u0430\u0441\u0441\u0438\u0432)",
                type: "json",
                optional: true,
                defaultValue: "[]",
                placeholder: '["passport_scan", "client_address"]'
              },
              {
                key: "required_mime_types",
                label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 MIME-\u0442\u0438\u043F\u044B \u0444\u0430\u0439\u043B\u043E\u0432 (JSON-\u043C\u0430\u0441\u0441\u0438\u0432)",
                type: "json",
                optional: true,
                defaultValue: "[]",
                placeholder: '["application/pdf", "image/*"]'
              },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "users") {
            return [
              { key: "name", label: "\u0418\u043C\u044F", type: "text", required: true },
              { key: "email", label: "Email", type: "text", required: true },
              { key: "phone", label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", type: "text", optional: true, placeholder: "+7..." },
              { key: "role", label: "\u0420\u043E\u043B\u044C", type: "enum", required: true, options: getRoleOptions, defaultValue: "LAWYER" },
              {
                key: "avatar_url",
                label: "URL \u0430\u0432\u0430\u0442\u0430\u0440\u0430",
                type: "text",
                optional: true,
                placeholder: "https://... \u0438\u043B\u0438 s3://...",
                uploadScope: "USER_AVATAR",
                accept: "image/*"
              },
              { key: "primary_topic_code", label: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C (\u0442\u0435\u043C\u0430)", type: "reference", optional: true, options: getTopicOptions },
              { key: "default_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E", type: "number", optional: true },
              { key: "salary_percent", label: "\u041F\u0440\u043E\u0446\u0435\u043D\u0442 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u044B", type: "number", optional: true },
              { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean", defaultValue: "true" },
              { key: "password", label: "\u041F\u0430\u0440\u043E\u043B\u044C", type: "password", requiredOnCreate: true, optional: true, omitIfEmpty: true, placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C" }
            ];
          }
          if (tableKey === "userTopics") {
            return [
              { key: "admin_user_id", label: "\u042E\u0440\u0438\u0441\u0442", type: "reference", required: true, options: getLawyerOptions },
              { key: "topic_code", label: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0442\u0435\u043C\u0430", type: "reference", required: true, options: getTopicOptions }
            ];
          }
          const meta = tableCatalogMap[tableKey];
          if (!meta || !Array.isArray(meta.columns)) return [];
          return (meta.columns || []).filter((column) => column && column.name && column.editable).map((column) => {
            const key = String(column.name || "");
            const requiredOnCreate = Boolean(column.required_on_create);
            const reference = normalizeReferenceMeta(column.reference);
            return {
              key,
              label: String(column.label || humanizeKey(key)),
              type: reference ? "reference" : metaKindToRecordType(column.kind),
              options: reference ? () => getReferenceOptions(reference) : void 0,
              requiredOnCreate,
              optional: !requiredOnCreate
            };
          });
        },
        [
          getReferenceOptions,
          tableCatalogMap,
          getFormFieldKeyOptions,
          getFormFieldTypeOptions,
          getInvoiceStatusOptions,
          getInvoicePayerOptions,
          getInvoiceRequestTrackOptions,
          getClientOptions,
          getLawyerOptions,
          getRoleOptions,
          getServiceRequestStatusOptions,
          getServiceRequestTypeOptions,
          getStatusGroupOptions,
          getStatusKindOptions,
          getStatusOptions,
          getTopicOptions
        ]
      );
      const getFieldDef = useCallback(
        (tableKey, fieldName) => {
          return getFilterFields(tableKey).find((field) => field.field === fieldName) || null;
        },
        [getFilterFields]
      );
      const getFieldOptions = useCallback((fieldDef) => {
        if (!fieldDef) return [];
        if (typeof fieldDef.options === "function") return fieldDef.options() || [];
        return [];
      }, []);
      const getFilterValuePreview = useCallback(
        (tableKey, clause) => {
          var _a2, _b, _c;
          const fieldDef = getFieldDef(tableKey, clause.field);
          if (!fieldDef) return String((_a2 = clause.value) != null ? _a2 : "");
          if (fieldDef.type === "boolean") return boolFilterLabel(Boolean(clause.value));
          if (fieldDef.type === "reference" || fieldDef.type === "enum") {
            const options = getFieldOptions(fieldDef);
            const found = options.find((option) => String(option.value) === String(clause.value));
            return found ? found.label : String((_b = clause.value) != null ? _b : "");
          }
          return String((_c = clause.value) != null ? _c : "");
        },
        [getFieldDef, getFieldOptions]
      );
      const {
        kanbanData,
        kanbanLoading,
        kanbanSortModal,
        kanbanSortApplied,
        loadKanban,
        openKanbanSortModal,
        closeKanbanSortModal,
        updateKanbanSortMode,
        submitKanbanSortModal,
        resetKanbanState
      } = useKanban({
        api,
        setStatus,
        setTableState,
        tablesRef
      });
      const { loadTable, loadPrevPage, loadNextPage, loadAllRows, toggleTableSort } = useTableActions({
        api,
        setStatus,
        resolveTableConfig,
        tablesRef,
        setTableState,
        setDictionaries,
        buildUniversalQuery
      });
      const { loadAvailableTables, loadReferenceRows } = useAdminCatalogLoaders({
        api,
        setStatus,
        setTableState,
        setReferenceRowsMap,
        buildUniversalQuery
      });
      const loadCurrentConfigTable = useCallback(
        async (resetOffset, tokenOverride, keyOverride) => {
          const currentKey = keyOverride || configActiveKey;
          if (!currentKey) {
            return false;
          }
          return loadTable(currentKey, { resetOffset: Boolean(resetOffset) }, tokenOverride);
        },
        [configActiveKey, loadTable]
      );
      const loadStatusDesignerTopic = useCallback(
        async (topicCode) => {
          const code = String(topicCode || "").trim();
          setStatusDesignerTopicCode(code);
          statusDesignerLoadedTopicRef.current = code;
          if (!code) {
            await loadTable("statusTransitions", { resetOffset: true, filtersOverride: [] });
            return;
          }
          await loadTable("statusTransitions", {
            resetOffset: true,
            filtersOverride: [{ field: "topic_code", op: "=", value: code }]
          });
        },
        [loadTable]
      );
      useEffect(() => {
        var _a2;
        if (configActiveKey !== "statusTransitions") {
          statusDesignerLoadedTopicRef.current = "";
          return;
        }
        const topics = dictionaries.topics || [];
        if (!topics.length) {
          setStatusDesignerTopicCode("");
          return;
        }
        const hasSelected = topics.some((item) => String((item == null ? void 0 : item.code) || "") === String(statusDesignerTopicCode || ""));
        const nextTopic = String(hasSelected ? statusDesignerTopicCode : ((_a2 = topics[0]) == null ? void 0 : _a2.code) || "").trim();
        if (!nextTopic) return;
        if (nextTopic !== statusDesignerTopicCode) {
          setStatusDesignerTopicCode(nextTopic);
          return;
        }
        if (statusDesignerLoadedTopicRef.current === nextTopic) return;
        statusDesignerLoadedTopicRef.current = nextTopic;
        loadTable("statusTransitions", {
          resetOffset: true,
          filtersOverride: [{ field: "topic_code", op: "=", value: nextTopic }]
        });
      }, [configActiveKey, dictionaries.topics, loadTable, statusDesignerTopicCode]);
      const loadDashboard = useCallback(
        async (tokenOverride) => {
          var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
          setStatus("dashboard", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
          try {
            const data = await api("/api/admin/metrics/overview", {}, tokenOverride);
            const scope = String(data.scope || role || "");
            const cards = scope === "LAWYER" ? [
              { label: "\u041C\u043E\u0438 \u0437\u0430\u044F\u0432\u043A\u0438", value: (_a2 = data.assigned_total) != null ? _a2 : 0 },
              { label: "\u041C\u043E\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435", value: (_b = data.active_assigned_total) != null ? _b : 0 },
              { label: "\u041D\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0435", value: (_c = data.unassigned_total) != null ? _c : 0 },
              { label: "\u041C\u043E\u0438 \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435", value: (_e = (_d = data.my_unread_notifications_total) != null ? _d : data.my_unread_updates) != null ? _e : 0 },
              { label: "\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E SLA", value: (_f = data.sla_overdue) != null ? _f : 0 }
            ] : [
              { label: "\u041D\u043E\u0432\u044B\u0435", value: (_g = data.new) != null ? _g : 0 },
              { label: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0435", value: (_h = data.assigned_total) != null ? _h : 0 },
              { label: "\u041D\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0435", value: (_i = data.unassigned_total) != null ? _i : 0 },
              { label: "\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E SLA", value: (_j = data.sla_overdue) != null ? _j : 0 },
              { label: "\u041C\u043E\u0438 \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435", value: (_l = (_k = data.my_unread_notifications_total) != null ? _k : data.my_unread_updates) != null ? _l : 0 },
              { label: "\u0412\u044B\u0440\u0443\u0447\u043A\u0430 (\u043C\u0435\u0441.)", value: Number((_m = data.month_revenue) != null ? _m : 0).toFixed(2) },
              { label: "\u0420\u0430\u0441\u0445\u043E\u0434\u044B (\u043C\u0435\u0441.)", value: Number((_n = data.month_expenses) != null ? _n : 0).toFixed(2) },
              { label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u044E\u0440\u0438\u0441\u0442\u0430\u043C\u0438", value: (_o = data.unread_for_lawyers) != null ? _o : 0 },
              { label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u0430\u043C\u0438", value: (_p = data.unread_for_clients) != null ? _p : 0 }
            ];
            const localized = {};
            Object.entries(data.by_status || {}).forEach(([code, count]) => {
              localized[statusLabel(code)] = count;
            });
            setDashboardData({
              scope,
              cards,
              byStatus: localized,
              lawyerLoads: data.lawyer_loads || [],
              myUnreadByEvent: data.my_unread_by_event || {},
              myUnreadTotal: Number(data.my_unread_updates || 0),
              myUnreadNotificationsTotal: Number(data.my_unread_notifications_total || data.my_unread_updates || 0),
              unreadForClients: Number(data.unread_for_clients_notifications_total || data.unread_for_clients || 0),
              unreadForLawyers: Number(data.unread_for_lawyers_notifications_total || data.unread_for_lawyers || 0),
              serviceRequestUnreadTotal: Number(data.service_request_unread_total || 0),
              deadlineAlertTotal: Number(data.deadline_alert_total || 0),
              monthRevenue: Number(data.month_revenue || 0),
              monthExpenses: Number(data.month_expenses || 0)
            });
            setStatus("dashboard", "\u0414\u0430\u043D\u043D\u044B\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B", "ok");
          } catch (error) {
            setStatus("dashboard", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, role, setStatus]
      );
      const loadMeta = useCallback(
        async (tokenOverride) => {
          const entity = (metaEntity || "quotes").trim() || "quotes";
          setStatus("meta", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
          try {
            const data = await api("/api/admin/meta/" + encodeURIComponent(entity), {}, tokenOverride);
            setMetaJson(JSON.stringify(localizeMeta(data), null, 2));
            setStatus("meta", "\u041C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u044B", "ok");
          } catch (error) {
            setStatus("meta", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, metaEntity, setStatus]
      );
      const loadSmsProviderHealth = useCallback(
        async (tokenOverride, options) => {
          const opts = options || {};
          const silent = Boolean(opts.silent);
          const currentRole = String(role || "").toUpperCase();
          const authToken = tokenOverride !== void 0 ? tokenOverride : token;
          if (!authToken || currentRole !== "ADMIN") {
            setSmsProviderHealth(null);
            return null;
          }
          if (!silent) setStatus("smsProviderHealth", "\u041E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u043C \u0431\u0430\u043B\u0430\u043D\u0441 SMS Aero...", "");
          try {
            const payload = await api("/api/admin/system/sms-provider-health", {}, tokenOverride);
            const enriched = { ...payload || {}, loaded_at: (/* @__PURE__ */ new Date()).toISOString() };
            setSmsProviderHealth(enriched);
            if (!silent) setStatus("smsProviderHealth", "\u0411\u0430\u043B\u0430\u043D\u0441 SMS Aero \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D", "ok");
            return enriched;
          } catch (error) {
            const fallback = {
              provider: "smsaero",
              status: "error",
              mode: "real",
              can_send: false,
              balance_available: false,
              balance_amount: null,
              balance_currency: "RUB",
              issues: [error.message],
              loaded_at: (/* @__PURE__ */ new Date()).toISOString()
            };
            setSmsProviderHealth(fallback);
            if (!silent) setStatus("smsProviderHealth", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
            return null;
          }
        },
        [api, role, setStatus, token]
      );
      const refreshSection = useCallback(
        async (section, tokenOverride) => {
          if (!(tokenOverride !== void 0 ? tokenOverride : token)) return;
          if (section === "dashboard") return loadDashboard(tokenOverride);
          if (section === "kanban") return loadKanban(tokenOverride);
          if (section === "requests" && canAccessSection(role, "requests")) return loadTable("requests", {}, tokenOverride);
          if (section === "serviceRequests" && canAccessSection(role, "serviceRequests")) return loadTable("serviceRequests", {}, tokenOverride);
          if (section === "invoices" && canAccessSection(role, "invoices")) return loadTable("invoices", {}, tokenOverride);
          if (section === "quotes" && canAccessSection(role, "quotes")) return loadTable("quotes", {}, tokenOverride);
          if (section === "config" && canAccessSection(role, "config")) return loadCurrentConfigTable(false, tokenOverride);
          if (section === "availableTables" && canAccessSection(role, "availableTables")) return loadAvailableTables(tokenOverride);
          if (section === "meta") return loadMeta(tokenOverride);
        },
        [loadAvailableTables, loadCurrentConfigTable, loadDashboard, loadKanban, loadMeta, loadTable, role, token]
      );
      const bootstrapReferenceData = useCallback(
        async (tokenOverride, roleOverride) => {
          setDictionaries((prev) => ({
            ...prev,
            statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name }))
          }));
          if (roleOverride !== "ADMIN") return;
          try {
            const body = buildUniversalQuery([], [{ field: "sort_order", dir: "asc" }], 500, 0);
            const usersBody = buildUniversalQuery([], [{ field: "created_at", dir: "desc" }], 500, 0);
            const [catalogData, topicsData, statusesData, fieldsData, usersData] = await Promise.all([
              api("/api/admin/crud/meta/tables", {}, tokenOverride),
              api("/api/admin/crud/topics/query", { method: "POST", body }, tokenOverride),
              api("/api/admin/crud/statuses/query", { method: "POST", body }, tokenOverride),
              api("/api/admin/crud/form_fields/query", { method: "POST", body }, tokenOverride),
              api("/api/admin/crud/admin_users/query", { method: "POST", body: usersBody }, tokenOverride)
            ]);
            const catalogRows = (catalogData.tables || []).filter((row) => row && row.table).map((row) => {
              const tableName = String(row.table || "");
              const key = TABLE_KEY_ALIASES[tableName] || String(row.key || tableName);
              return { ...row, key, table: tableName };
            });
            setTableCatalog(catalogRows);
            await loadReferenceRows(catalogRows, tokenOverride);
            const statusesMap = new Map(Object.entries(STATUS_LABELS).map(([code, name]) => [code, { code, name }]));
            (statusesData.rows || []).forEach((row) => {
              if (!row.code) return;
              statusesMap.set(row.code, { code: row.code, name: row.name || statusLabel(row.code) });
            });
            const typeSet = new Set(DEFAULT_FORM_FIELD_TYPES);
            (fieldsData.rows || []).forEach((row) => {
              if (row == null ? void 0 : row.type) typeSet.add(row.type);
            });
            const fieldKeys = (fieldsData.rows || []).filter((row) => row && row.key).map((row) => ({ key: row.key, label: row.label || row.key })).sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
            setDictionaries((prev) => ({
              ...prev,
              topics: sortByName((topicsData.rows || []).map((row) => ({ code: row.code, name: row.name || row.code }))),
              statuses: sortByName(Array.from(statusesMap.values())),
              formFieldTypes: Array.from(typeSet.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
              formFieldKeys: fieldKeys,
              users: (usersData.rows || []).map((row) => ({
                id: row.id,
                name: row.name || "",
                email: row.email || "",
                phone: row.phone || "",
                role: row.role || "",
                is_active: Boolean(row.is_active)
              }))
            }));
          } catch (_) {
          }
        },
        [api, loadReferenceRows]
      );
      const updateAvailableTableState = useCallback(
        async (tableName, isActive) => {
          const name = String(tableName || "").trim();
          if (!name) return;
          try {
            setStatus("availableTables", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...", "");
            await api("/api/admin/crud/meta/available-tables/" + encodeURIComponent(name), {
              method: "PATCH",
              body: { is_active: Boolean(isActive) }
            });
            await Promise.all([loadAvailableTables(), bootstrapReferenceData(token, role)]);
            setStatus("availableTables", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E", "ok");
          } catch (error) {
            setStatus("availableTables", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, bootstrapReferenceData, loadAvailableTables, role, setStatus, token]
      );
      const openCreateRecordModal = useCallback(
        (tableKey) => {
          const fields = getRecordFields(tableKey);
          const initial = {};
          fields.forEach((field) => {
            if (field.defaultValue !== void 0) initial[field.key] = String(field.defaultValue);
            else if (field.type === "boolean") initial[field.key] = "false";
            else if (field.type === "json") initial[field.key] = field.optional ? "" : "{}";
            else if ((field.type === "reference" || field.type === "enum") && !field.optional) {
              const options = typeof field.options === "function" ? field.options() : [];
              initial[field.key] = options.length ? String(options[0].value) : "";
            } else initial[field.key] = "";
          });
          if (tableKey === "requests" && !initial.status_code) initial.status_code = "NEW";
          if (tableKey === "invoices") {
            const selectedTrack = String(initial.request_track_number || "").trim().toUpperCase();
            if (selectedTrack) {
              const rows = getInvoiceRequestRows();
              const found = rows.find((row) => String((row == null ? void 0 : row.track_number) || "").trim().toUpperCase() === selectedTrack);
              const autoPayer = String((found == null ? void 0 : found.client_name) || "").trim();
              if (autoPayer) initial.payer_display_name = autoPayer;
            }
          }
          setRecordModal({ open: true, tableKey, mode: "create", rowId: null, form: initial });
          setStatus("recordForm", "", "");
        },
        [getInvoiceRequestRows, getRecordFields, setStatus]
      );
      const openCreateStatusTransitionForTopic = useCallback(() => {
        const topicCode = String(statusDesignerTopicCode || "").trim();
        if (!topicCode) {
          setStatus("statusTransitions", "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0435\u043C\u0443 \u0434\u043B\u044F \u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442\u043E\u0440\u0430", "error");
          return;
        }
        setRecordModal({
          open: true,
          tableKey: "statusTransitions",
          mode: "create",
          rowId: null,
          form: {
            topic_code: topicCode,
            from_status: "",
            to_status: "",
            sla_hours: "",
            required_data_keys: "[]",
            required_mime_types: "[]",
            enabled: "true",
            sort_order: String(Math.max(1, (statusDesignerRows || []).length + 1))
          }
        });
        setStatus("recordForm", "", "");
      }, [setStatus, statusDesignerRows, statusDesignerTopicCode]);
      const openEditRecordModal = useCallback(
        async (tableKey, row) => {
          let sourceRow = row || {};
          if (tableKey === "requests" && role === "ADMIN" && (row == null ? void 0 : row.id)) {
            try {
              setStatus("requests", "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u043F\u043E\u043B\u043D\u0443\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0437\u0430\u044F\u0432\u043A\u0438...", "");
              const loaded = await api("/api/admin/requests/" + row.id);
              sourceRow = { ...row || {}, ...loaded || {} };
              setStatus("requests", "", "");
            } catch (error) {
              setStatus("requests", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0437\u0430\u044F\u0432\u043A\u0438: " + error.message, "error");
              return;
            }
          }
          const fields = getRecordFields(tableKey);
          const nextForm = {};
          fields.forEach((field) => {
            const value = sourceRow[field.key];
            if (field.type === "boolean") nextForm[field.key] = value ? "true" : "false";
            else if (field.type === "json") nextForm[field.key] = value == null ? "" : JSON.stringify(value, null, 2);
            else nextForm[field.key] = value == null ? "" : String(value);
          });
          if (tableKey === "requests" && role !== "LAWYER" && !String(nextForm.client_id || "").trim()) {
            nextForm.client_id = NEW_REQUEST_CLIENT_OPTION;
          }
          setRecordModal({ open: true, tableKey, mode: "edit", rowId: sourceRow.id, form: nextForm });
          setStatus("recordForm", "", "");
        },
        [api, getRecordFields, role, setStatus]
      );
      const closeRecordModal = useCallback(() => {
        setRecordModal({ open: false, tableKey: null, mode: "create", rowId: null, form: {} });
        setStatus("recordForm", "", "");
      }, [setStatus]);
      const updateRecordField = useCallback(
        (field, value) => {
          setRecordModal((prev) => {
            const nextForm = { ...prev.form || {}, [field]: value };
            if (prev.tableKey === "requests") {
              if (field === "client_id") {
                const selectedId = String(value || "").trim();
                if (!selectedId || selectedId === NEW_REQUEST_CLIENT_OPTION) {
                  nextForm.client_id = NEW_REQUEST_CLIENT_OPTION;
                  nextForm.client_name = "";
                  nextForm.client_phone = "";
                } else if (selectedId) {
                  const rows = Array.isArray(referenceRowsMap.clients) ? referenceRowsMap.clients : [];
                  const found = rows.find((row) => String((row == null ? void 0 : row.id) || "") === selectedId);
                  if (found) {
                    nextForm.client_name = String(found.full_name || nextForm.client_name || "");
                    nextForm.client_phone = String(found.phone || nextForm.client_phone || "");
                  }
                }
              }
              if ((field === "client_name" || field === "client_phone") && String(nextForm.client_id || "").trim() && String(nextForm.client_id || "").trim() !== NEW_REQUEST_CLIENT_OPTION) {
                const selectedId = String(nextForm.client_id || "").trim();
                const rows = Array.isArray(referenceRowsMap.clients) ? referenceRowsMap.clients : [];
                const found = rows.find((row) => String((row == null ? void 0 : row.id) || "") === selectedId);
                if (found) {
                  const selectedName = String(found.full_name || "");
                  const selectedPhone = String(found.phone || "");
                  const currentName = String(field === "client_name" ? value : nextForm.client_name || "");
                  const currentPhone = String(field === "client_phone" ? value : nextForm.client_phone || "");
                  if (currentName !== selectedName || currentPhone !== selectedPhone) {
                    nextForm.client_id = "";
                  }
                }
              }
            }
            if (prev.tableKey === "invoices" && field === "request_track_number") {
              const selectedTrack = String(value || "").trim().toUpperCase();
              if (selectedTrack) {
                const rows = getInvoiceRequestRows();
                const found = rows.find((row) => String((row == null ? void 0 : row.track_number) || "").trim().toUpperCase() === selectedTrack);
                if (found) {
                  nextForm.request_track_number = String(found.track_number || selectedTrack).trim().toUpperCase();
                  const autoPayer = String(found.client_name || "").trim();
                  if (autoPayer) nextForm.payer_display_name = autoPayer;
                }
              }
            }
            return { ...prev, form: nextForm };
          });
        },
        [getInvoiceRequestRows, referenceRowsMap.clients]
      );
      const uploadRecordFieldFile = useCallback(
        async (field, file) => {
          if (!recordModal.tableKey || !field || !file) return;
          if (field.uploadScope !== "USER_AVATAR") return;
          if (recordModal.tableKey !== "users") return;
          if (recordModal.mode !== "edit" || !recordModal.rowId) {
            setStatus("recordForm", "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F, \u0437\u0430\u0442\u0435\u043C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0430\u0432\u0430\u0442\u0430\u0440", "error");
            return;
          }
          try {
            setStatus("recordForm", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0444\u0430\u0439\u043B\u0430...", "");
            const mimeType = String(file.type || "application/octet-stream");
            const initPayload = {
              file_name: file.name,
              mime_type: mimeType,
              size_bytes: file.size,
              scope: "USER_AVATAR",
              user_id: recordModal.rowId
            };
            const init = await api("/api/admin/uploads/init", { method: "POST", body: initPayload });
            const putResp = await fetch(init.presigned_url, {
              method: "PUT",
              headers: { "Content-Type": mimeType },
              body: file
            });
            if (!putResp.ok) {
              throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435");
            }
            const done = await api("/api/admin/uploads/complete", {
              method: "POST",
              body: {
                key: init.key,
                file_name: file.name,
                mime_type: mimeType,
                size_bytes: file.size,
                scope: "USER_AVATAR",
                user_id: recordModal.rowId
              }
            });
            updateRecordField("avatar_url", String(done.avatar_url || ""));
            setStatus("recordForm", "\u0410\u0432\u0430\u0442\u0430\u0440 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D", "ok");
          } catch (error) {
            setStatus("recordForm", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438: " + error.message, "error");
          }
        },
        [api, recordModal, setStatus, updateRecordField]
      );
      const buildRecordPayload = useCallback(
        (tableKey, form, mode) => {
          const fields = getRecordFields(tableKey);
          const payload = {};
          const isLawyerRequestEdit = tableKey === "requests" && role === "LAWYER" && mode === "edit";
          const isAdminRequestEdit = tableKey === "requests" && role === "ADMIN" && mode === "edit";
          const adminRequestRestricted = /* @__PURE__ */ new Set(["client_id", "client_name", "client_phone"]);
          fields.forEach((field) => {
            if (isLawyerRequestEdit && field.key !== "topic_code") return;
            if (isAdminRequestEdit && adminRequestRestricted.has(field.key)) return;
            const raw = form[field.key];
            if (field.type === "boolean") {
              payload[field.key] = raw === "true";
              return;
            }
            if (field.type === "number") {
              if (raw === "" || raw == null) {
                if (!field.optional) payload[field.key] = 0;
                return;
              }
              const number = Number(raw);
              if (Number.isNaN(number)) throw new Error('\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E \u0432 \u043F\u043E\u043B\u0435 "' + field.label + '"');
              payload[field.key] = number;
              return;
            }
            if (field.type === "json") {
              const text = String(raw || "").trim();
              if (!text) {
                if (field.omitIfEmpty) return;
                if (field.optional) payload[field.key] = null;
                else payload[field.key] = {};
                return;
              }
              try {
                payload[field.key] = JSON.parse(text);
              } catch (_) {
                throw new Error('\u041F\u043E\u043B\u0435 "' + field.label + '" \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u043C JSON');
              }
              return;
            }
            const value = String(raw || "").trim();
            if (tableKey === "requests" && field.key === "client_id" && value === NEW_REQUEST_CLIENT_OPTION) {
              payload[field.key] = null;
              return;
            }
            if (!value) {
              if (mode === "create" && field.autoCreate) return;
              if (mode === "create" && field.requiredOnCreate) throw new Error('\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043F\u043E\u043B\u0435 "' + field.label + '"');
              if (field.required) throw new Error('\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043F\u043E\u043B\u0435 "' + field.label + '"');
              if (field.omitIfEmpty) return;
              if (tableKey === "requests" && field.key === "track_number") return;
              if (field.optional) payload[field.key] = null;
              return;
            }
            payload[field.key] = value;
          });
          if (tableKey === "requests" && mode === "create" && !payload.extra_fields) payload.extra_fields = {};
          if (tableKey === "invoices" && mode === "edit") delete payload.request_track_number;
          return payload;
        },
        [getRecordFields, role]
      );
      const submitRecordModal = useCallback(
        async (event) => {
          event.preventDefault();
          const tableKey = recordModal.tableKey;
          if (!tableKey) return;
          const endpoints = resolveMutationConfig(tableKey);
          if (!endpoints) return;
          try {
            setStatus("recordForm", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...", "");
            const payload = buildRecordPayload(tableKey, recordModal.form || {}, recordModal.mode);
            if (recordModal.mode === "edit" && recordModal.rowId) {
              await api(endpoints.update(recordModal.rowId), { method: "PATCH", body: payload });
            } else {
              await api(endpoints.create, { method: "POST", body: payload });
            }
            setStatus("recordForm", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E", "ok");
            await loadTable(tableKey, { resetOffset: true });
            await loadReferenceRows(tableCatalog, void 0);
            setTimeout(() => closeRecordModal(), 250);
          } catch (error) {
            setStatus("recordForm", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, buildRecordPayload, closeRecordModal, loadReferenceRows, loadTable, recordModal, resolveMutationConfig, setStatus, tableCatalog]
      );
      const deleteRecord = useCallback(
        async (tableKey, id) => {
          const endpoints = resolveMutationConfig(tableKey);
          if (!endpoints) return;
          if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C?")) return;
          try {
            await api(endpoints.delete(id), { method: "DELETE" });
            setStatus(tableKey, "\u0417\u0430\u043F\u0438\u0441\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0430", "ok");
            await loadTable(tableKey, { resetOffset: true });
            await loadReferenceRows(tableCatalog, void 0);
          } catch (error) {
            setStatus(tableKey, "\u041E\u0448\u0438\u0431\u043A\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F: " + error.message, "error");
          }
        },
        [api, loadReferenceRows, loadTable, resolveMutationConfig, setStatus, tableCatalog]
      );
      const claimRequest = useCallback(
        async (requestId) => {
          if (!requestId) return;
          try {
            setStatus("requests", "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438...", "");
            setStatus("kanban", "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438...", "");
            await api("/api/admin/requests/" + requestId + "/claim", { method: "POST" });
            setStatus("requests", "\u0417\u0430\u044F\u0432\u043A\u0430 \u0432\u0437\u044F\u0442\u0430 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", "ok");
            setStatus("kanban", "\u0417\u0430\u044F\u0432\u043A\u0430 \u0432\u0437\u044F\u0442\u0430 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", "ok");
            const refreshRequests = canAccessSection(role, "requests") ? loadTable("requests", { resetOffset: true }) : Promise.resolve();
            await Promise.all([refreshRequests, loadKanban()]);
          } catch (error) {
            setStatus("requests", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F: " + error.message, "error");
            setStatus("kanban", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F: " + error.message, "error");
          }
        },
        [api, loadKanban, loadTable, role, setStatus]
      );
      const openInvoiceRequest = useCallback(
        (row, event) => {
          if (!row || !row.request_id) return;
          openRequestDetails(row.request_id, event);
        },
        [openRequestDetails]
      );
      const moveRequestFromKanban = useCallback(
        async (row, targetGroup, explicitStatus) => {
          var _a2;
          const requestId = String((row == null ? void 0 : row.id) || "").trim();
          if (!requestId) return;
          const currentGroup = String((row == null ? void 0 : row.status_group) || fallbackStatusGroup(row == null ? void 0 : row.status_code));
          const groupKey = String(targetGroup || "").trim();
          const targetStatusFromSelect = String(explicitStatus || "").trim();
          const assignedLawyerId = String((row == null ? void 0 : row.assigned_lawyer_id) || "").trim();
          if (role === "LAWYER" && !assignedLawyerId) {
            setStatus("kanban", "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u043E\u0437\u044C\u043C\u0438\u0442\u0435 \u0437\u0430\u044F\u0432\u043A\u0443 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", "error");
            return;
          }
          if (role === "LAWYER" && assignedLawyerId && String(assignedLawyerId) !== String(userId || "")) {
            setStatus("kanban", "\u042E\u0440\u0438\u0441\u0442 \u043C\u043E\u0436\u0435\u0442 \u043C\u0435\u043D\u044F\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441 \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u043E\u0438\u0445 \u0437\u0430\u044F\u0432\u043E\u043A", "error");
            return;
          }
          let targetStatus = targetStatusFromSelect;
          const transitions = Array.isArray(row == null ? void 0 : row.available_transitions) ? row.available_transitions : [];
          if (!targetStatus) {
            if (!groupKey || groupKey === currentGroup) return;
            const candidates = transitions.filter((item) => String((item == null ? void 0 : item.target_group) || "") === groupKey);
            if (!candidates.length) {
              setStatus("kanban", "\u0414\u043B\u044F \u044D\u0442\u043E\u0439 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u043D\u0435\u0442 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430 \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u0443\u044E \u043A\u043E\u043B\u043E\u043D\u043A\u0443", "error");
              return;
            }
            if (candidates.length > 1) {
              await openRequestDetails(requestId, void 0, {
                statusChangePreset: {
                  source: "kanban",
                  targetGroup: groupKey,
                  suggestedStatuses: candidates.map((item) => String((item == null ? void 0 : item.to_status) || "")).filter(Boolean)
                }
              });
              setStatus("kanban", "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043C\u043E\u0434\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u043A\u043D\u043E \u0441\u043C\u0435\u043D\u044B \u0441\u0442\u0430\u0442\u0443\u0441\u0430 \u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441", "ok");
              return;
            }
            targetStatus = String(((_a2 = candidates[0]) == null ? void 0 : _a2.to_status) || "").trim();
          }
          if (!targetStatus || targetStatus === String((row == null ? void 0 : row.status_code) || "")) return;
          try {
            setStatus("kanban", "\u041F\u0435\u0440\u0435\u0432\u043E\u0434\u0438\u043C \u0437\u0430\u044F\u0432\u043A\u0443...", "");
            await submitRequestStatusChange({ requestId, statusCode: targetStatus });
            setStatus("kanban", "\u0421\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u044F\u0432\u043A\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D", "ok");
            const refreshRequests = canAccessSection(role, "requests") ? loadTable("requests", { resetOffset: true }) : Promise.resolve();
            await Promise.all([loadKanban(), refreshRequests]);
          } catch (error) {
            setStatus("kanban", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430: " + error.message, "error");
          }
        },
        [loadKanban, loadTable, openRequestDetails, role, setStatus, submitRequestStatusChange, userId]
      );
      const downloadInvoicePdf = useCallback(
        async (row, statusKey = "invoices") => {
          if (!row || !row.id || !token) return;
          try {
            setStatus(statusKey, "\u0424\u043E\u0440\u043C\u0438\u0440\u0443\u0435\u043C PDF...", "");
            const response = await fetch("/api/admin/invoices/" + row.id + "/pdf", {
              headers: { Authorization: "Bearer " + token }
            });
            if (!response.ok) {
              const text = await response.text();
              let payload = {};
              try {
                payload = text ? JSON.parse(text) : {};
              } catch (_) {
                payload = { raw: text };
              }
              const message = payload.detail || payload.error || payload.raw || "HTTP " + response.status;
              throw new Error(translateApiError(String(message)));
            }
            const blob = await response.blob();
            const fileName = (row.invoice_number || "invoice") + ".pdf";
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setStatus(statusKey, "PDF \u0441\u043A\u0430\u0447\u0430\u043D", "ok");
          } catch (error) {
            setStatus(statusKey, "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F: " + error.message, "error");
          }
        },
        [setStatus, token]
      );
      const downloadRequestInvoicePdf = useCallback(
        async (row) => {
          await downloadInvoicePdf(row, "requestModal");
        },
        [downloadInvoicePdf]
      );
      const resetAdminRoute = useCallback(() => {
        const nextUrl = "/admin.html";
        if (window.location.pathname !== nextUrl || window.location.search) {
          window.history.replaceState(null, "", nextUrl);
        }
      }, []);
      const goBackFromRequestWorkspace = useCallback(() => {
        const targetSection = canAccessSection(role, "requests") ? "requests" : "kanban";
        resetAdminRoute();
        setActiveSection(targetSection);
        refreshSection(targetSection);
      }, [refreshSection, resetAdminRoute, role]);
      const openReassignModal = useCallback(
        (row) => {
          const options = getLawyerOptions();
          if (!options.length) {
            setStatus("reassignForm", "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u044E\u0440\u0438\u0441\u0442\u043E\u0432 \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F", "error");
            return;
          }
          const current = String((row == null ? void 0 : row.assigned_lawyer_id) || "");
          const hasCurrent = options.some((option) => String(option.value) === current);
          const fallback = options[0] ? String(options[0].value) : "";
          setReassignModal({
            open: true,
            requestId: (row == null ? void 0 : row.id) || null,
            trackNumber: (row == null ? void 0 : row.track_number) || "",
            lawyerId: hasCurrent ? current : fallback
          });
          setStatus("reassignForm", "", "");
        },
        [getLawyerOptions, setStatus]
      );
      const closeReassignModal = useCallback(() => {
        setReassignModal({ open: false, requestId: null, trackNumber: "", lawyerId: "" });
        setStatus("reassignForm", "", "");
      }, [setStatus]);
      const updateReassignLawyer = useCallback((event) => {
        setReassignModal((prev) => ({ ...prev, lawyerId: event.target.value }));
      }, []);
      const submitReassignModal = useCallback(
        async (event) => {
          event.preventDefault();
          if (!reassignModal.requestId) return;
          const lawyerId = String(reassignModal.lawyerId || "").trim();
          if (!lawyerId) {
            setStatus("reassignForm", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u044E\u0440\u0438\u0441\u0442\u0430", "error");
            return;
          }
          try {
            setStatus("reassignForm", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...", "");
            await api("/api/admin/requests/" + reassignModal.requestId + "/reassign", {
              method: "POST",
              body: { lawyer_id: lawyerId }
            });
            setStatus("requests", "\u0417\u0430\u044F\u0432\u043A\u0430 \u043F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430", "ok");
            closeReassignModal();
            await loadTable("requests", { resetOffset: true });
          } catch (error) {
            setStatus("reassignForm", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, closeReassignModal, loadTable, reassignModal.lawyerId, reassignModal.requestId, setStatus]
      );
      const defaultFilterValue = useCallback(
        (fieldDef) => {
          if (!fieldDef) return "";
          if (fieldDef.type === "boolean") return "true";
          if (fieldDef.type === "reference" || fieldDef.type === "enum") {
            const options = getFieldOptions(fieldDef);
            return options.length ? String(options[0].value) : "";
          }
          return "";
        },
        [getFieldOptions]
      );
      const openFilterModal = useCallback(
        (tableKey) => {
          const fields = getFilterFields(tableKey);
          if (!fields.length) {
            setStatus("filter", "\u0414\u043B\u044F \u0442\u0430\u0431\u043B\u0438\u0446\u044B \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u043F\u043E\u043B\u0435\u0439 \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u0446\u0438\u0438", "error");
            return;
          }
          const firstField = fields[0];
          const firstOp = getOperatorsForType(firstField.type)[0] || "=";
          setFilterModal({
            open: true,
            tableKey,
            field: firstField.field,
            op: firstOp,
            rawValue: defaultFilterValue(firstField),
            editIndex: null
          });
          setStatus("filter", "", "");
        },
        [defaultFilterValue, getFilterFields, setStatus]
      );
      const openFilterEditModal = useCallback(
        (tableKey, index) => {
          var _a2;
          const tableState = tablesRef.current[tableKey] || createTableState();
          const target = (tableState.filters || [])[index];
          if (!target) return;
          const fieldDef = getFieldDef(tableKey, target.field);
          if (!fieldDef) return;
          const allowedOps = getOperatorsForType(fieldDef.type);
          const safeOp = allowedOps.includes(target.op) ? target.op : allowedOps[0] || "=";
          const rawValue = fieldDef.type === "boolean" ? target.value ? "true" : "false" : String((_a2 = target.value) != null ? _a2 : "");
          setFilterModal({
            open: true,
            tableKey,
            field: fieldDef.field,
            op: safeOp,
            rawValue,
            editIndex: index
          });
          setStatus("filter", "", "");
        },
        [getFieldDef, setStatus]
      );
      const closeFilterModal = useCallback(() => {
        setFilterModal((prev) => ({ ...prev, open: false, editIndex: null }));
        setStatus("filter", "", "");
      }, [setStatus]);
      const updateFilterField = useCallback(
        (event) => {
          const fieldName = event.target.value;
          const fields = getFilterFields(filterModal.tableKey);
          const fieldDef = fields.find((field) => field.field === fieldName) || null;
          if (!fieldDef) return;
          const defaultOp = getOperatorsForType(fieldDef.type)[0] || "=";
          setFilterModal((prev) => ({
            ...prev,
            field: fieldName,
            op: defaultOp,
            rawValue: defaultFilterValue(fieldDef)
          }));
        },
        [defaultFilterValue, filterModal.tableKey, getFilterFields]
      );
      const updateFilterOp = useCallback((event) => {
        const op = event.target.value;
        setFilterModal((prev) => ({ ...prev, op }));
      }, []);
      const updateFilterValue = useCallback((event) => {
        setFilterModal((prev) => ({ ...prev, rawValue: event.target.value }));
      }, []);
      const { applyFilterModal, clearFiltersFromModal, removeFilterChip } = useTableFilterActions({
        filterModal,
        closeFilterModal,
        getFieldDef,
        loadKanban,
        loadTable,
        setStatus,
        setTableState,
        tablesRef
      });
      const selectConfigNode = useCallback(
        (tableKey) => {
          resetAdminRoute();
          setConfigActiveKey(tableKey);
          setActiveSection("config");
          loadCurrentConfigTable(false, void 0, tableKey);
        },
        [loadCurrentConfigTable, resetAdminRoute]
      );
      const activateSection = useCallback(
        (section) => {
          const nextSection = canAccessSection(role, section) ? section : "dashboard";
          resetAdminRoute();
          setActiveSection(nextSection);
          refreshSection(nextSection);
        },
        [refreshSection, resetAdminRoute, role]
      );
      const applyRequestsQuickFilterPreset = useCallback(
        async (filters, statusMessage) => {
          if (!canAccessSection(role, "requests")) return;
          const nextFilters = Array.isArray(filters) ? filters.filter((item) => item && item.field) : [];
          resetAdminRoute();
          setActiveSection("requests");
          const currentState = tablesRef.current.requests || createTableState();
          setTableState("requests", {
            ...currentState,
            filters: nextFilters,
            offset: 0,
            showAll: false
          });
          if (statusMessage) setStatus("requests", statusMessage, "");
          await loadTable("requests", { resetOffset: true, filtersOverride: nextFilters });
        },
        [loadTable, resetAdminRoute, role, setStatus, setTableState, tablesRef]
      );
      const applyKanbanQuickFilterPreset = useCallback(
        async (filters, statusMessage) => {
          const nextFilters = Array.isArray(filters) ? filters.filter((item) => item && item.field) : [];
          resetAdminRoute();
          setActiveSection("kanban");
          const currentState = tablesRef.current.kanban || createTableState();
          setTableState("kanban", {
            ...currentState,
            filters: nextFilters,
            offset: 0,
            showAll: false
          });
          if (statusMessage) setStatus("kanban", statusMessage, "");
          await loadKanban(void 0, { filtersOverride: nextFilters });
        },
        [loadKanban, resetAdminRoute, setStatus, setTableState, tablesRef]
      );
      const openRequestsWithUnreadAlerts = useCallback(async () => {
        await applyRequestsQuickFilterPreset([{ field: "has_unread_updates", op: "=", value: true }], "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0437\u0430\u044F\u0432\u043A\u0438 \u0441 \u043D\u043E\u0432\u044B\u043C\u0438 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F\u043C\u0438");
      }, [applyRequestsQuickFilterPreset]);
      const openRequestsWithDeadlineAlerts = useCallback(async () => {
        await applyRequestsQuickFilterPreset([{ field: "deadline_alert", op: "=", value: true }], "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0437\u0430\u044F\u0432\u043A\u0438 \u0441 \u0433\u043E\u0440\u044F\u0449\u0438\u043C\u0438 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430\u043C\u0438");
      }, [applyRequestsQuickFilterPreset]);
      const openKanbanWithUnreadAlerts = useCallback(async () => {
        await applyKanbanQuickFilterPreset([{ field: "has_unread_updates", op: "=", value: true }], "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0437\u0430\u044F\u0432\u043A\u0438 \u0441 \u043D\u043E\u0432\u044B\u043C\u0438 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F\u043C\u0438");
      }, [applyKanbanQuickFilterPreset]);
      const openKanbanWithDeadlineAlerts = useCallback(async () => {
        await applyKanbanQuickFilterPreset([{ field: "deadline_alert", op: "=", value: true }], "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0437\u0430\u044F\u0432\u043A\u0438 \u0441 \u0433\u043E\u0440\u044F\u0449\u0438\u043C\u0438 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430\u043C\u0438");
      }, [applyKanbanQuickFilterPreset]);
      const applyServiceRequestsQuickFilterPreset = useCallback(
        async (filters, statusMessage) => {
          const nextFilters = Array.isArray(filters) ? filters.filter((item) => item && item.field) : [];
          resetAdminRoute();
          setActiveSection("serviceRequests");
          const currentState = tablesRef.current.serviceRequests || createTableState();
          setTableState("serviceRequests", {
            ...currentState,
            filters: nextFilters,
            offset: 0,
            showAll: false
          });
          if (statusMessage) setStatus("serviceRequests", statusMessage, "");
          await loadTable("serviceRequests", { resetOffset: true, filtersOverride: nextFilters });
        },
        [loadTable, resetAdminRoute, setStatus, setTableState, tablesRef]
      );
      const openServiceRequestsWithUnreadAlerts = useCallback(async () => {
        if (String(role || "").toUpperCase() === "LAWYER") {
          await applyServiceRequestsQuickFilterPreset(
            [{ field: "lawyer_unread", op: "=", value: true }],
            "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u0430"
          );
          return;
        }
        await applyServiceRequestsQuickFilterPreset(
          [{ field: "admin_unread", op: "=", value: true }],
          "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u0430"
        );
      }, [applyServiceRequestsQuickFilterPreset, role]);
      const markServiceRequestRead = useCallback(
        async (serviceRequestId) => {
          const rowId = String(serviceRequestId || "").trim();
          if (!rowId) return;
          try {
            setStatus("serviceRequests", "\u041E\u0442\u043C\u0435\u0447\u0430\u0435\u043C \u043A\u0430\u043A \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0439...", "");
            await api("/api/admin/requests/service-requests/" + encodeURIComponent(rowId) + "/read", { method: "POST" });
            await Promise.all([loadTable("serviceRequests", { resetOffset: true }), loadDashboard()]);
            if (canAccessSection(role, "requests")) await loadTable("requests", { resetOffset: true });
            setStatus("serviceRequests", "\u0417\u0430\u043F\u0440\u043E\u0441 \u043E\u0442\u043C\u0435\u0447\u0435\u043D \u043A\u0430\u043A \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0439", "ok");
          } catch (error) {
            setStatus("serviceRequests", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, loadDashboard, loadTable, role, setStatus]
      );
      const loadTotpStatus = useCallback(
        async (tokenOverride) => {
          const activeToken = tokenOverride !== void 0 ? tokenOverride : token;
          if (!activeToken) return;
          try {
            const data = await api("/api/admin/auth/totp/status", { method: "GET" }, activeToken);
            if (data && typeof data === "object") {
              setTotpStatus({
                mode: String(data.mode || "password_totp_optional"),
                enabled: Boolean(data.enabled),
                required: Boolean(data.required),
                has_backup_codes: Boolean(data.has_backup_codes)
              });
            }
          } catch (_) {
          }
        },
        [api, token]
      );
      const openAccountModal = useCallback(async () => {
        if (!token || !userId) {
          setStatus("account", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C: \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", "error");
          return;
        }
        setAccountModal((prev) => ({
          ...prev,
          open: true,
          loading: true,
          saving: false
        }));
        setStatus("account", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u0440\u043E\u0444\u0438\u043B\u044F...", "");
        try {
          const row = await api("/api/admin/crud/admin_users/" + encodeURIComponent(String(userId)));
          const nextInitial = {
            name: String((row == null ? void 0 : row.name) || ""),
            email: String((row == null ? void 0 : row.email) || email || ""),
            phone: String((row == null ? void 0 : row.phone) || "")
          };
          setAccountModal({
            open: true,
            loading: false,
            saving: false,
            initial: nextInitial,
            form: {
              ...nextInitial,
              password: "",
              passwordConfirm: ""
            }
          });
          setStatus("account", "", "");
        } catch (error) {
          setAccountModal((prev) => ({ ...prev, loading: false }));
          setStatus("account", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044F: " + error.message, "error");
        }
      }, [api, email, setStatus, token, userId]);
      const closeAccountModal = useCallback(() => {
        setAccountModal((prev) => ({
          ...prev,
          open: false,
          loading: false,
          saving: false,
          form: {
            name: prev.initial.name,
            email: prev.initial.email,
            phone: prev.initial.phone,
            password: "",
            passwordConfirm: ""
          }
        }));
        setStatus("account", "", "");
      }, [setStatus]);
      const updateAccountField = useCallback((event) => {
        var _a2;
        const fieldName = String(((_a2 = event == null ? void 0 : event.target) == null ? void 0 : _a2.name) || "");
        if (!fieldName) return;
        setAccountModal((prev) => ({
          ...prev,
          form: {
            ...prev.form,
            [fieldName]: event.target.value
          }
        }));
      }, []);
      const submitAccountModal = useCallback(
        async (event) => {
          event.preventDefault();
          if (!token || !userId) return;
          const form = accountModal.form || {};
          const initial = accountModal.initial || {};
          const nextName = String(form.name || "").trim();
          const nextEmail = String(form.email || "").trim().toLowerCase();
          const nextPhone = String(form.phone || "").trim();
          const nextPassword = String(form.password || "");
          const nextPasswordConfirm = String(form.passwordConfirm || "");
          if (!nextName) {
            setStatus("account", "\u0418\u043C\u044F \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u043C", "error");
            return;
          }
          if (!nextEmail) {
            setStatus("account", "\u041F\u043E\u0447\u0442\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043F\u0443\u0441\u0442\u043E\u0439", "error");
            return;
          }
          if (nextPassword && nextPassword.length < 8) {
            setStatus("account", "\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 8 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432", "error");
            return;
          }
          if (nextPassword !== nextPasswordConfirm) {
            setStatus("account", "\u041F\u0430\u0440\u043E\u043B\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442", "error");
            return;
          }
          const payload = {};
          if (nextName !== String(initial.name || "").trim()) payload.name = nextName;
          if (nextEmail !== String(initial.email || "").trim().toLowerCase()) payload.email = nextEmail;
          if (nextPhone !== String(initial.phone || "").trim()) payload.phone = nextPhone || null;
          if (nextPassword) payload.password = nextPassword;
          if (!Object.keys(payload).length) {
            setStatus("account", "\u041D\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0434\u043B\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F", "");
            return;
          }
          try {
            setAccountModal((prev) => ({ ...prev, saving: true }));
            setStatus("account", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...", "");
            const row = await api("/api/admin/crud/admin_users/" + encodeURIComponent(String(userId)), {
              method: "PATCH",
              body: payload
            });
            const nextInitial = {
              name: String((row == null ? void 0 : row.name) || nextName),
              email: String((row == null ? void 0 : row.email) || nextEmail),
              phone: String((row == null ? void 0 : row.phone) || nextPhone)
            };
            setAccountModal((prev) => ({
              ...prev,
              saving: false,
              initial: nextInitial,
              form: {
                ...nextInitial,
                password: "",
                passwordConfirm: ""
              }
            }));
            if (nextInitial.email) setEmail(nextInitial.email);
            setStatus("account", "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D", "ok");
          } catch (error) {
            setAccountModal((prev) => ({ ...prev, saving: false }));
            setStatus("account", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F: " + error.message, "error");
          }
        },
        [accountModal.form, accountModal.initial, api, setStatus, token, userId]
      );
      const closeTotpSetupModal = useCallback(() => {
        setTotpSetupModal({
          open: false,
          secret: "",
          uri: "",
          qrDataUrl: "",
          code: "",
          loading: false
        });
        setStatus("totpSetup", "", "");
      }, [setStatus]);
      const updateTotpSetupCode = useCallback((event) => {
        setTotpSetupModal((prev) => ({ ...prev, code: event.target.value }));
      }, []);
      const copyTotpSecret = useCallback(async () => {
        const value = String(totpSetupModal.secret || "").trim();
        if (!value) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(value);
            setStatus("totpSetup", "\u041A\u043B\u044E\u0447 \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D \u0432 \u0431\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0435\u043D\u0430", "ok");
          } else {
            setStatus("totpSetup", "\u0411\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0435\u043D\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435", "error");
          }
        } catch (_) {
          setStatus("totpSetup", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u043B\u044E\u0447", "error");
        }
      }, [setStatus, totpSetupModal.secret]);
      const copyTotpUri = useCallback(async () => {
        const value = String(totpSetupModal.uri || "").trim();
        if (!value) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(value);
            setStatus("totpSetup", "URI \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D \u0432 \u0431\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0435\u043D\u0430", "ok");
          } else {
            setStatus("totpSetup", "\u0411\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0435\u043D\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435", "error");
          }
        } catch (_) {
          setStatus("totpSetup", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C URI", "error");
        }
      }, [setStatus, totpSetupModal.uri]);
      const setupTotp = useCallback(async () => {
        try {
          const setup = await api("/api/admin/auth/totp/setup", { method: "POST", body: {} });
          const secret = String((setup == null ? void 0 : setup.secret) || "").trim();
          const uri = String((setup == null ? void 0 : setup.otpauth_uri) || "").trim();
          if (!secret || !uri) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0441\u0435\u043A\u0440\u0435\u0442 TOTP");
          let qrDataUrl = "";
          try {
            qrDataUrl = await import_qrcode.default.toDataURL(uri, {
              margin: 1,
              width: 240,
              errorCorrectionLevel: "M"
            });
          } catch (_) {
            qrDataUrl = "";
          }
          setTotpSetupModal({
            open: true,
            secret,
            uri,
            qrDataUrl,
            code: "",
            loading: false
          });
          setStatus("totpSetup", "", "");
        } catch (error) {
          setStatus("login", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 2FA: " + error.message, "error");
        }
      }, [api, setStatus]);
      const submitTotpSetup = useCallback(
        async (event) => {
          event.preventDefault();
          const secret = String(totpSetupModal.secret || "").trim();
          const rawCode = String(totpSetupModal.code || "").trim();
          const digitsOnly = rawCode.replace(/\D+/g, "");
          if (!secret) {
            setStatus("totpSetup", "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D TOTP secret. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0443.", "error");
            return;
          }
          if (digitsOnly.length !== 6) {
            setStatus("totpSetup", "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 6-\u0437\u043D\u0430\u0447\u043D\u044B\u0439 \u043A\u043E\u0434", "error");
            return;
          }
          try {
            setTotpSetupModal((prev) => ({ ...prev, loading: true }));
            const enabled = await api("/api/admin/auth/totp/enable", { method: "POST", body: { secret, code: digitsOnly } });
            closeTotpSetupModal();
            setStatus("login", "2FA \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430", "ok");
            const backupCodes = Array.isArray(enabled == null ? void 0 : enabled.backup_codes) ? enabled.backup_codes : [];
            window.alert(
              "2FA \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430.\n\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0435 \u043A\u043E\u0434\u044B (\u043E\u0434\u043D\u043E\u043A\u0440\u0430\u0442\u043D\u043E):\n\n" + (backupCodes.length ? backupCodes.join("\n") : "-")
            );
            await loadTotpStatus();
          } catch (error) {
            setTotpSetupModal((prev) => ({ ...prev, loading: false }));
            setStatus("totpSetup", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F 2FA: " + error.message, "error");
          }
        },
        [api, closeTotpSetupModal, loadTotpStatus, setStatus, totpSetupModal.code, totpSetupModal.secret]
      );
      const regenerateTotpBackupCodes = useCallback(async () => {
        try {
          const code = String(window.prompt("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 TOTP \u043A\u043E\u0434 (\u0438\u043B\u0438 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0439 \u043A\u043E\u0434) \u0434\u043B\u044F \u0440\u0435\u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438", "") || "").trim();
          if (!code) return;
          const payload = /^\d{6}$/.test(code) ? { code } : { backup_code: code };
          const data = await api("/api/admin/auth/totp/backup/regenerate", { method: "POST", body: payload });
          const backupCodes = Array.isArray(data == null ? void 0 : data.backup_codes) ? data.backup_codes : [];
          window.alert("\u041D\u043E\u0432\u044B\u0435 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0435 \u043A\u043E\u0434\u044B:\n\n" + (backupCodes.length ? backupCodes.join("\n") : "-"));
          await loadTotpStatus();
        } catch (error) {
          setStatus("login", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0440\u0435\u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 backup-\u043A\u043E\u0434\u043E\u0432: " + error.message, "error");
        }
      }, [api, loadTotpStatus, setStatus]);
      const disableTotp = useCallback(async () => {
        try {
          const code = String(window.prompt("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 TOTP \u043A\u043E\u0434 (\u0438\u043B\u0438 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0439 \u043A\u043E\u0434) \u0434\u043B\u044F \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F 2FA", "") || "").trim();
          if (!code) return;
          const payload = /^\d{6}$/.test(code) ? { code } : { backup_code: code };
          await api("/api/admin/auth/totp/disable", { method: "POST", body: payload });
          setStatus("login", "2FA \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430", "ok");
          await loadTotpStatus();
        } catch (error) {
          setStatus("login", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F 2FA: " + error.message, "error");
        }
      }, [api, loadTotpStatus, setStatus]);
      const logout = useCallback(() => {
        localStorage.removeItem(LS_TOKEN);
        setToken("");
        setRole("");
        setEmail("");
        setUserId("");
        setRecordModal({ open: false, tableKey: null, mode: "create", rowId: null, form: {} });
        resetRequestWorkspaceState();
        setFilterModal({ open: false, tableKey: null, field: "", op: "=", rawValue: "", editIndex: null });
        resetKanbanState();
        setReassignModal({ open: false, requestId: null, trackNumber: "", lawyerId: "" });
        setDashboardData({
          scope: "",
          cards: [],
          byStatus: {},
          lawyerLoads: [],
          myUnreadByEvent: {},
          myUnreadTotal: 0,
          myUnreadNotificationsTotal: 0,
          unreadForClients: 0,
          unreadForLawyers: 0,
          serviceRequestUnreadTotal: 0,
          deadlineAlertTotal: 0,
          monthRevenue: 0,
          monthExpenses: 0
        });
        setMetaJson("");
        setConfigActiveKey("");
        setReferencesExpanded(true);
        resetTablesState();
        setDictionaries({
          topics: [],
          statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
          formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
          formFieldKeys: [],
          users: []
        });
        setStatusMap({});
        setSmsProviderHealth(null);
        setTotpStatus({
          mode: "password_totp_optional",
          enabled: false,
          required: false,
          has_backup_codes: false
        });
        setTotpSetupModal({
          open: false,
          secret: "",
          uri: "",
          qrDataUrl: "",
          code: "",
          loading: false
        });
        setAccountModal({
          open: false,
          loading: false,
          saving: false,
          initial: { name: "", email: "", phone: "" },
          form: { name: "", email: "", phone: "", password: "", passwordConfirm: "" }
        });
        setActiveSection("dashboard");
      }, [resetKanbanState, resetRequestWorkspaceState, resetTablesState]);
      const login = useCallback(
        async (emailInput, passwordInput, totpCodeInput) => {
          try {
            setStatus("login", "\u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u043C \u0432\u0445\u043E\u0434...", "");
            const rawTotp = String(totpCodeInput || "").trim();
            const digitsOnly = rawTotp.replace(/\D+/g, "");
            const loginBody = {
              email: String(emailInput || "").trim(),
              password: passwordInput || "",
              ...rawTotp ? digitsOnly.length === 6 ? { totp_code: digitsOnly } : { backup_code: rawTotp } : {}
            };
            const data = await api(
              "/api/admin/auth/login",
              {
                method: "POST",
                auth: false,
                body: loginBody
              },
              ""
            );
            const nextToken = data.access_token;
            const payload = decodeJwtPayload(nextToken || "");
            if (!payload || !payload.role || !payload.email) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0442\u043E\u043A\u0435\u043D\u0430");
            localStorage.setItem(LS_TOKEN, nextToken);
            setToken(nextToken);
            setRole(payload.role);
            setEmail(payload.email);
            setUserId(String(payload.sub || ""));
            await bootstrapReferenceData(nextToken, payload.role);
            setActiveSection("dashboard");
            await loadDashboard(nextToken);
            await loadTotpStatus(nextToken);
            setStatus("login", "\u0423\u0441\u043F\u0435\u0448\u043D\u044B\u0439 \u0432\u0445\u043E\u0434", "ok");
          } catch (error) {
            setStatus("login", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u0445\u043E\u0434\u0430: " + error.message, "error");
          }
        },
        [api, bootstrapReferenceData, loadDashboard, loadTotpStatus, setStatus]
      );
      useEffect(() => {
        const saved = localStorage.getItem(LS_TOKEN) || "";
        if (!saved) return;
        const payload = decodeJwtPayload(saved);
        if (!payload || !payload.role || !payload.email) {
          localStorage.removeItem(LS_TOKEN);
          return;
        }
        setToken(saved);
        setRole(payload.role);
        setEmail(payload.email);
        setUserId(String(payload.sub || ""));
      }, []);
      useEffect(() => {
        if (!token || !role) return;
        let cancelled = false;
        (async () => {
          await bootstrapReferenceData(token, role);
          if (!cancelled) await loadDashboard(token);
          if (!cancelled) await loadTotpStatus(token);
        })();
        return () => {
          cancelled = true;
        };
      }, [bootstrapReferenceData, loadDashboard, loadTotpStatus, role, token]);
      useEffect(() => {
        if (!token || !role) return;
        if (initialRouteHandledRef.current) return;
        initialRouteHandledRef.current = true;
        if (isRequestWorkspaceRoute && routeInfo.requestId) {
          setActiveSection("requestWorkspace");
          loadRequestModalData(routeInfo.requestId, { showLoading: true });
          resetAdminRoute();
          return;
        }
        if (routeInfo.section) {
          if (canAccessSection(role, routeInfo.section)) {
            setActiveSection(routeInfo.section);
            refreshSection(routeInfo.section, token);
            resetAdminRoute();
          } else {
            setActiveSection("dashboard");
            refreshSection("dashboard", token);
            resetAdminRoute();
          }
        }
      }, [isRequestWorkspaceRoute, loadRequestModalData, refreshSection, resetAdminRoute, role, routeInfo.requestId, routeInfo.section, token]);
      useEffect(() => {
        if (!token) {
          setSmsProviderHealth(null);
          return;
        }
        if (String(role || "").toUpperCase() !== "ADMIN") {
          setSmsProviderHealth(null);
          return;
        }
        if (activeSection !== "config" || configActiveKey !== "otp_sessions") return;
        loadSmsProviderHealth(void 0, { silent: true });
      }, [activeSection, configActiveKey, loadSmsProviderHealth, role, token]);
      useEffect(() => {
        if (!dictionaryTableItems.length) {
          if (configActiveKey) setConfigActiveKey("");
          return;
        }
        const hasCurrent = dictionaryTableItems.some((item) => item.key === configActiveKey);
        if (!hasCurrent) setConfigActiveKey(dictionaryTableItems[0].key);
      }, [configActiveKey, dictionaryTableItems]);
      const anyOverlayOpen = recordModal.open || filterModal.open || reassignModal.open || kanbanSortModal.open || totpSetupModal.open || accountModal.open;
      useEffect(() => {
        document.body.classList.toggle("modal-open", anyOverlayOpen);
        return () => document.body.classList.remove("modal-open");
      }, [anyOverlayOpen]);
      useEffect(() => {
        const onEsc = (event) => {
          if (event.key !== "Escape") return;
          setRecordModal((prev) => ({ ...prev, open: false }));
          setFilterModal((prev) => ({ ...prev, open: false }));
          closeKanbanSortModal();
          setReassignModal((prev) => ({ ...prev, open: false }));
          closeTotpSetupModal();
          closeAccountModal();
        };
        document.addEventListener("keydown", onEsc);
        return () => document.removeEventListener("keydown", onEsc);
      }, [closeAccountModal, closeKanbanSortModal, closeTotpSetupModal]);
      const menuItems = useMemo(() => {
        const baseItems = [
          { key: "dashboard", label: "\u041E\u0431\u0437\u043E\u0440" },
          { key: "kanban", label: "\u041A\u0430\u043D\u0431\u0430\u043D" },
          { key: "requests", label: "\u0417\u0430\u044F\u0432\u043A\u0438" },
          { key: "serviceRequests", label: "\u0417\u0430\u043F\u0440\u043E\u0441\u044B" },
          { key: "invoices", label: "\u0421\u0447\u0435\u0442\u0430" }
        ];
        return baseItems.filter((item) => canAccessSection(role, item.key));
      }, [role]);
      const topbarUnreadCount = useMemo(() => {
        const roleCode = String(role || "").toUpperCase();
        if (roleCode === "LAWYER" || roleCode === "ADMIN" || roleCode === "CURATOR") {
          return Number(dashboardData.myUnreadNotificationsTotal || dashboardData.myUnreadTotal || 0);
        }
        return Number(dashboardData.unreadForClients || 0) + Number(dashboardData.unreadForLawyers || 0);
      }, [dashboardData.myUnreadNotificationsTotal, dashboardData.myUnreadTotal, dashboardData.unreadForClients, dashboardData.unreadForLawyers, role]);
      const topbarDeadlineAlertCount = useMemo(() => Number(dashboardData.deadlineAlertTotal || 0), [dashboardData.deadlineAlertTotal]);
      const topbarServiceRequestUnreadCount = useMemo(
        () => Number(dashboardData.serviceRequestUnreadTotal || 0),
        [dashboardData.serviceRequestUnreadTotal]
      );
      const topbarRoleCode = String(role || "").toUpperCase();
      const canUseRequestsAlerts = topbarRoleCode === "ADMIN";
      const canUseKanbanAlerts = topbarRoleCode === "LAWYER";
      const showRequestAlertIcons = canUseRequestsAlerts || canUseKanbanAlerts;
      const showServiceRequestIcon = canAccessSection(role, "serviceRequests");
      const activeFilterFields = useMemo(() => {
        if (!filterModal.tableKey) return [];
        return getFilterFields(filterModal.tableKey);
      }, [filterModal.tableKey, getFilterFields]);
      const filterTableLabel = useMemo(() => getTableLabel(filterModal.tableKey), [filterModal.tableKey, getTableLabel]);
      const recordModalFields = useMemo(() => {
        const all = getRecordFields(recordModal.tableKey);
        const isEdit = recordModal.mode !== "create";
        const roleCode = String(role || "").toUpperCase();
        const visible = isEdit ? all.filter((field) => !field.createOnly) : all.filter((field) => !field.autoCreate);
        return visible.map((field) => {
          const nextField = { ...field };
          if (recordModal.tableKey === "requests" && isEdit) {
            if (roleCode === "LAWYER" && field.key !== "topic_code") nextField.readOnly = true;
            if (roleCode === "ADMIN" && (field.key === "client_id" || field.key === "client_name" || field.key === "client_phone")) {
              nextField.readOnly = true;
            }
          }
          if (recordModal.tableKey === "serviceRequests" && isEdit && (field.key === "request_id" || field.key === "client_id" || field.key === "assigned_lawyer_id")) {
            nextField.readOnly = true;
          }
          return nextField;
        });
      }, [getRecordFields, recordModal.mode, recordModal.tableKey, role]);
      const activeConfigTableState = useMemo(() => {
        return tables[configActiveKey] || createTableState();
      }, [configActiveKey, tables]);
      const activeConfigMeta = useMemo(() => tableCatalogMap[configActiveKey] || null, [configActiveKey, tableCatalogMap]);
      const activeConfigActions = useMemo(() => {
        return Array.isArray(activeConfigMeta == null ? void 0 : activeConfigMeta.actions) ? activeConfigMeta.actions : [];
      }, [activeConfigMeta]);
      const canCreateInConfig = activeConfigActions.includes("create");
      const canUpdateInConfig = activeConfigActions.includes("update");
      const canDeleteInConfig = activeConfigActions.includes("delete");
      const genericConfigHeaders = useMemo(() => {
        if (!activeConfigMeta || !Array.isArray(activeConfigMeta.columns)) return [];
        const headers = (activeConfigMeta.columns || []).filter((column) => column && column.name && String(column.name) !== "id").map((column) => {
          const name = String(column.name);
          return {
            key: name,
            label: String(column.label || humanizeKey(name)),
            sortable: Boolean(column.sortable !== false),
            field: name
          };
        });
        if (canUpdateInConfig || canDeleteInConfig) headers.push({ key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" });
        return headers;
      }, [activeConfigMeta, canDeleteInConfig, canUpdateInConfig]);
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "layout" }, /* @__PURE__ */ React.createElement("aside", { className: "sidebar" }, /* @__PURE__ */ React.createElement("div", { className: "logo" }, /* @__PURE__ */ React.createElement("a", { href: "/" }, /* @__PURE__ */ React.createElement("img", { className: "brand-mark", src: "/brand-mark.svg", alt: "", width: "24", height: "24" }), /* @__PURE__ */ React.createElement("span", null, "\u041F\u0440\u0430\u0432\u043E\u0432\u043E\u0439 \u0442\u0440\u0435\u043A\u0435\u0440"))), /* @__PURE__ */ React.createElement("nav", { className: "menu" }, menuItems.map((item) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: item.key,
          className: activeSection === item.key ? "active" : "",
          "data-section": item.key,
          type: "button",
          onClick: () => activateSection(item.key)
        },
        item.label
      )), role === "ADMIN" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: activeSection === "config" ? "active" : "",
          type: "button",
          onClick: () => {
            setReferencesExpanded((prev) => !prev);
            activateSection("config");
          }
        },
        "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0438 " + (referencesExpanded ? "\u25BE" : "\u25B8")
      ), referencesExpanded ? /* @__PURE__ */ React.createElement("div", { className: "menu-tree" }, dictionaryTableItems.map((item) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: item.key,
          type: "button",
          className: activeSection === "config" && configActiveKey === item.key ? "active" : "",
          onClick: () => selectConfigNode(item.key)
        },
        getTableLabel(item.key)
      ))) : null) : null)), /* @__PURE__ */ React.createElement("main", { className: "main" }, /* @__PURE__ */ React.createElement("div", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "\u041F\u0430\u043D\u0435\u043B\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "UniversalQuery, RBAC \u0438 \u0430\u0443\u0434\u0438\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u043F\u043E \u043A\u043B\u044E\u0447\u0435\u0432\u044B\u043C \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u044F\u043C \u0441\u0438\u0441\u0442\u0435\u043C\u044B.")), /* @__PURE__ */ React.createElement("div", { className: "topbar-actions", "aria-label": "\u0411\u044B\u0441\u0442\u0440\u044B\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044C" }, showServiceRequestIcon ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn topbar-alert-btn" + (topbarServiceRequestUnreadCount > 0 ? " has-alert alert-danger" : ""),
          "data-tooltip": topbarServiceRequestUnreadCount > 0 ? "\u041D\u043E\u0432\u044B\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B: " + String(topbarServiceRequestUnreadCount) : "\u041D\u043E\u0432\u044B\u0445 \u043A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0445 \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u043D\u0435\u0442",
          "aria-label": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u0430",
          onClick: openServiceRequestsWithUnreadAlerts
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "17", height: "17", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: "M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v9.8a1.5 1.5 0 0 1-1.5 1.5H9.1l-3.7 3.1c-.98.82-2.4.13-2.4-1.14V6a1.5 1.5 0 0 1 1.5-1.5zm1.7 4.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm5.8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm5.8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z",
            fill: "currentColor"
          }
        )),
        /* @__PURE__ */ React.createElement("span", { className: "topbar-alert-dot", "aria-hidden": "true" })
      ) : null, showRequestAlertIcons ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn topbar-alert-btn" + (topbarDeadlineAlertCount > 0 ? " has-alert alert-danger" : ""),
          "data-tooltip": topbarDeadlineAlertCount > 0 ? "\u0413\u043E\u0440\u044F\u0449\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u044B: " + String(topbarDeadlineAlertCount) : "\u0413\u043E\u0440\u044F\u0449\u0438\u0445 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u043E\u0432 \u043D\u0435\u0442",
          "aria-label": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0438 \u0441 \u0433\u043E\u0440\u044F\u0449\u0438\u043C\u0438 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430\u043C\u0438",
          onClick: canUseRequestsAlerts ? openRequestsWithDeadlineAlerts : openKanbanWithDeadlineAlerts
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "17", height: "17", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: "M12 3a1.6 1.6 0 0 1 1.42.86l7.14 13.7A1.6 1.6 0 0 1 19.14 20H4.86a1.6 1.6 0 0 1-1.42-2.44l7.14-13.7A1.6 1.6 0 0 1 12 3zm0 4.2a1 1 0 0 0-1 1v5.2a1 1 0 1 0 2 0V8.2a1 1 0 0 0-1-1zm0 9.4a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z",
            fill: "currentColor"
          }
        )),
        /* @__PURE__ */ React.createElement("span", { className: "topbar-alert-dot", "aria-hidden": "true" })
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn topbar-alert-btn" + (topbarUnreadCount > 0 ? " has-alert alert-success" : ""),
          "data-tooltip": topbarUnreadCount > 0 ? "\u041D\u043E\u0432\u044B\u0435 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0430\u043C: " + String(topbarUnreadCount) : "\u041D\u043E\u0432\u044B\u0445 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u0439 \u043D\u0435\u0442",
          "aria-label": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0438 \u0441 \u043D\u043E\u0432\u044B\u043C\u0438 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F\u043C\u0438",
          onClick: canUseRequestsAlerts ? openRequestsWithUnreadAlerts : openKanbanWithUnreadAlerts
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "17", height: "17", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11zm2 .5v.32l6 4.44 6-4.44V7a.5.5 0 0 0-.5-.5h-11A.5.5 0 0 0 6 7zm12 2.8-5.4 4a1 1 0 0 1-1.2 0L6 9.8v7.7c0 .28.22.5.5.5h11a.5.5 0 0 0 .5-.5V9.8z",
            fill: "currentColor"
          }
        )),
        /* @__PURE__ */ React.createElement("span", { className: "topbar-alert-dot", "aria-hidden": "true" })
      )) : null, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn topbar-alert-btn",
          "data-tooltip": "\u041B\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442",
          "aria-label": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043B\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442",
          onClick: openAccountModal
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "17", height: "17", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: "M12 12.2a4.1 4.1 0 1 0-4.1-4.1 4.1 4.1 0 0 0 4.1 4.1zm0 2c-3.8 0-7 2.2-7.8 5.3-.1.4.2.8.6.8h14.4c.4 0 .7-.4.6-.8-.8-3.1-4-5.3-7.8-5.3z",
            fill: "currentColor"
          }
        ))
      ))), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "dashboard", id: "section-dashboard" }, /* @__PURE__ */ React.createElement(
        DashboardSection,
        {
          dashboardData,
          token,
          status: getStatus("dashboard"),
          apiCall: api,
          onOpenRequest: openRequestDetails,
          DataTableComponent: DataTable,
          StatusLineComponent: StatusLine,
          UserAvatarComponent: UserAvatar
        }
      )), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "kanban", id: "section-kanban" }, /* @__PURE__ */ React.createElement(
        KanbanBoard,
        {
          loading: kanbanLoading,
          columns: kanbanData.columns,
          rows: kanbanData.rows,
          role,
          actorId: userId,
          onRefresh: () => loadKanban(),
          filters: tables.kanban.filters,
          onOpenFilter: () => openFilterModal("kanban"),
          onRemoveFilter: (index) => removeFilterChip("kanban", index),
          onEditFilter: (index) => openFilterEditModal("kanban", index),
          getFilterChipLabel: (clause) => {
            const fieldDef = getFieldDef("kanban", clause.field);
            return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("kanban", clause);
          },
          onOpenSort: openKanbanSortModal,
          sortActive: kanbanSortApplied,
          onOpenRequest: openRequestDetails,
          onClaimRequest: claimRequest,
          onMoveRequest: moveRequestFromKanban,
          status: getStatus("kanban"),
          FilterToolbarComponent: FilterToolbar,
          StatusLineComponent: StatusLine
        }
      )), canAccessSection(role, "requests") ? /* @__PURE__ */ React.createElement(Section, { active: activeSection === "requests", id: "section-requests" }, /* @__PURE__ */ React.createElement(
        RequestsSection,
        {
          role,
          tables,
          status: getStatus("requests"),
          getFieldDef,
          getFilterValuePreview,
          resolveReferenceLabel,
          onRefresh: () => loadTable("requests", { resetOffset: true }),
          onCreate: () => openCreateRecordModal("requests"),
          onOpenFilter: () => openFilterModal("requests"),
          onRemoveFilter: (index) => removeFilterChip("requests", index),
          onEditFilter: (index) => openFilterEditModal("requests", index),
          onSort: (field) => toggleTableSort("requests", field),
          onPrev: () => loadPrevPage("requests"),
          onNext: () => loadNextPage("requests"),
          onLoadAll: () => loadAllRows("requests"),
          onClaimRequest: claimRequest,
          onOpenReassign: openReassignModal,
          onOpenRequest: openRequestDetails,
          onEditRecord: (row) => openEditRecordModal("requests", row),
          onDeleteRecord: (id) => deleteRecord("requests", id),
          FilterToolbarComponent: FilterToolbar,
          DataTableComponent: DataTable,
          TablePagerComponent: TablePager,
          StatusLineComponent: StatusLine,
          IconButtonComponent: IconButton
        }
      )) : null, /* @__PURE__ */ React.createElement(Section, { active: activeSection === "serviceRequests", id: "section-service-requests" }, /* @__PURE__ */ React.createElement(
        ServiceRequestsSection,
        {
          role,
          tables,
          status: getStatus("serviceRequests"),
          getFieldDef,
          getFilterValuePreview,
          resolveReferenceLabel,
          onRefresh: () => loadTable("serviceRequests", { resetOffset: true }),
          onCreate: () => openCreateRecordModal("serviceRequests"),
          onOpenFilter: () => openFilterModal("serviceRequests"),
          onRemoveFilter: (index) => removeFilterChip("serviceRequests", index),
          onEditFilter: (index) => openFilterEditModal("serviceRequests", index),
          onSort: (field) => toggleTableSort("serviceRequests", field),
          onPrev: () => loadPrevPage("serviceRequests"),
          onNext: () => loadNextPage("serviceRequests"),
          onLoadAll: () => loadAllRows("serviceRequests"),
          onOpenRequest: openRequestDetails,
          onMarkRead: markServiceRequestRead,
          onEditRecord: (row) => openEditRecordModal("serviceRequests", row),
          onDeleteRecord: (id) => deleteRecord("serviceRequests", id),
          FilterToolbarComponent: FilterToolbar,
          DataTableComponent: DataTable,
          TablePagerComponent: TablePager,
          StatusLineComponent: StatusLine,
          IconButtonComponent: IconButton
        }
      )), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "requestWorkspace", id: "section-request-workspace" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, requestModal.trackNumber ? "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0437\u0430\u044F\u0432\u043A\u0438 " + requestModal.trackNumber : "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0437\u0430\u044F\u0432\u043A\u0438")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.45rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "icon-btn workspace-head-icon", type: "button", "data-tooltip": "\u041D\u0430\u0437\u0430\u0434", "aria-label": "\u041D\u0430\u0437\u0430\u0434", onClick: goBackFromRequestWorkspace }, /* @__PURE__ */ React.createElement("span", { className: "workspace-head-icon-glyph" }, "\u21A9")), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "icon-btn workspace-head-icon",
          type: "button",
          "data-tooltip": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
          "aria-label": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
          onClick: refreshRequestModal,
          disabled: requestModal.loading || requestModal.fileUploading
        },
        /* @__PURE__ */ React.createElement("span", { className: "workspace-head-icon-glyph" }, "\u21BB")
      ))), /* @__PURE__ */ React.createElement(
        RequestWorkspace,
        {
          viewerRole: role,
          viewerUserId: userId,
          loading: requestModal.loading,
          trackNumber: requestModal.trackNumber,
          requestData: requestModal.requestData,
          financeSummary: requestModal.financeSummary,
          invoices: requestModal.invoices || [],
          statusRouteNodes: requestModal.statusRouteNodes,
          statusHistory: requestModal.statusHistory || [],
          availableStatuses: requestModal.availableStatuses || [],
          currentImportantDateAt: requestModal.currentImportantDateAt || "",
          pendingStatusChangePreset: requestModal.pendingStatusChangePreset,
          messages: requestModal.messages || [],
          attachments: requestModal.attachments || [],
          messageDraft: requestModal.messageDraft || "",
          selectedFiles: requestModal.selectedFiles || [],
          fileUploading: Boolean(requestModal.fileUploading),
          status: getStatus("requestModal"),
          onMessageChange: updateRequestModalMessageDraft,
          onSendMessage: submitRequestModalMessage,
          onFilesSelect: appendRequestModalFiles,
          onRemoveSelectedFile: removeRequestModalFile,
          onClearSelectedFiles: clearRequestModalFiles,
          onLoadRequestDataTemplates: loadRequestDataTemplates,
          onLoadRequestDataBatch: loadRequestDataBatch,
          onLoadRequestDataTemplateDetails: loadRequestDataTemplateDetails,
          onSaveRequestDataTemplate: saveRequestDataTemplate,
          onSaveRequestDataBatch: saveRequestDataBatch,
          onIssueInvoice: issueRequestInvoice,
          onDownloadInvoicePdf: downloadRequestInvoicePdf,
          onChangeStatus: submitRequestStatusChange,
          onConsumePendingStatusChangePreset: clearPendingStatusChangePreset,
          onLiveProbe: probeRequestLive,
          onTypingSignal: setRequestTyping,
          AttachmentPreviewModalComponent: AttachmentPreviewModal,
          StatusLineComponent: StatusLine
        }
      )), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "invoices", id: "section-invoices" }, /* @__PURE__ */ React.createElement(
        InvoicesSection,
        {
          role,
          tables,
          status: getStatus("invoices"),
          getFieldDef,
          getFilterValuePreview,
          onRefresh: () => loadTable("invoices", { resetOffset: true }),
          onCreate: () => openCreateRecordModal("invoices"),
          onOpenFilter: () => openFilterModal("invoices"),
          onRemoveFilter: (index) => removeFilterChip("invoices", index),
          onEditFilter: (index) => openFilterEditModal("invoices", index),
          onSort: (field) => toggleTableSort("invoices", field),
          onPrev: () => loadPrevPage("invoices"),
          onNext: () => loadNextPage("invoices"),
          onLoadAll: () => loadAllRows("invoices"),
          onOpenRequest: openInvoiceRequest,
          onDownloadPdf: downloadInvoicePdf,
          onEditRecord: (row) => openEditRecordModal("invoices", row),
          onDeleteRecord: (id) => deleteRecord("invoices", id),
          FilterToolbarComponent: FilterToolbar,
          DataTableComponent: DataTable,
          TablePagerComponent: TablePager,
          StatusLineComponent: StatusLine,
          IconButtonComponent: IconButton
        }
      )), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "quotes", id: "section-quotes" }, /* @__PURE__ */ React.createElement(
        QuotesSection,
        {
          tables,
          status: getStatus("quotes"),
          getFieldDef,
          getFilterValuePreview,
          onRefresh: () => loadTable("quotes", { resetOffset: true }),
          onCreate: () => openCreateRecordModal("quotes"),
          onOpenFilter: () => openFilterModal("quotes"),
          onRemoveFilter: (index) => removeFilterChip("quotes", index),
          onEditFilter: (index) => openFilterEditModal("quotes", index),
          onSort: (field) => toggleTableSort("quotes", field),
          onPrev: () => loadPrevPage("quotes"),
          onNext: () => loadNextPage("quotes"),
          onLoadAll: () => loadAllRows("quotes"),
          onEditRecord: (row) => openEditRecordModal("quotes", row),
          onDeleteRecord: (id) => deleteRecord("quotes", id),
          FilterToolbarComponent: FilterToolbar,
          DataTableComponent: DataTable,
          TablePagerComponent: TablePager,
          StatusLineComponent: StatusLine,
          IconButtonComponent: IconButton
        }
      )), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "config", id: "section-config" }, /* @__PURE__ */ React.createElement(
        ConfigSection,
        {
          token,
          tables,
          dictionaries,
          configActiveKey,
          activeConfigTableState,
          activeConfigMeta,
          genericConfigHeaders,
          canCreateInConfig,
          canUpdateInConfig,
          canDeleteInConfig,
          statusDesignerTopicCode,
          statusDesignerCards,
          getTableLabel,
          getFieldDef,
          getFilterValuePreview,
          resolveReferenceLabel,
          resolveTableConfig,
          getStatus,
          loadCurrentConfigTable,
          onRefreshSmsProviderHealth: () => loadSmsProviderHealth(void 0, { silent: false }),
          smsProviderHealth,
          openCreateRecordModal,
          openFilterModal,
          removeFilterChip,
          openFilterEditModal,
          toggleTableSort,
          openEditRecordModal,
          deleteRecord,
          loadStatusDesignerTopic,
          openCreateStatusTransitionForTopic,
          loadPrevPage,
          loadNextPage,
          loadAllRows,
          FilterToolbarComponent: FilterToolbar,
          DataTableComponent: DataTable,
          TablePagerComponent: TablePager,
          StatusLineComponent: StatusLine,
          IconButtonComponent: IconButton,
          UserAvatarComponent: UserAvatar
        }
      )), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "availableTables", id: "section-available-tables" }, /* @__PURE__ */ React.createElement(
        AvailableTablesSection,
        {
          tables,
          status: getStatus("availableTables"),
          onRefresh: () => loadAvailableTables(),
          onToggleActive: updateAvailableTableState,
          DataTableComponent: DataTable,
          StatusLineComponent: StatusLine,
          IconButtonComponent: IconButton
        }
      )))), /* @__PURE__ */ React.createElement(
        RecordModal,
        {
          open: recordModal.open,
          title: (recordModal.mode === "edit" ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u2022 " : "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u2022 ") + getTableLabel(recordModal.tableKey),
          fields: recordModalFields,
          form: recordModal.form || {},
          status: getStatus("recordForm"),
          onClose: closeRecordModal,
          onChange: updateRecordField,
          onUploadField: uploadRecordFieldFile,
          onSubmit: submitRecordModal
        }
      ), /* @__PURE__ */ React.createElement(
        FilterModal,
        {
          open: filterModal.open,
          tableLabel: filterTableLabel,
          fields: activeFilterFields,
          draft: filterModal,
          status: getStatus("filter"),
          onClose: closeFilterModal,
          onFieldChange: updateFilterField,
          onOpChange: updateFilterOp,
          onValueChange: updateFilterValue,
          onSubmit: applyFilterModal,
          onClear: clearFiltersFromModal,
          getOperators: getOperatorsForType,
          getFieldOptions
        }
      ), /* @__PURE__ */ React.createElement(
        KanbanSortModal,
        {
          open: kanbanSortModal.open,
          value: kanbanSortModal.value,
          status: getStatus("kanbanSort"),
          onChange: updateKanbanSortMode,
          onClose: closeKanbanSortModal,
          onSubmit: submitKanbanSortModal
        }
      ), /* @__PURE__ */ React.createElement(
        ReassignModal,
        {
          open: reassignModal.open,
          status: getStatus("reassignForm"),
          options: getLawyerOptions(),
          value: reassignModal.lawyerId,
          onChange: updateReassignLawyer,
          onClose: closeReassignModal,
          onSubmit: submitReassignModal,
          trackNumber: reassignModal.trackNumber
        }
      ), /* @__PURE__ */ React.createElement(
        TotpSetupModal,
        {
          open: totpSetupModal.open,
          status: getStatus("totpSetup"),
          secret: totpSetupModal.secret,
          uri: totpSetupModal.uri,
          qrDataUrl: totpSetupModal.qrDataUrl,
          code: totpSetupModal.code,
          loading: totpSetupModal.loading,
          onCodeChange: updateTotpSetupCode,
          onClose: closeTotpSetupModal,
          onSubmit: submitTotpSetup,
          onCopySecret: copyTotpSecret,
          onCopyUri: copyTotpUri
        }
      ), /* @__PURE__ */ React.createElement(
        AccountModal,
        {
          open: accountModal.open,
          status: getStatus("account"),
          profileLoading: accountModal.loading,
          saveLoading: accountModal.saving,
          form: accountModal.form,
          currentEmail: email,
          currentRoleLabel: roleLabel(role),
          totpStatus,
          onFieldChange: updateAccountField,
          onClose: closeAccountModal,
          onSubmit: submitAccountModal,
          onSetupTotp: setupTotp,
          onRegenerateBackupCodes: regenerateTotpBackupCodes,
          onDisableTotp: disableTotp,
          onLogout: logout
        }
      ), !token || !role ? /* @__PURE__ */ React.createElement(LoginScreen, { onSubmit: login, status: getStatus("login") }) : null, /* @__PURE__ */ React.createElement(GlobalTooltipLayer, null));
    }
    const root = ReactDOM.createRoot(document.getElementById("admin-root"));
    root.render(/* @__PURE__ */ React.createElement(App, null));
  })();
})();
