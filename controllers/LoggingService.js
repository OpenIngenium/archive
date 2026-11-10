'use strict';


var base_funcs = require('../api/base_funcs');
var node_funcs = require('../api/node_funcs');
var log = base_funcs.log;

exports.get_logging = function(args, res, next) {
  /**
   *
   * returns LoggingInfo
   **/

  let logging_info = node_funcs.getLogging();
  res.status(200).json(logging_info);
}

exports.update_logging = function(args, res, next) {
  /**
   * Update logging status
   *
   * logging_info LoggingInfo Logging info
   * no response value expected for this operation
   **/

  let logging_info = args['logging_info'].value;

  try {
    node_funcs.updateLogging(logging_info);
    res.status(204).end();
  } catch(e) {
    res.status(400).json({'message': e.toString()});
  }
}
