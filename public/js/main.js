/*global Dropzone, $ */

$(function () {
    "use strict";
    
    Dropzone.options.uploadForm = {
        paramName: "extensionPackage",
        init: function () {
            this.on("error", function (file, msg) {
                var msgObj;
                try {
                    msgObj = JSON.parse(msg);
                    msg = msgObj.errors.join(" ");
                } catch (e) {
                    // just use the input string
                }
                file.previewTemplate.querySelector(".error-message").innerHTML = msg;
            });
            this.on("success", function (file, msg) {
                $.ajax("/registryList", { datatype: "html" })
                    .done(function (content) {
                        $(".extension-list").html(content);
                    });
            });
        }
    };
});
