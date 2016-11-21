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
    'modules/declipping/ClipIntervalUtilities',
    'modules/signal_processing/Blocking',
    'modules/signal_processing/FFTWrapper',
    'modules/signal_processing/SignalProcessing'
  ], function(ClipIntervalUtilities,
              Blocking,
              FFTWrapper,
              SignalProcessing) {

  function RMSThreshold(x, threshold_amplitude, block_size, hop_size) {
    var channel_length = x.length;

    var block_idx = 0;
    var cur_block = new Float32Array(block_size);
    var noise_flags = [];
    var start_idx = 0;
    var stop_idx = start_idx + block_size - 1;

    // The noise profile is specified in frequency bins, and is the timewise
    // average of the fft magnitude.
    while(stop_idx < channel_length) {
      var cur_progress = start_idx / channel_length;

      // Get the current block.
      Blocking.CopyToBlock(x, channel_length, start_idx, stop_idx, cur_block, block_size); 

      var cur_rms = SignalProcessing.RMS(cur_block);
      if(cur_rms < threshold_amplitude) {
        noise_flags.push(1);
      }
      else {
        noise_flags.push(0);
      }

      start_idx = start_idx + hop_size;
      stop_idx = start_idx + block_size - 1;
      block_idx++;
    }

    var noise_intervals = ClipIntervalUtilities.FlagsToIntervals(noise_flags);

    return noise_intervals;
  }

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

  function RemoveNoiseGivenProfile(x, n, channel_idx, params, test_mode) {
    var alpha = 1;
    var medfilt_order = 11;

    block_size = params[1];
    hop_size = params[2];
    channel_length = x.length;
    out_channel = new Float32Array(channel_length);
    for(var sample_idx = 0; sample_idx < channel_length; sample_idx++) {
      out_channel[sample_idx] = 0;
    }

    var cur_block = new Float32Array(block_size);
    var hann_window = SignalProcessing.HannWindow(block_size);

    // For each block, we will calculate masks which will define the noise
    // removal. Processing will consist of multiplying the fft_magnitudes by
    // the masks.
    var masks = new Float32Array(block_size);

    // These are the masks from the last block. We smooth the masks over time
    // to avoid artifacts from fast-varying masks.
    var prev_masks = new Float32Array(block_size);

    // The signal to noise ratio (per frequency) of the previos block. This is 
    // calculated by assuming the noise removal removes all the noise: 
    // |x_hat|.^2 / |n|.^2
    var prev_snr = new Float32Array(block_size);

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

    // Zero fill.
    for(var bin_idx = 0; bin_idx < block_size; bin_idx++) {
      fft_imag[bin_idx] = 0;
      masks[bin_idx] = 0;
      prev_masks[bin_idx] = 0;
      prev_snr[bin_idx] = 0;
    }

    // Processing block by block.
    while(stop_idx < channel_length) {
      var cur_progress = start_idx / channel_length;

      if(!test_mode) {
        postMessage([cur_progress, channel_idx]);
      }

      Blocking.CopyToBlock(x, channel_length, start_idx, stop_idx, cur_block, block_size); 

      FFTWrapper.FFT(cur_block, imag_input, fft_real, fft_imag);
      FFTWrapper.GetFFTMagnitudeAndPhase(fft_real, fft_imag, fft_mag, fft_phase);

      // Find the masks.
      masks = GetMasks(fft_mag, n, prev_snr, block_size);

      // Smooth the masks.
      masks = SignalProcessing.SignalWeightedAverage(masks, prev_masks, alpha)

      // Median filter the masks by frequency.
      masks = SignalProcessing.ApplyMedianFilter(masks, medfilt_order);

      // Apply the masks.
      SignalProcessing.SignalPointwiseMultiplyInPlace(fft_mag, masks);

      // Calculate the prev_snr.
      prev_snr = CalculateSNR(fft_mag, n, block_size);

      // Transform back to the time domain.
      FFTWrapper.GetFFTRealAndImag(fft_mag, fft_phase, fft_real, fft_imag);
      FFTWrapper.IFFT(fft_real, fft_imag, cur_block, imag_output);

      // Apply window.
      SignalProcessing.SignalPointwiseMultiplyInPlace(cur_block, hann_window);

      Blocking.OverlapAndAdd(out_channel, channel_length, start_idx, stop_idx, cur_block, block_size);

      // Copy masks into prev_masks.
      Blocking.CopyToBlock(masks, block_size, 0, block_size - 1, prev_masks, block_size);

      start_idx = start_idx + hop_size;
      stop_idx = start_idx + block_size - 1;
      block_idx++;
    }

    // Window Compensation.
    var num_blocks = block_idx;
    var window_compensation = new Float32Array(channel_length);
    start_idx = 0;
    stop_idx = block_size - 1;
    for(var block_idx = 0; block_idx < num_blocks; block_idx++) {
      Blocking.OverlapAndAdd(window_compensation, channel_length, start_idx, stop_idx, hann_window, block_size);
      start_idx = start_idx + hop_size;
      stop_idx = start_idx + block_size - 1;
    }
    
    // Ensure we don't divide by zero.
    for(var signal_idx = 0; signal_idx < channel_length; signal_idx++) {
      if(window_compensation[signal_idx] < 0.01) {
        window_compensation[signal_idx] = 0.01;
      }
    }
    
    SignalProcessing.SignalPointwiseDivideInPlace(out_channel, window_compensation);

    return out_channel;
  }

  // TODO: TEST THIS FUNCTION;
  function GetMasks(y_mag, n_mag, prev_snr, block_size) {
    // Amount to smooth the prior snr. 1 -> no smoothing, 0 -> 100% smoothing.
    var PRIOR_ALPHA = 0.5;
    var masks = new Float32Array(block_size);

    for(var bin_idx = 0; bin_idx < block_size; bin_idx++) {
      var cur_y = y_mag[bin_idx];
      var cur_n = n_mag[bin_idx];
      var cur_x = cur_y - cur_n;
        
      var posterior_snr = (cur_y * cur_y) / (cur_n * cur_n);
      var prior_snr = (cur_x * cur_x) / (cur_n * cur_n); 
      var prior_snr = (PRIOR_ALPHA * prior_snr) + ((1 - PRIOR_ALPHA) * prev_snr[bin_idx]);

      var tmp_term = (prior_snr * prior_snr) + ( (2 * (1 + prior_snr)) * (prior_snr / posterior_snr));
      var num = prior_snr + Math.sqrt(tmp_term);
      var denom = 2 * (1 + prior_snr);
      masks[bin_idx] = num / denom;
    }

    return masks;
  }

  // TODO: TEST THIS FUNCTION;
  // signal and noise are fft magnitudes.
  function CalculateSNR(signal, noise, block_size) {
    snr = new Float32Array(block_size);

    for(var bin_idx = 0; bin_idx < block_size; bin_idx++) {
      cur_s = signal[bin_idx];
      cur_n = noise[bin_idx];
      snr[bin_idx] = (cur_s * cur_s) / (cur_n * cur_n);
    }
    
    return snr;
  }

  /* Public variables go here. */
  return {
    RMSThreshold: RMSThreshold,
    GetNoiseProfile: GetNoiseProfile,
    RemoveNoiseGivenProfile: RemoveNoiseGivenProfile,

    CalculateSNR: CalculateSNR,
    GetMasks: GetMasks
  };
});