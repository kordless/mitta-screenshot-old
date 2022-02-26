var height_limit = 8500;

function dataURItoBlob(dataURI) {
    var byteString;
    if (dataURI.split(',')[0].indexOf('base64') >= 0)
        byteString = atob(dataURI.split(',')[1]);
    else
        byteString = unescape(dataURI.split(',')[1]);

    // separate out the mime component
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

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

  grab: function(e) {
    var self = this;

    this.imageDataURLPartial = [];

    chrome.windows.getCurrent(function(win) {
      chrome.tabs.query({ active: true, windowId: win.id }, function(tabs) {
        var tab = tabs[0];
        self.shared.tab = tab;

        var parts = tab.url.match(/https?:\/\/chrome.google.com\/?.*/);
        if (parts !== null) {
          alert("Due to security restrictions \non the Google Chrome Store, \Can't run here.\n\nTry on any other page. ;)\n\n\n");
          return false;
        }

        chrome.tabs.sendMessage(self.shared.tab.id, { action: 'heartbeat' }, function(response) {
          if (!response) {
            UI.status("❌", 5000);
            alert("Please wait for the page to finish loading. If you just installed the extension, please reload the page.\n\n");
          }
        });

        self.screenshotBegin(self.shared);
      });
    });
  },

  screenshotBegin: function(shared) { chrome.tabs.sendMessage(this.shared.tab.id, { action: 'screenshotBegin', shared: shared }); },

  screenshotVisibleArea: function(shared) {
    var self = this;
    chrome.tabs.captureVisibleTab(null, { format: "png", quality: 80 }, function(dataUrl) {
      if (dataUrl) {
        self.imageDataURLPartial.push(dataUrl);
        self.screenshotScroll(shared);
      } else {
        alert("Not able to grab the screenshot of the active tab.\n\n");
        return false;
      }
    });
  },

  screenshotScroll: function(shared) { chrome.tabs.sendMessage(this.shared.tab.id, { action: 'screenshotScroll', shared: shared }); },

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
    chrome.tabs.sendMessage(this.shared.tab.id, { action: 'screenshotReturn', shared: shared });
    var domain = "https://mitta.us";
    // var domain = "http://localhost:8080";

    var url = shared.tab.url;
    var title = shared.tab.title;
    var sidekick = "none";

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

  eventManagerInit: function() {
    var self = this;
    chrome.extension.onMessage.addListener(function(e) {
        switch (e.action) {
          case "grab": self.grab(); break;
          case "screenshotVisibleArea": self.screenshotVisibleArea(e.shared); break;
          case "screenshotEnd": self.screenshotEnd(e.shared); break;
        }
    });
  },

  recursiveImageMerge: function(imageDataURLs, imageDirtyCutAt, hasVscrollbar, callback, images, i) {
    var fx = arguments.callee;
    i = i || 0;
    images = images || [];

    if (i < imageDataURLs.length) {
      images[i] = new Image();
      images[i].onload = function() {
        imageDataURLs[i] = null;
        if (i == imageDataURLs.length - 1) {
          var canvas = window.document.createElement('canvas');

          canvas.width = images[0].width - (hasVscrollbar ? 15 : 0); // <-- manage V scrollbar

          if (images.length > 1) canvas.height = (imageDataURLs.length - 1) * images[0].height + imageDirtyCutAt;
          else canvas.height = images[0].height;

          if (canvas.height > height_limit) {
            canvas.height = height_limit;
          }

          for (var j = 0; j < images.length; j++) {
            var cut = 0;
            if (images.length > 1 && j == images.length - 1) cut = images[j].height - imageDirtyCutAt;

            var height = images[j].height - cut;
            var width = images[j].width;

            canvas.getContext("2d").drawImage(images[j], 0, cut, width, height, 0, j * images[0].height, width, height);
          }

          callback(canvas.toDataURL("image/png"));
        } else {
          fx(imageDataURLs, imageDirtyCutAt, hasVscrollbar, callback, images, ++i);
        }
      }
      images[i].src = imageDataURLs[i];
    }
  }
}

Screenshotter.eventManagerInit();