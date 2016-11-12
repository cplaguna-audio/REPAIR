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
 *                            IndexController.js                             *
 *                                                                           *
 *  Controller for index.html. Interface between index.html UI and the audio *
 *  analysis and processing.                                                 *
 *                                                                           *
 *****************************************************************************/

define([
  /* Includes go here. */
    'IndexGlobal',
    'WaveformInteractor',
    'WebAudioUtils',

    'modules/codecs/WavEncoder',
    'modules/perceptual_eq/PerceptualEq',
    'modules/signal_processing/SignalProcessing',
    'modules/test/Test',

    'third_party/jquery/jquery-1.12.1.min',
    'third_party/w2ui/w2ui-1.4.3.min',

    'third_party/katspaugh-wavesurfer.js-fdd4b7f/wavesurfer.min',
    'third_party/katspaugh-wavesurfer.js-fdd4b7f/wavesurfer.regions.min',
    'third_party/katspaugh-wavesurfer.js-fdd4b7f/wavesurfer.timeline.min',

    'third_party/web_evaluation_toolkit/loudness'
  ], function(IndexGlobal,
              WaveformInteractor,
              WebAudioUtils,

              WavEncoder,
              PerceptualEq,
              SignalProcessing,
              Test) {

  PROGRESS = [];

  // Load the web workers at init time. One per channel.
  // For loudness normalization.
  GAIN_WORKERS = [];

  // For declipping.
  CLIPPING_DETECTION_WORKERS = [];
  DECLIP_SHORT_BURSTS_WORKERS = [];
  GET_KNOWN_POINTS_WORKERS = [];
  DECLIP_LONG_BURSTS_WORKERS = [];

  // For noise removal.
  NOISE_REMOVAL_WORKERS = [];
  NOISE_PROFILE_WORKERS = [];

  $(document).ready(InitIndex);

  // Queue of (audio processing) callbacks to be executed by a web worker.
  action_queue = [];

  function DoFirstAction() {
    if(action_queue.length >= 1) {
      top_callback = action_queue.shift();
      OpenProgressBar();
      top_callback();
    }
  }

  function DoNextAction() {
    if(action_queue.length >= 1) {
      top_callback = action_queue.shift();
      top_callback();
    }
    else {
      CloseProgressBar();
    }
  }

  // Event handlers.
  function PluginImageClicked(plugin_options_view, plugin_tab) {
    var plugin_options_view = 0;
    var plugin_tab = 0;
    if(this.id === "declip_image") {
      plugin_options_view = document.getElementById("declip_options_view");
      plugin_tab = document.getElementById("declip_tab");
    }
    else if(this.id === "noise_removal_image") {
      plugin_options_view = document.getElementById("noise_removal_options_view");
      plugin_tab = document.getElementById("noise_removal_tab");
    }
    else if(this.id === "auto_eq_image") {
      plugin_options_view = document.getElementById("auto_eq_options_view");
      plugin_tab = document.getElementById("auto_eq_tab");
    }

    var should_set = plugin_options_view.style.display === "none";

    var options_views = document.getElementsByClassName("options_view");
    for(var idx = 0; idx < options_views.length; idx++) {
      var options_view = options_views[idx];
      options_view.style.display = "none";
    }

    var tabs = document.getElementsByClassName("tab");
    for(var idx = 0; idx < tabs.length; idx++) {
      var tab = tabs[idx];
      tab.style.display = "none";
    }

    if(should_set) {
      plugin_options_view.style.display = "block";
      plugin_tab.style.display = "inline-block";
    }
  }

  function ActivateClicked(plugin_string, activate_button) {

    var should_activate = activate_button.firstChild.data === "Activate";

    if(plugin_string === "declip") {
      IndexGlobal.STATE.declip_active = should_activate;
    }
    else if(plugin_string === "noise_removal") {
      IndexGlobal.STATE.noise_removal_active = should_activate;
    }
    else if(plugin_string === "auto_eq") {
      IndexGlobal.STATE.auto_eq_active = should_activate;
    }

    RefreshIndex();
  }

  function ClippingExampleClicked() {
    var blob = null;
    var xhr = new XMLHttpRequest(); 
    xhr.open("GET", "resources/audio_examples/1/1_clipped.wav"); 
    xhr.responseType = "blob";
    xhr.onload = function() {
      blob = xhr.response;
      IndexGlobal.FILE_NAME = "clipping_example.wav";

      var reader = new FileReader();
      reader.onload = function(ev) {
        FlushIndex();
        IndexGlobal.AUDIO_CONTEXT.decodeAudioData(ev.target.result, function(buffer) {
          IndexGlobal.INPUT_AUDIO_BUFFER = buffer;
          IndexGlobal.PROCESSED_AUDIO_BUFFER = WebAudioUtils.CopyAudioBuffer(IndexGlobal.AUDIO_CONTEXT, IndexGlobal.INPUT_AUDIO_BUFFER);
          IndexGlobal.STATE.audio_loaded = true;
          action_queue.push(DoDetectClipping);
          action_queue.push(DoNormalizeInput);
          action_queue.push(DoNormalizeOutput);
          DoFirstAction();
        });
      };
      reader.readAsArrayBuffer(blob);
      IndexGlobal.WAVEFORM_INTERACTOR.LoadAudio(blob);
      RefreshIndex();
    }
    xhr.send();
  }

  function NoisyExampleClicked() {
    var blob = null;
    var xhr = new XMLHttpRequest(); 
    xhr.open("GET", "resources/audio_examples/noise_removal/noisy_example.wav"); 
    xhr.responseType = "blob";
    xhr.onload = function() {
      blob = xhr.response;
      IndexGlobal.FILE_NAME = "clipping_example.wav";

      var reader = new FileReader();
      reader.onload = function(ev) {
        FlushIndex();
        IndexGlobal.AUDIO_CONTEXT.decodeAudioData(ev.target.result, function(buffer) {
          IndexGlobal.INPUT_AUDIO_BUFFER = buffer;
          IndexGlobal.PROCESSED_AUDIO_BUFFER = WebAudioUtils.CopyAudioBuffer(IndexGlobal.AUDIO_CONTEXT, IndexGlobal.INPUT_AUDIO_BUFFER);
          IndexGlobal.STATE.audio_loaded = true;
          action_queue.push(DoDetectClipping);
          action_queue.push(DoNormalizeInput);
          action_queue.push(DoNormalizeOutput);
          DoFirstAction();
        });
      };
      reader.readAsArrayBuffer(blob);
      IndexGlobal.WAVEFORM_INTERACTOR.LoadAudio(blob);
      RefreshIndex();
    }
    xhr.send();
  }

function EQExampleClicked() {
    var blob = null;
    var xhr = new XMLHttpRequest(); 
    xhr.open("GET", "resources/audio_examples/perceptual_eq/eq_example.wav"); 
    xhr.responseType = "blob";
    xhr.onload = function() {
      blob = xhr.response;
      IndexGlobal.FILE_NAME = "clipping_example.wav";

      var reader = new FileReader();
      reader.onload = function(ev) {
        FlushIndex();
        IndexGlobal.AUDIO_CONTEXT.decodeAudioData(ev.target.result, function(buffer) {
          IndexGlobal.INPUT_AUDIO_BUFFER = buffer;
          IndexGlobal.PROCESSED_AUDIO_BUFFER = WebAudioUtils.CopyAudioBuffer(IndexGlobal.AUDIO_CONTEXT, IndexGlobal.INPUT_AUDIO_BUFFER);
          IndexGlobal.STATE.audio_loaded = true;
          action_queue.push(DoDetectClipping);
          action_queue.push(DoNormalizeInput);
          action_queue.push(DoNormalizeOutput);
          DoFirstAction();
        });
      };
      reader.readAsArrayBuffer(blob);
      IndexGlobal.WAVEFORM_INTERACTOR.LoadAudio(blob);
      RefreshIndex();
    }
    xhr.send();
  }

  function RepairClicked() {
    if(IndexGlobal.STATE.declip_active) {
      action_queue.push(DoDeclipShortBursts);
      action_queue.push(DoGetKnownPoints);
      action_queue.push(DoDeclipLongBursts);
    }
    if(IndexGlobal.STATE.noise_removal_active) {
      action_queue.push(DoNoiseRemoval);
    }
    if(IndexGlobal.STATE.auto_eq_active) {
      action_queue.push(DoPerceptualEq);
    }
    action_queue.push(DoNormalizeInput);
    action_queue.push(DoNormalizeOutput);

    DoFirstAction();
  }

  function NoiseProfileClicked() {
    var noise_bounds = IndexGlobal.WAVEFORM_INTERACTOR.GetOriginalRegionBounds();
    if(noise_bounds.start === -1) {
      alert("Please select a section of the input audio file to be used as the noise profile.");
      return;
    }
    var sample_rate = IndexGlobal.AUDIO_CONTEXT.sampleRate;

    IndexGlobal.NOISE_REGION_START = Math.floor(noise_bounds.start * sample_rate);
    IndexGlobal.NOISE_REGION_STOP = Math.floor(noise_bounds.end * sample_rate);
    action_queue.push(DoNoiseProfile);
    DoFirstAction();
  }

  function SaveOutputClicked() {
    var wav_blob = WavEncoder.AudioBufferToWavBlob(IndexGlobal.PROCESSED_AUDIO_BUFFER); 

    // Click the link programmatically.
    var download_element = document.getElementById("download_processed_audio");
    var url = window.URL.createObjectURL(wav_blob);
    download_element.href = url;
    download_element.download = "ClipAway-Declipped-" + IndexGlobal.FILE_NAME + '.wav';
    download_element.click();
    window.URL.revokeObjectURL(url);
  }

  // Callbacks for web worker progress updates.
  function GainCallback(e) {
    cur_progress = e.data[0];
    the_channel_idx = e.data[1]
    PROGRESS[the_channel_idx] = cur_progress;
    if(cur_progress > 1) {
      processed_channel = e.data[2];
      do_input_buffer = e.data[3];
      var audio_buffer = 0;
      if(do_input_buffer) {
        audio_buffer = IndexGlobal.INPUT_AUDIO_BUFFER;
      }
      else {
        audio_buffer = IndexGlobal.PROCESSED_AUDIO_BUFFER;
      }
      
      audio_buffer.copyToChannel(processed_channel, the_channel_idx);
      min_progress = SignalProcessing.MyMin(PROGRESS);
      console.timeEnd('Gain');

      if(min_progress > 1) {
        the_callback = function() {
          console.log('callback: gain');
          DoNextAction();
        }
        if(do_input_buffer) {
          IndexGlobal.WAVEFORM_INTERACTOR.UpdateInputAudio(audio_buffer, the_callback);
        }
        else {
          IndexGlobal.WAVEFORM_INTERACTOR.UpdateProcessedAudio(audio_buffer, the_callback);
        }
      }

    }
    else {
      avg_progress = SignalProcessing.MyAverage(PROGRESS);
      UpdateProgressBar(avg_progress);
    }
  }

  function ClippingDetectionCallback(e) {
    var cur_progress = e.data[0];
    var the_channel_idx = e.data[1]
    PROGRESS[the_channel_idx] = cur_progress;
    if(cur_progress > 1) {
      var cur_short_clip_intervals = e.data[2];
      var cur_long_clip_intervals = e.data[3];
      IndexGlobal.SHORT_CLIP_INTERVALS[the_channel_idx] = cur_short_clip_intervals;
      IndexGlobal.LONG_CLIP_INTERVALS[the_channel_idx] = cur_long_clip_intervals;

      min_progress = SignalProcessing.MyMin(PROGRESS);
      if(min_progress > 1) {
        console.timeEnd('ClipDetection');

        IndexGlobal.STATE.did_clipping_detection = true;
        RefreshIndex();
        DoNextAction();
      }
    }
    else {
      avg_progress = SignalProcessing.MyAverage(PROGRESS);
      UpdateProgressBar(avg_progress);
    }
  }

  function DeclipShortBurstsCallback(e) {
    cur_progress = e.data[0];
    the_channel_idx = e.data[1]
    PROGRESS[the_channel_idx] = cur_progress;
    if(cur_progress > 1) {
      processed_channel = e.data[2];
      IndexGlobal.PROCESSED_AUDIO_BUFFER.copyToChannel(processed_channel, the_channel_idx);
      
      min_progress = SignalProcessing.MyMin(PROGRESS);
      console.timeEnd('DeclipShort');

      if(min_progress > 1) {
        the_callback = function() {
          IndexGlobal.STATE.did_declip_short_bursts = true;
          RefreshIndex();
          DoNextAction();
        }
        IndexGlobal.WAVEFORM_INTERACTOR.UpdateProcessedAudio(IndexGlobal.PROCESSED_AUDIO_BUFFER, the_callback);
      }
    }
    else {
      avg_progress = SignalProcessing.MyAverage(PROGRESS);
      UpdateProgressBar(avg_progress);
    }
  }  

  function GetKnownPointsCallback(e) {
    cur_progress = e.data[0];
    the_channel_idx = e.data[1]
    PROGRESS[the_channel_idx] = cur_progress;
    if(cur_progress > 1) {
      cur_known_points = e.data[2];
      KNOWN_POINTS[the_channel_idx] = cur_known_points;

      min_progress = SignalProcessing.MyMin(PROGRESS);
      if(min_progress > 1) {
        console.timeEnd('GetKnownPoints');

        IndexGlobal.STATE.did_get_known_points = true;
        RefreshIndex();
        DoNextAction();
      }
    }
    else {
      avg_progress = SignalProcessing.MyAverage(PROGRESS);
      UpdateProgressBar(avg_progress);
    }
  }

  function DeclipLongBurstsCallback(e) {
    cur_progress = e.data[0];
    the_channel_idx = e.data[1];
    PROGRESS[the_channel_idx] = cur_progress;
    if(cur_progress > 1) {
      processed_channel = e.data[2];
      IndexGlobal.PROCESSED_AUDIO_BUFFER.copyToChannel(processed_channel, the_channel_idx);
      min_progress = SignalProcessing.MyMin(PROGRESS);

      if(min_progress > 1) {
        console.timeEnd('DeclipLongBursts');
        the_callback = function() {
          IndexGlobal.STATE.did_declip_long_bursts = true;
          RefreshIndex();
          DoNextAction();
        };

        IndexGlobal.WAVEFORM_INTERACTOR.UpdateProcessedAudio(IndexGlobal.PROCESSED_AUDIO_BUFFER, the_callback);
      }
    }
    else {
      avg_progress = SignalProcessing.MyAverage(PROGRESS);
      UpdateProgressBar(avg_progress);
    }
  }

  function NoiseRemovalCallback(e) {
    cur_progress = e.data[0];
    the_channel_idx = e.data[1];
    PROGRESS[the_channel_idx] = cur_progress;
    if(cur_progress > 1) {
      processed_channel = e.data[2];
      IndexGlobal.PROCESSED_AUDIO_BUFFER.copyToChannel(processed_channel, the_channel_idx);
      min_progress = SignalProcessing.MyMin(PROGRESS);

      if(min_progress > 1) {
        console.timeEnd('NoiseRemoval');
        the_callback = function() {
          IndexGlobal.STATE.did_remove_noise = true;
          RefreshIndex();
          DoNextAction()
        };

        IndexGlobal.WAVEFORM_INTERACTOR.UpdateProcessedAudio(IndexGlobal.PROCESSED_AUDIO_BUFFER, the_callback);
      }
    }
    else {
      avg_progress = SignalProcessing.MyAverage(PROGRESS);
      UpdateProgressBar(avg_progress);
    }
  }

  function NoiseProfileCallback(e) {
    cur_progress = e.data[0];
    the_channel_idx = e.data[1];
    PROGRESS[the_channel_idx] = cur_progress;
    if(cur_progress > 1) {
      IndexGlobal.NOISE_PROFILE[the_channel_idx] = e.data[2];
      min_progress = SignalProcessing.MyMin(PROGRESS);

      if(min_progress > 1) {
        console.timeEnd('GetNoiseProfile');
        IndexGlobal.STATE.did_profile_noise = true;
        RefreshIndex();
        DoNextAction();
      }
    }
    else {
      avg_progress = SignalProcessing.MyAverage(PROGRESS);
      UpdateProgressBar(avg_progress);
    }
  }

  function PerceptualEqCallback(e) {
    UpdateProgressBar(1.1);
    IndexGlobal.PROCESSED_AUDIO_BUFFER = e.renderedBuffer;
    RefreshIndex();
    DoNextAction();
  }
 
  // Called after the <body> has been loaded.
  function InitIndex() {  

    // Add the click handlers.
    $("#clipping_example").click(function() { ClippingExampleClicked(); });
    $("#noisy_example").click(function() { NoisyExampleClicked(); });
    $("#eq_example").click(function() { EQExampleClicked(); });

    $("#repair_button").click(function() { RepairClicked(); });
    $("#noise_profile_button").click(function() { NoiseProfileClicked(); });
    $("#download_audio_button").click(function() { SaveOutputClicked(); });

    $("#declip_activate_button").click(function() {
      var activate_button = document.getElementById("declip_activate_button");
      ActivateClicked("declip", activate_button); 
    });
    $("#noise_removal_activate_button").click(function() {
      var activate_button = document.getElementById("noise_removal_activate_button");
      ActivateClicked("noise_removal", activate_button); 
    });
    $("#auto_eq_activate_button").click(function() {
      var activate_button = document.getElementById("auto_eq_activate_button");
      ActivateClicked("auto_eq", activate_button); 
    });

    var options_views = document.getElementsByClassName("options_view");
    for(var idx = 0; idx < options_views.length; idx++) {
      var options_view = options_views[idx];
      options_view.style.display = "none";
    }

    // Construct the web workers.
    if (window.Worker) {
      for(channel_idx = 0; channel_idx < IndexGlobal.MAX_NUM_CHANNELS; channel_idx++) {
        var clipping_detection_worker = new Worker("js/web_workers/ClippingDetectionWorker.js");
        clipping_detection_worker.onmessage = ClippingDetectionCallback;
        CLIPPING_DETECTION_WORKERS.push(clipping_detection_worker); 

        var gain_worker = new Worker("js/web_workers/GainWorker.js");
        gain_worker.onmessage = GainCallback;
        GAIN_WORKERS.push(gain_worker); 

        var declip_short_bursts_worker = new Worker("js/web_workers/DeclipShortBurstsWorker.js");
        declip_short_bursts_worker.onmessage = DeclipShortBurstsCallback;
        DECLIP_SHORT_BURSTS_WORKERS.push(declip_short_bursts_worker);

        var get_known_points_worker = new Worker("js/web_workers/GetKnownPointsWorker.js");
        get_known_points_worker.onmessage = GetKnownPointsCallback;
        GET_KNOWN_POINTS_WORKERS.push(get_known_points_worker);

        var declip_long_bursts_worker = new Worker("js/web_workers/DeclipLongBurstsWorker.js");
        declip_long_bursts_worker.onmessage = DeclipLongBurstsCallback;
        DECLIP_LONG_BURSTS_WORKERS.push(declip_long_bursts_worker);

        var noise_removal_worker = new Worker("js/web_workers/NoiseRemovalWorker.js");
        noise_removal_worker.onmessage = NoiseRemovalCallback;
        NOISE_REMOVAL_WORKERS.push(noise_removal_worker);

        var noise_profile_worker = new Worker("js/web_workers/NoiseProfileWorker.js");
        noise_profile_worker.onmessage = NoiseProfileCallback;
        NOISE_PROFILE_WORKERS.push(noise_profile_worker);
      }

    }

    // Drag and drop.
    var toggleActive = function (e, toggle) {
        e.stopPropagation();
        e.preventDefault();
        toggle ? e.target.classList.add('wavesurfer-dragover') :
            e.target.classList.remove('wavesurfer-dragover');
    };

    var handlers = {
        drop: function (e) {
            toggleActive(e, false);

            if(e.dataTransfer.files.length) {

              IndexGlobal.FILE_NAME = e.dataTransfer.files[0].name;

              var reader = new FileReader();
              reader.onload = function(ev) {
                FlushIndex();
                IndexGlobal.AUDIO_CONTEXT.decodeAudioData(ev.target.result, function(buffer) {
                  IndexGlobal.INPUT_AUDIO_BUFFER = buffer;
                  IndexGlobal.PROCESSED_AUDIO_BUFFER = WebAudioUtils.CopyAudioBuffer(IndexGlobal.AUDIO_CONTEXT, IndexGlobal.INPUT_AUDIO_BUFFER);
                  IndexGlobal.STATE.audio_loaded = true;
                  DoDetectClipping();
                });
              };
              reader.readAsArrayBuffer(e.dataTransfer.files[0]);
              IndexGlobal.WAVEFORM_INTERACTOR.LoadAudio(e.dataTransfer.files[0]);
              RefreshIndex();
            } 
            else {
                console.log('Tried to drag and drop a bad file.');
            }
        },

        dragover: function(e) {
            toggleActive(e, true);
        },

        dragleave: function(e) {
            toggleActive(e, false);
        }
    };

    var dropTarget = document.querySelector('#waveform_view');
    Object.keys(handlers).forEach(function (event) {
        dropTarget.addEventListener(event, handlers[event]);
    });

    var screen_width_pixels = window.screen.width;
    var CONTENT_WIDTH_PIXELS = screen_width_pixels * IndexGlobal.CONTENT_WIDTH_PERCENTAGE;
    var content_element = document.getElementById('my_content');
    content_element.style.width = CONTENT_WIDTH_PIXELS.toString() + "px";

    // Progress bar.
    PROGRESS = [];
    for(channel_idx = 0; channel_idx < IndexGlobal.MAX_NUM_CHANNELS; channel_idx++) {
      PROGRESS[channel_idx] = 0;
    }
    IndexGlobal.PROGRESS_BAR_JQUERRY_ELEMENT = $('#audio_processing_progress_popup');
    IndexGlobal.PROGRESS_BAR_ELEMENT = document.getElementById('audio_processing_progress_popup');

    // Waveform interactor.
    var waveform_view_element = document.getElementById('waveform_view');
    var padding = window.getComputedStyle(waveform_view_element, null).getPropertyValue('padding');
    padding = padding.substring(0, padding.length - 2);
    var waveform_view_width_px = CONTENT_WIDTH_PIXELS - (2 * Number(padding)) - 10;
    IndexGlobal.WAVEFORM_INTERACTOR = new WaveformInteractor.WaveformInteractor(waveform_view_width_px);
    IndexGlobal.WAVEFORM_INTERACTOR.Init("original_audio_waveform", "processed_audio_waveform");
    
    // Clear state.
    RefreshIndex();

    // Tests.
    if(IndexGlobal.RUN_TESTS) {
      Test.RunTests();
    }

  }

  function DoNormalizeInput() {
    DoLoudnessNormalization(true);
  }

  function DoNormalizeOutput() {
    DoLoudnessNormalization(false);
  }

  function DoLoudnessNormalization(do_input_buffer) {
    var audio_buffer = 0;
    if(do_input_buffer) {
      audio_buffer = IndexGlobal.INPUT_AUDIO_BUFFER;
    }
    else {
      audio_buffer = IndexGlobal.PROCESSED_AUDIO_BUFFER;
    }
    console.time('Gain');

    var loudness_wrapper = {
        buffer: audio_buffer, 
        ready: function() {}
    };

    var loudness_callback = function(buffer, do_input_buffer) {
      var gain_db = IndexGlobal.TARGET_LUFS - audio_buffer.lufs;
      var gain_linear = SignalProcessing.DBToLinear(gain_db);
      console.log('gain: ' + gain_linear)
      var num_channels = audio_buffer.numberOfChannels;

      // Start up the progress bar pop-up.
      ResetProgressBar('Normalizing Loudness');

      PROGRESS = [];
      for(var channel_idx = 0; channel_idx < num_channels; channel_idx++) {
        PROGRESS[channel_idx] = 0;
      }

      // Start the audio processing on a separate thread.
      if(window.Worker) {
        for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
          params = [gain_linear];
          GAIN_WORKERS[channel_idx].postMessage([channel_idx, audio_buffer.getChannelData(channel_idx), params, do_input_buffer]);
        }
      }
    };

    calculateLoudness(IndexGlobal.AUDIO_CONTEXT, loudness_wrapper, 'I', loudness_callback, do_input_buffer);
  }

  function DoDeclipShortBursts() {
    console.time('DeclipShort');
    var num_channels = IndexGlobal.INPUT_AUDIO_BUFFER.numberOfChannels;

    // Start up the progress bar pop-up.
    ResetProgressBar('1/3: Declipping Short Bursts');

    PROGRESS = [];
    for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
      PROGRESS[channel_idx] = 0;
    }

    // Start the audio processing on a separate thread.
    if(window.Worker) {
      for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
        params = [IndexGlobal.INPUT_AUDIO_BUFFER.sampleRate];
        DECLIP_SHORT_BURSTS_WORKERS[channel_idx].postMessage([channel_idx, IndexGlobal.INPUT_AUDIO_BUFFER.getChannelData(channel_idx), IndexGlobal.SHORT_CLIP_INTERVALS[channel_idx], params]);
      }
    }
  }

  function DoGetKnownPoints() {  
    console.time('GetKnownPoints');
    var num_channels = IndexGlobal.INPUT_AUDIO_BUFFER.numberOfChannels;

    KNOWN_POINTS = [];
    for(var channel_idx = 0; channel_idx < num_channels; channel_idx++) {
      KNOWN_POINTS[channel_idx] = [];
    }

    // Start up the progress bar pop-up.
    ResetProgressBar('2/3: Finding Reliable FFT Magnitudes');

    PROGRESS = [];
    for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
      PROGRESS[channel_idx] = 0;
    }

    // Start the audio processing on a separate thread.
    if(window.Worker) {
      for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
        params = [IndexGlobal.INPUT_AUDIO_BUFFER.sampleRate, IndexGlobal.DECLIP_BLOCK_SIZE, IndexGlobal.DECLIP_HOP_SIZE, IndexGlobal.MIN_FFT_LENGTH];
        GET_KNOWN_POINTS_WORKERS[channel_idx].postMessage([channel_idx, IndexGlobal.PROCESSED_AUDIO_BUFFER.getChannelData(channel_idx), IndexGlobal.LONG_CLIP_INTERVALS[channel_idx], params]);
      }
    }
  }

  function DoDeclipLongBursts() {
    console.time('DeclipLongBursts');
    var num_channels = IndexGlobal.INPUT_AUDIO_BUFFER.numberOfChannels;

    // Start up the progress bar pop-up.
    ResetProgressBar('3/3: Declipping Long Bursts');

    PROGRESS = [];
    for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
      PROGRESS[channel_idx] = 0;
    }

    if(window.Worker) {
      for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
        params = [IndexGlobal.INPUT_AUDIO_BUFFER.sampleRate, IndexGlobal.DECLIP_BLOCK_SIZE, IndexGlobal.DECLIP_HOP_SIZE];
        DECLIP_LONG_BURSTS_WORKERS[channel_idx].postMessage([channel_idx, IndexGlobal.PROCESSED_AUDIO_BUFFER.getChannelData(channel_idx), IndexGlobal.LONG_CLIP_INTERVALS[channel_idx], KNOWN_POINTS[channel_idx], params]);
      }
    }  
  }

  function DoDetectClipping() {
    if(IndexGlobal.STATE.audio_loaded) {

      console.time('ClipDetection');
      var num_channels = IndexGlobal.INPUT_AUDIO_BUFFER.numberOfChannels;
      IndexGlobal.SHORT_CLIP_INTERVALS = [];
      IndexGlobal.LONG_CLIP_INTERVALS = [];
      PROGRESS = [];
      for(var channel_idx = 0; channel_idx < num_channels; channel_idx++) {
        IndexGlobal.SHORT_CLIP_INTERVALS[channel_idx] = [];
        IndexGlobal.LONG_CLIP_INTERVALS[channel_idx] = [];
        PROGRESS[channel_idx] = 0;
      }

      ResetProgressBar("Detect Clipping");
      if(window.Worker) {
        for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
          params = [IndexGlobal.INPUT_AUDIO_BUFFER.sampleRate];
          CLIPPING_DETECTION_WORKERS[channel_idx].postMessage([channel_idx, IndexGlobal.INPUT_AUDIO_BUFFER.getChannelData(channel_idx), params]);
        }
      }
    }
    else {
      alert("Load an audio file first.");
    }
  }

  function DoNoiseRemoval() {
    if(IndexGlobal.STATE.did_profile_noise) {

      console.time('NoiseRemoval');
      var num_channels = IndexGlobal.INPUT_AUDIO_BUFFER.numberOfChannels;
      PROGRESS = [];
      for(var channel_idx = 0; channel_idx < num_channels; channel_idx++) {
        PROGRESS[channel_idx] = 0;
      }

      ResetProgressBar('Noise Removal');
      if(window.Worker) {
        for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
          params = [IndexGlobal.INPUT_AUDIO_BUFFER.sampleRate, IndexGlobal.NOISE_REMOVAL_BLOCK_SIZE, IndexGlobal.NOISE_REMOVAL_HOP_SIZE];
          NOISE_REMOVAL_WORKERS[channel_idx].postMessage([channel_idx, IndexGlobal.INPUT_AUDIO_BUFFER.getChannelData(channel_idx), IndexGlobal.NOISE_PROFILE[channel_idx], params]);
        }
      }
    }
    else {
      alert("Load an audio file first.");
    }
  }

  function DoNoiseProfile() {
    if(IndexGlobal.STATE.audio_loaded) {
      console.time('GetNoiseProfile');
      var num_channels = IndexGlobal.INPUT_AUDIO_BUFFER.numberOfChannels;
      IndexGlobal.NOISE_PROFILE = [];
      PROGRESS = [];
      for(var channel_idx = 0; channel_idx < num_channels; channel_idx++) {
        PROGRESS[channel_idx] = 0;
        IndexGlobal.NOISE_PROFILE[channel_idx] = [];
      }

      ResetProgressBar('Get Noise Profile');
      if(window.Worker) {
        for(channel_idx = 0; channel_idx < num_channels; channel_idx++) {
          params = [IndexGlobal.INPUT_AUDIO_BUFFER.sampleRate, IndexGlobal.NOISE_REMOVAL_BLOCK_SIZE, IndexGlobal.NOISE_REMOVAL_HOP_SIZE];
          NOISE_PROFILE_WORKERS[channel_idx].postMessage([channel_idx, IndexGlobal.INPUT_AUDIO_BUFFER.getChannelData(channel_idx), IndexGlobal.NOISE_REGION_START, IndexGlobal.NOISE_REGION_STOP, params]);
        }
      }
    }
    else {
      alert("Load an audio file first.");
    }
  }

  function DoPerceptualEq() {
    if(IndexGlobal.STATE.audio_loaded) {
      console.time('PerceptualEq');
      PROGRESS = [];
      for(var channel_idx = 0; channel_idx < PROGRESS.length; channel_idx++) {
        PROGRESS[channel_idx] = 0;
      }

      ResetProgressBar('Applying Perceptual Equalation');
      var warmth = GetWarmth();
      var brightness = GetBrightness();
      PerceptualEq.ApplyPerceptualEq(IndexGlobal.INPUT_AUDIO_BUFFER, warmth, brightness, PerceptualEqCallback);
    }
    else {
      alert("Load an audio file first.");
    }
  }

  /*
   * Assorted Helpers
   */
  function GetWarmth() {
    var warmth_slider = document.getElementById('warmth_slider');
    return warmth_slider.value;
  }

  function GetBrightness() {
    var brightness_slider = document.getElementById('brightness_slider');
    return brightness_slider.value;
  }

  function NoPluginsActive() {
    if(IndexGlobal.STATE.declip_active) {
      return true;
    }
    if(IndexGlobal.STATE.noise_removal_active) {
      return true;
    }
    if(IndexGlobal.STATE.auto_eq_active) {
      return true;
    }

    return false;
  }

  /* 
   * Progress Bar Functions
   */
  function OpenProgressBar() {
    IndexGlobal.PROGRESS_BAR_JQUERRY_ELEMENT.w2popup({showClose: false, modal:true});
  }
  function CloseProgressBar() {
    w2popup.close();
  }

  function ResetProgressBar(progress_text) {
    var progress_title_element = document.getElementById('progress_title');
    progress_title_element.innerHTML = progress_text;
    UpdateProgressBar(0);
  }

  function UpdateProgressBar(progress) {
    progress_percent = Math.floor(progress * 100);
    progress_element = document.getElementById('progress_bar_progress');
    progress_element.style.width = progress_percent.toString() + '%'; 
    $('#w2ui-popup .w2ui-msg-body').html(IndexGlobal.PROGRESS_BAR_ELEMENT.innerHTML);
  }

  function DownloadInputAudio() {
    var wav_blob = WavEncoder.AudioBufferToWavBlob(IndexGlobal.INPUT_AUDIO_BUFFER); 

    var output_file_name = IndexGlobal.FILE_NAME.substring(0, IndexGlobal.FILE_NAME.lastIndexOf('.'));

    // Click the link programmatically.
    var download_element = document.getElementById("download_processed_audio");
    var url = window.URL.createObjectURL(wav_blob);
    download_element.href = url;
    download_element.download = "ClipAway-Unprocessed-" + output_file_name + '.wav';
    download_element.click();
    window.URL.revokeObjectURL(url);
  }

  // Decide which buttons should be enable/disabled depending on the current
  // state.
  function RefreshIndex() {
    var file_name_element = document.getElementById("file_name");
    file_name_element.innerHTML = IndexGlobal.FILE_NAME;

    // 1. Check to allow wavesurfer interaction.
    if(ShouldAllowWaveformInteraction()) {
      IndexGlobal.WAVEFORM_INTERACTOR.EnableInteraction();

      var toggle_waveform_button = document.getElementById("toggle_waveform_button");
      toggle_waveform_button.removeEventListener('click', ToggleWaveformHandler);
      toggle_waveform_button.addEventListener('click', ToggleWaveformHandler);
      toggle_waveform_button.style.opacity = "1";

      var play_pause_button = document.getElementById("play_pause_button");
      play_pause_button.removeEventListener('click', PlayPauseHandler);
      play_pause_button.addEventListener('click', PlayPauseHandler);
      play_pause_button.style.opacity = "1";

      var play_selection_button = document.getElementById("play_selection_button");
      play_selection_button.removeEventListener('click', PlaySelectionHandler);
      play_selection_button.addEventListener('click', PlaySelectionHandler);
      play_selection_button.style.opacity = "1";

      var zoom_in_button = document.getElementById("zoom_in_button");
      zoom_in_button.removeEventListener('click', ZoomInHandler);
      zoom_in_button.addEventListener('click', ZoomInHandler);
      zoom_in_button.style.opacity = "1";

      var zoom_out_button = document.getElementById("zoom_out_button");
      zoom_out_button.removeEventListener('click', ZoomOutHandler);
      zoom_out_button.addEventListener('click', ZoomOutHandler);
      zoom_out_button.style.opacity = "1";

      var repair_button = document.getElementById("repair_button");
      if(NoPluginsActive()) {
        repair_button.style.opacity = "1";
        repair_button.disabled = false;
      }
      else {
        repair_button.style.opacity = "0.2";
        repair_button.disabled = true;
      }

      IndexGlobal.WAVEFORM_INTERACTOR.original_audio_element.addEventListener('click', function() {
        if(!IndexGlobal.WAVEFORM_INTERACTOR.original_on) {
          IndexGlobal.WAVEFORM_INTERACTOR.TurnOnOriginal();
        }
      })

      IndexGlobal.WAVEFORM_INTERACTOR.processed_audio_element.addEventListener('click', function() {
        if(IndexGlobal.WAVEFORM_INTERACTOR.original_on) {
          IndexGlobal.WAVEFORM_INTERACTOR.TurnOnProcessed();
        }
      })

      var plugin_images = document.getElementsByClassName("plugin_image");
      for(var i = 0; i < plugin_images.length; i++)
      {
        var plugin_image = plugin_images[i];
        plugin_image.removeEventListener('click', PluginImageClicked);
        plugin_image.addEventListener('click', PluginImageClicked);
        plugin_image.style.opacity = "1";
      }

      var noise_removal_activate_button = document.getElementById("noise_removal_activate_button");
      if(IndexGlobal.STATE.did_profile_noise) {
        noise_removal_activate_button.style.opacity = "1";
        noise_removal_activate_button.disabled = false;
      }
      else {
        noise_removal_activate_button.style.opacity = "0.2";
        noise_removal_activate_button.disabled = true;
      }
    }
    else {
      IndexGlobal.WAVEFORM_INTERACTOR.DisableInteraction();

      var toggle_waveform_button = document.getElementById("toggle_waveform_button");
      toggle_waveform_button.style.opacity = "0.2";

      var play_pause_button = document.getElementById("play_pause_button");
      play_pause_button.style.opacity = "0.2";

      var play_selection_button = document.getElementById("play_selection_button");
      play_selection_button.style.opacity = "0.2";

      var zoom_in_button = document.getElementById("zoom_in_button");
      zoom_in_button.removeEventListener('click', ZoomInHandler);
      zoom_in_button.style.opacity = "0.2";

      var zoom_out_button = document.getElementById("zoom_out_button");
      zoom_out_button.removeEventListener('click', ZoomOutHandler);
      zoom_out_button.style.opacity = "0.2";

      var processing_buttons = document.getElementsByClassName("processing_button");
      for(var i = 0; i < processing_buttons.length; i++) {
        processing_buttons[i].style.opacity = "0.2";
        processing_buttons[i].disabled = true;
      } 

      var plugin_images = document.getElementsByClassName("plugin_image");
      for(var i = 0; i < plugin_images.length; i++)
      {
        var plugin_image = plugin_images[i];
        plugin_image.removeEventListener('click', PluginImageClicked);
        plugin_image.style.opacity = "0.2";
      }
    }

    // Plugin activations.
    var declip_activate_button = document.getElementById("declip_activate_button");
    var declip_img = document.getElementById("declip_image");
    if(IndexGlobal.STATE.declip_active) {
      declip_img.src = "resources/DeclipIconOn.png";
      declip_activate_button.firstChild.data = "Deactivate";
    }
    else {
      declip_img.src = "resources/DeclipIconOff.png";
      declip_activate_button.firstChild.data = "Activate";
    }

    var noise_removal_activate_button = document.getElementById("noise_removal_activate_button");
    var noise_removal_div = document.getElementById("noise_removal_image");
    if(IndexGlobal.STATE.noise_removal_active) {
      noise_removal_div.src = "resources/RemoveNoiseIconOn.png";
      noise_removal_activate_button.firstChild.data = "Deactivate";
    }
    else {
      noise_removal_div.src = "resources/RemoveNoiseIconOff.png";
      noise_removal_activate_button.firstChild.data = "Activate";
    }

    var auto_eq_activate_button = document.getElementById("auto_eq_activate_button");
    var auto_eq_img = document.getElementById("auto_eq_image");
    if(IndexGlobal.STATE.auto_eq_active) {
      auto_eq_img.src = "resources/AutoEQIconOn.png";
      auto_eq_activate_button.firstChild.data = "Deactivate";
    }
    else {
      auto_eq_img.src = "resources/AutoEQIconOff.png";
      auto_eq_activate_button.firstChild.data = "Activate";
    }
  }

  function FlushIndex() {
    FlushState();

    IndexGlobal.FILE_NAME = "";
    IndexGlobal.INPUT_AUDIO_BUFFER = [];
    IndexGlobal.SHORT_CLIP_INTERVALS = [];
    IndexGlobal.LONG_CLIP_INTERVALS = [];
    IndexGlobal.PROCESSED_AUDIO_BUFFER = [];
    IndexGlobal.NOISE_PROFILE = [];
    IndexGlobal.NOISE_REGION_START = -1;
    IndexGlobal.NOISE_REGION_STOP = -1;
  }

  function FlushState() {
    IndexGlobal.STATE.audio_loaded = false;
    IndexGlobal.STATE.did_clipping_detection = false;
    IndexGlobal.STATE.did_declip_short_bursts = false;
    IndexGlobal.STATE.did_declip_long_bursts = false;
    IndexGlobal.STATE.did_profile_noise = false;
    IndexGlobal.STATE.did_remove_noise = false;

    IndexGlobal.STATE.declip_active = false;
    IndexGlobal.STATE.noise_removal_active = false;
    IndexGlobal.STATE.auto_eq_active = false;
  }

  function ShouldAllowWaveformInteraction() {
    return IndexGlobal.STATE.audio_loaded;
  }

  function ShouldEnableDetectClipping() {
    return IndexGlobal.STATE.audio_loaded;
  }

  function ShouldEnableDeclipShortBursts() {
    return IndexGlobal.STATE.audio_loaded && IndexGlobal.STATE.did_clipping_detection;
  }

  function ShouldEnableGetKnownPoints() {
    return IndexGlobal.STATE.audio_loaded && IndexGlobal.STATE.did_clipping_detection && IndexGlobal.STATE.did_declip_short_bursts;
  }

  function ShouldEnableDeclipLongBursts() {
    return IndexGlobal.STATE.audio_loaded && IndexGlobal.STATE.did_clipping_detection && IndexGlobal.STATE.did_declip_short_bursts && IndexGlobal.STATE.did_get_known_points;
  }

  // Button handlers.
  function ToggleWaveformHandler(event) {
    IndexGlobal.WAVEFORM_INTERACTOR.ToggleActiveWaveSurfer();
  }

  function PlayPauseHandler(event) {
    IndexGlobal.WAVEFORM_INTERACTOR.PlayPausePressed();
  }

  function PlaySelectionHandler(event) {
    IndexGlobal.WAVEFORM_INTERACTOR.PlayRegion();
  }

  function ZoomInHandler(event) {
    IndexGlobal.WAVEFORM_INTERACTOR.ZoomIn();
  }

  function ZoomOutHandler(event) {
    IndexGlobal.WAVEFORM_INTERACTOR.ZoomOut();
  }

  /* Public variables go here. */
  return {

  };
});