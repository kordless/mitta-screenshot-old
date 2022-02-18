var height_limit = 8500;

(function() {

  var shared = {};
  var templates = {};

  function screenshotBegin(shared) {
    var scrollNode = document.scrollingElement || document.documentElement;

    shared.originalScrollTop = scrollNode.scrollTop;
    shared.tab.hasVscrollbar = (window.innerHeight < scrollNode.scrollHeight);
    scrollNode.scrollTop = 0;
    setTimeout(function() { screenshotVisibleArea(shared); }, 500);
  }

  function screenshotVisibleArea(shared) {
    chrome.extension.sendMessage(
      { action: 'screenshotVisibleArea', shared: shared }
    ); 
  }

  function screenshotScroll(shared) {
    var scrollNode = document.scrollingElement || document.documentElement;
    var scrollTopBeforeScrolling = scrollNode.scrollTop;

    scrollNode.scrollTop += window.innerHeight;

    if (scrollNode.scrollTop == scrollTopBeforeScrolling || scrollNode.scrollTop > height_limit) {
      shared.imageDirtyCutAt = scrollTopBeforeScrolling % (window.innerHeight);
      scrollNode.scrollTop = shared.originalScrollTop;
      screenshotEnd(shared);
    } else {
      setTimeout(function() { screenshotVisibleArea(shared); }, 501);
    }
  }

  function screenshotEnd(shared) { 
    chrome.extension.sendMessage(
      { action: 'screenshotEnd', shared: shared }
    ); 
  }

  function screenshotReturn(shared) {
    function pad2(str) { if ((str + "").length == 1) return "0" + str; return "" + str; }

    var d = new Date();
    var timestamp = '' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '-' + pad2(d.getHours()) + '' + pad2(d.getMinutes()) + '\'' + pad2(d.getSeconds()) + '';
    var filename = "pageshot of '" + normalizeFileName(shared.tab.title) + "' @ " + timestamp;
    var blobURL = dataToBlobURL(shared.imageDataURL);
  }

  function eventManagerInit() {
    var self = this;
    chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
        switch (request.action) {
          case "screenshotBegin": screenshotBegin(request.shared); break;
          case "screenshotScroll": screenshotScroll(request.shared); break;
          case "screenshotReturn": screenshotReturn(request.shared); break;
        }

        sendResponse(true);
    });
  }

  eventManagerInit();

  function appendTemplate(templateString, data, callback) {
    var templatePrepared = templateString;

    for(var key in data) {
      templatePrepared = templatePrepared.replace(new RegExp("{" + key + "}", "g"), data[key]);
    }

    var div = window.document.createElement('div');
    div.innerHTML = templatePrepared;
    window.document.body.appendChild(div);

    callback(div);
  }

  function dataToBlobURL(dataURL) {
    var parts = dataURL.match(/data:([^;]*)(;base64)?,([0-9A-Za-z+/]+)/);

    if (parts && parts.length >= 3) {
      // Assume base64 encoding
      var binStr = atob(parts[3]);

      // Convert to binary in ArrayBuffer
      var buf = new ArrayBuffer(binStr.length);
      var view = new Uint8Array(buf);
      for(var i = 0; i < view.length; i++)
        view[i] = binStr.charCodeAt(i);

      // Create blob with mime type, create URL for it
      var blob = new Blob([view], {'type': parts[1]});
      var objectURL = window.URL.createObjectURL(blob)

      return objectURL;
    } else {
      return null;
    }
  }

  function normalizeFileName(string) {
    out = string;
    out = out.replace(/[^a-zA-Z0-9_\-+,;'!?$£@&%()\[\]=]/g, " ").replace(/ +/g, " ");
    return out;
  }
})();
