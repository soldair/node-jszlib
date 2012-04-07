/**
 * zlib.util.js
 *
 * The MIT License
 *
 * modified by Ryan Day 2012 for nodejs support
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
 * @fileoverview 
 */

var Zlib = {};

/**
 * module Zlib.Util
 */
exports.Util = Zlib.Util = {};

/**
 * make network byte order byte array from integer
 * @param {!number} number source number.
 * @param {!number=} size array size.
 * @return {!Array} network byte order array.
 */
Zlib.Util.convertNetworkByteOrder = function(number, size) {
  var tmp = [], octet, nullchar;

  do {
    octet = number & 0xff;
    tmp.push(octet);
    number >>>= 8;
  } while (number > 0);

  if (typeof(size) === 'number') {
    nullchar = 0;
    while (tmp.length < size) {
      tmp.push(nullchar);
    }
  }

  return tmp.reverse();
};


/**
 * @param {!(Array|Uint8Array)} arraylike 
 * @param {!number} start 
 * @param {!number} length 
 * @return {!Array}
 */
Zlib.Util.slice = function(arraylike, start, length) {
  var result, arraylength = arraylike.length;

  if (arraylike instanceof Array) {
    return arraylike.slice(start, start + length);
  }

  result = [];

  for (var i = 0; i < length; i++) {
    if (start + i >= arraylength) {
      break;
    }
    result.push(arraylike[start + i]);
  }

  return result;
};

/**
 * @param {!(Array|Uint8Array)} dst 
 * @param {!(Array|Uint8Array)} src 
 * @return {!number}
 */
Zlib.Util.push = function(dst, src) {
  var i = 0, dl = src.length, sl = src.length, pushImpl = (!!dst.push);

  if (pushImpl) {
    for (; i < sl; i++) {
      dst.push(src[i]);
    }
  } else {
    for (; i < sl; i++) {
      dst[dl + i] = src[i];
    }
  }

  return dst.length;
};

/**
 * Byte String .
 * @param {!string} str byte string.
 * @return {!Array.<number>} byte array.
 */
Zlib.Util.stringToByteArray = function(str) {
  /** @type {!Array.<(string|number)>} */
  var tmp = str.split('');
  var i, l;

  for (i = 0, l = tmp.length; i < l; i++) {
    tmp[i] = (tmp[i].charCodeAt(0) & 0xff) >>> 0;
  }

  return tmp;
};


/* vim:set expandtab ts=2 sw=2 tw=80: */
