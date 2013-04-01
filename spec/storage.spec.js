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
/*global expect, jasmine, describe, it, beforeEach, afterEach */

"use strict";

var rewire    = require("rewire"),
    s3storage = rewire("../lib/s3storage"),
    zlib      = require("zlib"),
    stream    = require("stream"),
    path      = require("path");

var testPackageDirectory = path.join(path.dirname(module.filename), "data"),
    basicValidExtension  = path.join(testPackageDirectory, "basic-valid-extension.zip");

var AWS;
var config = {
    "aws.accesskey": "AKID",
    "aws.secretkey": "sekret",
    "s3.bucket": "repository.brackets.io"
};

var sampleRegistry = {
    foo: {
        metadata: {
            name: "foo",
            version: "1.0.0"
        }
    }
};

var noopZlib = {
    inflate: function (data, callback) {
        callback(null, data);
    },
    deflate: function (data, callback) {
        callback(null, data);
    }
};

describe("S3 Storage", function () {
    
    var originalZlib = s3storage.__get__("zlib");
    
    beforeEach(function () {
        AWS = {
            config: {
                update: jasmine.createSpy()
            }
        };
        s3storage.__set__("AWS", AWS);
    });
    
    afterEach(function () {
        delete sampleRegistry.bar;
        s3storage.__set__("zlib", originalZlib);
    });
    
    it("should throw for missing configuration", function () {
        try {
            var storage = new s3storage.Storage({});
        } catch (e) {
            expect(e.message.indexOf("Configuration error")).toEqual(0);
        }
    });
    
    it("should configure AWS for a good configuration", function () {
        var storage = new s3storage.Storage(config);
        expect(AWS.config.update).toHaveBeenCalledWith({
            "accessKeyId": "AKID",
            "secretAccessKey": "sekret"
        });
    });
    
    it("should be able to retrieve the registry", function (done) {
        var storage = new s3storage.Storage(config);
        zlib.deflate(new Buffer(JSON.stringify(sampleRegistry)), function (err, body) {
            var result = {
                body: body
            };
            
            var getObject = function (params, callback) {
                expect(params).toEqual({
                    Bucket: "repository.brackets.io",
                    Key: "registry.json"
                });
                callback(null, result);
            };
            
            AWS.S3 = {
                Client: function (options) {
                    expect(options.sslEnabled).toEqual(true);
                    this.getObject = getObject;
                }
            };
            
            storage.getRegistry(function (err, registry) {
                expect(err).toBeNull();
                expect(registry.foo.metadata.name).toEqual("foo");
                expect(registry.foo.metadata.version).toEqual("1.0.0");
                done();
            });
        });
    });
    
    it("should return an error if the registry is invalid", function (done) {
        var storage = new s3storage.Storage(config);
        var getObject = function (params, callback) {
            callback(null, {
                body: new Buffer("")
            });
        };
        
        AWS.S3 = {
            Client: function (options) {
                this.getObject = getObject;
            }
        };
        
        storage.getRegistry(function (err, registry) {
            expect(err.message).toEqual("UNREADABLE_REGISTRY");
            expect(err.errors.length).toEqual(1);
            expect(registry).toBeNull();
            done();
        });
    });
    
    it("should be able to save the registry to S3", function (done) {
        var storage = new s3storage.Storage(config);
        
        AWS.S3 = {
            Client: function (options) {
                this.putObject = function (params, callback) {
                    expect(params).toEqual({
                        Bucket: "repository.brackets.io",
                        Key: "registry.json",
                        ACL: "public-read",
                        ContentEncoding: "gzip",
                        ContentType: "application/json",
                        Body: jasmine.any(Buffer)
                    });
                    zlib.inflate(params.Body, function (err, uncompressed) {
                        var registry = JSON.parse(uncompressed.toString());
                        expect(registry).toEqual(sampleRegistry);
                        done();
                    });
                };
            }
        };
        
        storage.saveRegistry(sampleRegistry);
    });
    
    it("should be resilient to registry save requests coming in close together", function (done) {
        var storage = new s3storage.Storage(config);
        
        // Use noopZlib to make everything synchronous so that we can control the timing
        s3storage.__set__("zlib", noopZlib);
        
        // The idea here is to call saveRegistry again before the first call
        // to saveRegistry has successfully finished its putObject. We don't want it
        // to kick off a second putObject call until the first is done.
        var requestNumber = 1;
        var callbackCalled = false;
        var putObject = function (params, callback) {
            if (requestNumber === 1) {
                requestNumber++;
                sampleRegistry.bar = {
                    metadata: {
                        name: "bar",
                        version: "2.1.1"
                    }
                };
                storage.saveRegistry(sampleRegistry);
                callbackCalled = true;
                callback(null, {});
            } else {
                expect(callbackCalled).toEqual(true);
                callback(null, {});
                done();
            }
        };
        
        AWS.S3 = {
            Client: function (options) {
                this.putObject = putObject;
            }
        };
        
        storage.saveRegistry(sampleRegistry);
    });
    
    it("should save packages to S3", function (done) {
        var storage = new s3storage.Storage(config);
        
        AWS.S3 = {
            Client: function (options) {
                this.putObject = function (params, callback) {
                    expect(params).toEqual({
                        Bucket: "repository.brackets.io",
                        Key: "basic-valid-extension/1.0.0.zip",
                        ACL: "public-read",
                        ContentType: "application/zip",
                        Body: jasmine.any(stream.Stream)
                    });
                    done();
                };
            }
        };
        
        storage.savePackage({
            versions: [
                {
                    version: "1.0.0"
                }
            ],
            metadata: {
                name: "basic-valid-extension",
                version: "1.0.0"
            }
        }, basicValidExtension);
    });
});
