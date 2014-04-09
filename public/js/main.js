/*global Dropzone, $, bootbox */

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
            this.on("sending", function (file, xhr, formData) {
                formData.append("_csrf", $("meta[name='csrf-token']").attr("content"));
            });
        },
        accept: function (file, done) {
            if (!file.name.match(/\.zip$/i)) {
                done("Extension packages must be zip files.");
            } else {
                done();
            }
        }
    };

    function displayErrorResult(errorResult) {
        var $alert = $("<div>"),
            $button = $("<button>");
        $alert.addClass("alert").addClass("alert-danger").addClass("alert-dismissable");
        $button.addClass("close").attr("data-dismiss", "alert").html("&times;");
        $alert.append($button);
        $("<div>").appendTo($alert).html(errorResult.responseText);
        $("#alertspace").append($alert);
    }

    $("body").on("click", "button.delete", function (event) {
        var $target = $(event.target),
            name = $target.data("name");
        bootbox.confirm("Really delete " + name + "?", function (result) {
            if (!result) {
                return;
            }
            $.ajax("/package/" + name, {
                type: "DELETE",
                data: {
                    "_csrf": $("meta[name='csrf-token']").attr("content")
                }
            }).then(function (result) {
                var $alert = $("<div>"),
                    $button = $("<button>");
                $alert.addClass("alert").addClass("alert-success").addClass("alert-dismissable");
                $button.addClass("close").attr("data-dismiss", "alert").html("&times;");
                $alert.append($button);
                $alert.append(name + " successfully deleted");
                $("#alertspace").append($alert);
                $target.parents("tr").remove();
            }, displayErrorResult);
        });
    });

    $("body").on("click", "button.changeOwner", function (event) {
        var $target = $(event.target),
            name = $target.data("name");
        bootbox.prompt("Enter the GitHub username of the new owner for " + name, function (newOwner) {
            if (!newOwner) {
                return;
            }
            $.ajax("/package/" + name + "/changeOwner", {
                type: "POST",
                data: {
                    "_csrf": $("meta[name='csrf-token']").attr("content"),
                    newOwner: newOwner
                }
            }).then(function (result) {
                var $alert = $("<div>"),
                    $button = $("<button>");
                $alert.addClass("alert").addClass("alert-success").addClass("alert-dismissable");
                $button.addClass("close").attr("data-dismiss", "alert").html("&times;");
                $alert.append($button);
                $alert.append(name + " owner changed to " + newOwner);
                $("#alertspace").append($alert);
                $.ajax("/registryList", { datatype: "html" })
                    .done(function (content) {
                        $(".extension-list").html(content);
                    });
            }, displayErrorResult);
        });
    });

    $("body").on("click", "button.changeRequirements", function (event) {
        var $target = $(event.target),
            name = $target.data("name"),
            existing = $target.data("existing");

        bootbox.prompt({
            title: "Enter the Brackets version requirements as a semver range " + name,
            value: existing,
            callback: function (requirements) {
                if (requirements === null) {
                    return;
                }
                $.ajax("/package/" + name + "/changeRequirements", {
                    type: "POST",
                    data: {
                        "_csrf": $("meta[name='csrf-token']").attr("content"),
                        requirements: requirements
                    }
                }).then(function (result) {
                    var $alert = $("<div>"),
                        $button = $("<button>");
                    $alert.addClass("alert").addClass("alert-success").addClass("alert-dismissable");
                    $button.addClass("close").attr("data-dismiss", "alert").html("&times;");
                    $alert.append($button);
                    $alert.append(name + " requirements changed to " + requirements);
                    $("#alertspace").append($alert);
                    $.ajax("/registryList", { datatype: "html" })
                        .done(function (content) {
                            $(".extension-list").html(content);
                        });
                }, displayErrorResult);
            }
        });
    });
});
