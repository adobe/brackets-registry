/*global Dropzone, $ */

$(function () {
    "use strict";
    
    Dropzone.options.uploadForm = {
        paramName: "extensionPackage",
        createImageThumbnails: false,
        dictDefaultMessage: "Drop extension zip files here, or click to browse",
        previewTemplate: "<div class=\"preview file-preview\">\n  <div class=\"details\">\n   <div class=\"filename\"><span></span></div>\n  </div>\n  <div class=\"progress\"><span class=\"upload\"></span></div>\n  <div class=\"success-mark\"><span>✔</span></div>\n  <div class=\"error-mark\"><span>✘</span></div>\n  <div class=\"error-message\"><span></span></div>\n  <div class=\"success-message\"><span></span></div>\n</div>",
        init: function () {
            this.on("error", function (file, response) {
                var msgObj, msg;
                try {
                    msgObj = JSON.parse(response);
                    msg = msgObj.errors.join(" ");
                } catch (e) {
                    // just use the input string
                    msg = response;
                }
                if (msg.indexOf("Request Entity Too Large") !== -1) {
                    // Node spits out a huge error message in this case. (Dropzone doesn't
                    // give us the status code, so we have to detect this by a string.)
                    msg = "Uploads are limited to 5MB.";
                }
                file.previewTemplate.querySelector(".error-message").innerHTML = msg;
            });
            this.on("success", function (file, responseObj) {
                // Dropzone appears to preparse the response for us.
                var msg, entry = responseObj.entry;
                msg = (entry.metadata.title || entry.metadata.name);
                if (entry.versions.length > 1) {
                    msg += " updated to version " + entry.versions[entry.versions.length - 1].version + ".";
                } else {
                    msg += " added to registry.";
                }
                file.previewTemplate.querySelector(".success-message").innerHTML = msg;
                $.ajax("/registryList", { datatype: "html" })
                    .done(function (content) {
                        $(".extension-list").html(content);
                    });
            });
        }
    };
});
