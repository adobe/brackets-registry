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
    routes = rewire("../lib/routes");

var repository = routes.__get__("repository");

// Don't map the keys to human-readable strings.
routes.__set__("_mapError", function (key) { return key; });
routes.__set__("_formatError", function (err) { return err; });

describe("routes", function () {
    var req, res, mockRepository;
    
    beforeEach(function () {
        req = {
            logout: createSpy("req.logout")
        };
        res = {
            redirect: createSpy("res.redirect"),
            render: createSpy("res.render")
        };
        mockRepository = {
            addPackage: createSpy("repository.addPackage")
        };
        routes.__set__("repository", mockRepository);
    });
    
    afterEach(function () {
        routes.__set__("repository", repository);
    });
    
    it("should redirect to home page on successful authentication", function () {
        routes._authCallback(req, res);
        expect(res.redirect).toHaveBeenCalledWith("/");
    });
    
    it("should render and inject correct data into the home page when user is not authenticated", function () {
        routes._index(req, res);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("index");
        expect(res.render.mostRecentCall.args[1].user).toBeUndefined();
    });
    
    it("should render and inject correct data into the home page when user is authenticated", function () {
        req.user = "github:someuser";
        routes._index(req, res);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("index");
        expect(res.render.mostRecentCall.args[1].user).toBe("github:someuser");
    });

    it("should logout and redirect to home page when logging out", function () {
        routes._logout(req, res);
        expect(req.logout).toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith("/");
    });
    
    it("should render failure page if auth failed", function () {
        routes._authFailed(req, res);
        expect(res.render).toHaveBeenCalledWith("authFailed");
    });
    
    it("should pass uploaded file to the repository", function () {
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        routes._upload(req, res);
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
        routes._upload(req, res);
        
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
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadSucceeded");
        expect(res.render.mostRecentCall.args[1]).toEqual({ entry: entry });
    });

    it("should render upload failure page with error if upload failed", function () {
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        routes._upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            err = new Error("NOT_AUTHORIZED");
        callback(err, null);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadFailed");
        expect(res.render.mostRecentCall.args[1].errors[0]).toBe("NOT_AUTHORIZED");
    });

    it("should render upload failure page if upload failed and there are multiple errors", function () {
        req.user = "github:someuser";
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        routes._upload(req, res);
        
        var callback = mockRepository.addPackage.mostRecentCall.args[2],
            err = new Error("VALIDATION_FAILED");
        err.errors = [["MISSING_PACKAGE_NAME", "/path/to/extension.zip"], ["INVALID_VERSION_NUMBER", "x.y.z"]];
        callback(err, null);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadFailed");
        expect(res.render.mostRecentCall.args[1].errors[0]).toBe("VALIDATION_FAILED");
        expect(res.render.mostRecentCall.args[1].errors[1]).toEqual(["MISSING_PACKAGE_NAME", "/path/to/extension.zip"]);
        expect(res.render.mostRecentCall.args[1].errors[2]).toEqual(["INVALID_VERSION_NUMBER", "x.y.z"]);
    });

    it("should render upload failure page with error if no file is received", function () {
        req.user = "github:someuser";
        req.files = {};
        routes._upload(req, res);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadFailed");
        expect(res.render.mostRecentCall.args[1].errors[0]).toBe("NO_FILE");
    });
    
    it("should render upload failure page with error immediately (without hitting registry) if user is not logged in", function () {
        req.files = {
            extensionPackage: {
                path: "/path/to/extension.zip",
                size: 1000
            }
        };
        routes._upload(req, res);
        expect(res.render).toHaveBeenCalled();
        expect(res.render.mostRecentCall.args[0]).toBe("uploadFailed");
        expect(res.render.mostRecentCall.args[1].errors[0]).toBe("NOT_LOGGED_IN");
    });
});