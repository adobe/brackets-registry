/*global Dropzone, $, document, window, URL*/

$(function () {
    "use strict";

    function revealFactory(options) {
        $('#customModal').remove();

        var $modalTemplate = $('<div id="customModal" class="reveal-modal" data-reveal aria-labelledby="modalHeader" aria-hidden="true" role="dialog"><h3 id="modalHeader"></h3><div id="modalBody"><p id="modalMessage"></p></div><div id="modalButtons" class="right"><button id="modalOk">Ok</button><button id="modalCancel">Cancel</button></div><a class="close-reveal-modal" aria-label="Close">&#215;</a></div>');

        var $inputTemplate = $('<input id="modalInput" type="text">'),
            dismissFunction = function () {
                $('#customModal').foundation('reveal', 'close');
            };

        if (options["prompt"]) {
            if (options["placeholder"]) {
                $inputTemplate.val(options["placeholder"]);
            }
            $modalTemplate.find("#modalBody").append($inputTemplate);
        }

        $modalTemplate.find("#modalHeader").text(options["title"]);
        $modalTemplate.find("#modalMessage").text(options["message"]);
        $modalTemplate.find("#modalOk").click(options["onOk"]);
        $modalTemplate.find("#modalCancel").click(options["onCancel"] || dismissFunction);

        $modalTemplate.appendTo($('body'));
        $modalTemplate.foundation('reveal').foundation('reveal', 'open');
    }

    var revealDialog = {
        prompt: function (options) {
            options["prompt"] = true;
            revealFactory(options);
        },
        confirm: revealFactory
    };


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
                $.ajax("/user-extensions")
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

    function displayStatus(type, message) {
        var $alert = $('<div data-alert class="alert-box radius"></div>'),
            $close = $('<a href="#" class="close">&times;</a>');
        
        message = $('<div>').html(message);
        
        $alert.addClass(type);
        $alert.text($(message).text());;
        $alert.append($close);
        
        $("#custom-alert").append($alert);
        $(document).foundation();
    }

    function displayErrorResult(errorResult) {
        displayStatus("alert", errorResult.responseText);
    }

    $("body").on("click", "button.delete", function (event) {
        var $target = $(event.target),
            name = $target.data("name");

        revealDialog.confirm({
            title: "Delete",
            message: "Really delete " + name + "?",
            onOk: function () {
                $('#customModal').foundation('reveal', 'close');
                $.ajax("/package/" + name, {
                    type: "DELETE",
                    data: {
                        "_csrf": $("meta[name='csrf-token']").attr("content")
                    }
                }).then(function (result) {
                    displayStatus("success", name + " successfully deleted");
                    $.ajax("/user-extensions")
                    .done(function (content) {
                        $(".extension-list").html(content);
                    });
                }, displayErrorResult);
            }
        });
    });

    $("body").on("click", "button.changeOwner", function (event) {
        var $target = $(event.target),
            name = $target.data("name");

        revealDialog.prompt({
            title: "Change Owner",
            message: "Enter the GitHub username / organization of the new owner for " + name,
            onOk: function () {
                var newOwner = $("#modalInput").val();
                $('#customModal').foundation('reveal', 'close');
                if (newOwner === null) {
                    return;
                }
                if (!newOwner) {
                    displayStatus("info", "No new owner provided. No action taken.");
                    return;
                }

                $.ajax("/package/" + name + "/changeOwner", {
                    type: "POST",
                    data: {
                        "_csrf": $("meta[name='csrf-token']").attr("content"),
                        newOwner: newOwner
                    }
                }).then(function (result) {
                    displayStatus("success", name + " owner changed to " + newOwner);
                    $.ajax("/user-extensions")
                    .done(function (content) {
                        $(".extension-list").html(content);
                    });
                }, displayErrorResult);
            }
        });
    });

    $("body").on("click", "button.changeRequirements", function (event) {
        var $target = $(event.target),
            name = $target.data("name"),
            existing = $target.data("existing");

        revealDialog.prompt({
            title: "Change Requirements",
            message: "Update version requirements for all versions of your extension. Enter the Brackets version requirements as a semver range " + name,
            placeholder: existing,
            onOk: function (requirements) {
                var requirements = $("#modalInput").val();
                $('#customModal').foundation('reveal', 'close');
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
                    displayStatus("success", name + " requirements changed to " + requirements);
                    $.ajax("/user-extensions")
                    .done(function (content) {
                        $(".extension-list").html(content);
                    });
                }, displayErrorResult);
            }
        });
    });

    function _searchHandler() {
        if (!this.value) {
            return;
        }
        var dynamicQuery = "?q=" + this.value.toLowerCase();
        if (window.location.pathname.split('/').pop() !== 'search') {
            dynamicQuery = "search" + dynamicQuery;
        }
        var url = [window.location.protocol, '//', window.location.host, window.location.pathname, dynamicQuery].join('');
        window.location.href = url;
    }

    $(document).ready(function () {
        var url = new URL(window.location.href);
        var searchString = url.searchParams.get("q");
        if (searchString || (typeof searchString === "string" && !searchString.length)) {
            $("#search-registry").val(decodeURIComponent(searchString));
        } else {
            $(".extension-list.search-list").hide();
        }
        $(document).on("change", "#search-registry", _searchHandler);
    });

    $(document).on("click", ".ext-keywords li a", function () {
        var dynamicQuery = "?q=keywords:" + encodeURIComponent($(this).text());
        if (window.location.pathname.split('/').pop() !== 'search') {
            dynamicQuery = "search" + dynamicQuery;
        }
        var url = [window.location.protocol, '//', window.location.host, window.location.pathname, dynamicQuery].join('');
        window.location.href = url;
    });
});
