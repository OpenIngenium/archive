'use strict';
var base_funcs = require('../api/base_funcs');
var procedure_funcs = require('../api/procedure_funcs');
var util = require('util');
var log = base_funcs.log;

exports.procedure_get_elements = async function(args, res, next) {
  /**
   * Get elements of the specified type from procedure. List is sorted by the order in the procedure.
   *
   * procedure_id String unique id of procedure
   * elem_type String type of procedure element. If omitted, get all types. (optional)
   * step_type String type of step. If omitted, get all types. (optional)
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * description String Query for words in description (optional)
   * returns List
   **/
  
  let procedure_id = args['procedure_id']['value'];
  let elem_type = args['elem_type']['value'] || null;
  let step_type = args['step_type']['value'] || null;
  let offset = args['offset']['value'] || 0;
  let limit = args['limit']['value'] || 50;
  let sort = args["sort"]['value'] || 'ASC';
  let description = args["description"]["value"] || null;

  try {
    const version_id = await procedure_funcs.getProcedureVersionId(procedure_id, 0);
    const data = await procedure_funcs.getElements('procedureVersion/' + version_id,
      elem_type, step_type, description);
    
    let total_count = data.length;
    let elems = data.slice(offset, offset+limit);
    if (sort == 'DESC') {
      elems = elems.reverse();
    }
    res.status(200).set('x-total-count', total_count).json(elems);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting procedure elements', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_update_elements = async function(args, res, next) {
  /**
   * Update elements the working copy of the procedure
   *
   * procedure_id String unique id of procedure 
   * elems_input elements to be updated
   * 
   * returns List
   **/  
  let procedure_id = args['procedure_id']['value'];
  let version = 0;
  let elems_input = args['elems_input']['value'];
  
  try {
    const version_id = await procedure_funcs.getProcedureVersionId(procedure_id, version);
    const elems = await procedure_funcs.updateElements(elems_input);
    res.status(200).json(elems);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating procedure elements', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_move_element = async function(args, res, next) {
  /**
   * Copy an element and its children in procedure
   *
   * procedure_id String unique id of procedure
   * move_element_input input 
   * returns ElementsNumberResponse
   **/
  
  let procedure_id = args['procedure_id']['value'];
  let move_element_input = args['move_element_input']['value'];

  let elem_ids = move_element_input['elem_ids'];
  let insert_after_id = move_element_input['insert_after_id'];
  let level = move_element_input['level'];

  try {
    const data = await procedure_funcs.moveElement(procedure_id, elem_ids, insert_after_id, level);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when moving procedure element', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_copy_element = async function(args, res, next) {
  /**
   * Copy element and its children in procedure
   *
   * procedure_id String unique id of procedure
   * copy_element_input input
   * returns CopyElementResponse
   **/
  
  let procedure_id = args['procedure_id']['value'];
  let copy_element_input = args['copy_element_input']['value'];

  let elem_ids = copy_element_input['elem_ids'];
  let insert_after_id = copy_element_input['insert_after_id'];
  let level = copy_element_input['level'];

  let source_execution_id = copy_element_input['source_execution_id'] || null;
  let source_procedure_id = copy_element_input['source_procedure_id'] || null;
  let source_procedure_version = copy_element_input.hasOwnProperty('source_procedure_version') ? 
    copy_element_input['source_procedure_version'] : null; 

  log.debug(`procedure_copy_element source_execution_id: ${source_execution_id} source_procedure_id: ${source_procedure_id} source_procedure_version: ${source_procedure_version}`);  

  try {
    const data = await procedure_funcs.copyElement(procedure_id, elem_ids, insert_after_id, level,
      source_execution_id, source_procedure_id, source_procedure_version);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when copying procedure element', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_get_element = async function(args, res, next) {
  /**
   * Get an element in procedure
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * returns ProcedureElement
   **/
  let procedure_id = args['procedure_id']['value'];  
  let elem_id = args['elem_id']['value'];

  try {
    const data = await procedure_funcs.getElement(elem_id);
    base_funcs.sanitize_internal_attrs(data);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting a procedure element', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_update_element = async function(args, res, next) {
  /**
   * Update an element in procedure
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * elem_input element data to update
   * returns ProcedureElement
   **/
  let procedure_id = args['procedure_id']['value'];  
  let elem_id = args['elem_id']['value'];
  let elem_input = args['elem_input']['value'];

  try {
    await procedure_funcs.checkElementVersioned(procedure_id, elem_id, 'Cannot modify element of versioned procedure');    
    const data = await procedure_funcs.updateElement(procedure_id, elem_id, elem_input);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating a procedure element', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_delete_element = async function(args, res, next) {
  /**
   * Delete an element
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * returns ElementsNumberResponse
   **/
  
  let procedure_id = args['procedure_id']['value'];  
  let elem_id = args['elem_id']['value'];

  try {
    await procedure_funcs.checkElementVersioned(procedure_id, elem_id, 'Cannot delete element of versioned procedure');    
    const data = await procedure_funcs.deleteElement(procedure_id, elem_id);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when deleting a procedure element', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_replace_element = async function(args, res, next) {
  /**
   * Replace an element of proedure
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * replace_element_input Object element info to replace the current element
   * returns ProcedureElement
   **/
  
  let procedure_id = args['procedure_id']['value'];  
  let elem_id = args['elem_id']['value'];
  let replace_element_input = args['replace_element_input']['value'];

  try {
    const data = await procedure_funcs.replaceProcedureElement(procedure_id, elem_id, replace_element_input);    
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when replacing a procedure element', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_element_apply_tag = async function(args, res, next) {
  /**
   * Apply a tag to an element
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * tag_id String id of tag
   * returns array of UpdatedElementTags
   **/
  
  let procedure_id = args['procedure_id']['value'];  
  let elem_id = args['elem_id']['value'];
  let tag_id = args['tag_id']['value'];

  try {
    const data = await procedure_funcs.procedureElementApplyTag(procedure_id, elem_id, tag_id);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when applying a tag', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_element_remove_tag = async function(args, res, next) {
  /**
   * Remove a tag from an element
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * tag_id String id of tag
   * returns array of UpdatedElementTags
   **/
  
  let procedure_id = args['procedure_id']['value'];  
  let elem_id = args['elem_id']['value'];
  let tag_id = args['tag_id']['value'];

  try {
    const data = await procedure_funcs.procedureElementRemoveTag(procedure_id, elem_id, tag_id);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when applying a tag', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_get_structure = async function(args, res, next) {
  /**
   * Get hierarchical view of procedure
   *
   * procedure_id String unique id of procedure
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns ProcedureStructure
   **/
  
  let procedure_id = args['procedure_id']['value'];

  try {
    const version_id = await procedure_funcs.getProcedureVersionId(procedure_id, 0);
    const data = await procedure_funcs.getStructure('procedureVersion/' + version_id, false);
    base_funcs.sanitizeElement(data);
    base_funcs.sanitize_internal_attrs_recursive(data);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting procedure structure', err);
    res.status(400).json(err_data);
  }
}

exports.load_working_copy = async function(args, res, next) {
  /**
   * Reload the working copy
   *
   * procedure_id String unique id of procedure
   * procedure_info Procedure_info load the version of the procedure specified.
   * no response value expected for this operation
   **/
  let procedure_id = args['procedure_id']['value'];
  let procedure_info = args['procedure_info']['value'];
  
  let source_procedure_id = procedure_info.procedure_id;
  let source_procedure_version = procedure_info.version;

  try {
    const data = await procedure_funcs.loadToWorkingCopy(procedure_id, source_procedure_id, source_procedure_version);
    res.status(204).end();    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when loading a working copy', err);
    res.status(400).json(err_data);
  }   
}

exports.import_procedure_version = async function(args, res, next) {

  /**
  * Import a procedure version into the working copy. The working copy will be replaced. 

  * procedure_id: (string) unique id of procedure
  * procedure_version_data: (object) procedure version data
  * returns: None

  **/
  let procedure_id = args['procedure_id']['value'];
  let procedure_version_data = args['procedure_version_data']['value'];

  try {
    const data = await procedure_funcs.importProcedureVersion(procedure_id, procedure_version_data);
    res.status(204).end();    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when imporing a procedure version', err);
    res.status(400).json(err_data);
  }   
}

exports.export_procedure_versions = async function(args, res, next) {

  /**
  * Get procedure, versions, elements and edges

  * procedure_id: (string) unique id of procedure
  * version: (number) procedure version to export. If not specified, export all versions.
  * released_only: (boolean) export only released versions
  * returns: VersionsData

  **/
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'] == undefined ? null : args['version']['value'];
  let released_only = args['released_only']['value'] == undefined ? null : args['released_only']['value'];

  try {
    const data = await procedure_funcs.exportProcedureVersions(procedure_id, version, released_only);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when exporting a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_create_tag = async function(args, res, next) {

  /**
  * Create a tag for procedure

  * procedure_id: (string) unique id of procedure
  * tag_input: (object) tag input
  * returns: array of Tag

  **/
  let procedure_id = args['procedure_id']['value'];
  let tag_input = args['tag_input']['value'];

  try {
    const data = await procedure_funcs.procedureCreateTag(procedure_id, tag_input);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when creating a tag', err);
    res.status(400).json(err_data);
  }   
}

exports.procedure_update_tag = async function(args, res, next) {

  /**
  * Update a tag

  * procedure_id: (string) unique id of procedure
  * tag_id: (string) unique id of tag
  * tag_input: (object) tag input
  * returns: array of Tag

  **/
  let procedure_id = args['procedure_id']['value'];
  let tag_id = args['tag_id']['value'];
  let tag_input = args['tag_input']['value'];

  try {
    const data = await procedure_funcs.procedureUpdateTag(procedure_id, tag_id, tag_input);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating a tag', err);
    res.status(400).json(err_data);
  }   
}

exports.procedure_delete_tag = async function(args, res, next) {

  /**
  * Delete a tag from procedure

  * procedure_id: (string) unique id of procedure
  * tag_id: (string) unique id of tag
  * returns: array of Tag

  **/
  let procedure_id = args['procedure_id']['value'];
  let tag_id = args['tag_id']['value'];

  try {
    const data = await procedure_funcs.procedureDeleteTag(procedure_id, tag_id);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating a tag', err);
    res.status(400).json(err_data);
  }   
}