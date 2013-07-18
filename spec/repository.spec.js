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
        repository.configure({
            storage: "./ramstorage"
        });
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

    it("should fail with no configuration", function (done) {
        repository.__set__("config", null);
        repository.addPackage(basicValidExtension, "github:adobe", function (err, entry) {
            expect(err.message).toEqual("Repository not configured!");
            done();
        });
    });
    
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
            
            // toBeCloseTo with precision -4 means that we're allowing anything less than 10
            // seconds of difference to pass
            var pubDate = new Date(registered.versions[0].published);
            expect(pubDate.getTime()).toBeCloseTo(new Date().getTime(), -4);
            
            var storage = repository.__get__("storage");
            expect(storage.files["basic-valid-extension/basic-valid-extension-1.0.0.zip"]).toEqual(basicValidExtension);
            
            storage.getRegistry(function (err, storedRegistry) {
                var registered2 = storedRegistry["basic-valid-extension"];
                expect(registered2.metadata.name).toEqual(registered.metadata.name);
                
                // testing that Date serialization is working as it should
                expect(new Date(registered2.versions[0].published).getTime()).toBeCloseTo(new Date().getTime(), -4);
                done();
            });
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
                    description: "Less basic than before",
                    version: "2.0.0",
                    engines: {
                        brackets: ">0.21.0"
                    }
                }
            });
            
            repository.addPackage("nopackage.zip", username, function (err, entry) {
                expect(entry.metadata.description).toEqual("Less basic than before");
                expect(entry.metadata.version).toEqual("2.0.0");
                expect(entry.versions.length).toEqual(2);
                expect(entry.versions[1].version).toEqual("2.0.0");
                expect(entry.versions[1].brackets).toEqual(">0.21.0");
                
                // toBeCloseTo with precision -4 means that we're allowing anything less than 10
                // seconds of difference to pass
                var pubDate = new Date(entry.versions[1].published);
                expect(pubDate.getTime()).toBeCloseTo(new Date().getTime(), -4);
                
                var storage = repository.__get__("storage");
                expect(storage.files["basic-valid-extension/basic-valid-extension-1.0.0.zip"]).toEqual(basicValidExtension);
                expect(storage.files["basic-valid-extension/basic-valid-extension-2.0.0.zip"]).toBeDefined();
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
    
    it("should return an error if the registry is not loaded", function (done) {
        repository.__set__("registry", null);
        repository.addPackage("nopackage.zip", username, function (err, entry) {
            expect(err.message).toEqual("REGISTRY_NOT_LOADED");
            done();
        });
    });
    
    it("should return the current registry", function () {
        var registry = {
            "my-extension": {
                metadata: { name: "my-extension", version: "1.0.0" }
            }
        };
        repository.__set__("registry", registry);
        expect(repository.getRegistry()).toBe(registry);
    });
    
    it("should report errors that come from the storage", function (done) {
        var storage = repository.__get__("storage");
        var expectedError = new Error("It brokeded.");
        storage.savePackage = function (entry, path, callback) {
            callback(expectedError);
        };
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            expect(err).toBe(expectedError);
            var registry = repository.__get__("registry");
            expect(registry["basic-valid-extension"]).toBeUndefined();
            done();
        });
    });
    
    it("should not update the registry if there's a storage error", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            setValidationResult({
                metadata: {
                    name: "basic-valid-extension",
                    description: "Less basic than before",
                    version: "2.0.0",
                    engines: {
                        brackets: ">0.21.0"
                    }
                }
            });
            
            var storage = repository.__get__("storage");
            var expectedError = new Error("It brokeded.");
            storage.savePackage = function (entry, path, callback) {
                callback(expectedError);
            };
            
            repository.addPackage("nopackage.zip", username, function (err, entry) {
                expect(err).toBe(expectedError);
                var registry = repository.__get__("registry");
                expect(registry["basic-valid-extension"].versions.length).toEqual(1);
                done();
            });
        });
    });
    
    it("should not allow two packages with the same title, even from the same owner", function (done) {
        setValidationResult({
            metadata: {
                name: "anotherpkg",
                version: "2.1.1"
            }
        });
        
        repository.addPackage("nopackage.zip", username, function (err, entry) {
            expect(err).toBeNull();
            
            setValidationResult({
                metadata: {
                    name: "superawesome",
                    title: "Super Awesome!",
                    description: "It's awesome.",
                    version: "1.0.0"
                }
            });
            repository.addPackage("nopackage.zip", username, function (err, entry) {
                expect(err).toBeNull();
                setValidationResult({
                    metadata: {
                        name: "super-awesome",
                        title: "Super awesome!",
                        description: "It's awesomer.",
                        version: "1.0.0"
                    }
                });
            
                repository.addPackage("nopackage.zip", username, function (err, entry) {
                    expect(err).not.toBeNull();
                    expect(err.message).toEqual("VALIDATION_FAILED");
                    expect(err.errors.length).toEqual(1);
                    expect(err.errors[0][0]).toEqual("DUPLICATE_TITLE");
                    done();
                });
            });
        });
    });
});