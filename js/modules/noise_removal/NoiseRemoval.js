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
 *                              NoiseRemoval.js                              *
 *                                                                           *
 *  Noise removal implementation.                                            *
 *****************************************************************************/

 define([
    /* Includes go here. */
    'modules/signal_processing/Blocking',
    'modules/signal_processing/FFTWrapper',
    'modules/signal_processing/SignalProcessing'
  ], function(Blocking,
              FFTWrapper,
              SignalProcessing) {

  function GetNoiseProfile(x, channel_idx, params, test_mode) {
    block_size = params[1];
    hop_size = params[2];
    channel_length = x.length;

    var cur_block = new Float32Array(block_size);
    var noise_profile = new Float32Array(block_size);
    var hann_window = SignalProcessing.HannWindow(block_size);
  
    var start_idx = 0;
    var stop_idx = start_idx + block_size - 1;
    var block_idx = 0;

    var fft_real = new Float32Array(block_size);
    var fft_imag = new Float32Array(block_size);
    var fft_mag = new Float32Array(block_size);
    var fft_phase = new Float32Array(block_size);

    var imag_input = new Float32Array(block_size);

    // We don't care about this, but we need a spot to write the ifft imaginary
    // output.
    var imag_output = new Float32Array(block_size);

    // Input is real, so we need to zero out the imaginary. Also zero out the 
    // noise profile.
    for(var bin_idx = 0; bin_idx < block_size; bin_idx++) {
      fft_imag[bin_idx] = 0;
      noise_profile[bin_idx] = 0;
    }

    // The noise profile is specified in frequency bins, and is the timewise
    // average of the fft magnitude.
    while(stop_idx < channel_length) {
      var cur_progress = start_idx / channel_length;

      if(!test_mode) {
        postMessage([cur_progress, channel_idx]);
      }
 
      // Get the current block.
      Blocking.CopyToBlock(x, channel_length, start_idx, stop_idx, cur_block, block_size); 

      // Get the fft magnitude.
      SignalProcessing.SignalPointwiseMultiplyInPlace(cur_block, hann_window);
      FFTWrapper.FFT(cur_block, imag_input, fft_real, fft_imag);
      FFTWrapper.GetFFTMagnitudeAndPhase(fft_real, fft_imag, fft_mag, fft_phase);

      // Make the working average of the fft_mags. Online averaging.
      for(var bin_idx = 0; bin_idx < block_size; bin_idx++) {
        k = block_idx + 1;
        old_weight = (k - 1) / k;
        new_weight = 1 / k;
        noise_profile[bin_idx] = (noise_profile[bin_idx] * old_weight) + (fft_mag[bin_idx] * new_weight);
      }

      start_idx = start_idx + hop_size;
      stop_idx = start_idx + block_size - 1;
      block_idx++;
    }

    return noise_profile;
  }

  function RemoveNoiseGivenProfile(x, n, channel_idx, params) {

  }

  /* Public variables go here. */
  return {
    GetNoiseProfile: GetNoiseProfile,
    RemoveNoiseGivenProfile: RemoveNoiseGivenProfile
  };
});
