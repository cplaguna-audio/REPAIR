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

var phase_audio;
var declipping_audio;
var playlist;
var tracks;
var current;

var WAIT_TIME = 200;

$(document).ready(function() {
  init_phase();
  init_declipping();

  $("#description_link_button").click(function() { 
    window.location='index.html';
  });

  function init_phase(){
    current = 0;
    phase_audio = $('#phase_player')[0];
    playlist = $('#phase_playlist');
    tracks = playlist.find('a.phase_track');
    len = tracks.length - 1;
    phase_audio.volume = .20;
    playlist.find('a').on('click', function(e){
        e.preventDefault();
        link = $(this);
        current = link.parent().index();
        run_phase(link, phase_audio);
        return false;
    });
  }

  function run_phase(link, player){
    player.src = link.attr('href');
    par = link.parent();
    $('.phase_active').removeClass('phase_active');
    par.addClass('phase_active');
    
    phase_audio.pause(); 

    setTimeout(function () {
      phase_audio.load();
      phase_audio.play(); 
      }, WAIT_TIME);
  }

  function init_declipping(){
    current = 0;
    declipping_audio = $('#declipping_player')[0];
    playlist = $('#declipping_playlist');
    tracks = playlist.find('a.declipping_track');
    len = tracks.length - 1;
    declipping_audio.volume = .20;
    playlist.find('a').on('click', function(e){
        e.preventDefault();
        link = $(this);
        current = link.parent().index();
        run_declipping(link, declipping_audio);
        return false;
    });
  }
  
  function run_declipping(link, player){
    player.src = link.attr('href');
    par = link.parent();
    $('.declipping_active').removeClass('declipping_active');
    par.addClass('declipping_active');

    declipping_audio.pause(); 

    setTimeout(function () { 
      declipping_audio.load();
      declipping_audio.play();
    }, WAIT_TIME);

  }
});