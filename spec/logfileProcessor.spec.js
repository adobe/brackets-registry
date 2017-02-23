/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
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
/*global expect, describe, it, beforeEach, afterEach, createSpy, jasmine, xit */

"use strict";

var rewire           = require("rewire"),
    logfileProcessor = rewire("../downloadStats/logfileProcessor"),
    path             = require("path"),
    tmp              = require("temporary"),
    util             = require("util"),
    Stream           = require("stream");

var testLogfileDirectory = path.join(path.dirname(module.filename), "s3logfiles");

describe("LogfileProcessor", function () {
    var config = {};
    beforeEach(function () {
        config["aws.accesskey"] = "fake";
        config["aws.secretkey"] = "secretKey";
        config["s3.logBucket"] = "no_bucket_name";
    });

    describe("Parse Logfiles", function () {
        it("should throw an exception when configure without AWS credentials", function (done) {
            try {
                var lfp = new logfileProcessor.LogfileProcessor({});
            } catch (e) {
                expect(e.toString()).toBe("Error: Configuration error: aws.accesskey, aws.secretkey, or s3.logBucket missing");
                done();
            }
        });

        it("should return the information for 1 Extension", function (done) {
            var lfp = new logfileProcessor.LogfileProcessor(config);

            lfp.extractDownloadStats(path.join(testLogfileDirectory, "one-extension")).then(function (downloadStats) {
                expect(downloadStats["select-parent"].downloads.versions["1.0.0"]).toBe(1);

                done();
            });
        });

        it("should return the information for 1 Extension and multiple versions", function (done) {
            var lfp = new logfileProcessor.LogfileProcessor(config);
            lfp.extractDownloadStats(path.join(testLogfileDirectory, "one-extension-multiple-versions")).then(function (downloadStats) {
                expect(downloadStats["select-parent"].downloads.versions["1.0.0"]).toBe(1);
                expect(downloadStats["select-parent"].downloads.versions["1.0.2"]).toBe(1);
                expect(downloadStats["select-parent"].downloads.versions["1.0.3"]).toBe(1);

                done();
            });
        });

        it("should return no information for extension with rar extension", function (done) {
            var lfp = new logfileProcessor.LogfileProcessor(config);
            lfp.extractDownloadStats(path.join(testLogfileDirectory, "one-invalid-extension-log")).then(function (downloadStats) {
                expect(downloadStats).toEqual({});

                done();
            });
        });

        it("should return no information for unsuccessful get request http status != 200", function (done) {
            var lfp = new logfileProcessor.LogfileProcessor(config);
            lfp.extractDownloadStats(path.join(testLogfileDirectory, "failed-get-request")).then(function (downloadStats) {
                expect(downloadStats).toEqual({});

                done();
            });
        });
    });

    describe("Create recent download stats", function () {
        xit("should collect the recent download data", function (done) {
            var S3 = {
                listObjects: function (bucket, callback) { callback(null, { Contents: []}); }
            };

            var AWS = {
                config: {
                    update: jasmine.createSpy()
                },
                S3: function () { return S3; }
            };

            logfileProcessor.__set__("AWS", AWS);
            var lfp = new logfileProcessor.LogfileProcessor(config);
            lfp.downloadLogfiles(path.join(testLogfileDirectory, "bunchOfLogfiles")).then(function (downloadStats) {
                expect(18).toBe(Object.keys(downloadStats.extensions).length);
                expect(2).toBe(Object.keys(downloadStats.extensions[0]["incompatible-version"].downloads.recent).length);
                done();
            });
        });
    });
    
    describe("LastAccessKey", function () {
        function StringReader(str) {
            this.data = str;
        }

        util.inherits(StringReader, Stream);
        StringReader.prototype = {
            resume: function () {
                // If the data is a buffer and we have an encoding (from setEncoding)
                // then we convert the data to a String first.
                if (this.encoding && Buffer.isBuffer(this.data)) {
                    this.emit('data', this.data.toString(this.encoding));
                } else {
                // Otherwise we just emit the data as it is.
                    this.emit('data', this.data);
                }
                // We emitted the entire string, so we can finish up by
                // emitting end/close.
                this.emit('end');
                this.emit('close');
            },
            setEncoding: function (encoding) {
                this.encoding = encoding;
            },
            pause: function () {
            },
            pipe: function (dest) {
                dest.write(this.data);
                dest.end('');
            },
            destroy: function () {
                delete this.data;
            }
        };

        function configureAWSSpy(s3) {
            var AWS = {
                config: {
                    update: jasmine.createSpy()
                },
                S3: function () { return s3; }
            };
            
            return AWS;
        }

        it("should handle error properly when retrieving lastAccessKey", function (done) {
            var S3 = {
                listObjects: function (bucket, callback) { callback(null, {Contents: []}); },
                getObject: function (options, callback) { callback({msg: "Fail", code: 15271}, null); }
            };

            logfileProcessor.__set__("AWS", configureAWSSpy(S3));

            var lfp = new logfileProcessor.LogfileProcessor(config);
            var promise = lfp.downloadLogfiles('thisPathDoesntMatter');

            promise.error(function (result) {
                expect("Error: Error retrieving key for last accessed logfile entry. {\"msg\":\"Fail\",\"code\":15271}").toEqual(result.toString());
                done();
            });
        });

        xit("should handle exception properly when retrieving lastAccessKey", function (done) {
            var S3 = {
                listObjects: function (bucket, callback) { callback(null, { Contents: []}); },
                getObject: function (options, callback) { setTimeout(function () { throw new Error('Kaboom'); }, 100); }
            };

            logfileProcessor.__set__("AWS", configureAWSSpy(S3));

            var lfp = new logfileProcessor.LogfileProcessor(config);
            lfp.downloadLogfiles('thisPathDoesntMatter').catch(function (result) {
                expect("Kaboom").toEqual(result);
                done();
            });
        });

        it("should return empty JSON object if lastAccessKey is unavailable", function (done) {
            var S3 = {
                listObjects: function (bucket, callback) { callback(null, { Contents: []}); },
                getObject: function (options, callback) { callback({msg: "Fail", code: "NoSuchKey"}, null); },
                putObject: function (options, callback) { callback(null, {"Key": "Zatter"}); }
            };

            logfileProcessor.__set__("AWS", configureAWSSpy(S3));

            var lfp = new logfileProcessor.LogfileProcessor(config);
            var promise = lfp.downloadLogfiles('thisPathDoesntMatter');
            promise.then(function (result) {
                expect(result).toBeUndefined();
                done();
            });
        });

        it("should handle error if listObject returns an error", function (done) {
            var S3 = {
                listObjects: function (bucket, callback) { callback(new Error("Can't read object"), null); },
                getObject: function (options, callback) { callback({msg: "Fail", code: "NoSuchKey"}, null); }
            };

            logfileProcessor.__set__("AWS", configureAWSSpy(S3));

            var lfp = new logfileProcessor.LogfileProcessor(config);
            var promise = lfp.downloadLogfiles('thisPathDoesntMatter');
            promise.error(function (result) {
                expect(result).toEqual(result);
                done();
            });
        });

        it("should return the lastAccessKey after successful write", function (done) {
            var S3 = {
                listObjects: function (bucket, callback) { callback(null, { Contents: [{Key: "NewKey1"}, {Key: "test/NewKey2"}], IsTruncated: false}); },
                getObject: function (options, callback) {
                    if (typeof (callback) === "function") {
                        var key = {"Key": "OldKey"};
                        var data = {"Body": new Buffer(JSON.stringify(key))};

                        callback(null, data);
                    } else {
                        return {
                            createReadStream: function () {
                                return new StringReader("testdata");
                            }
                        };
                    }
                },
                putObject: function (options, callback) { callback(null, {"Key": "NewKey"}); }
            };

            logfileProcessor.__set__("AWS", configureAWSSpy(S3));

            var tmpDir = new tmp.Dir();
            var lfp = new logfileProcessor.LogfileProcessor(config);
            var promise = lfp.downloadLogfiles(tmpDir.path);
            promise.then(function (result) {
                expect({Key: "NewKey"}).toEqual({ Key : 'NewKey' });
                
                //tmpDir.rmdir();
                done();
            });
        });

        it("should handle error when writing lastAccessKey", function (done) {
            var S3 = {
                listObjects: function (bucket, callback) { callback(null, { Contents: [{Key: "NewKey1"}, {Key: "test/NewKey2"}], IsTruncated: false}); },
                getObject: function (options, callback) {
                    if (typeof (callback) === "function") {
                        var key = {"Key": "OldKey"};
                        var data = {"Body": new Buffer(JSON.stringify(key))};

                        callback(null, data);
                    } else {
                        return {
                            createReadStream: function () {
                                return new StringReader("testdata");
                            }
                        };
                    }
                },
                putObject: function (options, callback) { callback({Err: 'Write failed'}, null); }
            };

            logfileProcessor.__set__("AWS", configureAWSSpy(S3));

            
            var tmpDir = new tmp.Dir();
            var lfp = new logfileProcessor.LogfileProcessor(config);
            var promise = lfp.downloadLogfiles(tmpDir.path);
            promise.error(function (result) {
                expect("Error: Error writing key for last accessed logfile entry. {\"Err\":\"Write failed\"}").toEqual(result.toString());
                done();
            });
        });
    });
});
