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

var passport        = require("passport"),
    repository      = require("./repository"),
    registry_utils  = require("./registry_utils"),
    hbs             = require("hbs"),
    fs              = require("fs"),
    path            = require("path"),
    RSS             = require("rss"),
    _               = require("lodash"),
    logging         = require("./logging"),
    semver          = require("semver");

var config;

// TODO: localize
var _stringMap = {
    // Route handler errors
    "NO_FILE"                   : "No file was specified for upload.",
    "NOT_ACCEPTABLE"            : "I can only give you HTML or JSON.",
    "INVALID_FILE_TYPE"         : "Extension packages must be zip files.",

    // Registry errors
    "NOT_AUTHORIZED"            : "You are not the owner of this extension, so you can't update it.",
    "BAD_VERSION"               : "The new package's version is older than (or the same as) the latest uploaded version.",
    "REGISTRY_NOT_LOADED"       : "The registry has not been loaded. Please try again later.",
    "VALIDATION_FAILED"         : "The extension package is invalid:",
    "UNKNOWN_EXTENSION"         : "No extension with that name is in the registry.",
    "NO_NEW_OWNER"              : "No new package owner provided.",
    "NO_NEW_REQUIREMENTS"       : "No new requirements provided",
    "INVALID_REQUIREMENTS"      : "The requirements given were not a valid semver specification.",

    // Validation errors
    "INVALID_ZIP_FILE"          : "The uploaded content is not a valid zip file.",
    "INVALID_PACKAGE_JSON"      : "The package.json file is not valid (error was: {0}).",
    "MISSING_PACKAGE_NAME"      : "The package.json file doesn't specify a package name.",
    "BAD_PACKAGE_NAME"          : "{0} is an invalid package name (valid package names contain only lowercase letters, numbers, '.', '-' and '_'). Use 'title' for a display name.",
    "MISSING_PACKAGE_VERSION"   : "The package.json file doesn't specify a package version.",
    "INVALID_VERSION_NUMBER"    : "The package version number ({0}) is invalid.",
    "MISSING_MAIN"              : "The package has no main.js file.",
    "MISSING_PACKAGE_JSON"      : "The package has no package.json file.",
    "DUPLICATE_TITLE"           : "Another extension with the title {{0}} already exists.",

    // Unknown error
    "UNKNOWN_ERROR"             : "An error occurred, but unfortunately I don't know how to say this nicely:"
};

/////////////////
// Error handling
/////////////////

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

/**
 * Returns the string table entry for a given error key, or a generic error if the key is unknown.
 * @param {string} key The error key to map to a string.
 * @return {string} The mapped string.
 */
function _mapError(key) {
    return (_stringMap[key] || _stringMap.UNKNOWN_ERROR + " " + key);
}

/**
 * Formats the given error.
 * @param {string|Array.<string>} error If it's an array, the first entry is taken as the error key whose string
 * contains placeholders like {0}, {1}, etc., and the rest are substitution arguments. If it's a string,
 * then it's assumed to just be a key with no substitutions.
 * @return {string} The formatted error.
 */
function _formatError(err) {
    if (Array.isArray(err)) {
        err[0] = _mapError(err[0]);
        return format.apply(null, err);
    } else {
        return _mapError(err);
    }
}

/**
 * Converts the given error object into an array of error strings.
 * @param {Error} err An Error object with a message (which should be an error key) and an optional
 * "errors" property containing an array of arrays, each of which is suitable to pass to `_formatError()`.
 * @return {Array.<string>} Array of formatted error strings for display.
 */
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
["lastVersionDate", "formatUserId", "ownerLink", "authorInfo"].forEach(function (helper) {
    hbs.registerHelper(helper, registry_utils[helper]);
});

/////////////////////////////
// General response functions
/////////////////////////////

/**
 * Respond with the given info, rendering it for JSON or HTML depending on what the client wants.
 * @param {object} req The Express request object.
 * @param {object} res The Express response object.
 * @param {string} htmlTemplate The Handlebars template to use if returning HTML.
 * @param {object} data The data to flow into the template (if HTML) or to return as JSON.
 */
function _respond(req, res, htmlTemplate, data) {
    if (req.accepts("html")) {
        data = data || {};
        data.customFooter = config.customFooter;
        res.render(htmlTemplate, data);
    } else if (req.accepts("json")) {
        res.send(data);
    } else {
        res.status(406);
        res.send(_mapError("NOT_ACCEPTABLE"));
    }
}

/**
 * Respond with a 401 Unauthorized code and the appropriate WWw-Authenticate header, along with
 * a body containing the given info.
 * @param {object} req The Express request object.
 * @param {object} res The Express response object.
 * @param {string} htmlTemplate The Handlebars template to use if returning HTML.
 * @param {object} data The data to flow into the template (if HTML) or to return as JSON.
 */
function _respondUnauthorized(req, res, htmlTemplate, data) {
    res.status(401);
    res.set("WWW-Authenticate", "OAuth realm='https://registry.brackets.io'");
    _respond(req, res, htmlTemplate, data);
}

/**
 * Gets registry list suitable for display. The list is sorted and entries
 * for which the user has admin privileges have a `canAdmin` flag on them.
 */
function _getRegistryList(user) {
    var registryList = registry_utils.sortRegistry(repository.getRegistry());

    if (user) {
        var isAdmin = config.admins.indexOf(user) > -1;
        registryList = registryList.map(function (entry) {
            if (isAdmin || entry.owner === user) {
                var newEntry = _.clone(entry);
                newEntry.canAdmin = true;
                return newEntry;
            }
            return entry;
        });
    }

    return registryList;
}

///////////////////////////////
// Handlers for specific routes
///////////////////////////////

function _index(req, res) {
    var registryList = _getRegistryList(req.user);

    _respond(req, res, "index", {
        user: registry_utils.formatUserId.call({owner: req.user}),
        registry: registryList,
        repositoryBaseURL: config.repositoryBaseURL,
        helpURL: config.helpURL
    });
}

function _rss(req, res) {
    var items = registry_utils.sortRegistry(repository.getRegistry());

    //max of 10
    items = items.splice(0, 10);

    //If no config.rss, set some defaults
    config.rss = config.rss || {};
    config.rss.title = config.rss.title || "";
    config.rss.description = config.rss.description || "";
    config.rss.feedURL = config.rss.feedURL || "";
    config.rss.siteURL = config.rss.siteURL || "";

    var feed = new RSS({
        title: config.rss.title,
        description: config.rss.description,
        feed_url: config.rss.feedURL,
        site_url: config.rss.siteURL
    });

    items.forEach(function (itm) {
        var author = "";
        var title = itm.metadata.title || itm.metadata.name || "";

        if (itm.metadata.author && itm.metadata.author.name) {
            author = itm.metadata.author.name;
        }

        feed.item({
            title:  title + " v" + itm.metadata.version,
            description: itm.metadata.description,
            url: itm.metadata.homepage,
            author: author,
            date: itm.versions[0].published
        });

    });

    res.set("Content-Type", "application/rss+xml");
    res.send(feed.xml());
}

function _registryList(req, res) {
    var registryList = _getRegistryList(req.user);

    _respond(req, res, "registryList", {
        layout: false,
        registry: registryList,
        repositoryBaseURL: config.repositoryBaseURL,
        helpURL: config.helpURL
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
            !req.files.extensionPackage.name ||
            !req.files.extensionPackage.size) {
        // No file was specified in the request.
        res.status(400);
        _respond(req, res, "uploadFailed", {
            errors: _toErrorMessageList(new Error("NO_FILE"))
        });
    } else if (!req.files.extensionPackage.name.match(/\.zip$/i)) {
        // File must end with .zip.
        res.status(400);
        _respond(req, res, "uploadFailed", {
            errors: _toErrorMessageList(new Error("INVALID_FILE_TYPE"))
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

function _adminCommonValidation(req, res, operation) {
    if (!req.user) {
        // User isn't logged in.
        _respondUnauthorized(req, res, "authFailed");
        return false;
    } else if (!req.params || !req.params.name) {
        res.status(404);
        _respond(req, res, "adminFailed", {
            operation: operation,
            errors: _toErrorMessageList(new Error("UNKNOWN_EXTENSION"))
        });
        return false;
    }
    return true;
}

/**
 * The delete action to delete an extension's metadata.
 */
function _delete(req, res) {
    if (_adminCommonValidation(req, res, "delete")) {
        repository.deletePackageMetadata(req.params.name, req.user, function (err) {
            if (err) {
                var responseData = {
                    errors: _toErrorMessageList(err),
                    operation: "delete"
                };
                if (err.message === "UNKNOWN_EXTENSION") {
                    res.status(404);
                    _respond(req, res, "adminFailed", responseData);
                } else if (err.message === "NOT_AUTHORIZED") {
                    _respondUnauthorized(req, res, "adminFailed", responseData);
                } else {
                    res.status(400);
                    _respond(req, res, "adminFailed", responseData);
                }
            } else {
                res.status(200);
                _respond(req, res, "deleteSucceeded", {
                    name: req.params.name
                });
            }
        });
    }
}

/**
 * Change ownership action.
 */
function _changeOwner(req, res) {
    if (_adminCommonValidation(req, res, "changeOwner")) {
        if (!req.body || !req.body.newOwner) {
            res.status(400);
            _respond(req, res, "adminFailed", {
                operation: "changeOwner",
                errors: _toErrorMessageList(new Error("NO_NEW_OWNER"))
            });
        } else {
            if (req.body.newOwner.indexOf("github:") !== 0) {
                req.body.newOwner = "github:" + req.body.newOwner;
            }
            repository.changePackageOwner(req.params.name, req.user, req.body.newOwner, function (err) {
                if (err) {
                    var responseData = {
                        errors: _toErrorMessageList(err),
                        operation: "changeOwner"
                    };
                    if (err.message === "UNKNOWN_EXTENSION") {
                        res.status(404);
                        _respond(req, res, "adminFailed", responseData);
                    } else if (err.message === "NOT_AUTHORIZED") {
                        _respondUnauthorized(req, res, "adminFailed", responseData);
                    } else {
                        res.status(400);
                        _respond(req, res, "adminFailed", responseData);
                    }
                } else {
                    res.status(200);
                    _respond(req, res, "changeOwnerSucceeded", {
                        name: req.params.name,
                        newOwner: req.body.newOwner
                    });
                }
            });
        }
    }
}

/**
 * Change version requirements action.
 */
function _changeRequirements(req, res) {
    if (_adminCommonValidation(req, res, "changeRequirements")) {
        if (!req.body || !req.body.requirements) {
            res.status(400);
            _respond(req, res, "adminFailed", {
                operation: "changeRequirements",
                errors: _toErrorMessageList(new Error("NO_NEW_REQUIREMENTS"))
            });
        } else if (!semver.validRange(req.body.requirements)) {
            res.status(400);
            _respond(req, res, "adminFailed", {
                operation: "changeRequirements",
                errors: _toErrorMessageList(new Error("INVALID_REQUIREMENTS"))
            });
        } else {
            repository.changePackageRequirements(req.params.name, req.user, req.body.requirements, function (err) {
                if (err) {
                    var responseData = {
                        errors: _toErrorMessageList(err),
                        operation: "changeRequirements"
                    };
                    if (err.message === "UNKNOWN_EXTENSION") {
                        res.status(404);
                        _respond(req, res, "adminFailed", responseData);
                    } else if (err.message === "NOT_AUTHORIZED") {
                        _respondUnauthorized(req, res, "adminFailed", responseData);
                    } else {
                        res.status(400);
                        _respond(req, res, "adminFailed", responseData);
                    }
                } else {
                    res.status(200);
                    _respond(req, res, "changeRequirementsSucceeded", {
                        name: req.params.name,
                        requirements: req.body.requirements
                    });
                }
            });
        }
    }
}

function _stats(req, res) {
    logging.debug("Request IP", req.ip);
    logging.debug("Request HOST", req.host);

    if (req.ip === "127.0.0.1" && req.host === "localhost") {
        // read the uploaded JSON data
        var obj = JSON.parse(fs.readFileSync(req.files.file.path));

        _.each(obj, function (n, extensionName) {
            _.each(obj[extensionName].downloads, function (versions) {
                // iterate over all updatable versions
                _.each(Object.keys(versions), function (version) {
                    repository.addDownloadDataToPackage(extensionName,
                                                        version,
                                                        versions[version],
                                                        obj[extensionName].downloads.recent);
                });
            });
        });

        res.send(202); // indicate that everything is alright
    } else {
        // uploads are only allowed from localhost to prevent DoS attacks
        res.send(403); // Forbidden
    }
}

//////////////
// Route setup
//////////////

/**
 * The main route setup function for the Express app.
 * @param {object} app The Express app to attach our routes to.
 * @param {object} configObj Configuration options (especially repositoryBaseURL)
 */
function setup(app, configObj) {
    config = configObj;
    app.get("/", _index);

    app.get("/rss", _rss);

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

    app["delete"]("/package/:name", _delete);
    app.post("/package/:name/changeOwner", _changeOwner);
    app.post("/package/:name/changeRequirements", _changeRequirements);

    app.post("/stats", _stats);
}

exports.setup = setup;
