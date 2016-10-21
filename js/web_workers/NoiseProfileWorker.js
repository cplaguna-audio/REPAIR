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
 *                          NoiseProfileWorker.js                            *
 *  The web worker for obtaining the noise profile.                          *
 *****************************************************************************/
self.importScripts('../third_party/requirejs/require.js');

require({
        baseUrl: '../'
    }, [
      /* Includes go here. */
      'modules/signal_processing/FFTWrapper',
      'modules/noise_removal/NoiseRemoval'
    ], function(FFTWrapper,
                NoiseRemoval) {

  /*
   *  Input:
   *    e.data[0]: channel index
   *    e.data[1]: input audio buffer - user-selected noise segment of audio file (Float32Array)
   *    e.data[2]: params
   *      params[0]: sample rate
   *      params[1]: block size
   *      params[2]: hop size
   *
   *  Output:
   *    [0]: progress
   *    [1]: channel index
   *    [2]: noise profile
   */

  onmessage = function(e) {
    var channel_idx = e.data[0];
    var audio_buffer = e.data[1];
    var params = e.data[2];
    var block_size = params[1];

    FFTWrapper.InitFFTWrapper(block_size);
    var noise_profile = NoiseRemoval.GetNoiseProfile(audio_buffer, channel_idx, params, false);

    postMessage([1.1, channel_idx, noise_profile]);
  }
});
