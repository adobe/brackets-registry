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

var LogfileProcessor = require("../downloadStats/logfileProcessor").LogfileProcessor,
    path             = require("path");

var testLogfileDirectory = path.join(path.dirname(module.filename), "s3logfiles");

describe("LogfileProcessor", function () {
    describe("Parse Logfiles", function () {
        var config = {};
        beforeEach(function () {
            config["aws.accesskey"] = "fake";
            config["aws.secretkey"] = "secretKey";
            config["s3.bucket"] = "no_bucket_name";
        });
        
        it("should throw an exception when configure without AWS credentials", function (done) {
            try {
                var logfileProcessor = new LogfileProcessor({});
            } catch(e) {
                expect(e.toString()).toBe("Error: Configuration error: aws.accesskey, aws.secretkey, or s3.bucket missing");
                done();
            }
        });

        it("should return the information for 1 Extension", function (done) {
            var logfileProcessor = new LogfileProcessor(config);

            logfileProcessor.extractDownloadStats(testLogfileDirectory + "/one-extension").then(function (downloadStats) {
                expect(downloadStats["select-parent"].downloads.versions["1.0.0"]).toBe(1);
                
                done();
            });
        });

        it("should return the information for 1 Extension and multiple versions", function (done) {
            var logfileProcessor = new LogfileProcessor(config);
            logfileProcessor.extractDownloadStats(testLogfileDirectory + "/one-extension-multiple-versions").then(function (downloadStats) {
                expect(downloadStats["select-parent"].downloads.versions["1.0.0"]).toBe(1);
                expect(downloadStats["select-parent"].downloads.versions["1.0.2"]).toBe(1);
                expect(downloadStats["select-parent"].downloads.versions["1.0.3"]).toBe(1);
                
                done();
            });
        });
    });
});