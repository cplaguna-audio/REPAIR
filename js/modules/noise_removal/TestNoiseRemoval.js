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

  /* Public variables go here. */
  return {
    TestModuleNoiseRemoval: TestModuleNoiseRemoval
  };
});