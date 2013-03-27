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

var passport = require("passport");

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
    // *** TODO: validate and then upload
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
