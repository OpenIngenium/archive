'use strict';

var ProcedureProcSection = require('./ProcedureProcSectionService');

module.exports.procedure_create_procedure_section = function procedure_create_procedure_section (req, res, next) {
  ProcedureProcSection.procedure_create_procedure_section(req.swagger.params, res, next);
};

module.exports.procedure_get_procedure_section = function procedure_get_procedure_section (req, res, next) {
  ProcedureProcSection.procedure_get_procedure_section(req.swagger.params, res, next);
};

module.exports.procedure_get_procedure_section_structure = function procedure_get_procedure_section_structure (req, res, next) {
  ProcedureProcSection.procedure_get_procedure_section_structure(req.swagger.params, res, next);
};

module.exports.procedure_get_procedure_section_elements = function procedure_get_procedure_section_elements (req, res, next) {
  ProcedureProcSection.procedure_get_procedure_section_elements(req.swagger.params, res, next);
};

module.exports.procedure_get_procedure_sections = function procedure_get_procedure_sections (req, res, next) {
  ProcedureProcSection.procedure_get_procedure_sections(req.swagger.params, res, next);
};

module.exports.procedure_update_procedure_section = function procedure_update_procedure_section (req, res, next) {
  ProcedureProcSection.procedure_update_procedure_section(req.swagger.params, res, next);
};

module.exports.procedure_get_procedure_section_input = function procedure_get_procedure_section_input (req, res, next) {
  ProcedureProcSection.procedure_get_procedure_section_input(req.swagger.params, res, next);
};

module.exports.procedure_update_procedure_section_input = function procedure_update_procedure_section_input (req, res, next) {
  ProcedureProcSection.procedure_update_procedure_section_input(req.swagger.params, res, next);
};
