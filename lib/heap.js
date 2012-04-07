/**
 * zlib.heap.js
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
 * @fileoverview Heap Sort
 */

var Zlib = {};

/**
 * 
 * @param {number} length
 * @constructor
 */
exports.Heap = Zlib.Heap = function(length) {
  this.buffer = new Array(length * 2);
  this.length = 0;
};

/**
 *  index
 * @param {number}  index.
 * @return {number} index.
 *
 */
Zlib.Heap.prototype.getParent = function(index) {
  return ((index - 2) / 4 | 0) * 2;
};

/**
 *  index 
 * @param {number} index.
 * @return {number} index.
 */
Zlib.Heap.prototype.getChild = function(index) {
  return 2 * index + 2;
};

/**
 * Heap
 * @param {number} index
 * @param {number} value
 * @return {number}
 */
Zlib.Heap.prototype.push = function(index, value) {
  var current, parent,
      heap = this.buffer,
      swap;

  current = this.length;
  heap[this.length++] = value;
  heap[this.length++] = index;

  while (current > 0) {
    parent = this.getParent(current);

    if (heap[current + 1] < heap[parent + 1]) {
      swap = heap[current];
      heap[current] = heap[parent];
      heap[parent] = swap;

      swap = heap[current + 1];
      heap[current + 1] = heap[parent + 1];
      heap[parent + 1] = swap;

      current = parent;
    } else {
      break;
    }
  }

  return this.length;
};

/**
 * Heap
 * @return {{index: number, value: number, length: number}} {index: index,
 *     value: , length:  Object.
 */
Zlib.Heap.prototype.pop = function() {
  var index, value,
      heap = this.buffer, swap,
      current, parent;

  value = heap[0];
  index = heap[1];

  this.length -= 2;
  heap[0] = heap[this.length];
  heap[1] = heap[this.length + 1];

  parent = 0;
  while (true) {
    current = this.getChild(parent);

    if (current >= this.length) {
      break;
    }

    if (current + 2 < this.length && heap[current + 3] < heap[current + 1]) {
      current += 2;
    }

    if (heap[parent + 1] > heap[current + 1]) {
      swap = heap[parent];
      heap[parent] = heap[current];
      heap[current] = swap;

      swap = heap[parent + 1];
      heap[parent + 1] = heap[current + 1];
      heap[current + 1] = swap;
    } else {
      break;
    }

    parent = current;
  }

  return {index: index, value: value, length: this.length};
};


// end of scope

/* vim:set expandtab ts=2 sw=2 tw=80: */
