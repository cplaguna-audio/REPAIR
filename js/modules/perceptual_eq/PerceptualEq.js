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
 *                                Blocking.js                                *
 *                                                                           *
 *  Utilities for blocking audio.                                            *
 *****************************************************************************/

 define([
    /* Includes go here. */
  ], function() {

  /* 
   * lowpass
   * highpass
   * bandpass
   * lowshelf  
   * highshelf 
   * peaking 
   * notch 
   */
  function ConnectWarmthFilter(warmth, context, input_node) {
    var biquad_gain = (warmth / 50) - 1;
    biquad_gain = biquad_gain * 8;

    var biquad_filter = context.createBiquadFilter();
    biquad_filter.type = "peaking";
    biquad_filter.frequency.value = 1000;
    biquad_filter.gain.value = biquad_gain;

    input_node.connect(biquad_filter);

    return biquad_filter;
  }

  function ConnectBrightnessFilter(brightness, context, input_node) {
    var biquad_gain = (brightness / 50) - 1;
    biquad_gain = biquad_gain * 8;

    var biquad_filter = context.createBiquadFilter();
    biquad_filter.type = "highshelf";
    biquad_filter.frequency.value = 10000;
    biquad_filter.gain.value = biquad_gain;

    input_node.connect(biquad_filter);

    return biquad_filter;
  }

  // x is an AudioBuffer.
  function ApplyPerceptualEq(x, warmth, brightness, callback_fn) {
    var offline_context = new OfflineAudioContext(x.numberOfChannels, x.duration * x.sampleRate, x.sampleRate);

    var source = offline_context.createBufferSource();
    source.buffer = x;

    var warmth_out_node = ConnectWarmthFilter(warmth, offline_context, source);
    var brightness_out_node = ConnectBrightnessFilter(brightness, offline_context, warmth_out_node);

    brightness_out_node.connect(offline_context.destination);
    offline_context.oncomplete = callback_fn;

    source.start(0);
    offline_context.startRendering();
  }

  /* Public variables go here. */
  return {
    ApplyPerceptualEq: ApplyPerceptualEq
  };
});