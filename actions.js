var UI = {
  status: function(text, timed) {
    chrome.browserAction.setBadgeBackgroundColor({"color": [0, 0, 0, 0]});
    chrome.browserAction.setBadgeText({ text: text });

    if (timed > 0) {
      setTimeout(function() {
        chrome.browserAction.setBadgeText({ text: "" });
      }, timed);
    }
  }
}

chrome.browserAction.onClicked.addListener(function(tab) {
  chrome.browserAction.setBadgeBackgroundColor({"color": [0, 0, 0, 0]});
  UI.status("🤖", 3000);
  Screenshotter.grab();
});
