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
/*global expect, describe, it, beforeEach, afterEach, createSpy */

"use strict";

var rewire = require("rewire"),
    routes = rewire("../lib/routes"),
    fs     = require("fs");

var repository = routes.__get__("repository");

// Pull out private functions we want to test
var _index = routes.__get__("_index"),
    _registryList = routes.__get__("_registryList"),
    _authCallback = routes.__get__("_authCallback"),
    _authFailed = routes.__get__("_authFailed"),
    _logout = routes.__get__("_logout"),
    _upload = routes.__get__("_upload"),
    _lastVersionDate = routes.__get__("_lastVersionDate"),
    _formatUserId = routes.__get__("_formatUserId"),
    _ownerLink = routes.__get__("_ownerLink");

// Don't map the keys to human-readable strings.
routes.__set__("_mapError", function (key) { return key; });
routes.__set__("_formatError", function (err) { return err; });

describe("routes", function () {
    var req, res, mockRepository, acceptable = { html: true };
    var mockRegistry = {
        "another-extension": {
            metadata: {
                name: "another-extension",
                version: "2.0.0"
            },
            owner: "github:anotherreallyfakeuser",
            versions: [
                { version: "2.0.0", published: "2013-04-03T08:32:02.153Z" }
            ]
        },
        "my-extension": {
            metadata: {
                name: "my-extension",
                version: "1.0.0"
            },
            owner: "github:somereallyfakeuser",
            versions: [
                { version: "1.0.0", published: "2013-04-02T21:12:33.865Z" }
            ]
        }
    };
    
    var lastDeleted;
    
    // Rewire doesn't work with fs, but we can just pull the parts of fs
    // that we need
    var rewiredFS = {
        readFileSync: fs.readFileSync,
        unlink: function (path, callback) {
            lastDeleted = path;
            callback(null);
        }
    };
    
    routes.__set__("fs", rewiredFS);

    beforeEach(function () {
        lastDeleted = null;
        
        this.addMatchers({
            toBeSortedEntriesFrom: function (expected) {
                var actual = this.actual,
                    notText = this.isNot ? " not" : "",
                    self = this;
                if (!Array.isArray(actual)) {
                    return false;
                }
                if (Object.keys(expected).length !== actual.length) {
                    return false;
                }

                // test that all items are present and unchanged                
                var actualValues = {};
                actual.forEach(function (item) {
                    actualValues[item.metadata.name] = item;
                });
                
                var ok = true;
                Object.keys(expected).forEach(function (key) {
                    if (JSON.stringify(expected[key]) !== JSON.stringify(actualValues[key])) {
                        self.message = function () {
                            return "Expected " + JSON.stringify(expected[key]) + notText +
                                " to be " + JSON.stringify(actualValues[key]);
                        };
                        ok = false;
                    }
                });
                if (!ok) {
                    return false;
                }
                
                // test that items are sorted by date (newest first)
                var prevTime = Infinity, prevDate;
                actual.forEach(function (item) {
                    var newDate = item.versions[item.versions.length - 1].published,
                        newTime = new Date(newDate).getTime();
                    if (newTime > prevTime) {
                        self.message = function () {
                            return "Expected " + newDate + " to be earlier than " + prevDate;
                        };
                        ok = false;
                    }
                    prevTime = newTime;
                    prevDate = newDate;
                });
                
                return ok;
            }
        });
        req = {
            logout: createSpy("req.logout"),
            accepts: function (type) {
                return acceptable[type] || false;
            }
        };
        res = {
            redirect: createSpy("res.redirect"),
            render: createSpy("res.render"),
            send: createSpy("res.send"),
            status: createSpy("res.status"),
            set: createSpy("res.set")
        };
        mockRepository = {
            addPackage: createSpy("repository.addPackage"),
            getRegistry: function () {
                return mockRegistry;
            }
        };
        routes.__set__("repository", mockRepository);
    });
    
    afterEach(function () {
        routes.__set__("repository", repository);
        acceptable = { html: true };
    });
    
    it("should redirect to home page on successful authentication", function () {
        _authCallback(req, res);
        expect(res.redirect).toHaveBeenCalledWith("/");
    });
    
    it("should render and inject correct data into the home page when user is not authenticated", function () {
        _index(req, res);
        expect(res.render).toHaveBeenCalled();
        
        var args = res.render.mostRecentCall.args;
        expect(args[0]).toBe("index");
        expect(args[1].user).toBeUndefined();
        expect(args[1].registry).toBeSortedEntriesFrom(mockRegistry);
    });
    
    it("should render and inject correct data into the home page when user is authenticated", function () {
        req.user = "github:someuser";
        _index(req, res);
        expect(res.render).toHaveBeenCalled();
        var args = res.render.mostRecentCall.args;
        expect(args[0]).toBe("index");
        expect(args[1].user).toBe("someuser (github)");
        expect(args[1].registry).toBeSortedEntriesFrom(mockRegistry);
    });
    
    it("should return registry listing when home page requested by client only accepting json", function () {
        acceptable = { json: true };
        _index(req, res);
        expect(res.render).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalled();
        expect(res.send.mostRecentCall.args[0].registry).toBeSortedEntriesFrom(mockRegistry);
    });
    
    it("should render just the registry partial when requested", function () {
        _registryList(req, res);
        expect(res.render).toHaveBeenCalled();
        var args = res.render.mostRecentCall.args;
        expect(args[0]).toBe("registryList");
        expect(args[1].layout).toBe(false);
        expect(args[1].registry).toBeSortedEntriesFrom(mockRegistry);
    });
    
    it("should return 406 Not Acceptable if neither HTML or JSON is specified by client", function () {
        acceptable = {};
        _index(req, res);
        expect(res.render).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(406);
    });
    
    it("should logout and redirect to home page when logging out", function () {
        _logout(req, res);
        expect(req.logout).toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith("/");
    });
    
    it("should return 401 and render failure page if auth failed", function () {
        _authFailed(req, res);
        expect(res.render).toHaveBeenCalledWith("authFailed", undefined);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.set).toHaveBeenCalledWith("WWW-Authenticate", "OAuth realm='https://registry.brackets.io'");
    });
    
    it("should pass uploaded file to the repository", function () {
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        expect(mockRepository.addPackage).toHaveBeenCalled();
        expect(mockRepository.addPackage.mostRecentCall.args[0]).toBe("/path/to/extension.zip");
        expect(mockRepository.addPackage.mostRecentCall.args[1]).toBe("github:someuser");
    });
    
    it("should render upload success page with entry data if upload succeeded", function () {
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            entry = {
                metadata: {
                    name: "my-package",
                    version: "1.0.0"
                },
                owner: "github:someuser",
                versions: [{ version: "1.0.0" }]
            };
        callback(null, entry);
        expect(lastDeleted).toEqual("/path/to/extension.zip");
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadSucceeded");
        expect(res.render.mostRecentCall.args[1]).toEqual({ entry: entry });
    });
    
    it("should return entry data as JSON if upload succeeded and JSON was requested", function () {
        acceptable = { json: true };
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            entry = {
                metadata: {
                    name: "my-package",
                    version: "1.0.0"
                },
                owner: "github:someuser",
                versions: [{ version: "1.0.0" }]
            };
        callback(null, entry);
        expect(lastDeleted).toEqual("/path/to/extension.zip");
        expect(res.render).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith({ entry: entry });
    });

    it("should render upload failure page with 400 error if upload failed", function () {
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            err = new Error("REGISTRY_NOT_LOADED");
        callback(err, null);
        expect(lastDeleted).toEqual("/path/to/extension.zip");
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadFailed");
        expect(res.render.mostRecentCall.args[1].errors[0]).toBe("REGISTRY_NOT_LOADED");
    });

    it("should render upload failure page with 401 error if upload failed due to auth error", function () {
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            err = new Error("NOT_AUTHORIZED");
        callback(err, null);
        expect(lastDeleted).toEqual("/path/to/extension.zip");
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadFailed");
        expect(res.render.mostRecentCall.args[1].errors[0]).toBe("NOT_AUTHORIZED");
    });

    it("should return errors as JSON with 400 error if upload failed and JSON was requested", function () {
        acceptable = { json: true };
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            err = new Error("REGISTRY_NOT_LOADED");
        callback(err, null);
        expect(lastDeleted).toEqual("/path/to/extension.zip");
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.render).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith({ errors: ["REGISTRY_NOT_LOADED"] });
    });

    it("should return errors as JSON with 401 error if upload failed due to authorization failure and JSON was requested", function () {
        acceptable = { json: true };
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            err = new Error("NOT_AUTHORIZED");
        callback(err, null);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.render).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith({ errors: ["NOT_AUTHORIZED"] });
    });

    it("should render upload failure page with 400 error if upload failed and there are multiple errors", function () {
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            err = new Error("VALIDATION_FAILED");
        err.errors = [["MISSING_PACKAGE_NAME", "/path/to/extension.zip"], ["INVALID_VERSION_NUMBER", "x.y.z"]];
        callback(err, null);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.render).toHaveBeenCalled();
        
        var args = res.render.mostRecentCall.args;
        expect(args[0]).toBe("uploadFailed");
        expect(args[1].errors[0]).toBe("VALIDATION_FAILED");
        expect(args[1].errors[1]).toEqual(["MISSING_PACKAGE_NAME", "/path/to/extension.zip"]);
        expect(args[1].errors[2]).toEqual(["INVALID_VERSION_NUMBER", "x.y.z"]);
    });

    it("should render upload failure page with 400 error if no file is received", function () {
        req.user = "github:someuser";
        req.files = {};
        _upload(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadFailed");
        expect(res.render.mostRecentCall.args[1].errors[0]).toBe("NO_FILE");
    });
    
    it("should return 401 and render failure page if attempting to upload when user is not logged in", function () {
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        _upload(req, res);
        expect(res.render).toHaveBeenCalledWith("authFailed", undefined);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.set).toHaveBeenCalledWith("WWW-Authenticate", "OAuth realm='https://registry.brackets.io'");
    });
});

describe("UI helpers", function () {
    var entry;
    
    beforeEach(function () {
        entry = {
            metadata: {
                name: "my-extension",
                version: "1.0.0"
            },
            owner: "github:someuser"
        };
    });

    it("should get the last published date from a registry entry with one version", function () {
        entry.versions = [{
            version: "1.0.0",
            published: new Date("2013-04-02T23:35:21.727Z")
        }];
        expect(_lastVersionDate(entry)).toBe("2013-04-02");
    });
    it("should get the last published date from a registry entry with multiple versions", function () {
        entry.versions = [{
            version: "1.0.0",
            published: new Date("2013-03-31T23:35:21.727Z")
        }, {
            version: "2.0.0",
            published: new Date("2013-04-02T23:35:21.727Z")
        }];
        expect(_lastVersionDate(entry)).toBe("2013-04-02");
    });
    it("should get the last published date from a registry entry with the date in string format", function () {
        entry.versions = [{
            version: "1.0.0",
            published: "2013-04-02T23:35:21.727Z"
        }];
        expect(_lastVersionDate(entry)).toBe("2013-04-02");
    });
    it("should return empty string (and not crash) if some data is missing", function () {
        entry.versions = [];
        expect(_lastVersionDate(entry)).toBe("");
    });

    it("should format the owner name", function () {
        expect(_formatUserId(entry.owner)).toBe("someuser (github)");
    });
    it("should return a link for a github owner", function () {
        expect(_ownerLink(entry.owner)).toBe("https://github.com/someuser");
    });
});
