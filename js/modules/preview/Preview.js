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
 *                                 Delcip.js                                 *
 *                                                                           *
 *  Declipping implementation.                                               *
 *****************************************************************************/

 define([
    /* Includes go here. */
    'modules/signal_processing/Blocking',
    'modules/signal_processing/SignalProcessing'
  ], function(Blocking,
              SignalProcessing) {

  /* 
   * Finds the 'best' location to preview audio effects. Best means loudest. 
   * The length of the preview == |block_size|.
   */
  function GetPreviewBounds(x, block_size, hop_size) {
    var channel_length = x.length;
    
    var max_threshold = 0; 
    var preview_start = -1;
    var preview_stop = -1;

    var block_idx = 0;
    var cur_block = new Float32Array(block_size);
    var start_idx = 0;
    var stop_idx = start_idx + block_size - 1;

    // The noise profile is specified in frequency bins, and is the timewise
    // average of the fft magnitude.
    while(stop_idx < channel_length) {
      var cur_progress = start_idx / channel_length;

      // Get the current block.
      Blocking.CopyToBlock(x, channel_length, start_idx, stop_idx, cur_block, block_size); 

      var cur_rms = SignalProcessing.RMS(cur_block);
      if(cur_rms > max_threshold) {
        preview_start = start_idx;
        preview_stop = stop_idx;
        max_threshold = cur_rms;
      }

      start_idx = start_idx + hop_size;
      stop_idx = start_idx + block_size - 1;
      block_idx++;
    }

    return { start: preview_start, stop: preview_stop };
  }

  /* Public variables go here. */
  return {
    GetPreviewBounds, GetPreviewBounds
  };
});