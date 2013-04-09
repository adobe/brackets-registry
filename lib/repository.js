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

var validate = require("brackets-extensibility/package-validator").validate,
    semver   = require("semver");

/**
 * The data structure that keeps all of the registration information.
 *
 * @type {Object<{{metadata:Object, owner:String, versions:Array<Object>}}}
 */
var registry = null;

/**
 * Configuration that describes how the repository data is managed. Call
 * configure() before using this module.
 *
 * @type <Object>
 */
var config = null;

var storage = null;

var saveInterval = null;

var Errors = {
    NOT_AUTHORIZED:         "NOT_AUTHORIZED",
    BAD_VERSION:            "BAD_VERSION",
    VALIDATION_FAILED:      "VALIDATION_FAILED",
    REGISTRY_NOT_LOADED:    "REGISTRY_NOT_LOADED",
    
    // These failures do not need to be localized. They are only displayed to people
    // running the server.
    NOT_CONFIGURED:         "Repository not configured!"
};

function validConfiguration(callback) {
    if (config === null || storage === null) {
        callback(new Error(Errors.NOT_CONFIGURED));
        return false;
    }
    if (registry === null) {
        callback(new Error(Errors.REGISTRY_NOT_LOADED));
        return false;
    }
    return true;
}

/**
 * Adds or updates a package in the repository.
 * 
 * The package is validated, the user's authorization is checked, the version
 * is checked to ensure that only newer versions of major branches are being uploaded.
 * If any of these fail, an Error is sent back to the callback.
 *
 * If there are no errors, the callback is called with the updated repository entry.
 *
 * @param {String} path to the package file
 * @param {String} user identifier for the person submitting the file (e.g. "github:someusername")
 * @param {Function} callback (err, entry)
 */
function addPackage(packagePath, userID, callback) {
    if (!validConfiguration(callback)) {
        return;
    }
    validate(packagePath, {
        requirePackageJSON: true
    }, function (err, result) {
        if (err) {
            callback(err, null);
            return;
        }
        
        if (result.errors && result.errors.length) {
            var error = new Error(Errors.VALIDATION_FAILED);
            error.errors = result.errors;
            callback(error, null);
            return;
        }
        
        var name = result.metadata.name;
        
        // Look up the current repository entry to see if this is an add or update
        var entry, updateRegistry;
        
        if (registry.hasOwnProperty(name)) {
            // update
            entry = registry[result.metadata.name];
            
            // Verify that the user is authorized to add this package
            if (entry.owner !== userID) {
                callback(new Error(Errors.NOT_AUTHORIZED), null);
                return;
            }
            
            // Verify that this is a higher version number
            var newVersion = result.metadata.version;
            var lastVersion = entry.versions[entry.versions.length - 1].version;
            if (!semver.gt(newVersion, lastVersion)) {
                callback(new Error(Errors.BAD_VERSION), null);
                return;
            }
            updateRegistry = function () {
                entry.versions.push({
                    version: newVersion,
                    published: new Date().toJSON()
                });
                
                entry.metadata = result.metadata;
            };
        } else {
            // add
            entry = {
                metadata: result.metadata,
                owner: userID,
                versions: [{
                    version: result.metadata.version,
                    published: new Date().toJSON()
                }]
            };
            updateRegistry = function () {
                registry[result.metadata.name] = entry;
            };
        }
        
        storage.savePackage(entry, packagePath, function (err) {
            if (err) {
                callback(err, null);
            } else {
                updateRegistry();
                
                // Keep track of the Brackets compatibility information per version
                // so that the client can install the right version for the user's copy
                // of Brackets
                if (result.metadata.engines && result.metadata.engines.brackets) {
                    entry.versions[entry.versions.length - 1].brackets = result.metadata.engines.brackets;
                }
                
                storage.saveRegistry(registry);
                callback(null, entry);
            }
        });
    });
}

/*
 * Sets the configuration in use by this module.
 *
 * @param <Object> configuration object read from JSON file
 */
function configure(newConfig) {
    config = newConfig;
    var storageType = config.storage;
    if (!storageType) {
        throw new Error("Storage not provided in config file");
    }
    registry = null;
    var Storage = require(storageType).Storage;
    storage = new Storage(config);
    storage.getRegistry(function (err, currentRegistry) {
        if (err) {
            console.error("Unable to load registry!", err);
            return;
        }
        registry = currentRegistry;
    });
}

/*
 * Returns the current registry. Note that this is a reference to
 * the actual in-memory registry, so callers should not modify it
 * directly.
 *
 * @return {Object} The current registry. May be null if it hasn't yet
 * been initialized.
 */
function getRegistry() {
    return registry;
}

exports.addPackage = addPackage;
exports.configure = configure;
exports.getRegistry = getRegistry;

