'use strict';

var ProcedureVersions = require('./ProcedureVersionsService');

module.exports.create_version = function create_version (req, res, next) {
  ProcedureVersions.create_version(req.swagger.params, res, next);
};

module.exports.delete_version = function delete_version (req, res, next) {
  ProcedureVersions.delete_version(req.swagger.params, res, next);
};

module.exports.get_version = function get_version (req, res, next) {
  ProcedureVersions.get_version(req.swagger.params, res, next);
};

module.exports.get_version_structure = function get_version_structure (req, res, next) {
  ProcedureVersions.get_version_structure(req.swagger.params, res, next);
};

module.exports.get_version_elements = function get_version_elements (req, res, next) {
  ProcedureVersions.get_version_elements(req.swagger.params, res, next);
};

module.exports.get_version_outline = function get_version_outline (req, res, next) {
  ProcedureVersions.get_version_outline(req.swagger.params, res, next);
};

module.exports.get_versions = function get_versions (req, res, next) {
  ProcedureVersions.get_versions(req.swagger.params, res, next);
};

module.exports.update_version = function update_version (req, res, next) {
  ProcedureVersions.update_version(req.swagger.params, res, next);
};

module.exports.update_version_status = function update_version_status (req, res, next) {
  ProcedureVersions.update_version_status(req.swagger.params, res, next);
};