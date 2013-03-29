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

// Required modules
var express = require("express"),
    path = require("path"),
    fs = require("fs"),
    http = require("http"),
    https = require("https"),
    passport = require("passport"),
    GitHubStrategy = require("passport-github").Strategy,
    routes = require("./lib/routes");

// Load cert and secret configuration
var key = fs.readFileSync(path.resolve(__dirname, "config/certificate.key")),
    cert = fs.readFileSync(path.resolve(__dirname, "config/certificate.cert")),
    config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "config/config.json")));

config.hostname = config.hostname || "localhost";
config.port = config.port || 4040;
config.storage = config.storage || "./ramstorage.js";

// Set up Passport for authentication

// Session serialization. Since we don't need anything other than the registry user id
// (which is of the form "authservice:id"), we just pass the user id into and out
// of the session directly.
passport.serializeUser(function (registryUserId, done) {
    done(null, registryUserId);
});
passport.deserializeUser(function (registryUserId, done) {
    done(null, registryUserId);
});

// Set up the GitHub authentication strategy. The registry user id
// is just "github:" plus the user's GitHub username.
passport.use(
    new GitHubStrategy(
        {
            clientID: config.githubClientId,
            clientSecret: config.githubClientSecret,
            callbackURL: "https://" + config.hostname + ":" + config.port + "/auth/github/callback" // *** TODO: real callback URL
        },
        function (accessToken, refreshToken, profile, done) {
            done(null, "github:" + profile.username);
        }
    )
);

// Create and configure the app
var app = express();
app.configure(function () {
    app.set("views", path.resolve(__dirname, "views"));
    app.set("view engine", "html");
    app.engine("html", require("hbs").__express);
    app.use(express.logger("dev"));
    app.use(express.cookieParser());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.session({ secret: config.sessionSecret }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(app.router);
    // JSLint doesn't like "express.static" because static is a keyword.
    app.use(express["static"](path.resolve(__dirname, "public")));
});

// Set up routes
routes.setup(app);

// Start the HTTPS server
https.createServer({key: key, cert: cert}, app).listen(config.port);
