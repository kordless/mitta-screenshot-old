/*
 *  Screenshot (Previously Blipshot)
 *  Screenshotter.js
 *  Half of the screenshotter algorithm. See Screenshotter.DOM.js for the other half.
 *
 *  ==========================================================================================
 *
 *  Copyright (c) 2010-2017, Davide Casali.
 *  All rights reserved.
 *
 *  Bits related to Mitta Copyright (c) 2022, Kord Campbell.

 *  Redistribution and use in source and binary forms, with or without modification, are
 *  permitted provided that the following conditions are met:
 *
 *  Redistributions of source code must retain the above copyright notice, this list of
 *  conditions and the following disclaimer.
 *  Redistributions in binary form must reproduce the above copyright notice, this list of
 *  conditions and the following disclaimer in the documentation and/or other materials
 *  provided with the distribution.
 *  Neither the name of the Baker Framework nor the names of its contributors may be used to
 *  endorse or promote products derived from this software without specific prior written
 *  permission.
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 *  OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 *  SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 *  INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 *  PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 *  INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 *  LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 *  OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */
function dataURItoBlob(dataURI) {
    // convert base64/URLEncoded data component to raw binary data held in a string
    var byteString;
    if (dataURI.split(',')[0].indexOf('base64') >= 0)
        byteString = atob(dataURI.split(',')[1]);
    else
        byteString = unescape(dataURI.split(',')[1]);

    // separate out the mime component
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

    // write the bytes of the string to a typed array
    var ia = new Uint8Array(byteString.length);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ia], {type:mimeString});
}

var Screenshotter = {

  imageDataURL: [],

  shared: {
    imageDirtyCutAt: 0,
    imageDataURL: 0,

    originalScrollTop: 0,

    tab: {
      id: 0,
      url: "",
      title: "",
      hasVscrollbar: false
    }
  },

  // ****************************************************************************************** SCREENSHOT SEQUENCE START

  // 0
  grab: function(e) {
    /****************************************************************************************************
     * It's a chaos: the ball must bounce between background and script content since the first
     * can grab and the second can access the DOM (scroll)
     *
     * So the call stack is:
     *    grab (bg)
     *      screenshotBegin (script)
     *      loop {
     *        screenshotVisibleArea (bg)
     *        screenshotScroll (script)
     *      }
     *      screenshotEnd (bg)
     *      screenshotReturn (script)
     */
    var self = this;

    // ****** Reset screenshot container
    this.imageDataURLPartial = [];

    // ****** Get tab data
    chrome.windows.getCurrent(function(win) {
      chrome.tabs.query({ active: true, windowId: win.id }, function(tabs) {
        var tab = tabs[0];
        self.shared.tab = tab;

        // ****** Check if everything's is in order.
        var parts = tab.url.match(/https?:\/\/chrome.google.com\/?.*/);
        if (parts !== null) {
          alert("Due to security restrictions \non the Google Chrome Store, \Can't run here.\n\nTry on any other page. ;)\n\n\n");
          return false;
        }

        // ****** Check if script is loaded
        chrome.tabs.sendMessage(self.shared.tab.id, { action: 'heartbeat' }, function(response) {
          if (!response) {
            UI.status("❌", 5000);
            alert("Please wait for the page to finish loading. If you just installed the extension, please reload the page.\n\n");
          }
        });

        // ****** Begin!
        chrome.tabs.sendMessage(self.shared.tab.id, { action: 'blanketStyleSet', property: 'position', from: 'fixed', to: 'absolute' });
        self.screenshotBegin(self.shared);
      });
    });
  },

  // 1
  screenshotBegin: function(shared) { chrome.tabs.sendMessage(this.shared.tab.id, { action: 'screenshotBegin', shared: shared }); },

  // 2
  screenshotVisibleArea: function(shared) {
    var self = this;
    chrome.tabs.captureVisibleTab(null, { format: "png" /* png, jpeg */, quality: 80 }, function(dataUrl) {
      if (dataUrl) {
        // Grab successful
        self.imageDataURLPartial.push(dataUrl);
        self.screenshotScroll(shared);
      } else {
        // Grab failed, warning
        alert("Not able to grab the screenshot of the active tab.\n\n");
        return false;
      }
    });
  },

  // 3
  screenshotScroll: function(shared) { chrome.tabs.sendMessage(this.shared.tab.id, { action: 'screenshotScroll', shared: shared }); },

  // 4
  screenshotEnd: function(shared) {
    var self = this;
    UI.status("📷", 3000);

    this.recursiveImageMerge(this.imageDataURLPartial, shared.imageDirtyCutAt, shared.tab.hasVscrollbar, function(image) {
      shared.imageDataURL = image;
      self.screenshotReturn(shared);
    });
  },

  // on return, we upload to a mitta spool if logged in
  screenshotReturn: function(shared) {

    $('#chrome-extension__mitta-dim').remove();
    chrome.tabs.sendMessage(this.shared.tab.id, { action: 'blanketStyleRestore', property: 'position' });
    chrome.tabs.sendMessage(this.shared.tab.id, { action: 'screenshotReturn', shared: shared });
    var domain = "https://mitta.us";
    //var domain = "http://localhost:8080";

    var url = shared.tab.url; // we only send the url so it may be placed in user's index
    var title = shared.tab.title; // title can be used to look up stored records
    var sidekick = "none"; // target index (user controled)

    // file stuff
    var blob = dataURItoBlob(shared.imageDataURL);
    var fd = new FormData();
    fd.append("data", blob, "screenshot");

    // GET settings
    $.getJSON(
      // get the user's preferred index
      domain+"/p/sidekick"
    ).done(function(data) {
      // load default sidekick nick name
      sidekick = data.setting.value;

      // GET a document matching the url from the sidekick's index, if available
      var request_url = domain+"/s/"+sidekick+'?line=!search url_str:"'+encodeURIComponent(url)+'"';

      $.getJSON(
        // user request to encode the url and submit it for storage
        // users must have an account and agree to terms on mitta.us/legal
        request_url
      ).done(function(data) {

        UI.status("💾", 3000);
        // upload image to existing document
        if (data.response.docs[0]) {
          var spool = data.response.docs[0]['spool'];
          var document_id = data.response.docs[0]['document_id'];
          var upload_url = domain + "/u/" + spool + "?document_id=" + document_id;

          // upload the image to the spool (passes in document_id)
          $.ajax({
            url: upload_url,
            type: 'POST',
            data: fd,
            processData: false,
            contentType: false
          }).done(function(){
            UI.status("👍🏽", 3000);
          }).fail(function(){
            alert("An error occurred and the files were not sent.");
          });

        } else {
          // find or create a spool from url or title
          $.ajax({
            url: domain+"/u",
            type: 'POST',
            data: JSON.stringify({
              title: title,
              url: encodeURIComponent(url),
              tags: ["#url"]
            }),
            contentType: 'application/json',
            dataType: 'json'
          }).done(function(data){
            // upload url
            var nick = data['nick'];
            var upload_url = domain + "/u/" + nick;
            var spool_name = data['name'];

            // create a new document via the APIs
            $.ajax({
              url: domain+"/i/"+sidekick,
              type: 'POST',
              data: JSON.stringify([{
                line: "!crawl " + encodeURIComponent(url),
                url: url,
                title: title,
                spool: spool_name 
              }]),
              contentType: 'application/json',
              dataType: 'json'
            }).done(function(data){
              var document_id = data['docs'][0]['document_id'];
              upload_url = upload_url + "?document_id=" + document_id;
              // upload the image to the spool (passes in document_id)
              $.ajax({
                url: upload_url,
                type: 'POST',
                data: fd,
                processData: false,
                contentType: false
              }).done(function(){
                UI.status("👍🏽", 3000);
              }).fail(function(xhr, textStatus, errorThrown){
                alert("An error occurred and no upload was done.");
              });

            }).fail(function(){
              // fail on new document request
              alert("Error requesting new document.")    
            });

          }).fail(function(xhr, textStatus, errorThrown){
            alert("Error trying to find document.");
          });  
        
        } // end else

      }); // end get document


    }).fail(function() {
      UI.status("❌", 5000);
      alert("Please login to Mitta to enable uploads.");
    });
    // end settings GET

  },

  // ****************************************************************************************** EVENT MANAGER / HALF
  eventManagerInit: function() {
    /****************************************************************************************************
     * This function prepares the internal plugin callbacks to bounce between the plugin and DOM side.
     * It's initialized at the end of this file.
     */
    var self = this;
    chrome.extension.onMessage.addListener(function(e) {
        switch (e.action) {
          case "grab": self.grab(); break;
          case "screenshotVisibleArea": self.screenshotVisibleArea(e.shared); break;
          case "screenshotEnd": self.screenshotEnd(e.shared); break;
        }
    });
  },

  // ****************************************************************************************** SUPPORT
  recursiveImageMerge: function(imageDataURLs, imageDirtyCutAt, hasVscrollbar, callback, images, i) {
    /****************************************************************************************************
     * This function merges together all the pieces gathered during the scroll, recursively.
     * Returns a single data:// URL object from canvas.toDataURL("image/png") to the callback.
     */
    var fx = arguments.callee;
    i = i || 0;
    images = images || [];

    if (i < imageDataURLs.length) {
      images[i] = new Image();
      images[i].onload = function() {
        imageDataURLs[i] = null; // clear for optimize memory consumption (not sure)
        if (i == imageDataURLs.length - 1) {
          // ****** We're at the end of the chain, let's have fun with canvas.
          var canvas = window.document.createElement('canvas');

          // NOTE: Resizing a canvas is destructive, we can do it just now before stictching
          canvas.width = images[0].width - (hasVscrollbar ? 15 : 0); // <-- manage V scrollbar

          if (images.length > 1) canvas.height = (imageDataURLs.length - 1) * images[0].height + imageDirtyCutAt;
          else canvas.height = images[0].height;

          // Ouch: Skia / Chromium limitation
          // https://bugs.chromium.org/p/chromium/issues/detail?id=339725
          // https://bugs.chromium.org/p/skia/issues/detail?id=2122
          if (canvas.height > 8500) canvas.height = 8500;

          // ****** Stitch
          for (var j = 0; j < images.length; j++) {
            var cut = 0;
            if (images.length > 1 && j == images.length - 1) cut = images[j].height - imageDirtyCutAt;

            var height = images[j].height - cut;
            var width = images[j].width;

            canvas.getContext("2d").drawImage(images[j], 0, cut, width, height, 0, j * images[0].height, width, height);
          }

          callback(canvas.toDataURL("image/png")); // --> CALLBACK (note that the file type is used also in the drag function)
        } else {
          // ****** Down!
          fx(imageDataURLs, imageDirtyCutAt, hasVscrollbar, callback, images, ++i);
        }
      }
      images[i].src = imageDataURLs[i]; // Load!
    }
  }
}

/* \/ Initialize callback listeners */
Screenshotter.eventManagerInit();
/* /\ Initialize callback listeners */
