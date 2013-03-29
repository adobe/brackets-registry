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
    repository = require("./repository");

// TODO: localize
function _toErrorMessage(err) {
    if (Array.isArray(err) && err.length) {
        err = err[0];
    }
    if (err instanceof Error) {
        err = err.message;
    }
    
    switch (err) {
    case "NO_FILE":
        return "No file was specified for upload.";
    case "NOT_AUTHORIZED":
        return "You are not the owner of this extension, so you can't update it.";
    case "BAD_VERSION":
        return "The new package's version is older than (or the same as) the latest uploaded version.";
    default:
        return "An error occurred, but unfortunately I don't know how to say this nicely: " + err;
    }
}

function _index(req, res) {
    res.render("index", {user: req.user});
}

function _authCallback(req, res) {
    res.redirect("/");
}

function _authFailed(req, res) {
    res.render("authFailed");
}

function _logout(req, res) {
    req.logout();
    res.redirect("/");
}

function _upload(req, res) {
    if (!req.files ||
            !req.files.extensionPackage ||
            !req.files.extensionPackage.path ||
            !req.files.extensionPackage.size) {
        res.render("uploadFailed", {err: _toErrorMessage("NO_FILE")});
    } else {
        repository.addPackage(req.files.extensionPackage.path, req.user, function (err, entry) {
            if (err) {
                res.render("uploadFailed", {
                    err: _toErrorMessage(err)
                });
            } else {
                res.render("uploadSucceeded", {entry: entry});
            }
        });
    }
}

function setup(app) {
    app.get("/", _index);
    
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

// For unit testing only
exports._index = _index;
exports._authCallback = _authCallback;
exports._authFailed = _authFailed;
exports._logout = _logout;
exports._upload = _upload;