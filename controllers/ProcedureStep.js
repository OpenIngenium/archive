'use strict';

var ProcedureStep = require('./ProcedureStepService');

module.exports.procedure_create_step = function procedure_create_step (req, res, next) {
  ProcedureStep.procedure_create_step(req.swagger.params, res, next);
};

module.exports.procedure_get_step = function procedure_get_step (req, res, next) {
  ProcedureStep.procedure_get_step(req.swagger.params, res, next);
};

module.exports.procedure_get_step_input = function procedure_get_step_input (req, res, next) {
  ProcedureStep.procedure_get_step_input(req.swagger.params, res, next);
};

module.exports.procedure_get_steps = function procedure_get_steps (req, res, next) {
  ProcedureStep.procedure_get_steps(req.swagger.params, res, next);
};

module.exports.procedure_update_step = function procedure_update_step (req, res, next) {
  ProcedureStep.procedure_update_step(req.swagger.params, res, next);
};

module.exports.procedure_update_step_input = function procedure_update_step_input (req, res, next) {
  ProcedureStep.procedure_update_step_input(req.swagger.params, res, next);
};
