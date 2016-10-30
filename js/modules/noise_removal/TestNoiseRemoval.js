/*
 * ClipAway
 *
 * Copyright (c) 2016 Christopher Laguna
 * https://github.com/cplaguna-audio/ClipAway
 *
 * (MIT License)
 * Permission is hereby granted, free of charge, to any person obtaining a copy of 
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*****************************************************************************\
 *                             TestNoiseRemoval.js                           *
 *                                                                           *
 *  Tests for the noise removal module.                                      *
 *                                                                           *
 *****************************************************************************/

define([
    'modules/signal_processing/FFTWrapper',
    'modules/noise_removal/NoiseRemoval',
    'modules/test/TestHelpers'
  ], function(FFTWrapper,
              NoiseRemoval,
              TestHelpers) {

  function TestModuleNoiseRemoval() {
    var tests_pass = true;  
    tests_pass = tests_pass && TestFileNoiseRemoval();
    return tests_pass;
  }

  function TestFileNoiseRemoval() {
    var tests_pass = true;  
    tests_pass = tests_pass && TestGetNoiseProfile();
    tests_pass = tests_pass && TestCalculateSNR();
    tests_pass = tests_pass && TestGetMasks();
    return tests_pass;
  }

  function TestGetNoiseProfile() {
    var TOLERANCE = 0.0001;
    var tests_pass = true;

    var x = [0.8147,
             0.9058,
             0.1270,
             0.9134,
             0.6324,
             0.0975,
             0.2785,
             0.5469,
             0.9575,
             0.9649,
             0.1576,
             0.9706,
             0.9572,
             0.4854,
             0.8003,
             0.1419,
             0.4218,
             0.9157,
             0.7922,
             0.9595,
             0.6557,
             0.0357,
             0.8491,
             0.9340,
             0.6787,
             0.7577];

    var correct = [2.1648,
                   1.4338,
                   0.7186,
                   0.5113,
                   0.2087,
                   0.5113,
                   0.7186,
                   1.4338];

    var block_size = 8;
    var hop_size = 4;
    var params = [44100, block_size, hop_size];

    FFTWrapper.InitFFTWrapper(block_size);
    var result = NoiseRemoval.GetNoiseProfile(x, 1, params, true);

    if(!TestHelpers.ArrayEqualityTolerance(result, correct, TOLERANCE)) {
      console.log('Test Failed: TestGetNoiseProfile() #1');
      console.log(result);
      tests_pass = false;
    }

    return tests_pass;
  }

  function TestCalculateSNR() {
    var TOLERANCE = 0.0001;
    var tests_pass = true;

    var x = [0.81472368,
             0.90579193,
             0.12698681,
             0.91337585,
             0.63235924,
             0.09754040,
             0.27849821,
             0.54688151];

    var n = [0.95750683,
             0.96488853,
             0.15761308,
             0.97059278,
             0.95716694,
             0.48537564,
             0.80028046,
             0.14188633];

    var correct = [0.72399725,
                   0.88125705,
                   0.64913159,
                   0.88557416,
                   0.43646795,
                   0.04038435,
                   0.12110453,
                  14.85611768];

    var result = NoiseRemoval.CalculateSNR(x, n, 8);

    if(!TestHelpers.ArrayEqualityTolerance(result, correct, TOLERANCE)) {
      console.log('Test Failed: TestCalculateSNR() #1');
      console.log(result);
      tests_pass = false;
    }

    return tests_pass;
  }

  function TestGetMasks() {
    var TOLERANCE = 0.0001;
    var tests_pass = true;

    var y = [0.42176128,
             0.91573552,
             0.79220732,
             0.95949242,
             0.65574069,
             0.03571167,
             0.84912930,
             0.93399324];

    var n = [0.67873515,
             0.75774013,
             0.74313246,
             0.39222701,
             0.65547789,
             0.17118668,
             0.70604608,
             0.03183284];

    var p = [0.27692298,
             0.04617139,
             0.09713178,
             0.82345782,
             0.69482862,
             0.31709948,
             0.95022204,
             0.03444608];

    var correct = [0.56889190,
                   0.14452414,
                   0.17190365,
                   0.66735078,
                   0.51027921,
                   2.08590104,
                   0.54254447,
                   0.99809668];

    var result = NoiseRemoval.GetMasks(y, n, p, 8);

    if(!TestHelpers.ArrayEqualityTolerance(result, correct, TOLERANCE)) {
      console.log('Test Failed: TestGetMasks() #1');
      console.log(result);
      tests_pass = false;
    }

    return tests_pass;
  }

  /* Public variables go here. */
  return {
    TestModuleNoiseRemoval: TestModuleNoiseRemoval
  };
});