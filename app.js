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
    repository = require("./lib/repository"),
    routes = require("./lib/routes"),
    logging = require("./lib/logging");

// Load cert and secret configuration
var config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "config/config.json"))),
    key,
    cert;

config.hostname = config.hostname || "localhost";
config.securePort = config.securePort || 4040;
config.redirectPort = config.redirectPort || 4000;
config.storage = config.storage || "./ramstorage.js";
config.repositoryBaseURL = config.repositoryBaseURL || "";
config.helpURL = config.helpURL || "";
config.admins = config.admins || [];

// Load the custom footer HTML from disk, if it's defined.
if (config.customFooter) {
    config.customFooter = fs.readFileSync(config.customFooter);
} else {
    config.customFooter = "";
}

var callbackScheme = "https://",
    callbackPort = config.securePort;
// We just use HTTP on localhost for testing
if (config.hostname === "localhost" && config.port) {
    callbackScheme = "http://";
    callbackPort = config.port;
}

if (!config.insecure) {
    key = fs.readFileSync(path.resolve(__dirname, "config/certificate.key"));
    cert = fs.readFileSync(path.resolve(__dirname, "config/certificate.cert"));
}

// Check for other required config parameters
["githubClientId", "githubClientSecret", "sessionSecret"].forEach(function (param) {
    if (!config[param]) {
        throw new Error("Configuration error: must specify " + param + " in config.json");
    }
});

// Configure submodules
logging.configure(config);
repository.configure(config);

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
            callbackURL: callbackScheme + config.hostname + ":" + callbackPort + "/auth/github/callback"
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
    app.use(express.favicon(path.resolve(__dirname, "public/favicon.ico")));
    app.use(express.logger("dev"));
    app.use(express.limit("5mb"));
    app.use(express.cookieParser());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.session({ secret: config.sessionSecret }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(express.csrf());
    app.use(function (req, res, next) {
        // Must come before router (so locals are exposed properly) but after the CSRF middleware
        // (so _csrf is set).
        res.locals.csrfToken = req.csrfToken();
        next();
    });
    app.use(app.router);
    // JSLint doesn't like "express.static" because static is a keyword.
    app.use(express["static"](path.resolve(__dirname, "public")));
    
    // This is used for local testing with the FileStorage
    if (config.directory) {
        app.use("/files", express["static"](path.resolve(__dirname, config.directory)));
    }
});

// Set up routes
routes.setup(app, config);

if (config.hostname === "localhost" && config.port) {
    http.createServer(app).listen(config.port);
    console.log("HTTP Listening on ", config.port);
} else {
    // Start the HTTPS server
    https.createServer({key: key, cert: cert}, app).listen(config.securePort);
    console.log("HTTPS Listening on ", config.securePort);

    // Redirect HTTP to HTTPS
    http.createServer(function (req, res) {
        res.writeHead(301, {
            'Content-Type': 'text/plain',
            'Location': 'https://' + config.hostname + ":" + config.securePort + req.url
        });
        res.end('Redirecting to SSL\n');
    }).listen(config.redirectPort);
}

// If it's configured, turn on the REPL for localhost
if (config.repl) {
    var replify = require("replify");
    replify({
        name: "registry"
    }, app, {
        repository: repository,
        logging: logging
    });
}
