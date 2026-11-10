'use strict';

var ProcedureSection = require('./ProcedureSectionService');

module.exports.procedure_create_section = function procedure_create_section (req, res, next) {
  ProcedureSection.procedure_create_section(req.swagger.params, res, next);
};

module.exports.procedure_get_section = function procedure_get_section (req, res, next) {
  ProcedureSection.procedure_get_section(req.swagger.params, res, next);
};

module.exports.procedure_get_sections = function procedure_get_sections (req, res, next) {
  ProcedureSection.procedure_get_sections(req.swagger.params, res, next);
};

module.exports.procedure_update_section = function procedure_update_section (req, res, next) {
  ProcedureSection.procedure_update_section(req.swagger.params, res, next);
};
