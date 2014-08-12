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

var originalValidate = repository.__get__("validate"),
    ADMIN = "github:admin";

describe("Repository", function () {
    beforeEach(function () {
        // Clear the repository
        repository.configure({
            storage: "./ramstorage",
            admins: [ADMIN]
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
                expect(storage.files["basic-valid-extension/basic-valid-extension-2.0.0.zip"]).toEqual("nopackage.zip");
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

    it("should delete a package when requested by the owner", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            var registry = repository.__get__("registry");
            expect(registry["basic-valid-extension"]).toBeDefined();
            repository.deletePackageMetadata("basic-valid-extension", username, function (err) {
                expect(err).toBeNull();
                expect(registry["basic-valid-extension"]).toBeUndefined();
                done();
            });
        });
    });

    it("should produce an error for unknown package", function (done) {
        repository.deletePackageMetadata("does-not-exist", username, function (err) {
            expect(err).not.toBeNull();
            done();
        });
    });

    it("should not delete a package when requested by a non-owner", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            repository.deletePackageMetadata("basic-valid-extension", "github:unknown", function (err) {
                var registry = repository.__get__("registry");
                expect(err).not.toBeNull();
                expect(registry["basic-valid-extension"]).toBeDefined();
                done();
            });
        });
    });

    it("should delete a package when requested by an admin", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            var registry = repository.__get__("registry");
            expect(registry["basic-valid-extension"]).toBeDefined();
            repository.deletePackageMetadata("basic-valid-extension", ADMIN, function (err) {
                expect(err).toBeNull();
                expect(registry["basic-valid-extension"]).toBeUndefined();
                done();
            });
        });
    });

    it("should change a package's owner when requested by the owner", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            var registry = repository.__get__("registry");
            expect(registry["basic-valid-extension"]).toBeDefined();
            repository.changePackageOwner("basic-valid-extension", username, "github:newuser", function (err) {
                expect(err).toBeNull();
                expect(registry["basic-valid-extension"].owner).toEqual("github:newuser");
                done();
            });
        });
    });

    it("should produce an error for unknown package when changing ownership", function (done) {
        repository.changePackageOwner("does-not-exist", username, function (err) {
            expect(err).not.toBeNull();
            done();
        });
    });

    it("should not change ownership for a package when requested by a non-owner", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            repository.changePackageOwner("basic-valid-extension", "github:unknown", "github:badguy", function (err) {
                var registry = repository.__get__("registry");
                expect(err).not.toBeNull();
                expect(registry["basic-valid-extension"].owner).toEqual("github:reallyreallyfakeuser");
                done();
            });
        });
    });

    it("should change ownership of a package when requested by an admin", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            var registry = repository.__get__("registry");
            repository.changePackageOwner("basic-valid-extension", ADMIN, "github:someuser", function (err) {
                expect(err).toBeNull();
                expect(registry["basic-valid-extension"].owner).toEqual("github:someuser");
                done();
            });
        });
    });

    it("should change a package's requirements when requested by the owner", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            var registry = repository.__get__("registry");
            repository.changePackageRequirements("basic-valid-extension", username, "<0.38.0", function (err) {
                expect(err).toBeNull();
                registry["basic-valid-extension"].versions.forEach(function (version) {
                    expect(version.brackets).toEqual("<0.38.0");
                });
                done();
            });
        });
    });

    it("should produce an error for unknown package when changing requrements", function (done) {
        repository.changePackageRequirements("does-not-exist", username, "<0.38.0", function (err) {
            expect(err).not.toBeNull();
            done();
        });
    });

    it("should not change requirements for a package when requested by a non-owner", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            repository.changePackageRequirements("basic-valid-extension", "github:unknown", "<0.38.0", function (err) {
                var registry = repository.__get__("registry");
                expect(err).not.toBeNull();
                expect(registry["basic-valid-extension"].versions[0].brackets).toBeUndefined();
                done();
            });
        });
    });

    it("should change requirements of a package when requested by an admin", function (done) {
        repository.addPackage(basicValidExtension, username, function (err, entry) {
            var registry = repository.__get__("registry");
            repository.changePackageRequirements("basic-valid-extension", ADMIN, "<0.38.0", function (err) {
                expect(err).toBeNull();
                expect(registry["basic-valid-extension"].versions[0].brackets).toEqual("<0.38.0");
                done();
            });
        });
    });
});

describe("Add download data", function () {
    describe("Extension version download numbers", function () {
        beforeEach(function () {
            var registry = JSON.parse('{"snippets-extension":{"metadata":{"name":"snippets-extension","title":"Brackets Snippets","homepage":"https://github.com/testuser/brackets-snippets","author":{"name":"Testuser"},"version":"1.0.0","engines":{"brackets":">=0.24"},"description":"A simple brackets snippets extension."},"owner":"irichter","versions":[{"version":"0.2.0","published":"2014-01-10T17:27:25.996Z","brackets":">=0.24"},{"version":"0.3.0","published":"2014-01-10T17:27:25.996Z","brackets":">=0.24"}]}}');

            repository.__set__("registry", registry);
        });

        it("should add the download numbers to the 0.3.0 extension version and update the download total", function () {
            repository.addDownloadDataToPackage("snippets-extension", {"0.3.0" : 5}, {"20130805": 5});

            var registry = repository.getRegistry();
            expect(registry["snippets-extension"].versions[1].downloads).toBe(5);
            expect(registry["snippets-extension"].totalDownloads).toBe(5);
        });

        it("should add the download numbers to the 0.3.0 extension version and update the download total when called twice", function () {
            repository.addDownloadDataToPackage("snippets-extension", {"0.3.0" : 5}, {"20130805": 5});
            repository.addDownloadDataToPackage("snippets-extension", {"0.3.0" : 8}, {"20130805": 8});

            var registry = repository.getRegistry();
            expect(registry["snippets-extension"].versions[1].downloads).toBe(13);
            expect(registry["snippets-extension"].totalDownloads).toBe(13);
        });

        it("should add the download numbers to the 0.2.0 and 0.3.0 extension and update the download total", function () {
            repository.addDownloadDataToPackage("snippets-extension", {"0.3.0": 5, "0.2.0": 3}, {"20130805": 8});

            var registry = repository.getRegistry();
            expect(registry["snippets-extension"].versions[0].downloads).toBe(3);
            expect(registry["snippets-extension"].versions[1].downloads).toBe(5);
            expect(registry["snippets-extension"].totalDownloads).toBe(8);
        });
    });

    describe("Recent Downloads", function () {
        var registry;

        beforeEach(function () {
            var registry = JSON.parse('{"test-package":{"metadata":{"name":"test-package"}, "versions":[{"version":"0.2.0","published":"2014-01-10T17:27:25.996Z","brackets":">=0.24"}]}}');
            repository.__set__("registry", registry);
        });

        it("should update the recent download numbers on new extension", function () {
            var recentDownloads = {"20130216": 10, "20130217": 5, "20130218": 7, "20130219": 4, "20130220": 41, "20130221": 14, "20130222": 30};

            repository._updateRecentDownloadsForPackage("test-package", recentDownloads);

            var updatedRecentDownload = repository.getRegistry()["test-package"].recent;

            expect(Object.keys(updatedRecentDownload).length).toBe(7);
            // Check that the download numbers got doubled
            expect(updatedRecentDownload).toEqual({"20130216": 10, "20130217": 5, "20130218": 7, "20130219": 4, "20130220": 41, "20130221": 14, "20130222": 30});
        });

        it("should update the recent download numbers 2 times and ensure that the sum of the downloads is correct", function () {
            var recentDownloads = {"20130216": 10, "20130217": 5, "20130218": 7, "20130219": 4, "20130220": 41, "20130221": 14, "20130222": 30};
            var recentDownloads2 = {"20130216": 10, "20130217": 5, "20130218": 7, "20130219": 4, "20130220": 20, "20130221": 7, "20130222": 15};

            repository._updateRecentDownloadsForPackage("test-package", recentDownloads);
            repository._updateRecentDownloadsForPackage("test-package", recentDownloads2);

            var updatedRecentDownload = repository.getRegistry()["test-package"].recent;

            expect(Object.keys(updatedRecentDownload).length).toBe(7);
            expect(updatedRecentDownload).toEqual({"20130216": 20, "20130217": 10, "20130218": 14, "20130219": 8, "20130220": 61, "20130221": 21, "20130222": 45});
        });

        it("should update the recent download numbers with 3 datapoints and keep only these 3 datapoints on new extension", function () {
            var recentDownloads = {"20130215": 10, "20130216": 5, "20130217": 7};

            repository._updateRecentDownloadsForPackage("test-package", recentDownloads);

            var updatedRecentDownload = repository.getRegistry()["test-package"].recent;

            expect(Object.keys(updatedRecentDownload).length).toBe(3);
            expect(updatedRecentDownload).toEqual({"20130215": 10, "20130216": 5, "20130217": 7});
        });
    });
});
