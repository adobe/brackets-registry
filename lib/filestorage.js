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

var fs = require("fs-extra"),
    path = require("path");

/**
 * Stores repository data in files on disk. Used for running on localhost.
 * This requires dev-dependencies to be installed.
 *
 * @param <Object> unused
 */
function FileStorage(config) {
    if (!config.directory) {
        throw new Error("Directory must be specified in config when using the FileStorage");
    }
    this.directory = config.directory;
    this.extensionsDirectory = this.directory;
    this.registryFile = path.join(config.directory, "registry.json");
    
    // We use these flags to make sure that the latest registry is stored and that
    // we only have one call to save the registry in progress at a time.
    this._registrySaveInProgress = false;
    this._pendingRegistry = null;
}

FileStorage.prototype = {
    /**
     * Save the registry to disk.
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
        
        var self = this;

        fs.writeFile(this.registryFile, JSON.stringify(updatedRegistry), "utf8", function (err) {
            if (err) {
                console.error(err);
            }

            self._registrySaveInProgress = false;
                
            // If there was a pending registry save, now is the time to save it again.
            var pendingRegistry = self._pendingRegistry;
            self._pendingRegistry = null;
            if (pendingRegistry !== null) {
                self.saveRegistry(pendingRegistry);
            }
        });
    },
    
    /**
     * Saves a package file to the repository of packages on disk.
     *
     * @param <Object> information about the entry from the registry
     * @param <String> uploadedFile to the file
     * @param <Function> callback that is called
     */
    savePackage: function (entry, uploadedFile, callback) {
        var version = entry.versions[entry.versions.length - 1].version;
        var name = entry.metadata.name;
        var filename = path.join(this.extensionsDirectory, name + "/" + name + "-" + version + ".zip");
        fs.mkdirsSync(path.dirname(filename));
        fs.copy(uploadedFile, filename, callback);
    },
    
    /**
     * Retrieve the registry from disk
     *
     * @param <Function> callback(err, registry)
     */
    getRegistry: function (callback) {
        if (!fs.existsSync(this.extensionsDirectory)) {
            fs.mkdirsSync(this.extensionsDirectory);
        }
        if (!fs.existsSync(this.registryFile)) {
            fs.outputJsonSync(this.registryFile, {});
        }
        fs.readJson(this.registryFile, callback);
    }
};

exports.Storage = FileStorage;
