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

"use strict";

var AWS        = require("aws-sdk"),
    fs         = require("fs"),
    path       = require("path"),
    readline   = require("readline"),
    FileQueue  = require("filequeue"),
    Promise    = require("bluebird"),
    _          = require("lodash"),
    readFile   = Promise.promisify(require("fs").readFile);

// this regex is used to parse AWS access logfiles. A usual line in the logfile looks like the one below.
// 04db613bd000d07badc32d16138efc3efa3e96c6c3ca18365997ba468a6ac850 repository.brackets.io [19/Jul/2013:16:26:40 +0000] 192.150.22.5 - 5444C2FE39980E28 REST.GET.OBJECT select-parent/select-parent-1.0.0.zip "GET /repository.brackets.io/select-parent/select-parent-1.0.0.zip HTTP/1.1" 200 - 56846 56846 566 268 "-" "-" -
var AWSLogFileParserRegex = /(\S+) (\S+) (\S+ \+\S+\]) (\S+) (\S+) (\S+) (\S+) (\S+) "(\S+) (\S+) (\S+)" (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) "(.*)" (\S+)/;
var TimeStampParserRegex = /(\d+)\/(\w+)\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+(\+\d+)/;

var LAST_ACCESSED_KEY_FILENAME = "logfileProcessing/lastAccessedKey.json";

function LogfileProcessor(config) {
    var accessKeyId = config["aws.accesskey"],
        secretAccessKey = config["aws.secretkey"];

    this.bucketName = config["s3.logBucket"];

    if (!accessKeyId || !secretAccessKey || !this.bucketName) {
        throw new Error("Configuration error: aws.accesskey, aws.secretkey, or s3.logBucket missing");
    }

    AWS.config.update({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    });
}

/**
 * Create a short representation of the download timestamp extracted from the logfile
 *
 * The date in the logfile looks like this
 * 10/Apr/2013:18:28:11 +0000
 * the result will be `20130410`.
 *
 * @param {string} date - timestamp from logfile
 */
function formatDownloadDate(date) {
    var tsMatchResult = date.match(TimeStampParserRegex),
        downloadDate = "";

    if (tsMatchResult) {
        var tempDate = new Date(Date.parse(tsMatchResult[2] + ", " + tsMatchResult[1] + " " + tsMatchResult[3]));
        var month = tempDate.getMonth() + 1;
        var day = tempDate.getDate();
        downloadDate = downloadDate +
            tempDate.getFullYear() +
            (month < 10 ? "0" + month : month) +
            (day < 10 ? "0" + day : day);
    }

    return downloadDate;
}

LogfileProcessor.prototype = {
    /**
     * Write the key of the last processed logfile to S3. This key is used by S3
     * http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/frames.html
     *
     * @param {JSON} - lastAccessedKey {Key: S3Key}
     *
     * @return {Promise} - promise that resolves with the `lastAccessedKey`
     * once the object was written to S3. Will rejected with err in case of any error.
     */
    setLastProcessedKey: function (lastAccessedKey) {
        var self = this;

        var s3 = new AWS.S3.Client({
            sslEnabled: true
        });

        return new Promise(function (resolve, reject) {
            s3.putObject({
                Bucket: self.bucketName,
                Key: LAST_ACCESSED_KEY_FILENAME,
                ACL: "public-read",
                ContentType: "application/json",
                Body: new Buffer(lastAccessedKey)
            }, function (err, data) {
                if (err) {
                    reject(new Error("Error writing key for last accessed logfile entry. " + JSON.stringify(err)));
                } else {
                    resolve(lastAccessedKey);
                }
            });
        });
    },

    /**
     * Retrieve the key of the last processed object in the S3 bucket.
     * The key is stored as simple JSON {Key: S3Key}.
     *
     * @return {Promise} promise that resolved when the JSON was successfully retrieved.
     * The promise is resolved with an empty object, if the JSON object can't be found in the S3 bucket.
     * In case of an error, the promise is rejected with the err.
     */
    getLastProcessedKey: function () {
        var self = this;

        var s3 = new AWS.S3.Client({
            sslEnabled: true
        });

        return new Promise(function (resolve, reject) {
            s3.getObject({
                Bucket: self.bucketName,
                Key: LAST_ACCESSED_KEY_FILENAME
            }, function (err, data) {
                if (err) {
                    if (err.code === "NoSuchKey") {
                        // return default: read all logs
                        resolve("{}");
                    } else {
                        reject(new Error("Error retrieving key for last accessed logfile entry. " + JSON.stringify(err)));
                    }
                } else {
                    resolve(new Buffer(data.Body).toString());
                }
            });
        });
    },
    /**
     * Download the S3 logfiles into the directory tempFolderName. The lastProcessedTimestamp indicates the last processed logfile.
     * All previous logfiles will be skipped and not downloaded for further processing.
     * @param {String} - tempFolderName temp location to store the logfiles
     * @param {String} - lastProcessedKey timestamp of the logfile last processed. Should be either undefined (include all)
     * or something else. If undefined, we will retrieve all logfiles from S3.
     *
     * @return {Promise} - resolved when all logfiles have been downloaded from S3.
     */
    _downloadLogfiles: function (tempFolderName, lastProcessedKey) {
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

        /**
         * This function will list objects in the S3 bucket. and it can take care of
         * paginated results with the nextMarker parameter. If this argument is provided,
         * listObjects will return the objects that are
         *
         * @param {!String} bucketName - name of the bucket.
         * @param {?String} nextMarker - specifies the key to start with when listing objects in a bucket.
         * @param {?String} maxKeys - specifies how many objects should be returned on maximum with this call.
         *                            Defaults to 1000 if not specified (this is the API default)
         */
        function listObjects(bucketName, nextMarker, maxKeys) {
            var listObjectPromise = Promise.defer(),
                allPromises = [];

            function _listObjects(bucketName, nextMarker, maxKeys) {
                var params = {Bucket: bucketName};
                if (nextMarker) {
                    params.Marker = nextMarker;
                }

                if (maxKeys) {
                    params.MaxKeys = maxKeys;
                }

                s3.listObjects(params, function (err, data) {
                    var fq = new FileQueue(150);

                    if (err) {
                        listObjectPromise.reject(err);
                        return;
                    }

                    if (data.Contents.length) {
                        data.Contents.forEach(function (obj) {
                            var promise = _writeLogfileHelper(fq, obj);

                            promise.then(function () {
                                globalPromise.progress(".");
                            });

                            allPromises.push(promise);
                        });

                        if (data.IsTruncated) {
                            var nextMarker = data.Contents[data.Contents.length - 1].Key;
                            _listObjects(bucketName, nextMarker, maxKeys);
                        } else {
                            // this will get the Key off the last data item
                            // the log files for the registry are stored in a "subfolder"
                            // logs. Any file that appears in this bucket will be considered,
                            // even if it's located in a subfolder of logs
                            var key = data.Contents[data.Contents.length - 1].Key;

                            Promise.settle(allPromises).then(function () {
                                listObjectPromise.resolve(key);
                            }, function (err) {
                                listObjectPromise.reject(err);
                            }, function (value) {
                                listObjectPromise.progress(value);
                            });
                        }
                    } else {
                        listObjectPromise.resolve();
                    }
                });

                return listObjectPromise.promise;
            }

            return _listObjects(bucketName, nextMarker, maxKeys);
        }

        return listObjects(self.bucketName, lastProcessedKey);
    },

    /**
     * Download all the logfiles from the S3 bucket into the folder specified by
     * tempFolderName for further processing.
     *
     * @param {!String} tempFolderName - path to a valid temp folder location
     *
     * @return {Promise} - resolve with the object key of the last processed object
     * reject with error string in case of an error
     */
    downloadLogfiles: function (tempFolderName) {
        var self = this;

        function _getValidKeyFromJson(lastProcessedKeyJson) {
            var lastKeyJson = JSON.parse(lastProcessedKeyJson);

            var lastKey;
            if (lastKeyJson.hasOwnProperty("Key")) {
                lastKey = lastKeyJson.Key;
            }

            return lastKey;
        }

        function _setLastProcessedLogFileKey(lastProcessedLogfileKey) {
            return new Promise(function (resolve, reject) {
                if (lastProcessedLogfileKey) {
                    var key = JSON.stringify({"Key": lastProcessedLogfileKey});

                    self.setLastProcessedKey(key).then(function () {
                        resolve(key);
                    }).catch(function (err) {
                        reject(err);
                    });
                } else {
                    resolve();
                }
            });
        }

        return self.getLastProcessedKey().then(function (lastProcessedKeyJson) {
            return self._downloadLogfiles(tempFolderName, _getValidKeyFromJson(lastProcessedKeyJson));
        }).then(function (key) {
            return _setLastProcessedLogFileKey(key);
        });
    },

    /**
     * Process all the logfiles in tempFolderName. We are extracting the name and version of the extension (derived from the zip filename).
     *
     * @param {String} - tempFolderName temp location to store the logfiles
     * @return {JSON} - {"extensionname": downloads: {versions: {"version": downloadsPerVersion}}}
     */
    extractDownloadStats: function (tempFolderName) {
        var globalPromise = Promise.defer(),
            result = {};

        function _readLogfileHelper(fq, fileName) {
            var fileReadPromise = Promise.defer();

            fq.readFile(fileName, function (err, fileContent) {
                if (err) {
                    fileReadPromise.reject(err);
                } else {
                    fileReadPromise.resolve(fileContent);
                }
            });

            return fileReadPromise.promise;
        }

        function parseLogfile(content) {
            var readContentPromise = Promise.defer();

            var lines = content.toString().split('\n');
            lines.forEach(function (line, index) {
                var matchResult = line.match(AWSLogFileParserRegex);
                if (matchResult) {
                    var uri = matchResult[8],
                        date = matchResult[3],
                        httpStatusCode = matchResult[12],
                        downloadDate = formatDownloadDate(date);

//                  // we are only interested in the Extension zip files
                    var m = uri.match(/(\S+)\/(\S+)\-(.*)\.zip/);
                    if (m && httpStatusCode === "200") {
                        var extensionName = m[1],
                            version = m[3];

                        if (!result[extensionName]) {
                            result[extensionName] = {downloads : { versions: {}, recent: {}}};

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

                        // count the recent downloads
                        var recentDownloads = result[extensionName].downloads.recent;

                        if (recentDownloads[downloadDate]) {
                            recentDownloads[downloadDate]++;
                        } else {
                            recentDownloads[downloadDate] = 1;
                        }
                    }
                }

                if (index === (lines.length - 1)) {
                    readContentPromise.resolve(result);
                } else {
                    readContentPromise.progress(".");
                }
            });

            return readContentPromise.promise;
        }

        fs.readdir(tempFolderName, function (err, allFiles) {
            var fq = new FileQueue(150);

            var allPromises = allFiles.map(function (file) {
                var deferred = Promise.defer();

                var _readLogfileHelperPromise = _readLogfileHelper(fq, path.resolve(tempFolderName, file));

                _readLogfileHelperPromise.then(function (content) {
                    parseLogfile(content).then(function () {
                        deferred.resolve();
                    });
                }).done(function () {
                    globalPromise.progress(".");
                });

                return deferred.promise;
            });

            Promise.settle(allPromises).then(function () {
                globalPromise.resolve(result);
            });
        });

        return globalPromise.promise;
    }
};

// API
exports.LogfileProcessor = LogfileProcessor;
