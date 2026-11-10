'use strict';
var base_funcs = require('../api/base_funcs');
var procedure_funcs = require('../api/procedure_funcs');
var util = require('util');
var log = base_funcs.log;

exports.procedure_element_add_conversation = async function(args, res, next, headers) {
  /**
   * Add a conversation to an element
   *
   * procedure_id String unique id of procedure
   * version Integer version of procedure
   * elem_id String unique id of an element
   * conversation ConversationInput comment to add
   * returns Conversation
   **/
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'];
  let elem_id = args['elem_id']['value'];
  let conversation = args['conversation']['value'];

  let user_name = base_funcs.getUserName(headers['authorization']); 

  try {
    await procedure_funcs.checkElementNotVersioned(procedure_id, elem_id, 'Cannot add comment to a working copy of procedure');     
    
    const data = await procedure_funcs.addConversation(procedure_id, version, elem_id, conversation, user_name);
    res.status(200).json(data);
  } catch(err) {
    console.log(err);
    const err_data = base_funcs.push_error('Error when adding a conversation', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_element_get_conversations = async function(args, res, next, headers) {
    /**
     * Get conversations of an element
     *
     * procedure_id String unique id of procedure 
     * elem_id String unique id of a procedure element
     * returns Conversations
     **/  
    // TODO: handle query parameters
    let procedure_id = args['procedure_id']['value'];
    let elem_id = args['elem_id']['value'];
    let offset = args["offset"]["value"] || undefined;
    let limit = args["limit"]["value"] || undefined;
  
    try {
      const data = await procedure_funcs.getConversations(procedure_id, elem_id, offset, limit);
      let total_count = data['total'] || 0;
      res.set('x-total-count', total_count);
      res.status(200).json(data['conversations']);
    } catch(err) {
      const err_data = base_funcs.push_error('Error when getting conversations', err);
      res.status(400).json(err_data);
    }  
  }
  
  exports.procedure_element_get_conversation = async function(args, res, next) {
    /**
     * Get a conversation of an element
     *
     * procedure_id String unique id of procedure 
     * elem_id String unique id of a procedure element
     * conversation_id unique id of a conversation
     * returns Conversation
     **/
    let procedure_id = args['procedure_id']['value'];
    let elem_id = args['elem_id']['value'];
    let conversation_id = args['conversation_id']['value'];
  
    try {
      const data = await procedure_funcs.getConversation(procedure_id, elem_id, conversation_id);
      res.status(200).json(data);
    } catch(err) {
      const err_data = base_funcs.push_error('Error when getting a conversation', err);
      res.status(400).json(err_data);
    }
  }
  
  exports.procedure_element_update_conversation = async function(args, res, next, headers) {
    /**
     * Update a conversation of a procedure element
     *
     * procedure_id String unique id of procedure
     * version Number procedure version
     * elem_id String unique id of a procedure element
     * conversation_id unique id of a conversation
     * conversation ConversationInput conversation to update
     * returns Conversation
     **/
  
    let procedure_id = args['procedure_id']['value'];
    let version = args['version']['value'];
    let elem_id = args['elem_id']['value'];
    let conversation_id = args['conversation_id']['value'];
    let conversation = args['conversation']['value'];
  
    let user_name = base_funcs.getUserName(headers['authorization']); 
  
    try {
      const data = await procedure_funcs.updateConversation(procedure_id, version, elem_id, conversation_id, conversation, user_name);
      res.status(200).json(data);
    } catch(err) {
      const err_data = base_funcs.push_error('Error when updating a conversation', err);
      res.status(400).json(err_data);
    }
  }
  
  
  exports.procedure_element_delete_conversation = async function(args, res, next) {
    /**
     * Delete a conversation
     *
     * procedure_id String unique id of procedure
     * elem_id String unique id of a procedure element
     * conversation_id unique id of a conversation
     * no response value expected for this operation
     **/
  
    let procedure_id = args['procedure_id']['value'];
    let version = args['version']['value'];
    let elem_id = args['elem_id']['value'];
    let conversation_id = args['conversation_id']['value'];
  
    try {
      const data = await procedure_funcs.deleteConversation(procedure_id, version, elem_id, conversation_id);
      res.status(204).end();
    } catch(err) {
      const err_data = base_funcs.push_error('Error when deleting a conversation', err);
      res.status(400).json(err_data);
    }
  }
  
exports.procedure_element_add_comment = async function(args, res, next, headers) {
    /**
     * Add a comment to an element
     *
     * procedure_id String unique id of procedure 
     * elem_id String unique id of an element
     * conversation_id unique id of a conversation
     * comment CommentInput comment to add
     * returns Comment
     **/
    let procedure_id = args['procedure_id']['value'];
    let elem_id = args['elem_id']['value'];
    let conversation_id = args['conversation_id']['value'];
    let comment = args['comment']['value'];
  
    let user_name = base_funcs.getUserName(headers['authorization']); 
  
    try {
      const data = await procedure_funcs.addComment(procedure_id, elem_id, conversation_id, comment, user_name);
      res.status(200).json(data);
    } catch(err) {
      const err_data = base_funcs.push_error('Error when adding a comment', err);
      res.status(400).json(err_data);
    }
  }
  
exports.procedure_element_get_comments = async function(args, res, next) {
  /**
   * Get a list of comments for an element. List is ordered by the creation date (ascending order).
   *
   * procedure_id String unique id of procedure_id    
   * elem_id String unique id of an element
   * conversation_id unique id of a conversation
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns List
   **/

  // TODO: handle query parameters
  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let offset = args["offset"]["value"] || undefined;
  let limit = args["limit"]["value"] || undefined;

  try {
    const data = await procedure_funcs.getComments(procedure_id, elem_id, conversation_id, offset, limit);
    let total_count = data['total'] || 0;
    res.set('x-total-count', total_count);
    res.status(200).json(data['comments']);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting comments', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_element_get_comment = async function(args, res, next) {
  /**
   * Get a list of comments for an element"
   *
   * procedure_id String unique id of procedure 
   * elem_id String unique id of an element
   * conversation_id unique id of a conversation
   * comment_id String resource id of a comment
   * returns Comment
   **/
  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];

  try {
    const data = await procedure_funcs.getComment(procedure_id, elem_id, conversation_id, comment_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a comment', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_element_update_comment = async function(args, res, next, headers) {
  /**
   * Update a comment of an element
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of an element
   * conversation_id unique id of a conversation
   * comment_id String resource id of a comment
   * comment CommentInput comment to update
   * returns Comment
   **/

  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];
  let comment = args['comment']['value'];

  let user_name = base_funcs.getUserName(headers['authorization']); 

  try {
    const data = await procedure_funcs.updateComment(procedure_id, elem_id, conversation_id, comment_id, comment, user_name);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating a comment', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_element_delete_comment = async function(args, res, next) {
  /**
   * Delete a comment
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of an element
   * conversation_id unique id of a conversation
   * comment_id String resource id of a comment
   * no response value expected for this operation
   **/

  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let conversation_id = args['conversation_id']['value'];
  let comment_id = args['comment_id']['value'];

  try {
    const data = await procedure_funcs.deleteComment(procedure_id, elem_id, conversation_id, comment_id);
    res.status(204).end();
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting a comment', err);
    res.status(400).json(err_data);
  }
}



