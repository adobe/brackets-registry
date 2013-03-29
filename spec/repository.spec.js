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


/*jslint vars: true, plusplus: true, devel: true, node: true, nomen: true,
indent: 4, maxerr: 50 */
/*global expect, describe, it, beforeEach, afterEach */

"use strict";

var rewire     = require("rewire"),
    repository = rewire("../lib/repository"),
    path       = require("path");

var testPackageDirectory = path.join(path.dirname(module.filename), "data"),
    basicValidExtension  = path.join(testPackageDirectory, "basic-valid-extension.zip");

var originalValidate = repository.__get__("validate");

describe("Repository", function () {
    beforeEach(function () {
        // Clear the repository
        repository.__set__("registry", {});
    });
    
    afterEach(function () {
        repository.__set__("validate", originalValidate);
    });
    
    function setValidationResult(result) {
        repository.__set__("validate", function (path, options, callback) {
            callback(null, result);
        });
    }
    
    var username = "github:reallyreallyfakeuser";
    
    it("should be able to add a valid package", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            expect(err).toEqual(null);
            expect(entry.metadata.name).toEqual("basic-valid-extension");
            
            var registered = repository.__get__("registry")["basic-valid-extension"];
            expect(registered).toBeDefined();
            expect(registered.metadata.name).toEqual("basic-valid-extension");
            expect(registered.owner).toEqual(username);
            expect(registered.versions.length).toEqual(1);
            expect(registered.versions[0].version).toEqual("1.0.0");
            done();
        });
    });
    
    it("should verify ownership before allowing action for a package", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            repository.addPackage(basicValidExtension, "github:someonewhowedontknowandshouldnthaveaccess", function (err, metadata) {
                expect(err.message).toEqual("NOT_AUTHORIZED");
                done();
            });
        });
    });
    
    it("should not get tripped up by JS object properties", function (done) {
        setValidationResult({
            metadata: {
                name: "constructor",
                version: "1.0.0"
            }
        });
        
        repository.addPackage("nopackage.zip", username, function (err, entry) {
            expect(err).toBeNull();
            done();
        });
    });
    
    it("should handle good version upgrades", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            setValidationResult({
                metadata: {
                    name: "basic-valid-extension",
                    version: "2.0.0"
                }
            });
            
            repository.addPackage("nopackage.zip", username, function (err, entry) {
                expect(entry.versions.length).toEqual(2);
                expect(entry.versions[1].version).toEqual("2.0.0");
                done();
            });
        });
    });
    
    it("should reject versions that are not higher than the previous version", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            setValidationResult({
                metadata: {
                    name: "basic-valid-extension",
                    version: "0.9.9"
                }
            });
            
            repository.addPackage("nopackage.zip", username, function (err, entry) {
                expect(err.message).toEqual("BAD_VERSION");
                done();
            });
        });
    });
    
    it("should reject packages with validation errors", function (done) {
        setValidationResult({
            errors: [
                ["BAD_PACKAGE_NAME", "foo@bar"],
                ["INVALID_VERSION_NUMBER", "x.231.aaa", "nopackage.zip"]
            ],
            metadata: {
                name: "foo@bar",
                version: "x.231.aaa"
            }
        });
        
        repository.addPackage("nopackage.zip", username, function (err, entry) {
            expect(err).not.toBeNull();
            expect(err.message).toEqual("VALIDATION_FAILED");
            expect(err.errors.length).toEqual(2);
            expect(err.errors[0][0]).toEqual("BAD_PACKAGE_NAME");
            expect(err.errors[1][0]).toEqual("INVALID_VERSION_NUMBER");
            done();
        });
    });
});