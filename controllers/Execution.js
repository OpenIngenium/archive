'use strict';

var url = require('url');

var Execution = require('./ExecutionService');

module.exports.create_execution = function create_execution (req, res, next) {
  Execution.create_execution(req.swagger.params, res, next);
};

module.exports.create_execution_step = function create_execution_step (req, res, next) {
  Execution.create_execution_step(req.swagger.params, res, next);
};

module.exports.delete_execution = function delete_execution (req, res, next) {
  Execution.delete_execution(req.swagger.params, res, next);
};

module.exports.get_execution = function get_execution (req, res, next) {
  Execution.get_execution(req.swagger.params, res, next);
};

module.exports.get_execution_as_run = function get_execution_as_run (req, res, next) {
  Execution.get_execution_as_run(req.swagger.params, res, next);
};

module.exports.get_execution_elements = function get_execution_elements (req, res, next) {
  Execution.get_execution_elements(req.swagger.params, res, next);
};

module.exports.get_execution_simple_elements = function get_execution_simple_elements (req, res, next) {
  Execution.get_execution_simple_elements(req.swagger.params, res, next);
};

module.exports.update_execution_elements = function update_execution_elements (req, res, next) {
  Execution.update_execution_elements(req.swagger.params, res, next);
};

module.exports.get_execution_outline = function get_execution_outline (req, res, next) {
  Execution.get_execution_outline(req.swagger.params, res, next);
};

module.exports.get_execution_history = function get_execution_history (req, res, next) {
  Execution.get_execution_history(req.swagger.params, res, next);
};

module.exports.get_execution_status = function get_execution_status (req, res, next) {
  Execution.get_execution_status(req.swagger.params, res, next);
};

module.exports.get_execution_steps = function get_execution_steps (req, res, next) {
  Execution.get_execution_steps(req.swagger.params, res, next);
};

module.exports.get_executions = function get_executions (req, res, next) {
  Execution.get_executions(req.swagger.params, res, next);
};

module.exports.move_execution_element = function move_execution_element (req, res, next) {
  Execution.move_execution_element(req.swagger.params, res, next);
};

module.exports.copy_execution_element = function copy_execution_element (req, res, next) {
  Execution.copy_execution_element(req.swagger.params, res, next);
};

module.exports.execution_get_element = function execution_get_element (req, res, next) {
  Execution.execution_get_element(req.swagger.params, res, next);
};

module.exports.execution_update_element = function execution_update_element (req, res, next) {
  Execution.execution_update_element(req.swagger.params, res, next);
};

module.exports.execution_delete_element = function execution_delete_element (req, res, next) {
  Execution.execution_delete_element(req.swagger.params, res, next);
};

module.exports.execution_modify_element = function execution_modify_element (req, res, next) {
  Execution.execution_modify_element(req.swagger.params, res, next);
};

module.exports.execution_discard_element = function execution_discard_element (req, res, next) {
  Execution.execution_discard_element(req.swagger.params, res, next);
};

module.exports.execution_discard_elements = function execution_discard_elements (req, res, next) {
  Execution.execution_discard_elements(req.swagger.params, res, next);
};

module.exports.update_execution = function update_execution (req, res, next) {
  Execution.update_execution(req.swagger.params, res, next);
};

module.exports.update_execution_status = function update_execution_status (req, res, next) {
  Execution.update_execution_status(req.swagger.params, res, next, req['headers']);
};

module.exports.get_next_element = function get_next_element (req, res, next) {
  Execution.get_next_element(req.swagger.params, res, next);
};

module.exports.set_boundary_element = function set_boundary_element (req, res, next) {
  Execution.set_boundary_element(req.swagger.params, res, next);
};

module.exports.export_execution = function export_execution (req, res, next) {
  Execution.export_execution(req.swagger.params, res, next);
};

module.exports.import_execution = function import_execution (req, res, next) {
  Execution.import_execution(req.swagger.params, res, next);
};