/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, nomen: true, node: true, indent: 4, maxerr: 50 */

"use strict";

var passport = require("passport"),
    repository = require("./repository"),
    hbs = require("hbs"),
    fs = require("fs"),
    path = require("path");

// TODO: localize
var _stringMap = {
    // Route handler errors
    "NO_FILE"                   : "No file was specified for upload.",
    "NOT_ACCEPTABLE"            : "I can only give you HTML or JSON.",
    
    // Registry errors
    "NOT_AUTHORIZED"            : "You are not the owner of this extension, so you can't update it.",
    "BAD_VERSION"               : "The new package's version is older than (or the same as) the latest uploaded version.",
    "REGISTRY_NOT_LOADED"       : "The registry has not been loaded. Please try again later.",
    "VALIDATION_FAILED"         : "The extension package is invalid:",
    
    // Validation errors
    "INVALID_ZIP_FILE"          : "The uploaded content is not a valid zip file.",
    "INVALID_PACKAGE_JSON"      : "The package.json file is not valid (error was: {0}).",
    "MISSING_PACKAGE_NAME"      : "The package.json file doesn't specify a package name.",
    "BAD_PACKAGE_NAME"          : "{0} is an invalid package name (valid package names contain only lowercase letters, numbers, '.', '-' and '_'). Use 'title' for a display name.",
    "MISSING_PACKAGE_VERSION"   : "The package.json file doesn't specify a package version.",
    "INVALID_VERSION_NUMBER"    : "The package version number ({0}) is invalid.",
    "MISSING_MAIN"              : "The package has no main.js file.",
    "MISSING_PACKAGE_JSON"      : "The package has no package.json file.",
    
    // Unknown error
    "UNKNOWN_ERROR"             : "An error occurred, but unfortunately I don't know how to say this nicely:"
};

// Error handling

// From Brackets StringUtils.js.
/**
 * Format a string by replacing placeholder symbols with passed in arguments.
 *
 * Example: var formatted = StringUtils.format("Hello {0}", "World");
 *
 * @param {string} str The base string
 * @param {...} Arguments to be substituted into the string
 *
 * @return {string} Formatted string
 */
function format(str) {
    // arguments[0] is the base string, so we need to adjust index values here
    var args = [].slice.call(arguments, 1);
    return str.replace(/\{(\d+)\}/g, function (match, num) {
        return typeof args[num] !== "undefined" ? args[num] : match;
    });
}

function _mapError(key) {
    return (_stringMap[key] || _stringMap.UNKNOWN_ERROR + " " + key);
}

function _formatError(err) {
    if (Array.isArray(err)) {
        err[0] = _mapError(err[0]);
        return format.apply(null, err);
    } else {
        return _mapError(err);
    }
}

function _toErrorMessageList(err) {
    var result;
    if (err instanceof Error) {
        result = [_mapError(err.message)];
        if (err.errors) {
            // Each error might be an array where the first item is a key and the rest are
            // substitution arguments.
            Array.prototype.push.apply(result, err.errors.map(_formatError));
        }
    } else {
        // Some other type of object--shouldn't get this normally.
        result = [_mapError(err)];
    }
    return result;
}

// Template helpers and partials

hbs.registerPartial("registryList",
    fs.readFileSync(path.resolve(__dirname, "../views/registryList.html"), "utf8"));

function _lastVersionDate(object) {
    var result;
    if (object.versions && object.versions.length) {
        result = object.versions[object.versions.length - 1].published;
        if (result instanceof Date) {
            result = result.toISOString();
        }
        if (result) {
            // Just return the ISO-formatted date, which is the portion up to the "T".
            var dateEnd = result.indexOf("T");
            if (dateEnd !== -1) {
                result = result.substr(0, dateEnd);
            }
        }
    }
    return result || "";
}
hbs.registerHelper("lastVersionDate", _lastVersionDate);

function _formatUserId(id) {
    // Converts our internal user id into something more suitable for display.
    var friendlyName;
    if (id) {
        var nameComponents = id.split(":");
        friendlyName = nameComponents[1] + " (" + nameComponents[0] + ")";
    }
    return friendlyName;
}
hbs.registerHelper("formatUserId", _formatUserId);

function _ownerLink(id) {
    var url;
    if (id) {
        var nameComponents = id.split(":");
        if (nameComponents[0] === "github") {
            url = "https://github.com/" + nameComponents[1];
        }
    }
    return url;
}
hbs.registerHelper("ownerLink", _ownerLink);

function _getSortedRegistry() {
    function getPublishTime(entry) {
        return new Date(entry.versions[entry.versions.length - 1].published).getTime();
    }
    
    var registry = repository.getRegistry(),
        sortedEntries = [];

    // Sort the registry by last published date (newest first).
    Object.keys(registry).forEach(function (key) {
        sortedEntries.push(registry[key]);
    });
    sortedEntries.sort(function (entry1, entry2) {
        return getPublishTime(entry2) - getPublishTime(entry1);
    });
    
    return sortedEntries;
}

// General response functions

function _respond(req, res, htmlTemplate, data) {
    if (req.accepts("html")) {
        res.render(htmlTemplate, data);
    } else if (req.accepts("json")) {
        res.send(data);
    } else {
        res.status(406);
        res.send(_mapError("NOT_ACCEPTABLE"));
    }
}

function _respondUnauthorized(req, res, htmlTemplate, data) {
    res.status(401);
    res.set("WWW-Authenticate", "OAuth realm='https://registry.brackets.io'");
    _respond(req, res, htmlTemplate, data);
}

// Handlers for specific routes

function _index(req, res) {
    _respond(req, res, "index", {
        user: _formatUserId(req.user),
        registry: _getSortedRegistry()
    });
}

function _registryList(req, res) {
    _respond(req, res, "registryList", {
        layout: false,
        registry: _getSortedRegistry()
    });
}

function _authCallback(req, res) {
    res.redirect("/");
}

function _authFailed(req, res) {
    _respondUnauthorized(req, res, "authFailed");
}

function _logout(req, res) {
    req.logout();
    res.redirect("/");
}

function _upload(req, res) {
    if (!req.user) {
        // User isn't logged in.
        _respondUnauthorized(req, res, "authFailed");
    } else if (!req.files ||
            !req.files.extensionPackage ||
            !req.files.extensionPackage.path ||
            !req.files.extensionPackage.size) {
        // No file was specified in the request.
        res.status(400);
        _respond(req, res, "uploadFailed", {
            errors: _toErrorMessageList(new Error("NO_FILE"))
        });
    } else {
        // Try to add the extension to the repository.
        repository.addPackage(req.files.extensionPackage.path, req.user, function (err, entry) {
            fs.unlink(req.files.extensionPackage.path, function (unlinkErr) {
                // We ignore unlinkErr because it does not really affect the user.
                // It's also very unlikely.
                
                if (err) {
                    var responseData = {
                        errors: _toErrorMessageList(err)
                    };
                    if (err instanceof Error && err.message === "NOT_AUTHORIZED") {
                        // Return the proper status code for authorization failure.
                        _respondUnauthorized(req, res, "uploadFailed", responseData);
                    } else {
                        // Return a generic failure code.
                        res.status(400);
                        _respond(req, res, "uploadFailed", responseData);
                    }
                } else {
                    _respond(req, res, "uploadSucceeded", {entry: entry});
                }
            });
        });
    }
}

// Route setup

function setup(app) {
    app.get("/", _index);
    
    app.get("/registryList", _registryList);
    
    app.get(
        "/auth/github",
        passport.authenticate("github"),
        function (req, res) {
            // The request will be redirected to GitHub for authentication, so this
            // function will not be called.
        }
    );
    
    app.get(
        "/auth/github/callback",
        // TODO: show error in-place on failure
        passport.authenticate("github", { failureRedirect: "/auth/failed" }),
        _authCallback
    );
    
    app.get(
        "/auth/failed",
        _authFailed
    );
    
    app.get("/logout", _logout);
    
    app.post("/upload", _upload);
}

exports.setup = setup;
