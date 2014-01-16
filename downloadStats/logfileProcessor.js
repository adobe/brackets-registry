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

var AWS        = require("aws-sdk"),
    fs         = require("fs"),
    path       = require("path"),
    readline   = require("readline"),
    FileQueue  = require("filequeue"),
    eachline   = require("eachline"),
    Promise    = require("bluebird"),
    _          = require("lodash");

// this regex is used to parse AWS access logfiles. A usual line in the logfile looks like the one below.
// 04db613bd000d07badc32d16138efc3efa3e96c6c3ca18365997ba468a6ac850 repository.brackets.io [19/Jul/2013:16:26:40 +0000] 192.150.22.5 - 5444C2FE39980E28 REST.GET.OBJECT select-parent/select-parent-1.0.0.zip "GET /repository.brackets.io/select-parent/select-parent-1.0.0.zip HTTP/1.1" 200 - 56846 56846 566 268 "-" "-" -
var regex = /(\S+) (\S+) (\S+ \+\S+\]) (\S+) (\S+) (\S+) (\S+) (\S+) "(\S+) (\S+) (\S+)" (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) "(.*)" (\S+)/;

function LogfileProcessor(config) {
    var accessKeyId = config["aws.accesskey"],
        secretAccessKey = config["aws.secretkey"];

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
    /**
     * Download the S3 logfiles into the directory tempFolderName. The lastProcessedTimestamp indicates the last processed logfile.
     * All previous logfiles will be skipped and not downloaded for further processing.
     * @param {String} - tempFolderName temp location to store the logfiles
     * @param {String} - lastProcessedTimestamp timestamp of the logfile last processed. Should be either 0 (include all)
     * or something much greater
     */
    downloadLogfiles: function (tempFolderName, lastProcessedTimestamp) {
        var self = this;

        if (!lastProcessedTimestamp) {
            lastProcessedTimestamp = 0;
        }

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
            var fq = new FileQueue(100);

            var allPromises = data.Contents.map(function (obj) {
                if (new Date(obj.LastModified) > lastProcessedTimestamp) {
                    return _writeLogfileHelper(fq, obj);
                }
            });

            // get the last logfiles timestamp
            var ts;
            if (data.Contents.length) {
                var lastLogfileObject = data.Contents[data.Contents.length - 1];
                ts = lastLogfileObject.LastModified;
            }

            Promise.settle(allPromises).then(function () {
                globalPromise.resolve(ts);
            });
        });

        return globalPromise.promise;
    },
    
    /**
     * Process all the logfiles in tempFolderName. We are extracting the name and version of the extension (derived from the zip filename).
     *
     * @param {String} - tempFolderName temp location to store the logfiles
     * @return {JSON} - {"extensionname": downloads: {versions: {"version": downloadsPerVersion}}}
     */
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
    },

    _downloadLogfiles: function (tempFolderName, lastProcessedTimestamp) {
        return this.downloadLogfiles(tempFolderName, lastProcessedTimestamp);
    },

    getRecentDownloads: function (tempFolderName) {
        var sevenDaysAgo = new Date() - (7 * 24 * 60 * 60 * 1000),
            recentDownloadsPromise = Promise.defer();

        var self = this;

        // download only the logfiles starting 7 days ago
        var promise = this._downloadLogfiles(tempFolderName, sevenDaysAgo);
        promise.then(function (timestampLastProcessedLogfile) {
            self.extractDownloadStats(tempFolderName).then(function (resultJSON) {
                // transform to something more suitable
                var extensionNames = _.keys(resultJSON);
                var recentDownloads = extensionNames.map(function (extensionName) {
                    var result = {"extensionName": extensionName};

                    var totalDownloads = 
                        _.reduce(resultJSON[extensionName].downloads.versions, function (sum, num) {
                            return sum + num;
                        });

                    result["totalDownloads"] = totalDownloads;
                    return result;
                });

                recentDownloads = _.sortBy(recentDownloads, "totalDownloads").reverse();

                var recentDownloadsWithMetadata = {};
                recentDownloadsWithMetadata["startDate"] = new Date(sevenDaysAgo);
                recentDownloadsWithMetadata["endDate"] = new Date();
                recentDownloadsWithMetadata["mostDownloadedExtensions"] = recentDownloads;
                recentDownloadsPromise.resolve(recentDownloadsWithMetadata);
            });
        });

        return recentDownloadsPromise.promise;
    }
};

// API
exports.LogfileProcessor = LogfileProcessor;
