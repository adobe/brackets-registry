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

/*jslint vars: true, plusplus: true, devel: true, node: true, nomen: true,
indent: 4, maxerr: 50 */

"use strict";

var AWS        = require('aws-sdk'),
    fs         = require('fs'),
    path       = require('path'),
    readline   = require('readline'),
    FileQueue  = require('filequeue'),
    eachline   = require('eachline'),
    Promise    = require("bluebird");

var regex = /(\S+) (\S+) (\S+ \+\S+\]) (\S+) (\S+) (\S+) (\S+) (\S+) "(\S+) (\S+) (\S+)" (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) "(.*)" (\S+)/;

function LogfileProcessor(config) {
    var accessKeyId = config["aws.accesskey"];
    var secretAccessKey = config["aws.secretkey"];
    this.bucketName = config["s3.bucket"];

    if (!accessKeyId || !secretAccessKey || !this.bucketName) {
        throw new Error("Configuration error: aws.accesskey, aws.secretkey, or s3.bucket missing");
    }

    AWS.config.update({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    });
}

LogfileProcessor.prototype = {
    downloadLogfiles: function (tempFolderName) {
        var self = this;

        var s3 = new AWS.S3.Client({
            sslEnabled: true
        });

        var globalPromise = Promise.defer();

        function _writeLogfileHelper(fq, obj) {
            var fileWrittenPromise = Promise.defer();

            var params = {Bucket: self.bucketName, Key: obj.Key};
            var file = fq.createWriteStream(tempFolderName + '/' + obj.Key.replace('/', '-') + '.log');

            file.on("close", function () {
                fileWrittenPromise.resolve();
            });

            s3.getObject(params).createReadStream().pipe(file);

            return fileWrittenPromise.promise;
        }

        s3.listObjects({Bucket: self.bucketName}, function(err, data) {
            console.log("Found", data.Contents.length, "logfile(s)");

            var fq = new FileQueue(100);

            var allPromises = data.Contents.map(function (obj) {
                return _writeLogfileHelper(fq, obj);
            });

            Promise.settle(allPromises).then(function () {
                globalPromise.resolve("Done");
            });
        });

        return globalPromise.promise;
    },
    
    extractDownloadStats: function(tempFolderName) {
        var deferred = Promise.defer();

        fs.readdir(tempFolderName, function (err, files) {
            var result = {};

            files.forEach(function (file) {
                var content = fs.readFileSync(path.resolve(tempFolderName, file));

                var lines = content.toString().split('\n');
                lines.forEach(function (line) {
                    var matchResult = line.match(regex);
                    if (matchResult) {
                        var uri = matchResult[8];
                        // we are only interested in the Extension zip files
                        if (uri.lastIndexOf(".zip") > -1) {
                            var m = uri.match(/(\S+)\/(\S+)\-(.*)\.zip/);
                            if (m) {
                                var extensionName = m[1];
                                var version = m[3];

                                if (!result[extensionName]) {
                                    result[extensionName] = {downloads : { versions: {} }};

                                    result[extensionName].downloads.versions[version] = 1;
                                } else {
                                    var downloadsForVersion = result[extensionName].downloads.versions[version];

                                    if (downloadsForVersion && !isNaN(downloadsForVersion)) {
                                        downloadsForVersion++;
                                        result[extensionName].downloads.versions[version] = downloadsForVersion;
                                    } else {  
                                        result[extensionName].downloads.versions[version] = 1;
                                    }
                                }
                            }                                
                        }
                    }

                    deferred.progress();
                });
            });

            deferred.resolve(result);
        });

        return deferred.promise;
    }
};

// API
exports.LogfileProcessor = LogfileProcessor;
