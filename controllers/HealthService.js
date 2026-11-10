'use strict';

exports.health_get = function(args, res, next) {
  /**
   *
   * returns HealthStatus
   **/
  let response =
  {
    'status' : 'OK',
    'message': ''
  };

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(response);
}
