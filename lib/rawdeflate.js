/**
 * zlib.rawdeflate.js
 *
 * The MIT License
 *
 * Copyright (c) 2011 imaya
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * @fileoverview Deflate (RFC1951) 符号化アルゴリズム実装.
 */


var Zlib = {};

Zlib.BitStream = require('./bitstream.js').BitStream;
Zlib.Heap = require('./heap.js').Heap;
Zlib.Util = require('./util.js').Util;


/**
 * Raw Deflate 実装
 * @param {Object=} opt_param compression options.
 * @constructor
 */
exports.RawDeflate = Zlib.RawDeflate = function(opt_param) {
  this.compressionType = Zlib.RawDeflate.CompressionType.DYNAMIC;
  this.lazy = 0;
  this.freqsLitLen = [];
  this.freqsDist = [];

  // option parameters
  if (typeof(opt_param) === 'object' && opt_param !== null) {
    if (typeof(opt_param.lazy) === 'number') {
      this.lazy = opt_param.lazy;
    }
    if (typeof(opt_param.compressionType) === 'number') {
      this.compressionType = opt_param.compressionType;
    }
  }
};

// Zlib.Util のエイリアス
var push = Zlib.Util.push;
var slice = Zlib.Util.slice;

/**
 * @enum {number}
 */
exports.CompressionType = Zlib.RawDeflate.CompressionType = {
  NONE: 0,
  FIXED: 1,
  DYNAMIC: 2,
  RESERVED: 3
};


/**
 * LZ77 の最小マッチ長
 * @type {number}
 * @const
 */
Zlib.RawDeflate.Lz77MinLength = 3;

/**
 * LZ77 の最大マッチ長
 * @type {number}
 * @const
 */
Zlib.RawDeflate.Lz77MaxLength = 258;

/**
 * LZ77 のウィンドウサイズ
 * @type {number}
 * @const
 */
Zlib.RawDeflate.WindowSize = 0x8000;

/**
 * 最長の符号長
 * @type {number}
 * @const
 */
Zlib.RawDeflate.MaxCodeLength = 16;

/**
 * ハフマン符号の最大数値
 * @type {number}
 * @const
 */
Zlib.RawDeflate.HUFMAX = 286;

/**
 * 固定ハフマン符号の符号化テーブル
 * @type {Array.<Array.<number, number>>}
 * @const
 */
Zlib.RawDeflate.FixedHuffmanTable = (function() {
  var table = [], i;

  for (i = 0; i < 288; i++) {
    if(i <= 143) {
      table.push([i - 0 + 0x030, 8]);
    } else if(i <= 255){ 
      table.push([i - 144 + 0x190, 9]);
    } else if(i <= 279){ 
      table.push([i - 256 + 0x000, 7]);
    } else if(i <= 287){
      table.push([i - 280 + 0x0C0, 8]);
    } else {
      throw 'invalid literal: ' + i;
    }
  }

  return table;
})();

/**
 * DEFLATE ブロックの作成
 * @param {!(Array.<number>|Uint8Array|string)} data plain data byte array / byte string.
 * @return {!Array} 圧縮済み byte array.
 */
Zlib.RawDeflate.prototype.makeBlocks = function(data) {
  var blocks = [], blockArray, position, length;

  // バッファが string だったら byte array に変換
  if (typeof(data) === 'string') {
    data = Zlib.Util.stringToByteArray(data);
  }

  // compression
  switch (this.compressionType) {
    case Zlib.RawDeflate.CompressionType.NONE:
      // each 65535-Byte (length header: 16-bit)
      for (position = 0, length = data.length; position < length;) {
        blockArray = slice(data, position, 0xffff);
        position += blockArray.length;
        push(
          blocks,
          this.makeNocompressBlock(blockArray, (position === length))
        );
      }
      break;
    case Zlib.RawDeflate.CompressionType.FIXED:
      push(
        blocks,
        this.makeFixedHuffmanBlock(data, true)
      );
      break;
    case Zlib.RawDeflate.CompressionType.DYNAMIC:
      push(
        blocks,
        this.makeDynamicHuffmanBlock(data, true)
      );
      break;
    default:
      throw 'invalid compression type';
  }

  return blocks;
};

/**
 * DEFLATE ブロックの作成
 * @param {!(Array.<number>|Uint8Array|string)} data plain data byte array / byte string.
 * @return {!Array} 圧縮済み byte array.
 */
Zlib.RawDeflate.prototype.compress = Zlib.RawDeflate.prototype.makeBlocks;

/**
 * 非圧縮ブロックの作成
 * @param {!(Array|Uint8Array)} blockArray ブロックデータ byte array.
 * @param {!boolean} isFinalBlock 最後のブロックならばtrue.
 * @return {!Array} 非圧縮ブロック byte array.
 */
Zlib.RawDeflate.prototype.makeNocompressBlock =
function(blockArray, isFinalBlock) {
  var block = [], bfinal, btype, len, nlen, i, l;

  // header
  bfinal = isFinalBlock ? 1 : 0;
  btype = Zlib.RawDeflate.CompressionType.NONE;
  block.push((bfinal) | (btype << 1));

  // length
  len = blockArray.length;
  nlen = (~len + 0x10000) & 0xffff;
  block.push(
             len & 0xff,
     (len >>> 8) & 0xff,
            nlen & 0xff,
    (nlen >>> 8) & 0xff
  );

  push(block, blockArray);

  return block;
};

/**
 * 固定ハフマンブロックの作成
 * @param {!(Array|Uint8Array)} blockArray ブロックデータ byte array.
 * @param {!boolean} isFinalBlock 最後のブロックならばtrue.
 * @return {!Array} 固定ハフマン符号化ブロック byte array.
 */
Zlib.RawDeflate.prototype.makeFixedHuffmanBlock =
function(blockArray, isFinalBlock) {
  var stream = new Zlib.BitStream(), bfinal, btype, data;

  // header
  bfinal = isFinalBlock ? 1 : 0;
  btype = Zlib.RawDeflate.CompressionType.FIXED;

  stream.writeBits(bfinal, 1, true);
  stream.writeBits(btype, 2, true);

  data = this.lz77(blockArray);
  data = this.fixedHuffman(data, stream);

  return data;
};

/**
 * 動的ハフマンブロックの作成
 * @param {!(Array|Uint8Array)} blockArray ブロックデータ byte array.
 * @param {!boolean} isFinalBlock 最後のブロックならばtrue.
 * @return {!Array} 動的ハフマン符号ブロック byte array.
 */
Zlib.RawDeflate.prototype.makeDynamicHuffmanBlock =
function(blockArray, isFinalBlock) {
  var stream = new Zlib.BitStream(), bfinal, btype, data,
      hlit, hdist, hclen,
      hclenOrder =
        [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
      litLenLengths, litLenCodes, distLengths, distCodes,
      treeSymbols, treeLengths,
      transLengths = new Array(19),
      codeLengths, codeCodes, code, bitlen,
      i, l;

  // header
  bfinal = isFinalBlock ? 1 : 0;
  btype = Zlib.RawDeflate.CompressionType.DYNAMIC;

  stream.writeBits(bfinal, 1, true);
  stream.writeBits(btype, 2, true);

  data = this.lz77(blockArray);

  // リテラル・長さ, 距離のハフマン符号と符号長の算出
  litLenLengths = this.getLengths_(this.freqsLitLen);
  litLenCodes = this.getCodesFromLengths_(litLenLengths);
  distLengths = this.getLengths_(this.freqsDist);
  distCodes = this.getCodesFromLengths_(distLengths);

  // HLIT, HDIST の決定
  for (hlit = 286; hlit > 257 && litLenLengths[hlit - 1] === 0; hlit--) {}
  for (hdist = 30; hdist > 1 && distLengths[hdist - 1] === 0; hdist--) {}

  // HCLEN
  treeSymbols =
    this.getTreeSymbols_(hlit, litLenLengths, hdist, distLengths);
  treeLengths = this.getLengths_(treeSymbols.freqs, 7);
  for (i = 0; i < 19; i++) {
    transLengths[i] = treeLengths[hclenOrder[i]];
  }
  for (hclen = 19; hclen > 4 && transLengths[hclen - 1] === 0; hclen--) {}

  codeLengths = this.getLengths_(treeSymbols.freqs);
  codeCodes = this.getCodesFromLengths_(codeLengths);

  // 出力
  stream.writeBits(hlit - 257, 5, true);
  stream.writeBits(hdist - 1, 5, true);
  stream.writeBits(hclen - 4, 4, true);
  for (i = 0; i < hclen; i++) {
    stream.writeBits(transLengths[i], 3, true);
  }

  // ツリーの出力
  for (i = 0, l = treeSymbols.codes.length; i < l; i++) {
    code = treeSymbols.codes[i];

    stream.writeBits(codeCodes[code], codeLengths[code], true);

    // extra bits
    if (code >= 16) {
      i++;
      switch (code) {
        case 16: bitlen = 2; break;
        case 17: bitlen = 3; break;
        case 18: bitlen = 7; break;
        default:
          throw 'invalid code: ' + code;
      }

      stream.writeBits(treeSymbols.codes[i], bitlen, true);
    }
  }

  this.dynamicHuffman(
    data,
    [litLenCodes, litLenLengths],
    [distCodes, distLengths],
    stream
  );

  return stream.finish();
};


/**
 * 動的ハフマン符号化(カスタムハフマンテーブル)
 * @param {!Array} dataArray LZ77 符号化済み byte array.
 * @param {Zlib.BitStream=} stream 書き込み用ビットストリーム.
 * @return {!Zlib.BitStream} ハフマン符号化済みビットストリームオブジェクト.
 */
Zlib.RawDeflate.prototype.dynamicHuffman =
function(dataArray, litLen, dist, stream) {
  var index, length, literal, code, bitlen, extra,
      litLenCodes, litLenLengths, distCodes, distLengths;

  if (!(stream instanceof Zlib.BitStream)) {
    stream = new Zlib.BitStream();
  }

  litLenCodes = litLen[0];
  litLenLengths = litLen[1];
  distCodes = dist[0];
  distLengths = dist[1];

  // 符号を BitStream に書き込んでいく
  for (index = 0, length = dataArray.length; index < length; index++) {
    literal = dataArray[index];

    // literal or length
    stream.writeBits(litLenCodes[literal], litLenLengths[literal], true);

    // 長さ・距離符号
    if (literal > 256) {
      // length extra
      stream.writeBits(dataArray[++index], dataArray[++index], true);
      // distance
      stream.writeBits(
        distCodes[dataArray[++index]],
        distLengths[dataArray[index]],
        true
      );
      // distance extra
      stream.writeBits(dataArray[++index], dataArray[++index], true);
    // 終端
    } else if (literal === 256) {
      break;
    }
  }

  return stream;
};

/**
 * 固定ハフマン符号化
 * @param {!(Array|Uint8Array)} dataArray LZ77 符号化済み byte array.
 * @param {Zlib.BitStream=} stream 書き込み用ビットストリーム.
 * @return {!Array} ハフマン符号化済み byte array.
 */
Zlib.RawDeflate.prototype.fixedHuffman = function(dataArray, stream) {
  var index, length, literal, code, bitlen, extra;

  if (!(stream instanceof Zlib.BitStream)) {
    stream = new Zlib.BitStream();
  }

  // 符号を BitStream に書き込んでいく
  for (index = 0, length = dataArray.length; index < length; index++) {
    literal = dataArray[index];

    // 符号の書き込み
    Zlib.BitStream.prototype.writeBits.apply(
      stream,
      Zlib.RawDeflate.FixedHuffmanTable[literal]
    );

    // 長さ・距離符号
    if (literal > 0x100) {
      // length extra
      stream.writeBits(dataArray[++index], dataArray[++index], true);
      // distance
      stream.writeBits(dataArray[++index], 5);
      // distance extra
      stream.writeBits(dataArray[++index], dataArray[++index], true);
    // 終端
    } else if (literal === 0x100) {
      break;
    }
  }

  return stream.finish();
};

/**
 * マッチ情報
 * @param {!number} length マッチした長さ.
 * @param {!number} backwordDistance マッチ位置との距離.
 * @constructor
 */
function Lz77Match(length, backwordDistance) {
  this.length = length;
  this.backwordDistance = backwordDistance;
}
/**
 * 長さ符号テーブル.
 * [コード, 拡張ビット, 拡張ビット長] の配列となっている.
 * @const {Array.<Array.<number>>}
 */
Lz77Match.LengthCodeTable = (function() {
  var table = [], i, l;

  for (i = 3; i <= 258; i++) {
    table[i] = code(i);
  }

  function code(length) {
    if(length === 3) return [257, length - 3, 0];
    if(length === 4) return [258, length - 4, 0];
    if(length === 5) return [259, length - 5, 0];
    if(length === 6) return [260, length - 6, 0];
    if(length === 7) return [261, length - 7, 0];
    if(length === 8) return [262, length - 8, 0];
    if(length === 9) return [263, length - 9, 0];
    if(length === 10) return [264, length - 10, 0];
    if(length <= 12) return [265, length - 11, 1];
    if(length <= 14) return [266, length - 13, 1];
    if(length <= 16) return [267, length - 15, 1];
    if(length <= 18) return [268, length - 17, 1];
    if(length <= 22) return [269, length - 19, 2];
    if(length <= 26) return [270, length - 23, 2];
    if(length <= 30) return [271, length - 27, 2];
    if(length <= 34) return [272, length - 31, 2];
    if(length <= 42) return [273, length - 35, 3];
    if(length <= 50) return [274, length - 43, 3];
    if(length <= 58) return [275, length - 51, 3];
    if(length <= 66) return [276, length - 59, 3];
    if(length <= 82) return [277, length - 67, 4];
    if(length <= 98) return [278, length - 83, 4];
    if(length <= 114) return [279, length - 99, 4];
    if(length <= 130) return [280, length - 115, 4];
    if(length <= 162) return [281, length - 131, 5];
    if(length <= 194) return [282, length - 163, 5];
    if(length <= 226) return [283, length - 195, 5];
    if(length <= 257) return [284, length - 227, 5];
    if(length === 258) return [285, length - 258, 0];

    throw 'invalid length: ' + length;
  }

  return table;
})();

/**
 * 距離符号テーブル
 * @param {!number} dist 距離.
 * @return {!Array.<number>} コード、拡張ビット、拡張ビット長の配列.
 * @private
 */
Lz77Match.prototype.getDistanceCode_ = function(dist) {
  var r;

  if(dist === 1) r = [0, dist - 1, 0];
  else if(dist === 2) r = [1, dist - 2, 0];
  else if(dist === 3) r = [2, dist - 3, 0];
  else if(dist === 4) r = [3, dist - 4, 0];
  else if(dist <= 6) r = [4, dist - 5, 1];
  else if(dist <= 8) r = [5, dist - 7, 1];
  else if(dist <= 12) r = [6, dist - 9, 2];
  else if(dist <= 16) r = [7, dist - 13, 2];
  else if(dist <= 24) r = [8, dist - 17, 3];
  else if(dist <= 32) r = [9, dist - 25, 3];
  else if(dist <= 48) r = [10, dist - 33, 4];
  else if(dist <= 64) r = [11, dist - 49, 4];
  else if(dist <= 96) r = [12, dist - 65, 5];
  else if(dist <= 128) r = [13, dist - 97, 5];
  else if(dist <= 192) r = [14, dist - 129, 6];
  else if(dist <= 256) r = [15, dist - 193, 6];
  else if(dist <= 384) r = [16, dist - 257, 7];
  else if(dist <= 512) r = [17, dist - 385, 7];
  else if(dist <= 768) r = [18, dist - 513, 8];
  else if(dist <= 1024) r = [19, dist - 769, 8];
  else if(dist <= 1536) r = [20, dist - 1025, 9];
  else if(dist <= 2048) r = [21, dist - 1537, 9];
  else if(dist <= 3072) r = [22, dist - 2049, 10];
  else if(dist <= 4096) r = [23, dist - 3073, 10];
  else if(dist <= 6144) r = [24, dist - 4097, 11];
  else if(dist <= 8192) r = [25, dist - 6145, 11];
  else if(dist <= 12288) r = [26, dist - 8193, 12];
  else if(dist <= 16384) r = [27, dist - 12289, 12];
  else if(dist <= 24576) r = [28, dist - 16385, 13];
  else if(dist <= 32768) r = [29, dist - 24577, 13];
  else throw 'invalid distance';
  
  return r;
};

/**
 * マッチ情報を LZ77 符号化配列で返す.
 * なお、ここでは以下の内部仕様で符号化している
 * [ CODE, EXTRA-BIT-LEN, EXTRA, CODE, EXTRA-BIT-LEN, EXTRA ]
 * @return {!Array} LZ77 符号化 byte array.
 */
Lz77Match.prototype.toLz77Array = function() {
  var length = this.length,
      dist = this.backwordDistance,
      codeArray = [];

  // length
  push(codeArray, Lz77Match.LengthCodeTable[length]);

  // distance
  push(codeArray, this.getDistanceCode_(dist));

  return codeArray;
};

/**
 * LZ77 実装
 * @param {!(Array|Uint8Array)} dataArray LZ77 符号化するバイト配列.
 * @return {!Array} LZ77 符号化した配列.
 */
Zlib.RawDeflate.prototype.lz77 = function(dataArray) {
  var position, // @type {number}
      length, // @type {number}
      i, // @type {number}
      l, // @type {number}
      matchKey, // @type {number}
      matchKeyArray, // @type {Array.<number>}
      table = {}, // @type {Object.<Array.<Array.<number>>>}
      windowSize = Zlib.RawDeflate.WindowSize, // @const {number}
      matchList, // @type {Array.<Array.<number>>}
      longestMatch, // @type {Lz77Match}
      prevMatch, // @type {Lz77Match}
      lz77buf = [], // @type {Array.<number>}
      skipLength = 0, // @type {number}
      freqsLitLen = [], // @type {Array.<number>}
      freqsDist = [], // @type {Array.<number>}
      lazy = this.lazy; // @const {number}

  // 初期化
  for (i = 0; i <= 285; i++) { freqsLitLen[i] = 0; }
  for (i = 0; i <= 29; i++) { freqsDist[i] = 0; }
  freqsLitLen[256] = 1; // EOB の最低出現回数は 1

  /**
   * マッチデータの書き込み
   * @param {Lz77Match} match LZ77 Match data.
   * @param {!number} offset スキップ開始位置(相対指定).
   * @private
   */
  function writeMatch(match, offset) {
    var lz77Array = match.toLz77Array();

    push(lz77buf, lz77Array);
    freqsLitLen[lz77Array[0]]++;
    freqsDist[lz77Array[3]]++;
    skipLength = match.length + offset - 1;
    prevMatch = null;
  }

  // LZ77 符号化
  for (position = 0, length = dataArray.length; position < length; position++) {
    // ハッシュキーの作成
    matchKeyArray = slice(dataArray, position, Zlib.RawDeflate.Lz77MinLength);
    for (matchKey = 0, i = 0, l = matchKeyArray.length; i < l; i++) {
      matchKey = ((matchKey << 8) | (matchKeyArray[i] & 0xff)) >>> 0;
    }

    // テーブルが未定義だったら作成する
    if (table[matchKey] === undefined) { table[matchKey] = []; }
    matchList = table[matchKey];

    // skip
    if (skipLength > 0) {
      skipLength--;
      matchList.push(position);
      continue;
    }

    // マッチテーブルの更新 (最大戻り距離を超えているものを削除する)
    while (matchList.length > 0 && position - matchList[0] > windowSize) {
      matchList.shift();
    }

    // データ末尾でマッチしようがない場合はそのまま流しこむ
    if (matchKeyArray.length < Zlib.RawDeflate.Lz77MinLength) {
      if (prevMatch instanceof Lz77Match) {
        writeMatch(prevMatch, -1);
      }

      push(lz77buf, matchKeyArray);
      for (i = 0, l = matchKeyArray.length; i < l; i++) {
        freqsLitLen[matchKeyArray[i]]++;
      }
      break;
    }

    // マッチ候補から最長のものを探す
    if (matchList.length > 0) {
      longestMatch = this.searchLongestMatch_(dataArray, position, matchList);

      if (prevMatch instanceof Lz77Match) {
        if (prevMatch.length < longestMatch.length) {
          lz77buf.push(dataArray[position - 1]); // previous match
          freqsLitLen[dataArray[position - 1]]++;
          writeMatch(longestMatch, 0); // current match
        } else {
          writeMatch(prevMatch, -1); // previous match
        }
      } else if (longestMatch.length < lazy) {
        prevMatch = longestMatch;
      } else {
        writeMatch(longestMatch, 0);
      }
    } else if (prevMatch instanceof Lz77Match) {
      writeMatch(prevMatch, -1); // previous match
    } else {
      lz77buf.push(dataArray[position]);
      freqsLitLen[dataArray[position]]++;
    }

    matchList.push(position); // マッチテーブルに現在の位置を保存
  }

  // 終端処理
  lz77buf.push(256);
  freqsLitLen[256]++;
  this.freqsLitLen = freqsLitLen;
  this.freqsDist = freqsDist;

  return lz77buf;
};

/**
 * マッチした候補の中から最長一致を探す
 * @param {!Object} data plain data byte array.
 * @param {!number} position plain data byte array position.
 * @param {!Array.<number>} matchList 候補となる位置の配列.
 * @return {!Lz77Match} 最長かつ最短距離のマッチオブジェクト.
 * @private
 */
Zlib.RawDeflate.prototype.searchLongestMatch_ =
function(data, position, matchList) {
  var  match,
       currentMatch,
       matchMax = 0, matchLength,
       i, j, l, dl = data.length;

  // 候補を後ろから 1 つずつ絞り込んでゆく
  permatch:
  for (i = 0, l = matchList.length; i < l; i++) {
    match = matchList[l - i - 1];
    matchLength = Zlib.RawDeflate.Lz77MinLength;

    // 前回までの最長一致を末尾から一致検索する
    if (matchMax > Zlib.RawDeflate.Lz77MinLength) {
      for (j = matchMax; j > Zlib.RawDeflate.Lz77MinLength; j--) {
        if (data[match + j - 1] !== data[position + j - 1]) {
          continue permatch;
        }
      }
      matchLength = matchMax;
    }

    // 最長一致探索
    while(matchLength < Zlib.RawDeflate.Lz77MaxLength &&
          position + matchLength < dl &&
          data[match + matchLength] === data[position + matchLength]) {
      matchLength++;
    }

    // マッチ長が同じ場合は後方を優先
    if (matchLength > matchMax) {
      currentMatch = match;
      matchMax = matchLength;
    }

    // 最長が確定したら後の処理は省略
    if (matchLength === Zlib.RawDeflate.Lz77MaxLength) {
      break;
    }
  }

  return new Lz77Match(matchMax, position - currentMatch);
};

/**
 * Tree-Transmit Symbols の算出
 * reference: PuTTY Deflate implementation
 * @param {number} hlit HLIT.
 * @param {Array} litlenLengths リテラルと長さ符号の符号長配列.
 * @param {number} hdist HDIST.
 * @param {Array} distLengths 距離符号の符号長配列.
 * @return {{codes: Array.<number>, freqs: Array.<number>}} Tree-Transmit
 *     Symbols.
 */
Zlib.RawDeflate.prototype.getTreeSymbols_ =
function(hlit, litlenLengths, hdist, distLengths) {
  var src = new Array(hlit + hdist),
      i, j, runLength, l, length,
      result = new Array(286 + 30), nResult,
      rpt, freqs = new Array(19);

  j = 0;
  for (i = 0; i < hlit; i++) {
    src[j++] = litlenLengths[i];
  }
  for (i = 0; i < hdist; i++) {
    src[j++] = distLengths[i];
  }

  // 初期化
  // XXX: Uint8Array の場合はここの初期化処理が要らない
  for (i = 0, l = freqs.length; i < l; i++) {
    freqs[i] = 0;
  }

  // 符号化
  nResult = 0;
  for (i = 0, l = src.length; i < l; i += j) {
    // Run Length Encoding
    for (j = 1; i + j < l && src[i + j] === src[i]; j++) {}

    runLength = j;

    if (src[i] === 0) {
      // 0 の繰り返しが 3 回未満ならばそのまま
      if (runLength < 3) {
        while (runLength-- > 0) {
          result[nResult++] = 0;
          freqs[0]++;
        }
      } else {
        while (runLength > 0) {
          // 繰り返しは最大 138 までなので切り詰める
          rpt = (runLength < 138 ? runLength : 138);

          if (rpt > runLength - 3 && rpt < runLength) {
            rpt = runLength - 3;
          }

          // 3-10 回 -> 17
          if (rpt <= 10) {
            result[nResult++] = 17;
            result[nResult++] = rpt - 3;
            freqs[17]++;
          // 11-138 回 -> 18
          } else {
            result[nResult++] = 18;
            result[nResult++] = rpt - 11;
            freqs[18]++;
          }

          runLength -= rpt;
        }
      }
    } else {
      result[nResult++] = src[i];
      freqs[src[i]]++;
      runLength--;

      // 繰り返し回数が3回未満ならばランレングス符号は要らない
      if (runLength < 3) {
        while (runLength-- > 0) {
          result[nResult++] = src[i];
          freqs[src[i]]++;
        }
      // 3 回以上ならばランレングス符号化
      } else {
        while (runLength > 0) {
          // runLengthを 3-6 で分割
          rpt = (runLength < 6 ? runLength : 6);

          if (rpt > runLength - 3 && rpt < runLength) {
            rpt = runLength - 3;
          }

          result[nResult++] = 16;
          result[nResult++] = rpt - 3;
          freqs[16]++;

          runLength -= rpt;
        }
      }
    }
  }

  return {codes: result.slice(0, nResult), freqs: freqs};
};

/**
 * ハフマン符号の長さを取得する
 * reference: PuTTY Deflate implementation
 * @param {Array} freqs 出現カウント.
 * @param {number=} opt_limit 符号長の制限.
 * @return {Array.<number>} 符号長配列.
 * @private
 */
Zlib.RawDeflate.prototype.getLengths_ = function(freqs, opt_limit) {
  var nSymbols = freqs.length,
      nActiveSymbols,
      max = 2 * Zlib.RawDeflate.HUFMAX - 1,
      heap = new Zlib.Heap(2 * Zlib.RawDeflate.HUFMAX),
      parent = new Array(max),
      length = new Array(max),
      i, node1, node2,
      freqsZero = [],
      maxProb, smallestFreq = Infinity, totalFreq,
      num, denom, adjust;

  // 0 の要素を調べる, 最小出現数を調べる, 合計出現数を調べる
  for (i = 0; i < nSymbols; i++) {
    if (freqs[i] === 0) {
      freqsZero.push(i);
    } else {
      if (smallestFreq > freqs[i]) {
        smallestFreq = freqs[i];
      }
      totalFreq += freqs[i];
    }
  }

  // 非 0 の要素が 2 より小さかったら 2 になるまで 1 で埋める
  for (i = 0; nSymbols - freqsZero.length < 2; i++) {
    freqs[freqsZero.shift()] = 1;
  }

  // limit が決まっている場合は調整する
  if ((opt_limit | 0) > 0) {
    totalFreq = 0;

    // 引数チェック
    if (opt_limit !== 7 && opt_limit !== 15) {
      throw 'invalid limit number';
    }

    // 調整用パラメータの算出
    maxProb = (opt_limit === 15) ? 2584 : 55;
    nActiveSymbols = nSymbols - freqsZero.length;
    num = totalFreq - smallestFreq * maxProb;
    denom = maxProb - nActiveSymbols;
    adjust = ((num + denom - 1) / denom) | 0;

    // 非 0 要素の値を調整する
    for (i = 0; i < nSymbols; i++) {
      if (freqs[i] !== 0) {
        freqs[i] += adjust;
      }
    }
  }

  // 配列の初期化
  for (i = 0; i < max; i++) {
    parent[i] = 0;
    length[i] = 0;
  }

  // ヒープの構築
  for (i = 0; i < nSymbols; i++) {
    if (freqs[i] > 0) {
      heap.push(i, freqs[i]);
    }
  }

  // ハフマン木の構築
  // ノードを2つ取り、その値の合計をヒープを戻していくことでハフマン木になる
  for (i = Zlib.RawDeflate.HUFMAX; heap.length > 2; i++) {
    node1 = heap.pop();
    node2 = heap.pop();
    parent[node1.index] = i;
    parent[node2.index] = i;
    heap.push(i, node1.value + node2.value);
  }

  // ハフマン木から符号長に変換する
  for (; i >= 0; i--) {
    if (parent[i] > 0) {
      length[i] = 1 + length[parent[i]];
    }
  }

  return length.slice(0, nSymbols);
};

/**
 * 符号長配列からハフマン符号を取得する
 * reference: PuTTY Deflate implementation
 * @param {Array} lengths 符号長配列.
 * @return {Array} ハフマン符号配列.
 * @private
 */
Zlib.RawDeflate.prototype.getCodesFromLengths_ = function(lengths) {
  var codes = new Array(lengths.length),
      count = [],
      startCode = [],
      code = 0, i, l, j, m;

  // Count the codes of each length.
  for (i = 0, l = lengths.length; i < l; i++) {
    count[lengths[i]] = (count[lengths[i]] | 0) + 1;
  }

  // Determine the starting code for each length block.
  for (i = 1, l = Zlib.RawDeflate.MaxCodeLength; i <= l; i++) {
    startCode[i] = code;
    code += count[i] | 0;

    // overcommited
    if (code > (1 << i)) {
      throw 'overcommitted';
    }

    code <<= 1;
  }

  // undercommitted
  if (code < ((1 << Zlib.RawDeflate.MaxCodeLength) >>> 0)) {
    throw 'undercommitted';
  }

  // Determine the code for each symbol. Mirrored, of course.
  for (i = 0, l = lengths.length; i < l; i++) {
    code = startCode[lengths[i]];
    startCode[lengths[i]] += 1;
    codes[i] = 0;
    for (j = 0, m = lengths[i]; j < m; j++) {
      codes[i] = (codes[i] << 1) | (code & 1);
      code >>>= 1;
    }
  }

  return codes;
};



/* vim:set expandtab ts=2 sw=2 tw=80: */
