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


/**
 * Stores repository data in memory. Used for unit tests and running on localhost.
 * Does not do anything with the passed-in config.
 *
 * @param <Object> unused
 */
function RAMStorage(config) {
    this.registry = {};
    this.files = {};
}

RAMStorage.prototype = {
    /**
     * Save the registry (keeps a clone in this storage).
     * 
     * @param <Object> updated registry information to save
     */
    saveRegistry: function (updatedRegistry) {
        // Abuse the JSON object to clone the registry
        this.registry = JSON.parse(JSON.stringify(updatedRegistry));
    },
    
    /**
     * Saves a package file to the repository of packages. In this case,
     * we just keep track of the saved files and their paths.
     *
     * @param <Object> information about the entry from the registry
     * @param <String> path to the file
     * @param <Function> callback that is called (immediately for this storage)
     */
    savePackage: function (entry, path, callback) {
        var version = entry.versions[entry.versions.length - 1].version;
        var name = entry.metadata.name;
        this.files[name + "/" + name + "-" + version + ".zip"] = path;
        callback(null);
    },
    
    /**
     * Retrieve the registry. Since this one is just passing back an object clone,
     * this happens synchronously. No errors are possible with this implementation.
     *
     * @param <Function> callback(err, registry)
     */
    getRegistry: function (callback) {
        // Abuse the JSON object to clone the registry
        callback(null, JSON.parse(JSON.stringify(this.registry)));
    }
};

exports.Storage = RAMStorage;