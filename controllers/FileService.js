'use strict';
var base_funcs = require('../api/base_funcs');
var node_funcs = require('../api/node_funcs');
var log = base_funcs.log;
var util = require('util');

exports.element_delete_file = async function(args, res, next) {
  /**
   * Delete an attached file
   *
   * elem_id String unique id of a procedure element
   * file_id String resource id of an attached file
   * no response value expected for this operation
   **/
  let elem_id = args['elem_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await node_funcs.deleteFile(elem_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting a file from an element', err);
    res.status(400).json(err_data);
  }
}

exports.element_get_file = async function(args, res, next) {
  /**
   * Download a list of attached files for a procedure element
   *
   * elem_id String unique id of a procedure element
   * file_id String resource id of an attached file
   * returns FileInfo
   **/
  let elem_id = args['elem_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await node_funcs.getFile(elem_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a file of an element', err);
    res.status(400).json(err_data);
  }
}

exports.element_get_files = async function(args, res, next) {
  /**
   * Get a list of attached files for a procedure element. List is ordered by the creation date (ascending order).
   *
   * elem_id String unique id of a procedure element
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns List
   **/
  let elem_id = args['elem_id']['value'];
  let offset = args["offset"]["value"] || undefined;
  let limit = args["limit"]["value"] || undefined;

  try {
    const data = await node_funcs.getFiles(elem_id, offset, limit);
    res.set('x-total-count', data['total']);
    res.status(200).json(data['files']);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting files of an element', err);
    res.status(400).json(err_data);
  }
}

exports.element_upload_file = async function(args, res, next) {
  /**
   * Upload a file to a procedure element
   *
   * elem_id String unique id of a procedure element
   * file_content File content of the file
   * file_name String file name (optional)
   * returns FileInfo
   **/
  let elem_id = args['elem_id']['value'];
  let file = args['file_metadata']['value'];

  try {
    const data = await node_funcs.addFile(elem_id, file);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when uploading file for an element', err);
    res.status(400).json(err_data);
  }
}

exports.execution_delete_file = async function(args, res, next) {
  /**
   * Delete an attached file
   *
   * execution_id String unique id of execution
   * file_id String resource id of an attached file
   * no response value expected for this operation
   **/
  let execution_id = args['execution_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await node_funcs.deleteExecFile(execution_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting a file from an execution', err);
    res.status(400).json(err_data);
  }
}

exports.execution_get_file = async function(args, res, next) {
  /**
   * Get a specific files meta-data
   *
   * execution_id String unique id of execution
   * file_id String resource id of an attached file
   * returns FileInfo
   **/
  let execution_id = args['execution_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await node_funcs.getExecFile(execution_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a file of an execution', err);
    res.status(400).json(err_data);
  }
}

exports.execution_get_files = async function(args, res, next) {
  /**
   * Get a list of attached files for a procedure execution. List is ordered by the creation date (ascending order).
   *
   * execution_id String unique id of execution
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns List
   **/
  let execution_id = args['execution_id']['value'];
  let offset = args["offset"]["value"] || undefined;
  let limit = args["limit"]["value"] || undefined;

  try {
    const data = await node_funcs.getExecFiles(execution_id, offset, limit);
    res.set('x-total-count', data['total']);
    res.status(200).json(data['files']);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting files of an execution', err);
    res.status(400).json(err_data);
  }
}

exports.execution_upload_file = async function(args, res, next) {
  /**
   * Upload a file to a procedure execution
   *
   * execution_id String unique id of execution
   * file_content File content of the file
   * file_name String file name (optional)
   * returns FileInfo
   **/
  let execution_id = args['execution_id']['value'];
  let file = args['file_metadata']['value'];

  try {
    const data = await node_funcs.addFileExec(execution_id, file);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting files of an execution', err);
    res.status(400).json(err_data);
  }
}

exports.element_post_comment_file = async function(args, res, next) {
  /**
   * Upload a file to an element comment
   * 
   * execution_id String unique id of execution
   * elem_id String unique id of a procedure element
   * conversation_id String resource id of a conversation
   * comment_id String resource id of a comment
   * file_content File content of the file
   * file_name String file name (optional)
   * returns FileInfo
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];
  let file = args['file_metadata']['value'];

  try {
    const data = await node_funcs.addFileComment(execution_id, elem_id, conversation_id, comment_id, file);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when adding a file to a comment', err);
    res.status(400).json(err_data);
  }
}

exports.element_get_comment_file = async function(args, res, next) {
  /**
   * get a files meta data
   *
   * execution_id String unique id of execution
   * elem_id String unique id of a procedure element
   * conversation_id String resource id of a conversation
   * comment_id String resource id of a comment
   * file_id String resource id of an attached file
   * returns FileInfo
   **/
  let execution_id = args['execution_id']['value'];  
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await node_funcs.getCommentFile(execution_id, elem_id, conversation_id, comment_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a file of a comment', err);
    res.status(400).json(err_data);
  }
}

exports.element_get_comment_files = async function(args, res, next) {
  /**
   * Get a list of files attached to comments
   *
   * execution_id String unique id of execution 
   * elem_id String unique id of a procedure element
   * conversation_id String resource id of a conversation
   * comment_id String resource id of a comment
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns List
   **/
  let execution_id = args['execution_id']['value'];   
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];
  let offset = args["offset"]["value"] || undefined;
  let limit = args["limit"]["value"] || undefined;

  try {
    const data = await node_funcs.getCommentFiles(execution_id, elem_id, conversation_id, comment_id, offset, limit);
    res.set('x-total-count', data['total']);
    res.status(200).json(data['files']);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting files of a comment', err);
    res.status(400).json(err_data);
  }
}

exports.element_delete_comment_file = async function(args, res, next) {
  /**
   * Delete a file
   * 
   * execution_id unique id of execution
   * elem_id String unique id of a procedure element
   * conversation_id String resource id of a conversation
   * comment_id String resource id of a comment
   * file_id String resource id of an attached file
   * no response value expected for this operation
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];
  let comment_id = args['comment_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let file_id = args['file_id']['value'];

  try {
    const data = await node_funcs.deleteCommentFile(execution_id, elem_id, conversation_id, comment_id, file_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting a file from a comment', err);
    res.status(400).json(err_data);
  }
}
