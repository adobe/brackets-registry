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

"use strict";

var AWS  = require("aws-sdk"),
    util = require("util");

// Error Handling

var snsClient = null;
var snsTopic = null;

/**
 * Logs an error.
 *
 * By default, errors are logged to stderr (using util.debug). If AWS SNS
 * is configured (see the configure function), then errors are also logged there.
 *
 * info can be a string or an object (that is turned into JSON) and is supposed to
 * provide context about what was happening at the time of the error.
 *
 * Optionally, you can pass in just an Error object, though passing in info is recommended.
 *
 * @param <String|Object> contextual information to help determine the cause of the error
 * @param <?Error> the Error that occurred, if known
 */
exports.error = function (info, error) {
    if (info instanceof Error) {
        error = info;
        info = undefined;
    }
    
    var snsMessage = {};
    
    if (info) {
        if (typeof (info) !== "string") {
            info = JSON.stringify(info, null, 2);
        }
        util.error(info);
        snsMessage.info = info;
    }
    if (error && error instanceof Error) {
        var stack = error.stack;
        util.error(stack);
        snsMessage.error = stack;
    }
    
    if (snsClient && snsTopic) {
        snsClient.publish({
            TopicArn: snsTopic,
            Message: JSON.stringify(snsMessage)
        }, function (err, data) {
            if (err) {
                util.error("Unable to publish to SNS: " + err.stack);
            }
        });
    }
};

// If there's an uncaught exception, we'll log it and then exit with an error code
// in case the process is in a bad state.
process.on("uncaughtException", function (err) {
    exports.error("Uncaught Exception", err);
    process.exit(1);
});


// Debug Logging

var debugging = false;

/**
 * Logs a debugging message to stdout, if debugging is turned on via the
 * logging.debug configuration option.
 * 
 * @param <String> message to log
 */
exports.debug = function (message) {
    if (debugging) {
        console.log(message);
    }
};

/*
 * Sets the configuration in use by this module. The following configuration options are used:
 *
 * * aws.accesskey, aws.secretkey, sns.topic: set these options to log to AWS SNS
 * * logging.debug: set to true to log debugging messages to stdout
 *
 * @param <Object> configuration object read from JSON file
 */
exports.configure = function (config) {
    var accessKeyId = config["aws.accesskey"];
    var secretAccessKey = config["aws.secretkey"];
    snsTopic = config["sns.topic"];
    if (accessKeyId && secretAccessKey && snsTopic) {
        snsClient = new AWS.SNS.Client({
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
            sslEnabled: true
        });
    }
    
    debugging = Boolean(config["logging.debug"]);
};
