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

/*
 * N.B.: This file is the source for `src/extensibility/registry_utils.js` in Brackets.
 * We can't use the exact same file currently because Brackets uses AMD-style modules, so the Brackets
 * version has the AMD wrapper added (and is reindented to avoid JSLint complaints).
 * If changes are made here, the version in Brackets should be kept in sync.
 * In the future, we should have a better mechanism for sharing code between the two.
 */

/*jslint vars: true, plusplus: true, node: true, nomen: true, indent: 4, maxerr: 50 */
/*global define*/

"use strict";

var numeral         = require("numeral");

// From Brackets StringUtils
function htmlEscape(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Gets the last version from the given object and returns the short form of its date.
 * Assumes "this" is the current template context.
 * @return {string} The formatted date.
 */
exports.lastVersionDate = function () {
    var result;
    if (this.versions && this.versions.length) {
        result = this.versions[this.versions.length - 1].published;
        if (result) {
            // Just return the ISO-formatted date, which is the portion up to the "T".
            var dateEnd = result.indexOf("T");
            if (dateEnd !== -1) {
                result = result.substr(0, dateEnd);
            }
        }
    }
    return result || "";
};

/**
 * Returns a more friendly display form of the owner's internal user id.
 * Assumes "this" is the current template context.
 * @return {string} A display version in the form "id (service)".
 */
exports.formatUserId = function () {
    var friendlyName;
    if (this.user && this.user.owner) {
        var nameComponents = this.user.owner.split(":");
        friendlyName = nameComponents[1];
    }
    return friendlyName;
};

/**
 * Given a registry item, returns a URL that represents its owner's page on the auth service.
 * Currently only handles GitHub.
 * Assumes "this" is the current template context.
 * @return {string} A link to that user's page on the service.
 */
exports.ownerLink = function ownerLink () {
    var url;
    if (this.user && this.user.owner) {
        var nameComponents = this.user.owner.split(":");
        if (nameComponents[0] === "github") {
            url = "https://github.com/" + nameComponents[1];
        }
    }
    return url;
};

/**
 * Returns the src url for an owner's git Avatar.
 * @returns {string} The url for an owners Git Avatar.
 */
exports.gitAvatar = function gitAvatar () {
    var avatar = "img/registry/github-grey.svg";
    if (this.owner) {
        var nameComponents = this.owner.split(":");
        if (nameComponents[0] === "github") {
            avatar = "https://github.com/" + nameComponents[1] + ".png?size=50";
        }
    }
    return avatar;
};


/**
 * Given a registry item, fetches and formats the total Downloads
 * @returns {string} Formatted total Downloads
 */
exports.totalDownloads = function () {
    var retval = parseInt(this.totalDownloads);
    retval = isNaN(retval) ? 0 : retval;
    if (retval > 999) {
        retval = numeral(retval).format('0.0a');
    }
    return retval;
};

/**
 * Given a registry item, formats the author information, including a link to the owner's
 * github page (if available) and the author's name from the metadata.
 */
exports.authorInfo = function () {
    var result = "",
        ownerLink = exports.ownerLink.call(this),
        userId = exports.formatUserId.call(this);
    if (this.metadata && this.metadata.author) {
        // author can be either a string or an object with a "name" field
        result += htmlEscape(this.metadata.author.name || this.metadata.author);
    }
    if (userId) {
        if (result !== "") {
            result += " / ";
        }
        result += "<a href='" + htmlEscape(ownerLink) + "'>" + htmlEscape(userId) + "</a>";
    }
    return result;
};

/**
 * URL encodes the extension name and the version.
 *
 * @param {string} baseURL The registry base url
 * @param {string} name The name of the extension
 * @param {string} version The version of the extension
 *
 * @return {string} An URI to download the extension
 */
exports.formatDownloadURL = function (baseURL, name, version) {
    var urlEncodedName = encodeURIComponent(name),
        urlEncodedNameAndVersion = encodeURIComponent(name + "-" + version + ".zip");

    return baseURL + "/" + urlEncodedName + "/" + urlEncodedNameAndVersion;
};

/**
 * Returns an array of current registry entries, sorted by the publish date of the latest version of each entry.
 * @param {object} registry The unsorted registry.
 * @param {string} subkey The subkey to look for the registry metadata in. If unspecified, assumes
 *     we should look at the top level of the object.
 * @return {Array} Sorted array of registry entries.
 */
exports.sortRegistry = function (registry, subkey) {
    function getPublishTime(entry) {
        if (entry.versions) {
            return new Date(entry.versions[entry.versions.length - 1].published).getTime();
        }

        return Number.NEGATIVE_INFINITY;
    }

    var sortedEntries = [];

    // Sort the registry by last published date (newest first).
    Object.keys(registry).forEach(function (key) {
        sortedEntries.push(registry[key]);
    });
    sortedEntries.sort(function (entry1, entry2) {
        return getPublishTime((subkey && entry2[subkey]) || entry2) -
            getPublishTime((subkey && entry1[subkey]) || entry1);
    });

    return sortedEntries;
};

/**
 * Returns an array of 4 registry entries, sorted by the total downloads from the begining of time.
 * @param {object} registry The unsorted registry.
 * @param {string} subkey The subkey to look for the registry metadata in. If unspecified, assumes
 *     we should look at the top level of the object.
 * @return {Array} Sorted array of registry entries.
 */
exports.getMostDownloaded = function (registry, subkey) {
    var sortedEntries = [];

    // Sort the registry by most downloads (highest first).
    Object.keys(registry).forEach(function (key) {
        sortedEntries.push(registry[key]);
    });
    sortedEntries.sort(function (entry1, entry2) {
        var e1 = parseInt(entry1.totalDownloads),
            e2 = parseInt(entry2.totalDownloads);
        
        e1 = isNaN(e1) ? 0 : e1;
        e2 = isNaN(e2) ? 0 : e2;
        
        return e2 - e1;
    });

    return sortedEntries.slice(0,4);
};


/**
 * Returns an array of 4 current registry entries, sorted by the publish date of the latest version of each entry.
 * @param {object} registry The unsorted registry.
 * @param {string} subkey The subkey to look for the registry metadata in. If unspecified, assumes
 *     we should look at the top level of the object.
 * @return {Array} Sorted array of registry entries.
 */
exports.getRecentlyUpdated = function (registry, subkey) {
    function getPublishTime(entry) {
        if (entry.versions) {
            return new Date(entry.versions[entry.versions.length - 1].published).getTime();
        }

        return Number.NEGATIVE_INFINITY;
    }

    var sortedEntries = [];

    // Sort the registry by last published date (newest first).
    Object.keys(registry).forEach(function (key) {
        sortedEntries.push(registry[key]);
    });
    sortedEntries.sort(function (entry1, entry2) {
        return getPublishTime((subkey && entry2[subkey]) || entry2) -
            getPublishTime((subkey && entry1[subkey]) || entry1);
    });

    return sortedEntries.slice(0,4);
};

/**
 * Returns an array of 4 most recently created registry entries.
 * @param {object} registry The unsorted registry.
 * @param {string} subkey The subkey to look for the registry metadata in. If unspecified, assumes
 *     we should look at the top level of the object.
 * @return {Array} Sorted array of registry entries.
 */
exports.getRecentlyCreated = function (registry, subkey) {
    function getPublishTime(entry) {
        if (entry.versions) {
            return new Date(entry.versions[0].published).getTime();
        }

        return Number.NEGATIVE_INFINITY;
    }

    var sortedEntries = [];

    // Sort the registry by last published date (newest first).
    Object.keys(registry).forEach(function (key) {
        sortedEntries.push(registry[key]);
    });
    sortedEntries.sort(function (entry1, entry2) {
        return getPublishTime((subkey && entry2[subkey]) || entry2) -
            getPublishTime((subkey && entry1[subkey]) || entry1);
    });

    return sortedEntries.slice(0,4);
};

/**
 * Returns an array of 4 registry entries, sorted by the recent week downloads (highest first).
 * @param {object} registry The unsorted registry.
 * @param {string} subkey The subkey to look for the registry metadata in. If unspecified, assumes
 *     we should look at the top level of the object.
 * @return {Array} Sorted array of registry entries.
 */
exports.getTrending = function (registry, subkey) {
    
    function getWeeklyDownloads(entry) {
        var downloads = 0;
        if (entry.recent) {
            Object.keys(entry.recent).forEach(function (key) {
                downloads = downloads + parseInt(entry.recent[key]);
            });
        }
        return downloads;
    }
    
    var sortedEntries = [];

    // Sort the registry by most downloads (highest first).
    Object.keys(registry).forEach(function (key) {
        sortedEntries.push(registry[key]);
    });
    sortedEntries.sort(function (entry1, entry2) {
        return getWeeklyDownloads(entry2) -
            getWeeklyDownloads(entry1);
    });

    return sortedEntries.slice(0,4);
};

/**
 * Returns a filtered registry list.
 * @param {object} registry The unsorted registry.
 * @param {object} filterKey:filterValue pairs to look for the registry metadata in.
 * @return {Array} Filtered array of registry entries.
 */
exports.getFilteredList = function (registry, filters) {
    var config = {};
    var filterEntries = decodeURIComponent(filters['q'] || "").split(/\s/).every(function(entry) {
        var pair = entry.split(":");
        var decodedStringVal;
        if (pair.length === 1) {
            config["name"] = pair[0];
            config["title"] = pair[0];
            config["keywords"] = pair[0];
            config["owner"] = pair[0];
        } else {
            config[pair[0]] = pair[1];
        }
    });
    var sortedEntries = [],
        filteredEntries = [];
    
    // Sort the registry by most downloads (highest first).
    Object.keys(registry).forEach(function (key) {
        sortedEntries.push(registry[key]);
    });
    sortedEntries.sort(function (entry1, entry2) {
        return entry2.totalDownloads -
            entry1.totalDownloads;
    });
    
    sortedEntries.every(function(registryEntry) {
        var matched = false;
        Object.keys(config).every(function(filterkey) {
            if (registryEntry.metadata[filterkey] && registryEntry.metadata[filterkey].indexOf(config[filterkey]) !== -1) {
                matched = true;
            }
        });
        if (matched) {
            filteredEntries.push(registryEntry);
        }
        return true;
    });

    return filteredEntries;
};


