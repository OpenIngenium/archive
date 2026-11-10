'use strict';

var ProcedureParagraph = require('./ProcedureParagraphService');

module.exports.procedure_create_paragraph = function procedure_create_paragraph (req, res, next) {
  ProcedureParagraph.procedure_create_paragraph(req.swagger.params, res, next);
};

module.exports.procedure_get_paragraph = function procedure_get_paragraph (req, res, next) {
  ProcedureParagraph.procedure_get_paragraph(req.swagger.params, res, next);
};

module.exports.procedure_get_paragraphs = function procedure_get_paragraphs (req, res, next) {
  ProcedureParagraph.procedure_get_paragraphs(req.swagger.params, res, next);
};

module.exports.procedure_update_paragraph = function procedure_update_paragraph (req, res, next) {
  ProcedureParagraph.procedure_update_paragraph(req.swagger.params, res, next);
};
