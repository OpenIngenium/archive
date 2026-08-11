'use strict';
var avacado = require('arangojs');
var app = require('express')();
var http = require('http');
var swaggerTools = require('swagger-tools');
var jsyaml = require('js-yaml');
var jwt = require('jsonwebtoken');
var fs = require('fs');
var serverPort = 8010;
var path = require('path');
var bodyParser = require('body-parser');
var base_funcs = require('./api/base_funcs');
var node_funcs = require('./api/node_funcs');
var util = require('util');
const uuid = require('uuid');
var interceptor  = require('express-interceptor');
var config = require('./config');
var _ = require('lodash');

var log = base_funcs.log;
log.info(`LOG_LEVEL: ${log.level.toUpperCase()}`);

var public_pem = config.public_pem;

base_funcs.init_db()
.then((res) => {

    // Need to override the size limit of body payload of swagger middleware.
    // Needs to set before swagger middleware stuff.
    // See "https://stackoverflow.com/questions/19917401/error-request-entity-too-large"
    app.use(bodyParser.json({limit: "500mb"}));
    app.use(bodyParser.urlencoded({limit: "5mb", extended: true, parameterLimit:5000}));

    app.use(interceptor(function (req, res) {
      return {
        isInterceptable: function() {
          let check = false;
          let apiPath = req.swagger ? req.swagger.apiPath : null;
          
          if (req.method == 'POST' || req.method == 'PUT' || req.method == 'PATCH' || req.method == 'DELETE') {
            if (apiPath) {
              check = true;
            }
          }
          return check;
        },
    
        intercept: function(body, send) {
          // send response 
          send(body);
    
          // Generate logs for API call
          // Log only if the HTTP method (operation) is defined for the end point
          if (req.swagger.operation) {
            let response_data = '';
            if (body) {
              try {
                response_data = JSON.parse(body);
              } catch (error) {
                log.warning(`Error when converting body to json: ${error}`);
                response_data = util.inspect(body);
              }
            }

            // send event message
            let swagger_params = {};
  
            let authorization_header = req.headers['authorization'] || req.headers['Authorization'] || '';
            let user_name = '';
  
            if (authorization_header.toLowerCase().startsWith('bearer')) {
              try {
                user_name = node_funcs.parse_username(authorization_header);
              } catch(err) {
                log.warning('failed to get user_name from JWT token', util.inspect(err));
              }
            } else if (authorization_header.toLowerCase().startsWith('basic')) {
              user_name = req.params && req.params.user ? req.params.user : '';
            }
  
            let params_keys = Object.keys(req.swagger.params);
            for (let i=0; i < params_keys.length; i++) {
              let key = params_keys[i];
              // exclude uploaded file
              if (key != 'file_content') {
                let parameter_type = req.swagger.params[key]['schema']['in'];
                // exclude body content. This will be captured as req.body below.
                if (parameter_type != 'body') {
                  swagger_params[key] = req.swagger.params[key].value;
                }
              }
            }

            let execution_id = null;
            if (swagger_params.execution_id) {
              execution_id = swagger_params.execution_id;
            } else if (req.body && req.body.execution_id) {
              execution_id = req.body.execution_id;
            }

            let message = req.swagger.operation.description || '';
            let operation_id = req.swagger.operation.operationId || '';
            let procedure_id = swagger_params['procedure_id'] || '';
            let elem_id = swagger_params['elem_id'] || '';

            let log_entry = {
              'user_name': user_name,
              'service': 'archive_ing',
            }

            log_entry['event'] = operation_id;
            if (execution_id) {
              log_entry['execution_id'] = execution_id;
            }
            if (procedure_id) {
              log_entry['procedure_id'] = procedure_id;
            }
            if (elem_id) {
              log_entry['elem_id'] = elem_id;
            }

            if (res.statusCode < 200 || res.statusCode >= 400) {
              log_entry['data'] = response_data;
              log.error(message, log_entry);
            } else {
              log.info(message, log_entry);
            }
          }
        }
      }
    }));
    
  
    // swaggerRouter configuration
    var options = {
      controllers: './controllers',
      useStubs: false // Conditionally turn on stubs (mock mode)
    };

    // The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
    var spec = fs.readFileSync('./api/swagger.yaml', 'utf8');
    var swaggerDoc = jsyaml.load(spec);

    // Initialize the Swagger middleware
    swaggerTools.initializeMiddleware(swaggerDoc, function (middleware) {
      // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
      app.use(middleware.swaggerMetadata());

      app.use(middleware.swaggerSecurity({
        UserSecurity: function(req, security_defs, required_scopes, cb) {
          log.trace(`apiPath: ${req.swagger.apiPath}`);
          log.trace(`method: ${req.method}`);

          // if the scope is explicitly specified as an empty list, do not check the token (e.g., 'health' end point)
          if (Array.isArray(required_scopes) && (required_scopes.length == 0)) {
            return cb(null);
          }      

          let key = '';
          let authorization_header = req.headers['authorization'] || req.headers['Authorization'] || '';
          if (authorization_header.toLowerCase().startsWith('bearer ')) {
            key = authorization_header.substring(7);
          } 
    
          if (key) {
            let decoded = '';
            try {
              decoded = jwt.verify(key, public_pem, {
                algorithms: ['RS256']
              });
            } catch (e) {
              let err = new Error('access denied: ' + e.toString());
              err.statusCode = 403;
              return cb(err);
            }
      
            let scopes = decoded['scopes'];
  
            const scope_names = scopes.map(scope => scope.hasOwnProperty('scope') ? scope.scope : scope);
            log.trace(`scope_names: ${scope_names}`);    
            let intersection_scopes = _.intersection(scope_names, required_scopes);
            log.trace(`intersection_scopes: ${intersection_scopes}`);
    
            if(intersection_scopes.length > 0) {
              return cb(null);
            } else {
              req.res.status(403).json({'message': 'user does not have the permission'});
              req.res.end();              
            }
          } else {
            req.res.status(401).json({'message': 'api key was not provided'});
            req.res.end();
          }
        }
      }));

      // Validate Swagger requests
      app.use(middleware.swaggerValidator());

      // Route validated requests to appropriate controller
      app.use(middleware.swaggerRouter(options));

      // Serve the Swagger documents and Swagger UI
      app.use(middleware.swaggerUi());

      // To capture more useful message of the validation error
      app.use(function(err, req, res, next) {
        // If response headers have already been sent, delegate to the default Express error handler.
        // See https://expressjs.com/en/guide/error-handling.html#the-default-error-handler
        if (res.headersSent) {
          return next(err);
        }

        if (err && err.failedValidation) {
          // The format of err varies depending of the type of error. 
          // Convert the entire object a string.
          let message = 'Failed schema validation';
          let details = [JSON.stringify(err)];
          const error_obj = {message: message, details: details};
          res.status(400).send(error_obj);
        } else if (err) {
          return next(err);
        }
        else {
          return next();
        }
      });

      // Start the server
      http.createServer(app).listen(serverPort, function () {
        log.info(`Your server is listening on (http://localhost:${serverPort})`);
        log.info(`Swagger-ui is available on http://localhost:${serverPort}/docs`, serverPort);
      });
    });
    app.get('/prettydoc', function(req, res) {
        res.sendFile(path.join(__dirname + '/redoc.html'));
    });
  }, (err) => {
    log.error(err);
})
