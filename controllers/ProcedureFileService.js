'use strict';
var base_funcs = require('../api/base_funcs');
var procedure_funcs = require('../api/procedure_funcs');
var util = require('util');
var log = base_funcs.log;

/**
 * Upload a file to a procedure element
 *
 * procedure_id String unique id of procedure
 * elem_id String unique id of a procedure element
 * file_content File content of the file
 * file_name String file name (optional)
 * returns FileInfo
 **/
exports.procedure_element_upload_file = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];
  let file = args['file_metadata']['value'];
  let procedure_id = args['procedure_id']['value'];

  try {
    await procedure_funcs.checkElementVersioned(procedure_id, elem_id, 'Cannot modify element of versioned procedure'); 
    const data = await procedure_funcs.addFile(elem_id, file);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when adding a file to a procedure element', err);
    res.status(400).json(err_data);
  }
}


/**
 * Get a list of attached files for a procedure element. List is ordered by the creation date (ascending order).
 *
 * procedure_id String unique id of procedure
 * elem_id String unique id of a procedure element
 * offset Integer Start index for pagination. zero based. (optional)
 * limit Integer Max number of elements to return. (optional)
 * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
 * returns List
 **/
exports.procedure_element_get_files = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];
  let offset = args["offset"]["value"] || undefined;
  let limit = args["limit"]["value"] || undefined;
  let procedure_id = args['procedure_id']['value'];

  try {
    const data = await procedure_funcs.getFiles(elem_id, offset, limit);
    res.set('x-total-count', data['total']);
    res.status(200).json(data['files']);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting files from a procedure element', err);
    res.status(400).json(err_data);
  }
}

/**
 * Download a list of attached files for a procedure element
 *
 * procedure_id String unique id of procedure
 * elem_id String unique id of a procedure element
 * file_id String resource id of an attached file
 * returns FileInfo
 **/
exports.procedure_element_get_file = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];
  let file_id = args['file_id']['value'];
  let procedure_id = args['procedure_id']['value'];

  try {
    const data = await procedure_funcs.getFile(elem_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a file from a procedure element', err);
    res.status(400).json(err_data);
  }
}

/**
 * Delete an attached file
 *
 * procedure_id String unique id of procedure
 * elem_id String unique id of a procedure element
 * file_id String resource id of an attached file
 * no response value expected for this operation
 **/
exports.procedure_element_delete_file = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];
  let file_id = args['file_id']['value'];
  let procedure_id = args['procedure_id']['value'];

  try {
    await procedure_funcs.checkElementVersioned(procedure_id, elem_id, 'Cannot modify element of versioned procedure');      
    const data = await procedure_funcs.deleteFile(elem_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting a file from a procedure element', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_upload_file = async function(args, res, next) {
  /**
   * Upload a file to a procedure
   *
   * procedure_id String unique id of procedure
   * file_content File content of the file
   * file_name String file name (optional)
   * returns FileInfo
   **/
  let file = args['file_metadata']['value'];
  let procedure_id = args['procedure_id']['value'];

  try {
    const data = await procedure_funcs.addProcedureFile(procedure_id, file);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when adding a file to a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_get_files = async function(args, res, next) {
  /**
   * Get a list of attached files for a procedure. List is ordered by the creation date (ascending order).
   *
   * procedure_id String unique id of procedure
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns List
   **/
  let offset = args["offset"]["value"] || undefined;
  let limit = args["limit"]["value"] || undefined;
  let procedure_id = args['procedure_id']['value'];

  try {
    const data = await procedure_funcs.getProcedureFiles(procedure_id, offset, limit);
    res.set('x-total-count', data['total']);
    res.status(200).json(data['files']);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting files from a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_get_file = async function(args, res, next) {
  /**
   * Download a list of attached files for a procedure
   *
   * procedure_id String unique id of procedure
   * file_id String resource id of an attached file
   * returns FileInfo
   **/
  let file_id = args['file_id']['value'];
  let procedure_id = args['procedure_id']['value'];

  try {
    const data = await procedure_funcs.getProcedureFile(procedure_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a file from a procedure element', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_delete_file = async function(args, res, next) {
  /**
   * Delete an attached file
   *
   * procedure_id String unique id of procedure
   * file_id String resource id of an attached file
   * no response value expected for this operation
   **/
  let procedure_id = args['procedure_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await procedure_funcs.deleteProcedureFile(procedure_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting a file from a procedure', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_element_post_comment_file = async function(args, res, next) {
  /**
   * Upload a file to an element comment
   * 
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * conversation_id String resource id of a conversation
   * comment_id String resource id of a comment
   * file_content File content of the file
   * file_name String file name (optional)
   * returns FileInfo
   **/
  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];
  let file = args['file_metadata']['value'];

  try {
    const data = await procedure_funcs.addFileComment(procedure_id, elem_id, conversation_id, comment_id, file);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when adding a file to a comment', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_element_get_comment_file = async function(args, res, next) {
  /**
   * get a files meta data
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * conversation_id String resource id of a conversation
   * comment_id String resource id of a comment
   * file_id String resource id of an attached file
   * returns FileInfo
   **/
  let procedure_id = args['procedure_id']['value']; 
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await procedure_funcs.getCommentFile(procedure_id, elem_id, conversation_id, comment_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a file of a comment', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_element_get_comment_files = async function(args, res, next) {
  /**
   * Get a list of files attached to comments
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * conversation_id String resource id of a conversation
   * comment_id String resource id of a comment
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns List
   **/
  let procedure_id = args['procedure_id']['value']; 
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];
  let offset = args["offset"]["value"] || undefined;
  let limit = args["limit"]["value"] || undefined;

  try {
    const data = await procedure_funcs.getCommentFiles(procedure_id, elem_id, conversation_id, comment_id, offset, limit);
    res.set('x-total-count', data['total']);
    res.status(200).json(data['files']);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting files of a comment', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_element_delete_comment_file = async function(args, res, next) {
  /**
   * Delete a file
   * 
   * procedure_id unique id of procedure
   * elem_id String unique id of a procedure element
   * conversation_id String resource id of a conversation
   * comment_id String resource id of a comment
   * file_id String resource id of an attached file
   * no response value expected for this operation
   **/
  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let comment_id = args['comment_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await procedure_funcs.deleteCommentFile(procedure_id, elem_id, conversation_id, comment_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting a file from a comment', err);
    res.status(400).json(err_data);
  }
}
