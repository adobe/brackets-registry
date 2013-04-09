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

"use strict";

var AWS     = require("aws-sdk"),
    zlib    = require("zlib"),
    fs      = require("fs"),
    logging = require("./logging");

var Errors = {
    UNREADABLE_REGISTRY: "UNREADABLE_REGISTRY"
};

/**
 * Stores repository data in S3.
 *
 * @param <Object> configuration with access info for S3
 */
function S3Storage(config) {
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
    
    // We use these flags to make sure that the latest registry is stored and that
    // we only have one call to save the registry in progress at a time.
    this._registrySaveInProgress = false;
    this._pendingRegistry = null;
}

S3Storage.prototype = {
    /**
     * Save the registry to S3.
     * 
     * @param <Object> updated registry information to save
     */
    saveRegistry: function (updatedRegistry) {
        // If we're already saving, then we hang on to the registry to save
        // and we'll take care of it later.
        if (this._registrySaveInProgress) {
            this._pendingRegistry = updatedRegistry;
            return;
        }
        
        this._registrySaveInProgress = true;
        
        var s3 = new AWS.S3.Client({
            sslEnabled: true
        });
        
        var self = this;
        
        // The object is stored as gzipped JSON.
        zlib.gzip(new Buffer(JSON.stringify(updatedRegistry)), function (err, body) {
            s3.putObject({
                Bucket: self.bucketName,
                Key: "registry.json",
                ACL: "public-read",
                ContentEncoding: "gzip",
                ContentType: "application/json",
                Body: body
            }, function (err, data) {
                if (err) {
                    logging.error("S3 saveRegistry", err);
                }
                
                self._registrySaveInProgress = false;
                
                // If there was a pending registry save, now is the time to save it again.
                var pendingRegistry = self._pendingRegistry;
                self._pendingRegistry = null;
                if (pendingRegistry !== null) {
                    self.saveRegistry(pendingRegistry);
                }
            });
        });
    },
    
    /**
     * Saves a package file to the repository of packages in S3.
     *
     * @param <Object> information about the entry from the registry
     * @param <String> path to the file
     * @param <Function> callback function that is called with error, if any
     */
    savePackage: function (entry, path, callback) {
        var s3 = new AWS.S3.Client({
            sslEnabled: true
        });
        
        // Filenames (keys in S3) are of the form
        // extension-name/x.y.z.zip
        // where x.y.z is the version number
        var version = entry.versions[entry.versions.length - 1].version;
        var name = entry.metadata.name;
        var key = name + "/" + name + "-" + version + ".zip";

        var readstream = fs.createReadStream(path);
        
        s3.putObject({
            Bucket: this.bucketName,
            Key: key,
            Body: readstream,
            ACL: "public-read",
            ContentType: "application/zip"
        }, function (err, data) {
            if (err) {
                logging.error("S3 savePackage: " + name, err);
            }
            callback(err);
        });
    },
    
    /**
     * Retrieve the registry from S3.
     *
     * If anything goes wrong, the callback is called with an error.
     * Otherwise, the callback is called with the ready-to-use registry object
     *
     * @param <Function> callback(err, registry)
     */
    getRegistry: function (callback) {
        var s3 = new AWS.S3.Client({
            sslEnabled: true
        });
        s3.getObject({
            Bucket: this.bucketName,
            Key: "registry.json"
        }, function (err, result) {
            if (err) {
                logging.error("S3 getRegistry", err);
                callback(err, null);
                return;
            }
            
            // The registry is stored as gzipped JSON, so we need to reverse that
            zlib.gunzip(result.Body, function (err, uncompressed) {
                if (err) {
                    callback(err, null);
                    return;
                }
                try {
                    var registry = JSON.parse(uncompressed.toString());
                    callback(null, registry);
                } catch (e) {
                    var error = new Error(Errors.UNREADABLE_REGISTRY);
                    error.errors = [[e.toString()]];
                    logging.error("S3 parsing registry", e);
                    callback(error, null);
                    return;
                }
            });
        });
    }
};

exports.Storage = S3Storage;