'use strict';

var url = require('url');

var ProcedureComment = require('./ProcedureCommentService');

module.exports.procedure_element_add_conversation = function procedure_element_add_conversation (req, res, next) {
  ProcedureComment.procedure_element_add_conversation(req.swagger.params, res, next, req['headers']);
};

module.exports.procedure_element_get_conversations = function procedure_element_get_conversations (req, res, next) {
  ProcedureComment.procedure_element_get_conversations(req.swagger.params, res, next);
};

module.exports.procedure_element_get_conversation = function procedure_element_get_conversation (req, res, next) {
  ProcedureComment.procedure_element_get_conversation(req.swagger.params, res, next);
};

module.exports.procedure_element_update_conversation = function procedure_element_update_conversation (req, res, next) {
  ProcedureComment.procedure_element_update_conversation(req.swagger.params, res, next, req['headers']);
};

module.exports.procedure_element_delete_conversation = function procedure_element_delete_conversation (req, res, next) {
  ProcedureComment.procedure_element_delete_conversation(req.swagger.params, res, next);
};

module.exports.procedure_element_add_comment = function procedure_element_add_comment (req, res, next) {
  ProcedureComment.procedure_element_add_comment(req.swagger.params, res, next, req['headers']);
};

module.exports.procedure_element_get_comments = function procedure_element_get_comments (req, res, next) {
  ProcedureComment.procedure_element_get_comments(req.swagger.params, res, next);
};

module.exports.procedure_element_get_comment = function procedure_element_get_comment (req, res, next) {
  ProcedureComment.procedure_element_get_comment(req.swagger.params, res, next);
};

module.exports.procedure_element_update_comment = function procedure_element_update_comment (req, res, next) {
  ProcedureComment.procedure_element_update_comment(req.swagger.params, res, next, req['headers']);
};

module.exports.procedure_element_delete_comment = function procedure_element_delete_comment (req, res, next) {
  ProcedureComment.procedure_element_delete_comment(req.swagger.params, res, next);
};


